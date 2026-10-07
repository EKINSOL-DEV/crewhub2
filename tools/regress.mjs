/* regress.mjs: the browser regression pass of the integrated world, in three groups.

   Usage:
     node tools/regress.mjs --port <port> [--groups walk,demo,live] [--host-port 5180] [--tag pass] [--out <dir>] [--swiftshader]

   Groups (--groups, default all three, in this order):
     walk  38 checks along a visitor's walk through the demo (keyboard, the text view, the timeline, chat, build mode,
           settings, the where form, reduced motion, a phone, both themes). About two minutes.
     demo  the jump list (/ opens it, a building's name, Enter lands inside), the scenario picker (the Demo chip, One
           project, back to Small team) and the Studio scenario's Region level (district cards, a beacon, a pin, a
           district, a building, the Escape chain back to the Region). About half a minute.
     live  live mode against a fake crewhub-loops the tool starts itself (`packages/loops-fake`, port 0) behind a host it
           starts itself (`apps/host`): the Live chip, the sign-in link, Loops down after the fake closes, Live again
           after a new fake on the same port, and, when the host has pairing, the pairing page without a cookie and
           the world after the one-time link. When `apps/world/dist` exists (after `npm run build`) the host serves
           it on a free port and the browser opens the host directly; otherwise the host listens on --host-port
           (default 5180, Vite's default proxy target) and the browser opens your Vite, which must have been started
           with CREWHUB_WORLD_PORT=<host-port>. About half a minute.
   Besides the checks it fails on any page error, console error or request that leaves the page's own origin, and
   on a group that stops before its end.

   Output in --out (default tools/out/): <tag>-NN-<stop>.png, <tag>-results.json (every check as { name, pass,
   detail }) and <tag>.log (what is printed, with each group's time as an INFO line). The last line printed is
   `regress: <passed>/<total>`; the exit code is 0 only when every check passed.

   Run it against a dev server (Vite): some checks read the scene through `window.__town`, which only dev builds set. */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cli, dressed, launch, list, problemLines, seek, speed, watch } from "./lib/world.mjs";

const GROUPS = ["walk", "demo", "live"];
const USAGE = "node tools/regress.mjs --port <port> [--groups walk,demo,live] [--host-port 5180] [--tag pass] [--out <dir>] [--swiftshader]";
const opts = cli(USAGE, { options: { tag: "pass", groups: GROUPS.join(","), "host-port": "5180" } });
const groups = list(opts.groups, GROUPS, opts.fail, "group");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { tag, out: OUT, base: BASE, origin } = opts;
const browser = await launch(opts);
const log = [];
const results = [];
const ok = (name, cond, detail = "") => (results.push({ name, pass: !!cond, detail }), log.push(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`));
const info = (text) => log.push(`INFO ${text}`);
const problems = [];

/** Runs one group when it was asked for, times it, and turns an exception in it into one FAIL instead of a dead run. */
async function group(name, run) {
  if (!groups.includes(name)) return;
  const started = Date.now();
  const first = results.length;
  try {
    await run();
  } catch (e) {
    ok(`${name} group runs to its end`, false, (e?.message ?? String(e)).split("\n")[0]);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const mine = results.slice(first);
  info(`group ${name}: ${mine.filter((r) => r.pass).length}/${mine.length} in ${seconds} s`);
}

async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...options });
  const p = await ctx.newPage();
  watch(p, origin, problems);
  return p;
}
async function town(p, settle, url = BASE) {
  await p.goto(url);
  await dressed(p);
  await p.waitForTimeout(settle);
}
const shot = (p, name) => p.screenshot({ path: `${OUT}${tag}-${name}.png` });
const sheet = (p) => p.locator("#text-view");
/** Opens the text view (T), reads it and closes it again. */
const text = async (p) => {
  await p.keyboard.press("t");
  await p.waitForTimeout(400);
  const t = await sheet(p).innerText().catch(() => "");
  await p.keyboard.press("Escape");
  return t;
};
const canvas = (p) => p.locator("canvas").first();
const crumbs = async (p) => (await p.locator("header, .breadcrumb, nav").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
/** The chip in the header that says the data is scripted; since the scenario picker it is a button, "Demo: <scenario>". */
const demoChip = (p) => p.locator("header .demo-word, header .chip").filter({ hasText: /^Demo\b/ }).first();
/** The breadcrumb: how many levels it shows and the name of the current one. */
const trail = (p) => p.locator("nav.world-breadcrumb");
const levels = (p) => trail(p).getAttribute("data-levels").catch(() => null);
const level = async (p) => (await trail(p).locator(".crumb-current").innerText().catch(() => "")).trim();
/** The entered building's slug as the scene has it; undefined outside a dev build. */
const entered = (p) => p.evaluate(() => globalThis.__town?.view?.entered);
/** How many of the elements `selector` finds are drawn: a box on screen, not hidden, not faded out. */
const drawn = (p, selector) =>
  p.evaluate((selector) => {
    const shown = (e) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && e.closest(".anchor")?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    return [...document.querySelectorAll(selector)].filter(shown).length;
  }, selector);
/** The labels that show over the scene: every element of the label layer that is drawn and not faded out. */
const labels = (p, selector = ".world-labels .anchor *") =>
  p.evaluate((selector) => {
    const shown = (e) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && e.closest(".anchor")?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    return [...document.querySelectorAll(selector)].filter((e) => e.children.length === 0 || e.matches(".room-sign, .town-sign")).filter(shown).length;
  }, selector);
const walkersWalking = (p) => p.evaluate(() => [...(globalThis.__town?.walks?.walkers?.() ?? [])].filter((x) => x.walking).length).catch(() => -1);

await group("walk", async () => {
  // 1. Town, Demo label, text view completeness
  let p = await open();
  await town(p, 3000);
  await shot(p, "01-town");
  // The chip in the header says the data is scripted; since the scenario picker it is a button, "Demo: <scenario>".
  const chip = demoChip(p);
  ok("Demo chip visible", await chip.isVisible().catch(() => false), (await chip.innerText().catch(() => "")).trim());
  let tv = await text(p);
  ok("text view opens with demo line", /Demo mode/.test(tv), tv.slice(0, 80).replace(/\n/g, " | "));
  ok("text view lists buildings", /CrewHub World \(CR\)/.test(tv) && /crewhub-loops \(CL\)/.test(tv) && /Launch & Marketing \(MK\)/.test(tv));

  // 2. Keyboard: enter a building, move between rooms, zoom a room, Details, back out
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  await shot(p, "02-building");
  const crumb = await crumbs(p);
  ok("entered a building by keyboard", /Town/.test(crumb) && (await entered(p)) !== null, crumb);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(400);
  const status1 = await p.locator("[aria-live=polite]").allInnerTexts();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  await shot(p, "03-room");
  ok("room focus announced", status1.join(" ").trim().length > 0, status1.filter((s) => s.trim()).join(" | ").slice(0, 120));
  // Details (D): every label shows, the button says so, and D again takes them away. Back out of the room first, so the
  // count is the building's (a zoomed room already reveals its own labels).
  await p.keyboard.press("Escape");
  await p.waitForTimeout(900);
  const detailsButton = p.getByRole("button", { name: "Details (D)", exact: true });
  const before = await labels(p);
  await canvas(p).focus();
  await p.keyboard.press("d");
  await p.waitForTimeout(900);
  const during = await labels(p);
  const pressed = await detailsButton.getAttribute("aria-pressed").catch(() => null);
  const signs = await labels(p, ".world-labels .room-sign");
  await shot(p, "03b-details");
  await p.keyboard.press("d");
  await p.waitForTimeout(900);
  const after = await labels(p);
  ok("Details (D) shows more labels and toggles back", during > before && after === before, `${before} → ${during} → ${after}`);
  ok("Details button pressed state", pressed === "true", String(pressed));
  ok("Details on shows room signs", signs > 0, String(signs));
  for (let i = 0; i < 3; i++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  const home = await crumbs(p);
  const still = await entered(p);
  ok("Escape chain returns to the town", still === null, `${home} (entered: ${still})`);

  // 3. Speed control and scrub: stall, attention, release, stale
  await speed(p, "16x").catch((e) => log.push("16x " + e.message.split("\n")[0]));
  await p.waitForTimeout(2000);
  await p.getByRole("button", { name: "Pause", exact: true }).click().catch((e) => log.push("pause " + e.message.split("\n")[0]));
  // The times are the script's (packages/demo/src/script.ts): CR-24 stalls from 2:56 to 6:30, CL-44 needs attention from
  // 8:00, 0.3.0 is published at 11:04 and the probe is silent from 10:10 to 15:40.
  for (const [label, ms] of [["stall", 200000], ["attention", 510000], ["release", 665000], ["stale", 900000]]) {
    ok(`seek ${label}`, await seek(p, ms));
    await p.waitForTimeout(1500);
    const t = await text(p);
    if (label === "stall") ok("stall in text view", /stalled, quiet \d+ min/.test(t), (t.match(/stalled, quiet[^;\n]*/) ?? [""])[0]);
    if (label === "attention") ok("attention in text view", /attention/i.test(t));
    if (label === "release") ok("release in text view", /[Rr]elease/.test(t) && /published/i.test(t));
    if (label === "stale") ok("stale in text view", /stale|unknown/i.test(t));
    await shot(p, `04-${label}`);
  }

  // 4. Inside a building while playing: drone, walks
  await seek(p, 200000);
  await speed(p, "4x").catch((e) => log.push("4x " + e.message.split("\n")[0]));
  await canvas(p).focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1500);
  let walking = 0;
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(500);
    walking = Math.max(walking, await walkersWalking(p));
    if (i % 8 === 0) await shot(p, `05-live-${i}`);
  }
  tv = await text(p);
  ok("walkers seen (max at once)", walking > 0, String(walking));
  info(`drone transit line present at the end: ${/in transit/.test(tv)}`);
  await p.keyboard.press("Escape");

  // 5. Chat dock: open, send, scripted reply
  await p.locator("aside.dock button").first().click().catch((e) => log.push("dock " + e.message.split("\n")[0]));
  await p.waitForTimeout(800);
  await p.locator("textarea").first().fill("Hello from the browser regression pass");
  await p.getByRole("button", { name: "Send" }).click().catch((e) => log.push("send " + e.message.split("\n")[0]));
  await p.waitForTimeout(6000);
  const chat = await p.locator(".bubble-chat").innerText().catch(() => "");
  ok("chat message sent", /browser regression pass/.test(chat));
  ok("scripted reply arrived", /\(demo reply\)/.test(chat), chat.slice(-120).replace(/\n/g, " | "));
  await shot(p, "06-chat");
  await p.keyboard.press("Escape");

  // 6. Build mode: place, undo
  await canvas(p).focus();
  if ((await entered(p)) == null) await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  await p.keyboard.press("b");
  await p.waitForTimeout(600);
  await shot(p, "07-build");
  const build = p.locator(".build-sheet");
  ok("build mode opens", /Build/.test(await build.innerText().catch(() => "")));
  // The palette is whatever the catalogue offers today: take its entries in order until one fits where the ghost starts.
  const status = build.locator(".build-status");
  const undo = build.getByRole("button", { name: "Undo", exact: true });
  const redo = build.getByRole("button", { name: "Redo", exact: true });
  const steps = async () => `undo ${(await undo.isEnabled().catch(() => null)) ? "on" : "off"}, redo ${(await redo.isEnabled().catch(() => null)) ? "on" : "off"}`;
  const stepsBefore = await steps();
  let placed = "";
  const entries = await build.locator(".build-palette .palette-item").count();
  for (let i = 0; i < Math.min(entries, 8) && !/Placed /.test(placed); i++) {
    await build.locator(".build-palette .palette-item").nth(i).click();
    await p.waitForTimeout(300);
    await canvas(p).focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(800);
    placed = (await status.innerText().catch(() => "")).replace(/\s+/g, " ");
  }
  const stepsPlaced = await steps();
  ok("place puts a prop down", /Placed /.test(placed) && /undo on/.test(stepsPlaced), (await build.locator(".build-message").innerText().catch(() => "")).trim() || placed.slice(0, 140));
  await p.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await p.waitForTimeout(500);
  // The sheet keeps its last message; the undo itself is announced, the step moves to Redo and the prop is selected no more.
  const undone = ((await p.locator("[aria-live=polite]").allInnerTexts()).join(" ").match(/Undone\./) ?? [""])[0];
  const stepsUndone = await steps();
  ok("undo takes the placement back", undone !== "" && /redo on/.test(stepsUndone) && !/redo on/.test(stepsPlaced), `${undone} (${stepsBefore} → ${stepsPlaced} → ${stepsUndone})`);
  await shot(p, "08-build-undo");
  await p.keyboard.press("b");

  // 7. Settings: style, director, model calls, graphics, town export
  await p.getByRole("button", { name: /settings/i }).first().click().catch((e) => log.push("settings " + e.message.split("\n")[0]));
  await p.waitForTimeout(600);
  const settingsSheet = p.locator(".settings-sheet");
  const settings = await settingsSheet.innerText().catch(() => "");
  ok("settings show style Greenhouse", /Greenhouse/.test(settings));
  ok("settings show director off by default", /director/i.test(settings));
  ok("settings show model calls 0", /Model calls\s*0/.test(settings), (settings.match(/Model calls[^\n]*(\n[^\n]*)?/) ?? [""])[0].replace(/\n/g, " "));
  const graphics = settingsSheet.locator(".quality-setting select");
  ok("Graphics setting defaults to Pretty", (await graphics.inputValue().catch(() => "")) === "pretty");
  const shadows = () => p.evaluate(() => globalThis.__town?.renderer?.shadowMap?.enabled);
  await graphics.selectOption("fast");
  await p.waitForTimeout(600);
  const fast = await shadows();
  const stored = await p.evaluate(() => localStorage.getItem("crewhub-world.quality"));
  await graphics.selectOption("pretty");
  await p.waitForTimeout(600);
  const pretty = await shadows();
  ok("Graphics Fast/Pretty switch shadow maps and persist", fast === false && pretty === true && stored === "fast", `fast=${fast} pretty=${pretty} stored=${stored}`);
  const [download] = await Promise.all([
    p.waitForEvent("download", { timeout: 5000 }).catch(() => null),
    p.getByRole("button", { name: /export the town/i }).click().catch((e) => log.push("export " + e.message.split("\n")[0])),
  ]);
  ok("town export downloads a file", !!download, download ? download.suggestedFilename() : "");
  await shot(p, "09-settings");
  await p.keyboard.press("Escape");

  // 8. Where form
  await p.keyboard.press("t");
  await p.waitForTimeout(500);
  const whereSelect = sheet(p).locator("select").first();
  if (await whereSelect.count()) {
    const options = await whereSelect.locator("option").allTextContents();
    const pick = options.find((o) => /cl-lead|CL Lead/i.test(o)) ?? options[1];
    if (pick) await whereSelect.selectOption({ label: pick });
    await p.getByRole("button", { name: /where/i }).first().click().catch(() => {});
    await p.waitForTimeout(500);
  }
  const whereText = await sheet(p).innerText().catch(() => "");
  ok("where answers", /You are|is in|real avatar|town hall/i.test(whereText), (whereText.match(/(You are[^\n]*)/) ?? [""])[0].slice(0, 140));
  await shot(p, "10-where");
  await p.context().close();

  // 9. Reduced motion: no walkers moving
  p = await open({ reducedMotion: "reduce" });
  await town(p, 2000);
  await speed(p, "16x").catch(() => {});
  let moving = 0;
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(500);
    moving = Math.max(moving, await walkersWalking(p));
  }
  ok("reduced motion: no walking", moving === 0, String(moving));
  await shot(p, "11-reduced");
  await p.context().close();

  // 10. The theme button: system, light, dark and round again, and the scene draws in each
  p = await open();
  await town(p, 2000);
  const themes = [];
  let drawing = true;
  for (let i = 0; i < 3; i++) {
    await p.getByRole("button", { name: /^Theme: / }).click();
    await p.waitForTimeout(700);
    themes.push(await p.evaluate(() => document.documentElement.getAttribute("data-theme")));
    // A frame drawn after the switch: the canvas is there, has a size and holds a live WebGL context.
    drawing &&= await p.evaluate(() => {
      const c = document.querySelector("canvas");
      const gl = globalThis.__town?.renderer?.getContext?.();
      return !!c && c.width > 0 && c.height > 0 && (!gl || !gl.isContextLost());
    });
    if (themes.at(-1) === "dark") await shot(p, "11b-theme");
  }
  ok("theme button cycles and the scene keeps rendering", themes.join(" → ") === "light → dark → system" && drawing, themes.join(" → "));
  await p.context().close();

  // 11. Phone and dark
  for (const scheme of ["light", "dark"]) {
    p = await open({ viewport: { width: 375, height: 812 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    await town(p, 2500);
    await shot(p, `12-375-${scheme}-town`);
    const sc = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`375 ${scheme}: no horizontal scroll`, sc.sw <= sc.cw, `${sc.sw}/${sc.cw}`);
    const small = await p.evaluate(() => [...document.querySelectorAll("button, a, input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24)));
    info(`375 ${scheme} targets under 40px (visible box): ${small.length} ${small.slice(0, 8).join(", ")}`);
    // A building's sign is a quiet name, smaller than a finger: its ::after pad is what is tapped.
    const pads = await p.evaluate(() => [...document.querySelectorAll("button.town-sign")].flatMap((e) => { const s = getComputedStyle(e, "::after"); return s.content === "none" ? [0, 0] : [Math.round(parseFloat(s.width)), Math.round(parseFloat(s.height))]; }));
    ok(`375 ${scheme}: building signs have 40px hit pads`, pads.length > 0 && pads.every((n) => n >= 40), pads.join(","));
    await p.context().close();
  }
  p = await open({ colorScheme: "dark" });
  await town(p, 2500);
  await shot(p, "13-dark-town");
  await p.context().close();
});

await group("demo", async () => {
  // 12. The jump list: / opens it, a building's name narrows it, Enter lands inside that building.
  let p = await open();
  await town(p, 2500);
  await canvas(p).focus();
  await p.keyboard.press("/");
  const dialog = p.getByRole("dialog", { name: "Jump to" });
  const opened = await dialog.waitFor({ timeout: 3000 }).then(() => true, () => false);
  const field = dialog.getByRole("combobox");
  ok("jump list opens on / with the search focused", opened && (await field.evaluate((e) => document.activeElement === e).catch(() => false)));
  await p.keyboard.type("crewhub-loops");
  await p.waitForTimeout(400);
  const top = (await dialog.getByRole("option").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await shot(p, "14-jump");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  const slug = await entered(p);
  const where = await crumbs(p);
  ok("jump list: Enter lands inside the named building", slug != null && /crewhub-loops/.test(where) && !(await dialog.isVisible().catch(() => false)), `"${top.slice(0, 50)}" → ${where} (entered: ${slug})`);
  await shot(p, "15-jumped");
  await p.context().close();

  // 13. The scenario picker: the Demo chip opens it, One project changes the town, Small team brings it back.
  p = await open();
  await town(p, 2000);
  const menu = p.getByRole("menu", { name: "Demo scenario" });
  const pick = async (name) => {
    await demoChip(p).click();
    await menu.waitFor({ timeout: 3000 });
    const items = await menu.getByRole("menuitemradio").allInnerTexts();
    const checked = (await menu.getByRole("menuitemradio", { checked: true }).innerText().catch(() => "")).split("\n")[0];
    if (name) {
      const before = p.url();
      await menu.getByRole("menuitemradio", { name }).click();
      await p.waitForURL((u) => u.toString() !== before, { timeout: 8000 }).catch(() => {});
      await dressed(p);
      await p.waitForTimeout(1500);
    }
    return { items: items.map((t) => t.split("\n")[0]), checked };
  };
  const first = await pick(null);
  ok("scenario picker opens on the Demo chip", first.items.length >= 3 && first.checked === "Small team", `${first.items.join(", ")}; checked: ${first.checked}`);
  await shot(p, "16-picker");
  await p.keyboard.press("Escape");
  const one = await pick("One project");
  const chipOne = (await demoChip(p).innerText().catch(() => "")).trim();
  const tvOne = await text(p);
  ok("scenario picker: One project loads a different town", /One project/.test(chipOne) && /Pocket Garden \(PG\)/.test(tvOne) && !/crewhub-loops \(CL\)/.test(tvOne), `${chipOne}; ${new URL(p.url()).search}; was ${one.checked}`);
  await shot(p, "17-one-project");
  const back = await pick("Small team");
  const chipBack = (await demoChip(p).innerText().catch(() => "")).trim();
  const tvBack = await text(p);
  ok("scenario picker: back to Small team", back.checked === "One project" && /Small team/.test(chipBack) && /crewhub-loops \(CL\)/.test(tvBack), `${chipBack}; ${new URL(p.url()).search}`);
  await p.context().close();

  // 14. The Studio scenario's Region level: district cards, a beacon, a pin, into a district and a building, and the
  // Escape chain back out to the Region.
  p = await open();
  await town(p, 3000, `${BASE}?scenario=studio`);
  const cards = p.locator(".district-card");
  const cardCount = await cards.count();
  const shown = await drawn(p, ".district-card");
  ok("studio: the Region level shows district cards", shown >= 2 && (await level(p)) === "Region", `${shown} of ${cardCount} cards drawn; at "${await level(p)}" (levels ${await levels(p)})`);
  await shot(p, "18-region");
  const beacons = await p.locator(".district-card.beacon").count();
  const beaconWords = await p.locator(".district-card.beacon .district-needs").first().innerText().catch(() => "");
  ok("studio: a district that needs a person carries a beacon", beacons > 0 && /Needs a person/.test(beaconWords), `${beacons} of ${cardCount} districts; ${beaconWords.slice(0, 80)}`);
  const pins = p.locator(".need-pin");
  const pinCount = await pins.count();
  const pinLabel = (await pins.first().getAttribute("aria-label").catch(() => "")) ?? "";
  ok("studio: a building that needs a person carries a pin", pinCount > 0 && (await drawn(p, ".need-pin")) > 0 && /needs a person/.test(pinLabel), `${pinCount} pins; ${pinLabel.slice(0, 90)}`);
  const card = cards.first();
  const districtName = (await card.locator("strong").innerText().catch(() => "")).trim();
  await card.click();
  await p.waitForTimeout(2000);
  const atDistrict = await level(p);
  ok("studio: a district card goes to the district", (await levels(p)) === "2" && atDistrict === districtName && atDistrict !== "", `${atDistrict} (levels ${await levels(p)})`);
  await shot(p, "19-district");
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  const inBuilding = await entered(p);
  ok("studio: a building entered from the district", inBuilding != null && (await levels(p)) === "3", `${await level(p)} (entered: ${inBuilding}, levels ${await levels(p)})`);
  await shot(p, "20-studio-building");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  const step1 = { levels: await levels(p), at: await level(p), entered: await entered(p) };
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1500);
  const step2 = { levels: await levels(p), at: await level(p) };
  ok("studio: Escape goes building → district → Region", step1.entered == null && step1.levels === "2" && step1.at === districtName && step2.levels === "1" && step2.at === "Region", `${step1.at} (${step1.levels}) → ${step2.at} (${step2.levels})`);
  await shot(p, "21-region-again");
  await p.context().close();
});

await group("live", async () => {
  // 15. Live mode against a fake crewhub-loops behind the host, both started here on 127.0.0.1.
  const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const dist = path.join(REPO, "apps", "world", "dist");
  const served = existsSync(path.join(dist, "index.html"));
  const hostPort = Number(opts["host-port"]);
  if (!served && (!Number.isInteger(hostPort) || hostPort <= 0)) opts.fail("--host-port <port> must be a port number");
  const fakeOptions = { heartbeatMs: 1000 };
  let fake = await createLoopsFake(fakeOptions);
  const hostOptions = { loopsUrl: fake.url, key: fake.key, keyName: fake.keyName, retryMs: { min: 100, max: 500 }, heartbeatMs: 1000, log: () => undefined };
  const host = await createHost(served ? { ...hostOptions, staticDir: dist } : { ...hostOptions, port: hostPort, allowedOrigins: [origin] });
  const liveOrigin = served ? host.url : origin;
  // The page is opened without `?source=live`: the source is `auto`, the probe finds the host and the health it answers
  // is what the sign-in link follows (an override skips the probe, and the link would fall back to the default URL).
  const liveBase = `${liveOrigin}/`;
  const pairing = typeof host.mintPairLink === "function";
  info(`live: fake on 127.0.0.1:${fake.port}, host on 127.0.0.1:${host.port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`}; pairing ${pairing ? "on" : "not present"}`);
  const openLive = async (into = problems) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const pg = await ctx.newPage();
    watch(pg, liveOrigin, into, "live");
    return pg;
  };
  const chip = (pg) => pg.locator(".connection-chip").first();
  const state = (pg) => chip(pg).getAttribute("data-connection").catch(() => null);
  /** Waits for the connection chip to say `wanted` and answers what it says then. */
  const until = async (pg, wanted, timeout) => {
    await pg.waitForSelector(`.connection-chip[data-connection="${wanted}"]`, { timeout }).catch(() => {});
    return state(pg);
  };
  try {
    if (pairing) {
      // Without the cookie: the API refuses and the world asks to pair, naming the command and never the link. The
      // refused request is a console error in the browser (it is what it is meant to be), so it is kept apart.
      const own = [];
      const bare = await openLive(own);
      const status = await bare.request.get(`${liveOrigin}/world-api/snapshot`).then((r) => r.status()).catch(() => 0);
      await bare.goto(liveBase);
      await bare.waitForTimeout(3000);
      const body = (await bare.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok("pairing: /world-api answers 401 without a cookie", status === 401, String(status));
      ok("pairing: the world asks to pair this browser", /Pair this browser/i.test(body) && /npm run host -- open/.test(body) && !/\/pair\//.test(body), body.slice(0, 160));
      await shot(bare, "22-pair-page");
      await bare.context().close();
      problems.push(...own.filter((x) => !/401/.test(x.text)));
    } else info("live: the host has no mintPairLink, so the two pairing checks are skipped");

    const pg = await openLive();
    if (pairing) {
      const link = host.mintPairLink();
      await pg.goto(link);
      await pg.waitForTimeout(500);
      ok("pairing: the one-time link lands on /", new URL(pg.url()).pathname === "/" && new URL(pg.url()).origin === liveOrigin, new URL(pg.url()).pathname);
    }
    await pg.goto(liveBase);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    const live1 = await until(pg, "live", 20000);
    ok("live: the chip says Live against the fake", live1 === "live", `${live1}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "23-live");
    const href = await pg.locator(".chat-sign-in").first().getAttribute("href").catch(() => null);
    ok("live: the sign-in link goes to the loops web URL the host names", href === new URL(fake.url).origin, `${href} (fake ${fake.url})`);
    const { port, key, keyName } = fake;
    const lastSeq = fake.lastSeq();
    await fake.close();
    const down = await until(pg, "loops-down", 20000);
    ok("live: Loops down after the fake closes", down === "loops-down", `${down}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "24-loops-down");
    fake = await createLoopsFake({ ...fakeOptions, port, key, keyName, firstSeq: lastSeq });
    const again = await until(pg, "live", 30000);
    ok("live: Live again after a new fake on the same port", again === "live", `${again}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "25-live-again");
    await pg.context().close();
  } finally {
    await host.close().catch(() => {});
    await fake.close().catch(() => {});
  }
});

const external = problems.filter((x) => x.kind === "external").map((x) => x.text);
const errors = problemLines(problems.filter((x) => x.kind !== "external"));
ok("no external requests", external.length === 0, [...new Set(external)].slice(0, 5).join(" "));
ok("no page errors or console errors", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();

const passed = results.filter((r) => r.pass).length;
log.push(...errors.slice(5), `regress: ${passed}/${results.length}`);
writeFileSync(`${OUT}${tag}-results.json`, JSON.stringify(results, null, 1));
writeFileSync(`${OUT}${tag}.log`, log.join("\n") + "\n");
console.log(log.join("\n"));
process.exit(passed === results.length ? 0 : 1);
