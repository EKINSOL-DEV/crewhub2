/* What every tool shares: the command line, the headless browser and a few moves in the world's page.

   Tooling only. Nothing under apps/ or packages/ may import this folder or playwright-core (a test enforces it), and
   a tool only ever opens http://127.0.0.1:<port>/ (scripts/scan-model-calls.ts checks the addresses in tools/). */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { ownPort } from "./toolGuard.ts";

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** GPU-backed headless Chromium (Metal ANGLE), and the software renderer for machines without a GPU. */
export const GPU_ARGS = ["--headless=new", "--use-angle=metal", "--enable-gpu"];
export const SWIFTSHADER_ARGS = ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

/**
 * Reads the command line: `--name value` options (with their defaults), `--name` flags, and what is left over in
 * order. Every tool takes --port (required: your own Vite's port, never a named port, lib/toolGuard.ts),
 * --out <dir> (default tools/out/) and --swiftshader; `usage` is printed with any mistake. `out` is an absolute directory that exists, ending in a slash.
 */
export function cli(usage, { options = {}, flags = [] } = {}) {
  const argv = process.argv.slice(2);
  const fail = (message) => {
    console.error(`${message}\n\nusage: ${usage}`);
    process.exit(2);
  };
  const values = { port: null, out: null, ...options };
  const set = Object.fromEntries(["swiftshader", ...flags].map((name) => [name, false]));
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`usage: ${usage}`);
      process.exit(0);
    }
    if (!arg.startsWith("--")) rest.push(arg);
    else if (arg.slice(2) in set) set[arg.slice(2)] = true;
    else if (arg.slice(2) in values) {
      if (argv[i + 1] === undefined) fail(`${arg} needs a value`);
      values[arg.slice(2)] = argv[++i];
    } else fail(`unknown option ${arg}`);
  }
  const portVerdict = ownPort(values.port, "--port");
  if (!portVerdict.ok) fail(`${portVerdict.reason} (--port is the port your own Vite serves the world on)`);
  const port = portVerdict.value;
  const out = path.resolve(values.out ?? path.join(TOOLS, "out")) + path.sep;
  mkdirSync(out, { recursive: true });
  return { ...values, ...set, port, out, rest, origin: `http://127.0.0.1:${port}`, base: `http://127.0.0.1:${port}/`, fail };
}

/** A comma-separated option as a list, each value one of `known` (when given). */
export function list(value, known, fail, what) {
  const items = String(value).split(",").map((s) => s.trim()).filter(Boolean);
  if (known) for (const item of items) if (!known.includes(item)) fail(`unknown ${what} "${item}"; known: ${known.join(", ")}`);
  return items;
}

/** Launches the browser the tools measure and look with. `extra` are more Chromium switches. */
export function launch({ swiftshader = false, extra = [] } = {}) {
  return chromium.launch({ args: [...(swiftshader ? SWIFTSHADER_ARGS : GPU_ARGS), ...extra] });
}

/** An init script that sets localStorage keys before the app reads them (null and undefined values are skipped). */
export async function store(context, entries) {
  const pairs = Object.entries(entries).filter(([, value]) => value != null);
  if (!pairs.length) return;
  await context.addInitScript((pairs) => {
    try {
      for (const [key, value] of pairs) localStorage.setItem(key, value);
    } catch {}
  }, pairs);
}

/** The viewer's cast choice (Settings > Town > Cast), as the app stores it. */
export const castChoice = (cast) => ({ "crewhub-world.cast": cast });

/**
 * Listens to a page for what must never happen: a page error, a console error, a request that leaves the page's own
 * origin. Every one lands in `problems` as { kind: "pageerror" | "console" | "external", text, pageOrigin, at }, an
 * external one with its `url` and `method`, a console one with the `url` the browser blames (its location), so a
 * closing check can tell an expected ask (road 2's probe at the loops web origin) from a stray one. `at` is when the
 * tool heard it (`Date.now()`), so a closing check can also tell a refusal inside a host restart the tool made itself
 * from one outside it (round 60, A7).
 */
export function watch(page, origin, problems, tag = "") {
  const push = (kind, text, more = {}) => problems.push({ kind, text: tag ? `[${tag}] ${text}` : text, pageOrigin: origin, at: Date.now(), ...more });
  // The same origin, not the same first characters (round 52, r51-review T1): `http://127.0.0.1:5389` is no prefix
  // licence for :53891 (a fake's free port) or for `http://127.0.0.1:5389@another.host/`.
  const own = (url) => URL.canParse(url) && new URL(url).origin === origin;
  page.on("pageerror", (e) => push("pageerror", e.message));
  page.on("console", (m) => m.type() === "error" && push("console", m.text(), { url: m.location()?.url ?? "" }));
  page.on("request", (r) => {
    const url = r.url();
    if (!own(url) && !url.startsWith("data:") && !url.startsWith("blob:")) push("external", url, { url, method: r.method() });
  });
}

/** The problems as lines, each once. */
export const problemLines = (problems) => [...new Set(problems.map((p) => `${p.kind.toUpperCase()} ${p.text}`))];

/** Waits for the town to be drawn and dressed (the app's "world:town-dressed" performance mark). */
export async function dressed(page, timeout = 60000) {
  await page.waitForSelector("canvas", { timeout });
  await page.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0, null, { timeout });
}

/** Sets the demo clock through the timeline slider, as a drag would; false when the page has no slider. */
export const seek = (page, ms) =>
  page.evaluate((ms) => {
    const slider = document.querySelector('input[type="range"]');
    if (!slider) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(slider, String(ms));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, ms);

/* Below 600 px the speeds are one menu button (round 65, w4-10): its row, by its word; a closed menu's rows are hidden. The
   checked row's name carries its tick, so the current choice has no row of that exact name: nothing to do then (s4's review). */
const chooseSpeed = async (page, word) => {
  const trigger = page.locator('.playback-bar button[aria-haspopup="menu"]');
  if ((await trigger.getAttribute("aria-label", { timeout: 5000 })) === `Playback speed: ${word}`) return;
  await trigger.click({ timeout: 5000 });
  await page.getByRole("menuitemradio", { name: word, exact: true }).click({ timeout: 5000 });
};
/** Sets a playback speed: its button, named "Play at 4x" (aria-label; the text alone does not match), or on a phone the menu's row. */
export const speed = async (page, label) => {
  const button = page.getByRole("button", { name: `Play at ${label}`, exact: true });
  if ((await button.count()) > 0) await button.click({ timeout: 5000 });
  else await chooseSpeed(page, label);
};
/** Pauses the playback: the button named "Pause", or on a phone the menu's row. */
export const pause = async (page) => {
  const button = page.getByRole("button", { name: "Pause", exact: true });
  if ((await button.count()) > 0) await button.click({ timeout: 5000 });
  else await chooseSpeed(page, "Pause");
};

/**
 * The world's page address: `?stress=<n>` for a stress fixture (dev builds only: 1 or 20), `?scenario=<id>` for a demo
 * scenario (the Demo chip's picker), nothing for the default storyline. `rooms` ("three" or "classic") adds the
 * building plan override (`?rooms=`, Settings > Town > Buildings); left out, the page uses the viewer's setting.
 * `source` ("live") adds `?source=live`: the live host behind the page's `/world-api` (see lib/live.mjs), whatever the
 * viewer's Source setting says; the stress fixture and the scenario are the demo's and are left out then.
 */
export const worldUrl = (base, stress, scenario, rooms = null, source = null) => {
  const params = new URLSearchParams();
  if (source === "live") params.set("source", "live");
  else if (stress) params.set("stress", String(stress));
  else if (scenario) params.set("scenario", scenario);
  if (rooms) params.set("rooms", rooms);
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}`;
};
