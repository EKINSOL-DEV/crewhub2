/* a11y.mjs: the accessibility pass over the connection's UI and the town's labels, headless. Against the stub host of
   lib/connectStub.mjs (started here) it opens every Connect screen, the town with the Connection panel, the Stream busy
   chip and the older host, in both themes at 1440 and 375, and asks the browser what a screen reader would be given:

   - the accessibility tree (Playwright's aria snapshot) of each screen, saved as text in --out/a11y/<state>-<theme>-<width>.txt;
   - one live region per screen that says the screen once (its title), and nothing that ticks is live (no clock read aloud);
   - the keyboard: Tab reaches every control in reading order, every focused control shows a focus style, Enter on the chip
     opens the Connection panel with the focus inside it, Escape closes it and the focus is back on the chip;
   - the panel's rows (the version, Closed buildings) and the links that open a new tab say so;
   - a state change over a live town (Live to Stream busy) is said once in the page's live region;
   - text instead of colour: the agent pill carries its lane words for a reader, the quiet tag its ticket;
   - contrast of the text on each screen against the surface it stands on, computed from the resolved colours (4.5:1 for
     the small text everything here is), in light and dark;
   - 375 px: no horizontal scroll, every control at least 40 x 40 px (an invisible pad counts), reduced motion: the
     checking icon and the pinned card do not animate.
   With --demo it also opens the demo, enters a building and reads the pill, the waiting tag, the quiet tag and the board
   card there (about 40 s more).

   Usage:
     node tools/a11y.mjs --port <vite port> --stub-port <port> [--demo] [--out <dir>] [--swiftshader]
   Start the Vite with CREWHUB_WORLD_PORT=<stub port> so /world-api reaches the stub. Prints `a11y: <passed>/<total>` last;
   exit 0 at full marks. */
import { mkdirSync, writeFileSync } from "node:fs";
import { cli, launch, problemLines, seek, speed, watch } from "./lib/world.mjs";
import { createConnectStub } from "./lib/connectStub.mjs";

const opts = cli("node tools/a11y.mjs --port <vite port> --stub-port <port> [--demo] [--out <dir>] [--swiftshader]", { options: { "stub-port": null }, flags: ["demo"] });
const stubPort = Number(opts["stub-port"]);
if (!Number.isInteger(stubPort) || stubPort <= 0) opts.fail("--stub-port <port> is required: the port the Vite proxy forwards /world-api to (CREWHUB_WORLD_PORT)");
const outDir = `${opts.out}a11y/`;
mkdirSync(outDir, { recursive: true });

const browser = await launch(opts);
const problems = [];
let passed = 0;
let total = 0;
const ok = (name, condition, detail = "") => {
  total++;
  if (condition) passed++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const COMBOS = [
  ["light", 1440],
  ["dark", 1440],
  ["light", 375],
  ["dark", 375],
];
const viewport = (width) => (width <= 480 ? { viewport: { width, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
const SCREENS = { "no-loops": "No crewhub-loops found", pair: "Pair this browser", connect: "Connect to crewhub-loops", checking: "Checking the key…", rejected: "crewhub-loops rejected the key", "loops-down": "crewhub-loops is not answering" };

async function open(theme, width, { reducedMotion = "no-preference", url = opts.base } = {}) {
  const ctx = await browser.newContext({ ...viewport(width), deviceScaleFactor: 1, colorScheme: theme, reducedMotion });
  const p = await ctx.newPage();
  watch(p, opts.origin, problems, `${theme} ${width}`);
  await p.goto(url, { waitUntil: "load" });
  return p;
}
const screen = (p, which, timeout = 15000) => p.waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout });
const chipState = (p, which, timeout = 45000) => p.waitForSelector(`.connection-chip[data-connection="${which}"]`, { timeout });

/** A label's words as a reader gets them: the sr-only part included, whitespace folded. */
const texts = async (locator) => (await locator.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
/** Pauses the demo's playback (the button is named "Pause"). */
const pause = (p) => p.getByRole("button", { name: "Pause", exact: true }).click();

/** The live regions' words, joined. */
const spoken = (p) => p.locator("[aria-live=polite], [role=alert]").allInnerTexts().then((t) => t.join(" | ").replace(/\s+/g, " ").trim());

/** Tabs through the page: role:name and whether a focus style shows, per stop, until the focus leaves the document or wraps. */
async function tabOrder(p, max = 14) {
  const stops = [];
  for (let i = 0; i < max; i++) {
    await p.keyboard.press("Tab");
    const stop = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const focusStyle = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || (style.boxShadow !== "none" && style.boxShadow !== "");
      const r = el.getBoundingClientRect();
      const name = el.getAttribute("aria-label") ?? el.textContent?.replace(/\s+/g, " ").trim().slice(0, 40) ?? "";
      const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
      return { role, name, focusStyle, visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight };
    });
    if (!stop) break;
    if (stops.length && stops[0].role === stop.role && stops[0].name === stop.name) break;
    stops.push(stop);
  }
  return stops;
}

/** Contrast of every element matching the selectors against the first opaque background behind it. */
async function contrast(p, selectors) {
  return p.evaluate((selectors) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgb = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const lum = ({ r, g, b }) => {
      const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const background = (el) => {
      let acc = null;
      for (let node = el; node; node = node.parentElement) {
        const c = rgb(getComputedStyle(node).backgroundColor);
        if (c.a === 0) continue;
        acc = acc ? over(acc, c) : c;
        if (acc.a >= 0.999 || c.a >= 0.999) return acc;
      }
      return acc ? over(acc, { r: 255, g: 255, b: 255, a: 1 }) : { r: 255, g: 255, b: 255, a: 1 };
    };
    const out = [];
    for (const selector of selectors)
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || !(el.textContent ?? "").trim()) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const fg = rgb(style.color);
        const bg = background(el);
        const mixed = fg.a < 1 ? over(fg, bg) : fg;
        const l1 = lum(mixed);
        const l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        out.push({ selector, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32), ratio: Math.round(ratio * 10) / 10, size: parseFloat(style.fontSize), weight: style.fontWeight });
        break; // one of each selector is enough: they share the style
      }
    return out;
  }, selectors);
}
const TEXT = [".pair-lead", ".connect-sub", ".connect-steps li", ".hint", ".connect-rejected", ".connect-status", ".card-title", ".btn", ".btn-primary", ".btn-danger", ".connection-facts dt", ".connection-facts dd", ".connection-error", ".chip", ".chip-stalled", ".chip-attention", ".name-pill", ".name-pill.person", ".quiet-tag", ".name-tag", ".signal-tag", ".board-card", ".board-card.failed", ".first-snapshot", ".status-tag", ".agent-plate", ".sign-muted"];
/** Text contrast against its surface: 4.5:1 for small text, 3:1 from 24 px (or 18.66 px bold). */
const enough = (c) => c.ratio >= (c.size >= 24 || (c.size >= 18.66 && Number(c.weight) >= 700) ? 3 : 4.5);

/** Every control on the page at least 40 x 40 px, an invisible ::after pad counting. */
const smallControls = (p) =>
  p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("a[href], button, input, [tabindex]:not([tabindex='-1'])")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const after = getComputedStyle(el, "::after");
      const padW = after.content !== "none" ? parseFloat(after.width) || 0 : 0;
      const padH = after.content !== "none" ? parseFloat(after.height) || 0 : 0;
      const w = Math.max(r.width, padW);
      const h = Math.max(r.height, padH);
      if (w < 39.5 || h < 39.5) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${Math.round(w)}x${Math.round(h)}`);
    }
    return out;
  });

const stub = await createConnectStub({ port: stubPort, state: "no-loops", origin: opts.origin, checkMs: 1500 });

// 1. The Connect screens
for (const [state, title] of Object.entries(SCREENS))
  for (const [theme, width] of COMBOS) {
    await stub.setState(state);
    const p = await open(theme, width);
    const tag = `${state} ${theme} ${width}`;
    try {
      await screen(p, state);
      await p.waitForTimeout(600);
      writeFileSync(`${outDir}${state}-${theme}-${width}.txt`, await p.locator("main").ariaSnapshot());
      if (theme === "light" && width === 1440) {
        const said = await spoken(p);
        ok(`${state}: the live region says the screen once`, said.includes(title), said.slice(0, 100));
        ok(`${state}: nothing that ticks is live`, (await p.locator(".connect-status[aria-live], .connect-status[role=status]").count()) === 0);
        // The Pair screen's Copy button is live too (it says "Copied"); the screen's own region is the one sr-only status.
        ok(`${state}: one live region for the screen`, (await p.locator(".sr-only[role=status]").count()) === 1, String(await p.locator("[aria-live]").count()));
        ok(`${state}: the main region is named by its title`, (await p.locator("main[aria-labelledby=connect-title] #connect-title").count()) === 1);
        const stops = await tabOrder(p);
        ok(`${state}: Tab reaches every control, each with a focus style`, stops.length > 0 && stops.every((s) => s.focusStyle && s.visible), stops.map((s) => `${s.role}:${s.name}${s.focusStyle ? "" : " NO FOCUS STYLE"}`).join(" → "));
        if (state === "connect") {
          // Connect is disabled (not in the Tab order) while the field is empty; with a key in the field it follows the field.
          ok("connect: the order is the loops link, the key field, Use the demo", /^a:Open crewhub-loops/.test(`${stops[0]?.role}:${stops[0]?.name}`) && stops[1]?.role === "input" && /Use the demo/.test(stops[2]?.name ?? ""), stops.map((s) => `${s.role}:${s.name}`).join(" → "));
          await p.getByLabel("Access key").fill("chl_" + "k".repeat(43));
          await p.keyboard.press("Tab");
          ok("connect: with a key in the field, Tab reaches Connect next", await p.evaluate(() => document.activeElement?.textContent?.trim() === "Connect"));
          ok("connect: the loops link says it opens a new tab", (await p.getByRole("link", { name: /Opens in a new tab/ }).count()) === 1);
          ok("connect: the key field is named and described", (await p.evaluate(() => { const i = document.querySelector('input[type="password"]'); return !!i && !!i.labels?.length && !!i.getAttribute("aria-describedby"); })));
          // A key that is not one: the error names the shape, in words, and the field is marked invalid.
          await p.getByLabel("Access key").fill("not a key");
          await p.keyboard.press("Enter");
          await p.waitForTimeout(200);
          ok("connect: a wrong key marks the field invalid with words", (await p.locator('input[aria-invalid="true"]').count()) === 1 && /47 characters/.test(await p.locator(".connect-key").innerText()));
        }
        if (state === "rejected") {
          const said2 = await spoken(p);
          ok("rejected: the live region carries loops' reason", /The host says:/.test(said2), said2.slice(0, 120));
          ok("rejected: Forget this key is a button, before the key field", stops.findIndex((s) => /Forget this key/.test(s.name)) >= 0 && stops.findIndex((s) => /Forget this key/.test(s.name)) < stops.findIndex((s) => s.role === "input"));
          ok("rejected: the rejected words are not red alone (an icon and the title say it)", (await p.locator(".connect-title-icon").count()) === 1 && /rejected/.test(title));
        }
        if (state === "checking") {
          const anim = await p.evaluate(() => getComputedStyle(document.querySelector(".connect-title-icon")).animationName);
          ok("checking: the icon turns (motion allowed)", anim !== "none", anim);
        }
      }
      if (theme === "dark" && width === 375 && state === "checking") {
        const q = await open("dark", 375, { reducedMotion: "reduce" });
        await screen(q, state);
        const anim = await q.evaluate(() => getComputedStyle(document.querySelector(".connect-title-icon")).animationName);
        ok("checking: no motion under reduced motion", anim === "none", anim);
        await q.context().close();
      }
      if (width === 375) {
        ok(`${tag}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const small = await smallControls(p);
        ok(`${tag}: every control is at least 40 x 40`, small.length === 0, small.join(", "));
      }
      const low = (await contrast(p, TEXT)).filter((c) => !enough(c));
      ok(`${tag}: text contrast`, low.length === 0, low.map((c) => `${c.selector} "${c.text}" ${c.ratio}:1`).join("; "));
    } catch (error) {
      ok(`${tag}: the screen came`, false, error.message.split("\n")[0]);
    }
    await p.context().close();
  }

// 2. The town: the chip, the Connection panel, the chat chip, a state change said, Stream busy, the older host
for (const [theme, width] of COMBOS) {
  await stub.setState("connected");
  const p = await open(theme, width);
  const tag = `connected ${theme} ${width}`;
  try {
    await chipState(p, "live");
    await p.waitForTimeout(1500);
    writeFileSync(`${outDir}town-${theme}-${width}.txt`, await p.locator("header, .world-corner-left, .world-chat").ariaSnapshot().catch(() => ""));
    const chip = p.locator("button.connection-chip");
    ok(`${tag}: the chip is a button that names the state and what it opens`, /Live.*Open the connection panel/.test((await chip.getAttribute("aria-label")) ?? ""), (await chip.getAttribute("aria-label")) ?? "");
    // The Chat chip (round 12): a button that names what it opens; Enter opens the Chat panel, a dialog with the focus
    // inside, whose frame is titled and whose link to the app says it opens a new tab; Escape returns the focus to the chip.
    const chatChip = p.locator("button.chat-open");
    ok(`${tag}: the chat chip is a button that names what it opens`, /crewhub-loops' own chat/.test((await chatChip.getAttribute("aria-label")) ?? "") && (await chatChip.getAttribute("aria-haspopup")) === "dialog", (await chatChip.getAttribute("aria-label")) ?? "");
    await chatChip.focus();
    await p.keyboard.press("Enter");
    await p.waitForSelector(".chat-sheet", { timeout: 5000 });
    await p.waitForTimeout(400);
    writeFileSync(`${outDir}chat-${theme}-${width}.txt`, await p.locator(".chat-sheet").ariaSnapshot());
    ok(`${tag}: Enter on the chat chip opens the Chat panel, a dialog named Chat with the focus inside, its frame titled, its app link saying it opens a new tab`, await p.evaluate(() => { const d = document.querySelector(".chat-sheet"); const frame = d?.querySelector("iframe"); const link = d?.querySelector(".chat-open-app"); return !!d && d.getAttribute("role") === "dialog" && document.getElementById(d.getAttribute("aria-labelledby") ?? "")?.textContent === "Chat" && d.contains(document.activeElement) && !!frame?.getAttribute("title") && /Opens in a new tab/.test(link?.textContent ?? ""); }));
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    ok(`${tag}: Escape closes the Chat panel and the focus returns to the chat chip`, (await p.locator(".chat-sheet").count()) === 0 && (await p.evaluate(() => document.activeElement?.classList.contains("chat-open") ?? false)));
    await chip.focus();
    await p.keyboard.press("Enter");
    await p.waitForSelector(".connection-sheet", { timeout: 5000 });
    await p.waitForTimeout(400);
    writeFileSync(`${outDir}panel-${theme}-${width}.txt`, await p.locator(".connection-sheet").ariaSnapshot());
    ok(`${tag}: Enter on the chip opens the panel, a dialog named Connection, with the focus inside`, await p.evaluate(() => { const d = document.querySelector(".connection-sheet"); return !!d && d.getAttribute("role") === "dialog" && document.getElementById(d.getAttribute("aria-labelledby") ?? "")?.textContent === "Connection" && d.contains(document.activeElement); }));
    ok(`${tag}: the chip says the panel is open`, (await chip.getAttribute("aria-expanded")) === "true");
    const facts = (await p.locator(".connection-facts").innerText()).replace(/\s+/g, " ");
    ok(`${tag}: the panel's rows name the version and the closed buildings`, /crewhub-loops version/.test(facts) && /Closed buildings 1 archived project, from loops' event log/.test(facts), facts.slice(0, 200));
    ok(`${tag}: the panel's rows are a definition list`, (await p.locator(".connection-sheet dl.connection-facts dt").count()) >= 6);
    ok(`${tag}: nothing in the panel ticks live`, (await p.locator(".connection-sheet [aria-live]").count()) === 1 && (await p.locator(".connection-sheet [aria-live]").innerText()) === "");
    const stops = await tabOrder(p, 6);
    ok(`${tag}: Tab inside the panel reaches Close and Forget this key with a focus style`, stops.some((s) => /Forget this key/.test(s.name)) && stops.filter((s) => /Close the connection panel|Forget this key/.test(s.name)).every((s) => s.focusStyle), stops.map((s) => `${s.role}:${s.name}`).join(" → "));
    await p.getByRole("button", { name: "Forget this key" }).focus();
    await p.keyboard.press("Enter");
    await p.waitForSelector(".connection-confirm", { timeout: 3000 });
    ok(`${tag}: the confirm is a named group with Forget and Keep`, (await p.locator('.connection-confirm[role=group][aria-labelledby="connection-forget-ask"]').count()) === 1 && (await p.getByRole("button", { name: "Keep" }).count()) === 1);
    await p.getByRole("button", { name: "Keep" }).click();
    ok(`${tag}: Keep returns the focus to Forget this key`, await p.evaluate(() => document.activeElement?.textContent === "Forget this key"));
    const low = (await contrast(p, TEXT)).filter((c) => !enough(c));
    ok(`${tag}: text contrast (town and panel)`, low.length === 0, low.map((c) => `${c.selector} "${c.text}" ${c.ratio}:1`).join("; "));
    if (width === 375) {
      ok(`${tag}: no horizontal scroll with the panel open`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const small = await smallControls(p);
      ok(`${tag}: every control is at least 40 x 40`, small.length === 0, small.join(", "));
    }
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
    ok(`${tag}: Escape closes the panel and the focus is back on the chip`, (await p.locator(".connection-sheet").count()) === 0 && (await p.evaluate(() => document.activeElement?.classList.contains("connection-chip"))));
    if (theme === "light" && width === 1440) {
      // A state change over the live town is said once: loops refuses the stream (429) under the running page.
      await stub.setState("busy");
      await chipState(p, "stream-busy");
      await p.waitForTimeout(500);
      const said = await spoken(p);
      ok("live town: the change to Stream busy is said in the live region", /Connection: Stream busy\./.test(said), said.slice(0, 160));
      ok("live town: the busy chip names the state in words", /Stream busy/.test((await chip.getAttribute("aria-label")) ?? ""));
      const chips = await contrast(p, [".chip-stalled"]);
      ok("live town: the Stream busy chip's text contrast", chips.every(enough), chips.map((c) => `${c.ratio}:1`).join(", "));
    }
  } catch (error) {
    ok(`${tag}: the town came`, false, error.message.split("\n")[0]);
  }
  await p.context().close();
}

// 3. The older host: the panel says so, in words
{
  await stub.setState("older");
  const p = await open("light", 1440);
  try {
    await chipState(p, "live");
    await p.locator("button.connection-chip").click();
    await p.waitForSelector(".connection-sheet", { timeout: 5000 });
    ok("older host: the panel says the host reports no connection details", /before the smooth connection/.test(await p.locator(".connection-sheet").innerText()));
  } catch (error) {
    ok("older host: the panel came", false, error.message.split("\n")[0]);
  }
  await p.context().close();
}
await stub.close();

// 4. The demo: the town's labels in words (the pill's lane, a person, the waiting tag, the quiet tag, the board card)
if (opts.demo) {
  const p = await open("light", 1440, { url: `${opts.base}?rooms=three` });
  try {
    await p.waitForSelector("canvas", { timeout: 60000 });
    await p.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0, null, { timeout: 60000 });
    await p.waitForTimeout(1500);
    ok("demo: the Demo chip names the scenario and that the data is scripted", (await p.locator('header [aria-label^="Demo: scripted data"]').count()) === 1);
    // Enter crewhub through the jump list, then Details on: every label shows.
    await p.keyboard.press("/");
    await p.waitForSelector('[role="listbox"], .jump-list, [role="dialog"]', { timeout: 5000 });
    await p.keyboard.type("crewhub");
    await p.waitForTimeout(300);
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 });
    await p.waitForTimeout(1500);
    await p.keyboard.press("d");
    await p.waitForTimeout(1200);
    const pills = await texts(p.locator(".world-labels .name-pill:not(.person)"));
    ok("demo: an agent's pill says its lane in words, not the dot's colour alone", pills.length > 0 && pills.every((t) => /: (working|done|blocked|planned|waiting|idle|unknown|stale|working elsewhere|[a-z ]+)$/.test(t.trim())), pills.slice(0, 4).join(" | "));
    const stalled = await texts(p.locator(".world-labels .signal-tag:not(.quiet-tag)"));
    ok("demo: a clock tag names its ticket and the minutes", stalled.length === 0 || stalled.some((t) => /^[A-Z]+-\d+ quiet \d+ min/.test(t.trim())), stalled.slice(0, 3).join(" | "));
    // The storyline's quiet fact (CR-17 at 8:10) and the first automation run (8:40), as regress finds them.
    await seek(p, 485000);
    await speed(p, "4x");
    await p.waitForSelector(".world-labels .quiet-tag", { timeout: 25000 });
    await pause(p);
    const quiet = await texts(p.locator(".world-labels .quiet-tag"));
    ok("demo: the quiet tag names its ticket for a reader", quiet.some((t) => /^CR-17 quiet 30 min/.test(t.trim())), quiet.join(" | "));
    const low1 = (await contrast(p, [".quiet-tag", ".name-pill", ".name-tag", ".status-tag", ".signal-tag"])).filter((c) => !enough(c));
    ok("demo: the labels' text contrast (light)", low1.length === 0, low1.map((c) => `${c.selector} ${c.ratio}:1`).join("; "));
    await seek(p, 519000);
    await speed(p, "4x");
    await p.waitForSelector(".world-labels .board-card", { timeout: 25000 });
    await pause(p);
    // The card is pinned for a few seconds of the demo's clock, which the pause holds; read it at once all the same.
    const card = await p.evaluate(() => { const c = document.querySelector(".world-labels .board-card"); return c ? { role: c.getAttribute("role"), text: (c.textContent ?? "").replace(/\s+/g, " ").trim() } : null; });
    ok("demo: the board card is a status region in words", card?.role === "status" && /ran on .*: (done|failed)/.test(card.text), card?.text ?? "no card");
    const visits = await texts(p.locator(".world-labels .name-pill.person"));
    ok("demo: a person's pill says it is a person (or none is in view)", visits.every((t) => /, a person$/.test(t.trim())), visits.join(" | "));
    const waits = await texts(p.locator(".world-labels .name-tag"));
    ok("demo: a waiting tag names its ticket (or none is in view)", waits.every((t) => /^[A-Z]+-\d+ waits on /.test(t.trim())), waits.join(" | "));
  } catch (error) {
    ok("demo: the labels came", false, error.message.split("\n")[0]);
  }
  await p.context().close();
  // Dark theme and reduced motion over the same building: the labels' contrast and the pinned card still.
  const q = await open("dark", 1440, { reducedMotion: "reduce", url: `${opts.base}?rooms=three` });
  try {
    await q.waitForSelector("canvas", { timeout: 60000 });
    await q.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0, null, { timeout: 60000 });
    await q.keyboard.press("/");
    await q.waitForSelector('[role="listbox"], .jump-list, [role="dialog"]', { timeout: 5000 });
    await q.keyboard.type("crewhub-loops");
    await q.waitForTimeout(300);
    await q.keyboard.press("Enter");
    await q.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 });
    await q.keyboard.press("d");
    await seek(q, 530000);
    await speed(q, "4x");
    await q.waitForSelector(".world-labels .board-card.failed", { timeout: 25000 });
    await pause(q);
    const still = await q.evaluate(() => { const c = document.querySelector(".world-labels .board-card"); return c ? getComputedStyle(c).animationName : "no card"; });
    const low2 = (await contrast(q, [".board-card.failed", ".board-card", ".quiet-tag", ".name-pill", ".name-tag", ".status-tag", ".signal-tag", ".sign-muted"])).filter((c) => !enough(c));
    ok("demo: the failed card and the labels keep their contrast in the dark theme", low2.length === 0, low2.map((c) => `${c.selector} ${c.ratio}:1`).join("; "));
    ok("demo: the pinned card does not animate under reduced motion", still === "none", still);
  } catch (error) {
    ok("demo dark: the failed card came", false, error.message.split("\n")[0]);
  }
  await q.context().close();
}

await browser.close();
// The Chat panel's frame is the one request that leaves the page by design: the loops web page the stub host names.
const webUrl = stub.webUrl();
const lines = problemLines(problems.filter((x) => !(x.kind === "console" && /status of 403/.test(x.text)) && !(x.kind === "external" && webUrl && x.text.includes(webUrl))));
if (lines.length) console.log(lines.join("\n"));
ok("no page errors, console errors or requests that leave the page", lines.length === 0, String(lines.length));
console.log(`a11y: ${passed}/${total}`);
process.exit(passed === total ? 0 : 1);
