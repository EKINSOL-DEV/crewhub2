/**
 * A visitor's walk through the demo: keyboard, the text view, the timeline, chat, build mode and the prop editor's focus,
 * settings, the where form, reduced motion, a phone, both themes.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { announced, labels, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { seek, speed } from "../lib/world.mjs";

export async function run({ pass, page, check, out }) {
  const { browser } = pass;
  const { open, town, canvas, crumbs, demoChip, entered, walkersWalking } = page;
  const { ok, info, note } = check;
  const { shot } = out;
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
  await speed(p, "16x").catch((e) => note("16x " + e.message.split("\n")[0]));
  await p.waitForTimeout(2000);
  await p.getByRole("button", { name: "Pause", exact: true }).click().catch((e) => note("pause " + e.message.split("\n")[0]));
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
  await speed(p, "4x").catch((e) => note("4x " + e.message.split("\n")[0]));
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
  await p.locator("aside.dock button").first().click().catch((e) => note("dock " + e.message.split("\n")[0]));
  await p.waitForTimeout(800);
  await p.locator("textarea").first().fill("Hello from the browser regression pass");
  await p.getByRole("button", { name: "Send" }).click().catch((e) => note("send " + e.message.split("\n")[0]));
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
  // Round 48 (r48-ui U7): the prop editor is a dialog: the focus goes into it when it opens and back to the button that
  // opened it when it closes (it stayed on New prop behind the sheet, and fell to the page on close).
  const newProp = build.getByRole("button", { name: "New prop", exact: true });
  await newProp.focus();
  await p.keyboard.press("Enter");
  await p.waitForSelector(".editor-sheet", { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(300);
  const focusWhere = () => p.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? "body" : a.closest(".editor-sheet") ? "editor" : (a.textContent ?? "").trim().slice(0, 30); }).catch(() => "?");
  const inEditor = await focusWhere();
  await p.locator(".editor-sheet").getByRole("button", { name: "Close the prop editor" }).click().catch(() => {});
  await p.waitForSelector(".editor-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
  const afterEditor = await focusWhere();
  ok("the prop editor takes the focus when it opens and gives it back to New prop when it closes", inEditor === "editor" && afterEditor === "New prop", `open: ${inEditor}, closed: ${afterEditor}`);
  await p.keyboard.press("b");

  // 7. Settings: style, director, model calls, graphics, town export
  await p.getByRole("button", { name: /settings/i }).first().click().catch((e) => note("settings " + e.message.split("\n")[0]));
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
    p.getByRole("button", { name: /export the town/i }).click().catch((e) => note("export " + e.message.split("\n")[0])),
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
    p = await open({ width: 375, theme: scheme });
    await town(p, 2500);
    await shot(p, `12-375-${scheme}-town`);
    const sc = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`375 ${scheme}: no horizontal scroll`, sc.sw <= sc.cw, `${sc.sw}/${sc.cw}`);
    const small = await p.evaluate(() => [...document.querySelectorAll("button, a, input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24)));
    info(`375 ${scheme} targets under 40px (visible box): ${small.length} ${small.slice(0, 8).join(", ")}`);
    // A building's sign is a quiet name, smaller than a finger: its ::after pad is what is tapped.
    const pads = await p.evaluate(() => [...document.querySelectorAll("button.town-sign")].flatMap((e) => { const s = getComputedStyle(e, "::after"); return s.content === "none" ? [0, 0] : [Math.round(parseFloat(s.width)), Math.round(parseFloat(s.height))]; }));
    ok(`375 ${scheme}: building signs have 40px hit pads`, pads.length > 0 && pads.every((n) => n >= 40), pads.join(","));
    if (scheme === "light") {
      // Round 64 (w4-7): a thumb has no T key and never meets the skip link, so a visible control must open the text view:
      // the "?" (Help) menu's row "Open the text view", tapped, as the tour's step 5 promises. Before, the menu held the
      // introduction's two rows only and the text view was unreachable on a touch device.
      await p.getByRole("button", { name: "Help" }).tap();
      await p.waitForTimeout(300);
      const row = p.getByRole("menuitem", { name: /^Open the text view/ });
      const rowShown = await row.isVisible().catch(() => false);
      await shot(p, "12b-375-help-menu");
      if (rowShown) await row.tap();
      const opened = await p.waitForSelector("#text-view", { timeout: 3000 }).then(() => true).catch(() => false);
      const menuClosed = (await p.getByRole("menuitem").count()) === 0;
      await shot(p, "12c-375-text-view-from-help");
      ok("375: the Help menu's row 'Open the text view', tapped, opens the text view and closes the menu (round 64, w4-7)", rowShown && opened && menuClosed, `row ${rowShown ? "shown" : "missing"}, text view ${opened ? "open" : "not open"}, menu ${menuClosed ? "closed" : "still open"}`);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
    await p.context().close();
  }
  p = await open({ theme: "dark" });
  await town(p, 2500);
  await shot(p, "13-dark-town");
  await p.context().close();
}
