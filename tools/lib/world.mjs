/* What every tool shares: the command line, the headless browser and a few moves in the world's page.

   Tooling only. Nothing under apps/ or packages/ may import this folder or playwright-core (a test enforces it), and
   a tool only ever opens http://127.0.0.1:<port>/ (scripts/scan-model-calls.ts checks the addresses in tools/). */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** GPU-backed headless Chromium (Metal ANGLE), and the software renderer for machines without a GPU. */
export const GPU_ARGS = ["--headless=new", "--use-angle=metal", "--enable-gpu"];
export const SWIFTSHADER_ARGS = ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

/**
 * Reads the command line: `--name value` options (with their defaults), `--name` flags, and what is left over in
 * order. Every tool takes --port (required), --out <dir> (default tools/out/) and --swiftshader; `usage` is printed
 * with any mistake. `out` is an absolute directory that exists, ending in a slash.
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
  const port = Number(values.port);
  if (!Number.isInteger(port) || port <= 0) fail("--port <port> is required: the port your own Vite serves the world on");
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
 * origin. Every one lands in `problems` as { kind: "pageerror" | "console" | "external", text }.
 */
export function watch(page, origin, problems, tag = "") {
  const push = (kind, text) => problems.push({ kind, text: tag ? `[${tag}] ${text}` : text });
  page.on("pageerror", (e) => push("pageerror", e.message));
  page.on("console", (m) => m.type() === "error" && push("console", m.text()));
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) push("external", url);
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

/** Presses a playback speed button. They are named "Play at 4x" (aria-label); the text alone does not match. */
export const speed = (page, label) => page.getByRole("button", { name: `Play at ${label}`, exact: true }).click({ timeout: 5000 });

/**
 * The world's page address: `?stress=<n>` for a stress fixture (dev builds only: 1 or 20), `?scenario=<id>` for a demo
 * scenario (the Demo chip's picker), nothing for the default storyline.
 */
export const worldUrl = (base, stress, scenario) => `${base}${stress ? `?stress=${encodeURIComponent(stress)}` : scenario ? `?scenario=${encodeURIComponent(scenario)}` : ""}`;
