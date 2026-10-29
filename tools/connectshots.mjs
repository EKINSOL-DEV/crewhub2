/* connectshots.mjs: the Connect screens and the Connection panel in screenshots, against the stub host of
   lib/connectStub.mjs (started here), plus a keyboard walk through the whole connection: paste a key, Enter, the host
   checks it, the world appears without a reload; the key is in no DOM, storage or URL; Forget this key brings the Connect
   screen back; a bad key lands on Key rejected with the host's reason.

   Usage:
     node tools/connectshots.mjs --port <vite port> --stub-port <port> [--states ...] [--theme light,dark] [--width 1440,375]
                                 [--tag ""] [--no-flow] [--out <dir>] [--swiftshader]
   Start the Vite with CREWHUB_WORLD_PORT=<stub port> so /world-api reaches the stub. States (default: all of these):
     no-loops, pair, connect, pasted (a key in the field), invalid (not a key, Enter), checking, rejected, loops-down, connected,
     panel (the Connection panel open), forget (its confirm), busy and busy-panel (loops refused the host's stream with
     429: the Stream busy chip, and the panel with the reason), older (a host from before the smooth connection).
     rejected-readonly exists only with --real (the stub knows no Read only bot); asking the stub for it is refused up front.
   --real: no stub; the host behind the Vite proxy is a real one (apps/host against crewhub-loops). Then --pair-link <url>
     (one one-time link from `npm run host -- open --origin <vite origin> --no-open`; visited once, its cookie copied to
     every context) and --key-file <path> (the key pasted for the connected step; read here, typed into the field, never
     printed) are needed, and the states run in order on one page per theme and width: connect, pasted, invalid, rejected
     (a shaped key loops does not know), rejected-readonly (a real Read only bot's key from --readonly-key-file: the refusal
     must say to make a new bot with Read only off), connected, panel, forget (which hands the Connect screen back). With --states
     no-loops or pair (no pair link) the host must be in that state itself.
   Output in --out: <tag><state>-<theme>-<width>.png. Prints connectshots: <passed>/<total> last; exit 0 at full marks. */
import { cli, launch, list, problemLines, watch } from "./lib/world.mjs";
import { createConnectStub } from "./lib/connectStub.mjs";
import { ownPort } from "./lib/toolGuard.ts";

const STATES = ["no-loops", "pair", "connect", "pasted", "invalid", "checking", "rejected", "rejected-readonly", "loops-down", "connected", "panel", "forget", "busy", "busy-panel", "older"];
/** States only a real host can show (the stub knows no Read only bot); the stub run's default list leaves them out. */
const REAL_ONLY = ["rejected-readonly"];
const opts = cli("node tools/connectshots.mjs --port <vite port> --stub-port <port> [--states ...] [--theme light,dark] [--width 1440,375] [--tag \"\"] [--no-flow] [--out <dir>] [--swiftshader]", {
  options: { "stub-port": null, states: null, theme: "light,dark", width: "1440,375", tag: "", "pair-link": null, "key-file": null, "readonly-key-file": null },
  flags: ["no-flow", "real"],
});
const stubVerdict = opts.real ? null : ownPort(opts["stub-port"], "--stub-port");
if (stubVerdict !== null && !stubVerdict.ok) opts.fail(`${stubVerdict.reason} (the port the Vite proxy forwards /world-api to, CREWHUB_WORLD_PORT)`);
const stubPort = stubVerdict === null ? 0 : stubVerdict.value;
const widths = list(opts.width).map(Number);
const themes = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const states = list(opts.states ?? (opts.real ? STATES : STATES.filter((s) => !REAL_ONLY.includes(s))).join(","), STATES, opts.fail, "state");
if (!opts.real) for (const s of states) if (REAL_ONLY.includes(s)) opts.fail(`state "${s}" needs --real (and --readonly-key-file): the stub host knows no Read only bot`);
const viewport = (width) => (width <= 480 ? { viewport: { width, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
const GOOD_KEY = "chl_" + "goodKEY-_0123456789abcdefghijklmnopqrstuv".slice(0, 43);
const BAD_KEY = "chl_bad" + "x".repeat(40);

const browser = await launch(opts);
const problems = [];
const notes = [];
let passed = 0;
let total = 0;
const ok = (name, condition, detail = "") => {
  total++;
  if (condition) passed++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const name = (state, theme, width) => `${opts.out}${opts.tag}${state}-${theme}-${width}.png`;
const baseState = (state) => (state === "pasted" || state === "invalid" ? "connect" : state === "panel" || state === "forget" ? "connected" : state === "busy-panel" ? "busy" : state);

async function open(theme, width) {
  const ctx = await browser.newContext({ ...viewport(width), deviceScaleFactor: 1, colorScheme: theme });
  const p = await ctx.newPage();
  watch(p, opts.origin, problems, `${theme} ${width}`);
  await p.goto(opts.base, { waitUntil: "load" });
  return p;
}
const screen = (p, which, timeout = 15000) => p.waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout });
const live = (p, timeout = 45000) => p.waitForSelector('.connection-chip[data-connection="live"]', { timeout });
const chipState = (p, which, timeout = 45000) => p.waitForSelector(`.connection-chip[data-connection="${which}"]`, { timeout });

if (opts.real) {
  await realRun();
  await browser.close();
  finish();
}

/** The real host behind the proxy: one page per theme and width, the states in order (see the header). */
async function realRun() {
  const { readFileSync } = await import("node:fs");
  const realKey = opts["key-file"] ? readFileSync(opts["key-file"], "utf8").trim() : null;
  const readonlyKey = opts["readonly-key-file"] ? readFileSync(opts["readonly-key-file"], "utf8").trim() : null;
  let cookies = null;
  const REAL_ORDER = ["no-loops", "pair", "connect", "pasted", "invalid", "rejected", "rejected-readonly", "connected", "panel", "forget"];
  const wanted = REAL_ORDER.filter((s) => states.includes(s));
  for (const theme of themes)
    for (const width of widths) {
      const ctx = await browser.newContext({ ...viewport(width), deviceScaleFactor: 1, colorScheme: theme });
      const p = await ctx.newPage();
      watch(p, opts.origin, problems, `${theme} ${width}`);
      if (opts["pair-link"] && cookies === null) {
        await p.goto(opts["pair-link"], { waitUntil: "load" });
        cookies = await ctx.cookies();
        ok("real: the one-time link paired this browser", cookies.length > 0, `${cookies.length} cookie(s)`);
      } else if (cookies) await ctx.addCookies(cookies);
      await p.goto(opts.base, { waitUntil: "load" });
      const tag = `${theme} ${width}`;
      for (const state of wanted) {
        try {
          switch (state) {
            case "no-loops":
            case "pair":
            case "connect":
              await screen(p, state);
              await p.waitForTimeout(500);
              break;
            case "pasted":
              await screen(p, "connect");
              await p.getByLabel("Access key").fill(GOOD_KEY);
              await p.waitForTimeout(200);
              break;
            case "invalid":
              await p.getByLabel("Access key").fill("not a key");
              await p.keyboard.press("Enter");
              await p.waitForTimeout(200);
              break;
            case "rejected": {
              await p.getByLabel("Access key").fill(GOOD_KEY);
              await p.keyboard.press("Enter");
              await p.waitForSelector(".connect-rejected, .connect-page[data-screen=\"rejected\"]", { timeout: 15000 });
              const reason = await p.locator(".connect-rejected").first().innerText().catch(() => "");
              if (theme === themes[0] && width === widths[0]) ok("real: a key loops does not know is refused with the host's reason", reason.length > 10, reason.slice(0, 120));
              await p.waitForTimeout(300);
              break;
            }
            case "rejected-readonly": {
              if (!readonlyKey) throw new Error("--readonly-key-file is needed for the rejected-readonly step");
              await p.getByLabel("Access key").fill(readonlyKey);
              await p.keyboard.press("Enter");
              await p.waitForFunction(() => /Read only/.test(document.querySelector(".connect-rejected")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => undefined);
              const reason = await p.locator(".connect-rejected").first().innerText().catch(() => "");
              if (theme === themes[0] && width === widths[0]) {
                ok("real: a Read only bot's key is refused", reason.length > 10, reason.slice(0, 160));
                ok("real: the refusal says to make a new bot with Read only off", /Read only/.test(reason) && /new|another/i.test(reason) && /off/.test(reason), reason.slice(0, 200));
                const html = await p.content();
                ok("real: the Read only key is in no DOM after the refusal", !html.includes(readonlyKey.slice(4, 20)));
              }
              await p.waitForTimeout(300);
              break;
            }
            case "connected": {
              if (!realKey) throw new Error("--key-file is needed for the connected step");
              await p.getByLabel("Access key").fill(realKey);
              await p.keyboard.press("Enter");
              await live(p, 60000);
              await p.waitForTimeout(2500);
              if (theme === themes[0] && width === widths[0]) {
                const html = await p.content();
                ok("real: the key is in no DOM after connecting", !html.includes(realKey.slice(4, 20)));
                ok("real: the Live chip against the real crewhub-loops", (await p.locator('.connection-chip[data-connection="live"]').count()) > 0);
              }
              break;
            }
            case "panel": {
              await p.locator(".connection-chip").click();
              await p.waitForSelector(".connection-sheet", { timeout: 5000 });
              await p.waitForTimeout(1500);
              if (theme === themes[0] && width === widths[0]) {
                const facts = await p.locator(".connection-facts").innerText();
                ok("real: the panel names where loops was found, the key and the stream", /found/.test(facts) && /accepted/.test(facts) && /streaming/.test(facts), facts.replace(/\s+/g, " ").slice(0, 200));
              }
              break;
            }
            case "forget": {
              await p.getByRole("button", { name: "Forget this key" }).click();
              await p.waitForSelector(".connection-confirm", { timeout: 5000 });
              await p.screenshot({ path: name(state, theme, width) });
              notes.push(`${state} ${tag}: shot`);
              await p.getByRole("button", { name: "Forget", exact: true }).click();
              await screen(p, "connect", 20000);
              if (theme === themes[0] && width === widths[0]) ok("real: Forget this key hands the Connect screen back", (await p.locator('.connect-page[data-screen="connect"]').count()) > 0);
              continue;
            }
          }
          await p.screenshot({ path: name(state, theme, width) });
          notes.push(`${state} ${tag}: shot`);
        } catch (error) {
          // A step that throws is a failing check (review F20): its own checks never ran, and the total must not shrink.
          ok(`real: ${state} ${tag} ran`, false, error.message.split("\n")[0]);
          notes.push(`${state} ${tag}: ${error.message.split("\n")[0]}`);
          await p.screenshot({ path: name(`${state}-FAILED`, theme, width) }).catch(() => undefined);
        }
      }
      await ctx.close();
    }
}

function finish() {
  console.log(notes.join("\n"));
  // The one console line a refused key must produce: the browser logs every 4xx answer to a fetch, and the host answers a
  // bad key with 403 key_rejected. It is expected, so it is a note, not a problem.
  const expected = problems.filter((p) => p.kind === "console" && /status of 403/.test(p.text));
  if (expected.length) console.log(`expected: ${expected.length} console line(s) "403 (Forbidden)" from the refused key's POST /world-api/connect`);
  const lines = problemLines(problems.filter((p) => !expected.includes(p)));
  if (lines.length) console.log(lines.join("\n"));
  ok("no page errors, console errors or requests that leave the page", lines.length === 0, String(lines.length));
  console.log(`connectshots: ${passed}/${total}`);
  process.exit(passed === total ? 0 : 1);
}

const stub = await createConnectStub({ port: stubPort, state: "no-loops", origin: opts.origin, checkMs: 1200 });

for (const state of states)
  for (const theme of themes)
    for (const width of widths) {
      await stub.setState(baseState(state));
      const p = await open(theme, width);
      try {
        if (baseState(state) === "connected" || state === "older" || baseState(state) === "busy") {
          if (baseState(state) === "busy") await chipState(p, "stream-busy");
          else await live(p);
          await p.waitForTimeout(1500);
          if (state === "panel" || state === "forget" || state === "busy-panel") {
            await p.locator(".connection-chip").click();
            await p.waitForSelector(".connection-sheet", { timeout: 5000 });
            await p.waitForTimeout(600);
            if (state === "forget") {
              await p.getByRole("button", { name: "Forget this key" }).click();
              await p.waitForSelector(".connection-confirm", { timeout: 5000 });
            }
          }
        } else {
          await screen(p, baseState(state));
          if (state === "pasted") {
            await p.getByLabel("Access key").fill(GOOD_KEY);
            await p.waitForTimeout(200);
          } else if (state === "invalid") {
            await p.getByLabel("Access key").fill("not a key");
            await p.keyboard.press("Enter");
            await p.waitForTimeout(200);
          }
          await p.waitForTimeout(400);
        }
        await p.screenshot({ path: name(state, theme, width) });
        notes.push(`${state} ${theme} ${width}: shot`);
      } catch (error) {
        // A screen that did not come is a failing check (review F20), not only a note beside full marks.
        ok(`${state} ${theme} ${width}: the screen came`, false, error.message.split("\n")[0]);
        notes.push(`${state} ${theme} ${width}: ${error.message.split("\n")[0]}`);
        await p.screenshot({ path: name(`${state}-FAILED`, theme, width) }).catch(() => undefined);
      }
      await p.context().close();
    }

if (!opts["no-flow"]) {
  // The whole connection, by keyboard, at 1440 light.
  await stub.setState("connect");
  const p = await open("light", 1440);
  await screen(p, "connect");
  await p.evaluate(() => ((window.__connectMarker = "set"), undefined));
  const order = [];
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press("Tab");
    order.push(await p.evaluate(() => `${document.activeElement?.tagName.toLowerCase()}:${document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 24) ?? ""}`));
    if ((await p.evaluate(() => document.activeElement?.getAttribute("type"))) === "password") break;
  }
  ok("flow: Tab reaches the key field after the Open link (focus order)", order.at(-1)?.startsWith("input") && order.length <= 3, order.join(" → "));
  ok("flow: the field is a password field (masked while typed)", (await p.getByLabel("Access key").getAttribute("type")) === "password");
  await p.keyboard.type(GOOD_KEY);
  const hint = await p.locator(".connect-key .hint").innerText().catch(() => "");
  ok("flow: the hint names only the last four characters", hint.includes(`…${GOOD_KEY.slice(-4)}`) && !hint.includes(GOOD_KEY.slice(0, 12)), hint);
  await p.keyboard.press("Enter");
  await screen(p, "checking", 5000).catch(() => undefined);
  ok("flow: Enter posts the key and the host says checking", stub.state === "checking" || stub.state === "connected", stub.state);
  await live(p, 30000).catch(() => undefined);
  ok("flow: the town appears with the Live chip", (await p.locator('.connection-chip[data-connection="live"]').count()) > 0);
  ok("flow: no reload between the Connect screen and the town", (await p.evaluate(() => window.__connectMarker)) === "set");
  const html = await p.content();
  const stored = await p.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)));
  ok("flow: the key is in no DOM, storage or URL", !html.includes(GOOD_KEY.slice(4, 24)) && !stored.includes(GOOD_KEY.slice(4, 24)) && !p.url().includes("chl_"));
  await p.locator(".connection-chip").click();
  await p.waitForSelector(".connection-sheet", { timeout: 5000 });
  const facts = await p.locator(".connection-facts").innerText();
  ok("flow: the panel names the key, where loops was found and the stream", /crewhub-world/.test(facts) && /socket/.test(facts) && /streaming|Cursor/.test(facts), facts.replace(/\s+/g, " ").slice(0, 160));
  const focusedInPanel = await p.evaluate(() => document.querySelector(".connection-sheet")?.contains(document.activeElement));
  ok("flow: opening the panel moves the focus into it", focusedInPanel === true);
  await p.keyboard.press("Escape");
  ok("flow: Escape closes the panel and the focus returns to the chip", (await p.locator(".connection-sheet").count()) === 0 && (await p.evaluate(() => document.activeElement?.classList.contains("connection-chip"))) === true);
  await p.keyboard.press("Enter");
  await p.waitForSelector(".connection-sheet", { timeout: 5000 });
  await p.getByRole("button", { name: "Forget this key" }).click();
  await p.getByRole("button", { name: "Forget", exact: true }).click();
  await screen(p, "connect", 15000).catch(() => undefined);
  ok("flow: Forget this key brings the Connect screen back", stub.state === "connect" && (await p.locator('.connect-page[data-screen="connect"]').count()) > 0, stub.state);
  await p.getByLabel("Access key").fill(BAD_KEY);
  await p.keyboard.press("Enter");
  await screen(p, "rejected", 10000).catch(() => undefined);
  const reason = await p.locator(".connect-rejected").innerText().catch(() => "");
  ok("flow: a bad key lands on Key rejected with the host's reason", /Read only/.test(reason), reason.slice(0, 100));
  ok("flow: the rejected screen offers the field again", (await p.getByLabel("Access key").count()) === 1);
  await p.context().close();
}

await browser.close();
await stub.close();
finish();
