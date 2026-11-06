/**
 * A visitor's walk through the demo: keyboard, the text view, the timeline, chat, build mode and the prop editor's focus,
 * settings, the where form, reduced motion, a phone, both themes.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { devices } from "playwright-core";
import { announced, labels, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { dressed, seek, speed, watch } from "../lib/world.mjs";
import { decodePng } from "../lib/png.ts";

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

  // 4b. Round 64 (w5-7): the lead's chat from inside its building: the card's activity strip holds a Chip.Link per ticket
  // the lead is on; kit.css ellipsizes the strip, which left the chips unpainted yet in the Tab order. Every chip whose box
  // is in the strip must be painted (the pixel at its centre differs from the strip's own background), and the last chip,
  // focused, must be scrolled into the strip and painted too. The town's own dock (G-Man, no tickets) is step 5's.
  {
    await canvas(p).focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(1500);
    await p.locator("aside.dock button").first().click().catch((e) => note("lead's dock " + e.message.split("\n")[0]));
    await p.waitForTimeout(800);
    const strip = p.locator(".bubble-chat .chat-summary");
    const chips = strip.locator(".chip-link");
    // The chips come with the agent's activity summary, a query of the dock's own: a few seconds at most.
    await chips.first().waitFor({ timeout: 8000 }).catch(() => {});
    const count = await chips.count();
    const painted = async () => {
      const image = decodePng(await strip.screenshot());
      const box = await strip.boundingBox();
      const at = (x, y) => { const i = (Math.round(y) * image.width + Math.round(x)) * 4; return [...image.data.subarray(i, i + 3)].join(","); };
      // The strip's own colour from its top padding (a chip scrolled under the left edge would colour a mid-height sample).
      const background = at(2, 2);
      const inView = [];
      for (let i = 0; i < count; i++) {
        const r = await chips.nth(i).boundingBox();
        if (!r || r.x < box.x - 1 || r.x + r.width > box.x + box.width + 1) continue;
        inView.push({ i, pixel: at(r.x - box.x + r.width / 2, r.y - box.y + r.height / 2) });
      }
      return { background, inView, unpainted: inView.filter((c) => c.pixel === background).map((c) => c.i) };
    };
    const before = await painted();
    await chips.last().focus().catch(() => {});
    await p.waitForTimeout(400);
    const lastBox = await chips.last().boundingBox().catch(() => null);
    const stripBox = await strip.boundingBox();
    const lastInView = !!lastBox && lastBox.x >= stripBox.x - 1 && lastBox.x + lastBox.width <= stripBox.x + stripBox.width + 1;
    const after = await painted();
    ok(
      "dock: the activity strip's ticket chips are painted where they stand, and the last one, focused, is scrolled into the strip and painted",
      count > 0 && before.inView.length > 0 && before.unpainted.length === 0 && lastInView && after.unpainted.length === 0,
      `${count} chips, ${before.inView.length} in the strip before the focus (unpainted chips: ${before.unpainted.join(",") || "none"}); the last focused: ${lastInView ? "in view" : "outside"}, unpainted chips then: ${after.unpainted.join(",") || "none"}; the strip's colour ${before.background}`,
    );
    await shot(p, "05b-dock-strip");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1200);
  }

  // 5. Chat dock: open, send, scripted reply
  await p.locator("aside.dock button").first().click().catch((e) => note("dock " + e.message.split("\n")[0]));
  await p.waitForTimeout(800);
  await p.locator("textarea").first().fill("Hello from the browser regression pass");
  await p.getByRole("button", { name: "Send" }).click().catch((e) => note("send " + e.message.split("\n")[0]));
  // Round 64 (w5-8): a Send by keyboard (or click) must not drop the focus to the body: once the box is enabled again, the focus is back in it.
  await p.waitForFunction(() => /browser regression pass/.test(document.querySelector(".bubble-chat")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector(".chat-compose textarea")?.disabled, null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(300);
  const sendFocus = await p.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.closest(".chat-compose") ? " in the compose form" : ""}` : "none"; });
  ok("chat dock (round 64, w5-8): after Send the focus is back in the message box, not on the body", sendFocus === "textarea in the compose form", `focus on ${sendFocus}`);
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
    // Design choice T5 (round 72, frame): on a portrait phone the home view frames the town in the space between the
    // chips and the playback bar (a cover fit: the sides run off), where a contain fit left an empty band under the chips
    // and above the bar with the width binding. Measured through the dev build's scene (`__town`): the vertical extent
    // of the lots' centres (ground and 2 up) projected by the home camera, as a share of the canvas height less the
    // scene's own insets. The threshold stands between the two measured fits: 0.26 on 2d22df8a's contain fit, 0.66 on
    // the cover fit (round 72, batch 3, both on the Small team's four lots); without `__town` (a production build) the
    // row is skipped with a note.
    if (scheme === "light") {
      const framing = await p.evaluate(() => {
        const s = globalThis.__town;
        if (!s?.camera || !s.renderer?.domElement || !s.view?.plan?.lots) return null;
        const canvas = s.renderer.domElement;
        const V = s.camera.position.constructor;
        const ys = [];
        for (const lot of s.view.plan.lots) for (const y of [0, 2]) ys.push(((1 - new V(lot.centre.x, y, lot.centre.z).project(s.camera).y) / 2) * canvas.clientHeight);
        const insets = s.insets();
        const free = canvas.clientHeight - insets.top - insets.bottom;
        return { extent: Math.round(Math.max(...ys) - Math.min(...ys)), free: Math.round(free), share: (Math.max(...ys) - Math.min(...ys)) / free, lots: s.view.plan.lots.length };
      });
      if (framing === null) info("375 light: the home framing row needs the dev build's __town; skipped (T5)");
      else ok("375 light: the home view frames the town in the band between the chips and the playback bar (T5: the lots' projected extent fills at least 0.50 of it)", framing.share >= 0.5, `extent ${framing.extent} of ${framing.free} px (${framing.share.toFixed(2)}), ${framing.lots} lots`);
    }
    const small = await p.evaluate(() => [...document.querySelectorAll("button, a, input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24)));
    info(`375 ${scheme} targets under 40px (visible box): ${small.length} ${small.slice(0, 8).join(", ")}`);
    // A building's sign is a quiet name, smaller than a finger: its ::after pad is what is tapped.
    const pads = await p.evaluate(() => [...document.querySelectorAll("button.town-sign")].flatMap((e) => { const s = getComputedStyle(e, "::after"); return s.content === "none" ? [0, 0] : [Math.round(parseFloat(s.width)), Math.round(parseFloat(s.height))]; }));
    ok(`375 ${scheme}: building signs have 40px hit pads`, pads.length > 0 && pads.every((n) => n >= 40), pads.join(","));
    // Round 64 (w4-14, w2's review): the Demo chip, an icon at this width, stays beside the brand's title on its first
    // line; the brand row wraps only for a chip grown to its word, never in the demo's usual state.
    const beside = await p.evaluate(() => {
      const chip = document.querySelector(".demo-chip")?.getBoundingClientRect();
      const title = document.querySelector(".world-brand > strong")?.getBoundingClientRect();
      return chip && title ? { chipLeft: Math.round(chip.left), chipTop: Math.round(chip.top), chipBottom: Math.round(chip.bottom), titleRight: Math.round(title.right), titleTop: Math.round(title.top), titleMid: Math.round((title.top + title.bottom) / 2), titleBottom: Math.round(title.bottom) } : null;
    });
    ok(`375 ${scheme}: the Demo chip sits beside the brand's title, on its first line`, beside !== null && beside.chipLeft >= beside.titleRight && beside.chipTop < beside.titleMid && beside.chipBottom > beside.titleTop, beside ? `chip at ${beside.chipLeft}, ${beside.chipTop}..${beside.chipBottom}; title to ${beside.titleRight}, ${beside.titleTop}..${beside.titleBottom}` : "no chip or title");
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
  // Round 64 (w4-7, w2's review): the same row by keyboard. Help, Enter, the arrows to "Open the text view", Enter: the
  // text view has the focus; Escape closes it and the focus is back on Help, as after T or after the menu's first row.
  // Before, the row ran its open before the menu closed, so the view's return slot was the row itself, unmounted a tick
  // later, and Escape dropped the focus to the body.
  const activeIs = () => p.evaluate(() => { const el = document.activeElement; return el ? `${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") || el.id || (el.textContent ?? "").trim().slice(0, 30)}` : "none"; });
  await p.getByRole("button", { name: "Help" }).focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(200);
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(100);
  const onRow = await activeIs();
  await p.keyboard.press("Enter");
  const openedByKey = await p.waitForSelector("#text-view", { timeout: 3000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(300);
  const onView = await activeIs();
  await p.keyboard.press("Escape");
  await p.waitForSelector("#text-view", { state: "detached", timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(200);
  const afterEscape = await activeIs();
  ok("keyboard: the Help menu's row 'Open the text view' opens the text view with the focus on it, and Escape gives the focus back to Help (round 64, w4-7, w2's review)", /Open the text view/.test(onRow) && openedByKey && /text-view/.test(onView) && afterEscape === "button Help", `row "${onRow}", opened ${openedByKey}, focus on "${onView}", after Escape "${afterEscape}"`);
  await p.context().close();

  // 12. A phone held sideways (round 64, w4-19): the dock's Agent chats menu is taller than the window, so it scrolls
  // inside itself and its last item can be brought into view and tapped. Playwright's own device profile (750 x 342,
  // scale 3, touch), not a narrow window: the menu is loops' narrow mode, below 900 px.
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13 landscape"], colorScheme: "dark" });
    const pg = await ctx.newPage();
    watch(pg, pass.origin, pass.problems, "landscape");
    await pg.goto(pass.base);
    await dressed(pg);
    await pg.waitForTimeout(1500);
    await pg.getByRole("button", { name: /Agent chats/ }).first().tap();
    const menu = pg.locator('[role="menu"]').filter({ hasText: /Pin an agent/i }).first();
    await menu.waitFor({ timeout: 3000 }).catch(() => {});
    const facts = await menu.evaluate((m) => ({ overflowY: getComputedStyle(m).overflowY, client: m.clientHeight, scroll: m.scrollHeight, bottom: Math.round(m.getBoundingClientRect().bottom), vh: innerHeight })).catch(() => null);
    const last = menu.getByRole("menuitem").last();
    await last.scrollIntoViewIfNeeded().catch(() => {});
    const lastBox = await last.boundingBox().catch(() => null);
    const lastName = (await last.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const reachable = facts !== null && lastBox !== null && lastBox.y >= 0 && lastBox.y + lastBox.height <= facts.vh + 1 && facts.bottom <= facts.vh + 1 && (facts.scroll <= facts.client || /auto|scroll/.test(facts.overflowY));
    await shot(pg, "14-landscape-dock-menu");
    await last.tap().catch(() => {});
    await pg.waitForTimeout(500);
    const closed = (await menu.isVisible().catch(() => false)) === false;
    ok("landscape phone: the Agent chats menu fits the window or scrolls, and its last item can be reached and tapped", reachable && closed, facts ? `menu ${facts.client}/${facts.scroll} overflow ${facts.overflowY}, bottom ${facts.bottom} of ${facts.vh}; "${lastName}" at y ${lastBox ? Math.round(lastBox.y) : "?"}..${lastBox ? Math.round(lastBox.y + lastBox.height) : "?"}; tapped: menu ${closed ? "closed" : "still open"}` : "no menu");
    await ctx.close();
  }
}
