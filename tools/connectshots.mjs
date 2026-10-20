/* connectshots.mjs: the Connect screens and the Connection panel in screenshots, against the stub host of
   lib/connectStub.mjs (started here), plus a keyboard walk through the whole connection: paste a key, Enter, the host
   checks it, the world appears without a reload; the key is in no DOM, storage or URL; Forget this key brings the Connect
   screen back; a bad key lands on Key rejected with the host's reason.

   Usage:
     node tools/connectshots.mjs --port <vite port> --stub-port <port> [--states ...] [--theme light,dark] [--width 1440,375]
                                 [--tag ""] [--no-flow] [--out <dir>] [--swiftshader]
   Start the Vite with CREWHUB_WORLD_PORT=<stub port> so /world-api reaches the stub. States (default all):
     no-loops, pair, connect, pasted (a key in the field), invalid (not a key, Enter), checking, rejected, loops-down, connected,
     panel (the Connection panel open), forget (its confirm), older (a host from before the smooth connection).
   Output in --out: <tag><state>-<theme>-<width>.png. Prints connectshots: <passed>/<total> last; exit 0 at full marks. */
import { cli, launch, list, problemLines, watch } from "./lib/world.mjs";
import { createConnectStub } from "./lib/connectStub.mjs";

const STATES = ["no-loops", "pair", "connect", "pasted", "invalid", "checking", "rejected", "loops-down", "connected", "panel", "forget", "older"];
const opts = cli("node tools/connectshots.mjs --port <vite port> --stub-port <port> [--states ...] [--theme light,dark] [--width 1440,375] [--tag \"\"] [--no-flow] [--out <dir>] [--swiftshader]", {
  options: { "stub-port": null, states: STATES.join(","), theme: "light,dark", width: "1440,375", tag: "" },
  flags: ["no-flow"],
});
const stubPort = Number(opts["stub-port"]);
if (!Number.isInteger(stubPort) || stubPort <= 0) opts.fail("--stub-port <port> is required: the port the Vite proxy forwards /world-api to (CREWHUB_WORLD_PORT)");
const widths = list(opts.width).map(Number);
const themes = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const states = list(opts.states, STATES, opts.fail, "state");
const viewport = (width) => (width <= 480 ? { viewport: { width, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
const GOOD_KEY = "chl_" + "goodKEY-_0123456789abcdefghijklmnopqrstuv".slice(0, 43);
const BAD_KEY = "chl_bad" + "x".repeat(40);

const stub = await createConnectStub({ port: stubPort, state: "no-loops", origin: opts.origin, checkMs: 1200 });
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
const baseState = (state) => (state === "pasted" || state === "invalid" ? "connect" : state === "panel" || state === "forget" ? "connected" : state);

async function open(theme, width) {
  const ctx = await browser.newContext({ ...viewport(width), deviceScaleFactor: 1, colorScheme: theme });
  const p = await ctx.newPage();
  watch(p, opts.origin, problems, `${theme} ${width}`);
  await p.goto(opts.base, { waitUntil: "load" });
  return p;
}
const screen = (p, which, timeout = 15000) => p.waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout });
const live = (p, timeout = 45000) => p.waitForSelector('.connection-chip[data-connection="live"]', { timeout });

for (const state of states)
  for (const theme of themes)
    for (const width of widths) {
      await stub.setState(baseState(state));
      const p = await open(theme, width);
      try {
        if (baseState(state) === "connected" || state === "older") {
          await live(p);
          await p.waitForTimeout(1500);
          if (state === "panel" || state === "forget") {
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
console.log(notes.join("\n"));
const lines = problemLines(problems);
if (lines.length) console.log(lines.join("\n"));
ok("no page errors, console errors or requests that leave the page", lines.length === 0, String(lines.length));
console.log(`connectshots: ${passed}/${total}`);
process.exit(passed === total ? 0 : 1);
