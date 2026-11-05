/**
 * A visitor's walk through the demo: keyboard, the text view, the timeline, chat, build mode and the prop editor's focus,
 * settings, the where form, reduced motion, a phone, both themes.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { devices } from "playwright-core";
import { announced, labels, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { dressed, pause, seek, speed, watch } from "../lib/world.mjs";
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
  // Round 65 (w1-19): the Fresh install scenario's staked plot carries a sign in words over the scene, as the buildings
  // have signs; before, only the board painted on the plot said it, in letters a few pixels high from the home view.
  {
    const back = p.url();
    const url = new URL(back);
    url.searchParams.set("scenario", "fresh");
    await town(p, 2500, url.toString());
    const sign = p.locator('.world-labels [data-anchor="c:staked"] .town-sign');
    const words = (await sign.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const shown = await sign.isVisible().catch(() => false);
    await shot(p, "01b-fresh-plot-sign");
    ok("fresh install: the staked plot carries a sign that says 'Create a project in crewhub-loops' (round 65, w1-19)", shown && words === "Create a project in crewhub-loops", words || "no sign");
    await town(p, 2500, back);
  }

  // 2. Keyboard: enter a building, move between rooms, zoom a room, Details, back out
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  await shot(p, "02-building");
  const crumb = await crumbs(p);
  ok("entered a building by keyboard", /Town/.test(crumb) && (await entered(p)) !== null, crumb);
  // The breadcrumb's back button is named "Town", not "Town Esc": the key hint is visual only (round 65, w5-15).
  const backNamed = await p.getByRole("button", { name: "Town", exact: true }).count();
  ok("key hints are not part of a control's name (w5-15)", backNamed === 1, `buttons named exactly Town: ${backNamed}`);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(400);
  const status1 = await p.locator("[aria-live=polite]").allInnerTexts();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  await shot(p, "03-room");
  ok("room focus announced", status1.join(" ").trim().length > 0, status1.filter((s) => s.trim()).join(" | ").slice(0, 120));
  // Round 65 (w4-6): under the keyboard the zoomed room's sign wears the focus ring (the scene holds the visible focus).
  const keyRing = await p.evaluate(() => { const s = document.querySelector(".world-labels .room-sign.focused"); return s ? getComputedStyle(s).boxShadow : "no sign"; });
  ok("keyboard: the zoomed room's sign wears the focus ring (round 65, w4-6)", /0px 0px 0px 4px/.test(keyRing), keyRing.slice(0, 80));
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
  // Round 65 (w1-11): a click on a figure's name pill opens that figure's card, as the tour's step 3 promises for "a
  // click on one". Before, the pill let the click through to the room under it, which zoomed instead of the card.
  {
    const pill = p.locator(".world-labels .agent-anchor .name-pill:not(.person):not(.you-pill)").first();
    const pillName = await pill.evaluate((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()).catch(() => "");
    const box = await pill.boundingBox().catch(() => null);
    if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const cardOpened = await p.locator(".agent-card").first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
    const cardTitle = (await p.locator(".agent-card .card-title").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await shot(p, "03c-pill-card");
    ok("a click on a figure's name pill opens that figure's card (round 65, w1-11)", cardOpened && pillName.length > 0 && cardTitle.includes(pillName), `pill "${pillName}", card ${cardOpened ? `"${cardTitle}"` : "not open"}`);
    // The card, then the selection, so the Escape chain below starts from the building as before.
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);
    // Build mode picks no figure, and a pill must not start to: there the click stays the scene's.
    const pillOnScreen = () => p.evaluate(() => { for (const el of document.querySelectorAll(".world-labels .agent-anchor .name-pill:not(.person):not(.you-pill)")) { const r = el.getBoundingClientRect(); if (el.closest(".anchor").style.visibility !== "hidden" && r.left > 400 && r.right < innerWidth - 80 && r.top > 80 && r.bottom < innerHeight - 90) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; } return null; });
    await canvas(p).focus();
    await p.keyboard.press("b");
    await p.waitForTimeout(800);
    const inBuild = await pillOnScreen();
    if (inBuild) await p.mouse.click(inBuild.x, inBuild.y);
    await p.waitForTimeout(500);
    const cardsInBuild = await p.locator(".agent-card").count();
    ok("in build mode a click on a name pill opens no card (round 65, w1-11)", !!inBuild && cardsInBuild === 0, `pill ${inBuild ? "clicked" : "none on screen"}, ${cardsInBuild} card(s)`);
    if (cardsInBuild) {
      await p.keyboard.press("Escape");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
    await p.keyboard.press("b");
    await p.waitForTimeout(500);
  }
  for (let i = 0; i < 3; i++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  const home = await crumbs(p);
  const still = await entered(p);
  ok("Escape chain returns to the town", still === null, `${home} (entered: ${still})`);
  // The camera keys say one line each, as D does (round 65, w5-6): a screen reader person hears the key did something.
  await canvas(p).focus();
  const zoomedIn = await announced(p, "+");
  const rotated = await announced(p, "[");
  const homeView = await announced(p, "h");
  ok("camera keys are said (w5-6)", /Zoomed in\./.test(zoomedIn) && /Rotated left\./.test(rotated) && /Home view\./.test(homeView), `${zoomedIn.slice(-30)} | ${rotated.slice(-30)} | ${homeView.slice(-30)}`);
  // Round 65 (w1-12): inside the first building with Details on, a rule prop's label says the fact ("Milestone CR-M2
  // active", "Release 0.3.0: draft", "2 open bugs"), not the build-mode word RULE and the prop's name.
  {
    await canvas(p).focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(1800);
    await p.keyboard.press("d");
    await p.waitForTimeout(1200);
    const ruleTags = (await p.locator(".world-labels .rule-tag").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    await shot(p, "03d-rule-labels");
    ok("Details on: the rule props' labels say the fact and none leads with the word rule (round 65, w1-12)", ruleTags.length > 0 && ruleTags.every((t) => !/^rule\b/i.test(t) && /^(Milestone \S+ active|Release .+: (draft|published)|\d+ open bugs?|\S+: awaiting-deploy)$/.test(t)), ruleTags.join(" | ") || "no rule labels");
    await p.keyboard.press("d");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1200);
  }
  // Round 65 (w4-6): Tab from the scene lands on a building's sign and expands it (the keyboard's focus is visible).
  await canvas(p).focus();
  await p.keyboard.press("Tab");
  await p.waitForTimeout(400);
  const tabbed = await p.evaluate(() => { const a = document.activeElement; return { sign: !!a?.classList.contains("town-sign"), expanded: !!a?.classList.contains("expanded"), ring: globalThis.__town?.view?.ringVisible ?? null }; });
  ok("keyboard: Tab onto a building's sign expands it and shows the ring (round 65, w4-6)", tabbed.sign && tabbed.expanded && tabbed.ring === true, JSON.stringify(tabbed));
  await canvas(p).focus();

  // 3. Speed control and scrub: stall, attention, release, stale
  // Round 65 (w1-18): before the script has looped the playback bar shows no loop count ("loop 0" read as a code).
  const loopAtStart = (await p.locator(".playback-loop").allInnerTexts()).map((t) => t.trim());
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
  // Round 65 (w1-18): sought to the script's last seconds and played, it loops: the bar then says "loop 1".
  ok("seek near the end", await seek(p, 955000));
  await speed(p, "16x").catch((e) => note("16x " + e.message.split("\n")[0]));
  await p.waitForTimeout(3000);
  await p.getByRole("button", { name: "Pause", exact: true }).click().catch((e) => note("pause " + e.message.split("\n")[0]));
  const loopAfter = (await p.locator(".playback-loop").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  await shot(p, "04b-looped");
  ok("the loop count is absent before the script has looped and says 'loop 1' after (round 65, w1-18)", loopAtStart.length === 0 && loopAfter.length === 1 && loopAfter[0] === "loop 1", `at start [${loopAtStart.join("|")}], after [${loopAfter.join("|")}]`);

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
  // Round 65 (w4-18): the phone's two parts are a phone's: a wide window draws no such buttons and shows the whole sheet.
  const wideParts = await build.getByRole("group", { name: "Part of the build sheet" }).isVisible().catch(() => false);
  const wideLayout = await build.getByRole("heading", { name: "Layout" }).isVisible().catch(() => false);
  const widePalette = await build.locator(".build-palette").isVisible().catch(() => false);
  const wideUndo = await build.getByRole("button", { name: "Undo", exact: true }).isVisible().catch(() => false);
  ok("wide window: the build sheet has no Props and More, and shows the palette and the rest together (round 65, w4-18)", !wideParts && wideLayout && widePalette && wideUndo, `parts ${wideParts}, Layout ${wideLayout}, palette ${widePalette}, Undo ${wideUndo}`);
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
  // The undo itself is announced, the step moves to Redo and the prop is selected no more.
  const undone = ((await p.locator("[aria-live=polite]").allInnerTexts()).join(" ").match(/Undone\./) ?? [""])[0];
  const stepsUndone = await steps();
  ok("undo takes the placement back", undone !== "" && /redo on/.test(stepsUndone) && !/redo on/.test(stepsPlaced), `${undone} (${stepsBefore} → ${stepsPlaced} → ${stepsUndone})`);
  // Round 65 (w6-3): the sheet's "Placed … It is selected" line was about the prop the undo took away: it clears with
  // the selection it described, instead of standing under "Choose a prop, or click a placed prop to select it".
  const keptMessage = (await build.locator(".build-message").allInnerTexts().catch(() => [])).join(" ").trim();
  ok("the sheet's message about the placed prop clears when the undo takes the prop away", keptMessage === "", keptMessage.slice(0, 120) || "(no message)");
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
  // Round 65 (w6-6): "Add a zone" says what it did in the sheet's zones part and the live region, as the layout's moves do.
  // The region stands before the line comes, so a screen reader hears the line (s1's note).
  const zoneRegionBefore = await build.locator(".build-zones .zone-said").count();
  await build.getByRole("button", { name: "Add a zone", exact: true }).click();
  await p.waitForTimeout(500);
  const zoneSaid = (await build.locator(".build-zones .zone-said").allInnerTexts().catch(() => [])).join(" ").trim();
  const zoneHeard = (await p.locator("[aria-live=polite]").allInnerTexts()).join(" ");
  ok("adding a zone says so in the sheet and in a live region that stood before the line", zoneRegionBefore === 1 && /^Zone \d+ added\. Undo takes it away\.$/.test(zoneSaid) && /Zone \d+ added\. Undo takes it away\./.test(zoneHeard), `${zoneSaid || "(nothing said)"}; region before: ${zoneRegionBefore}`);
  // The line clears when the zone is undone, and the second Add writes into an empty region, so it is heard again (s1's review).
  await undo.click();
  await p.waitForTimeout(500);
  const zoneLineAfterUndo = await build.locator(".build-zones .zone-said").innerText().catch(() => "?");
  await build.evaluate((sheet) => {
    const region = sheet.querySelector(".build-zones .zone-said");
    globalThis.__zoneChanges = 0;
    new MutationObserver((list) => (globalThis.__zoneChanges += list.length)).observe(region, { subtree: true, childList: true, characterData: true });
  });
  await build.getByRole("button", { name: "Add a zone", exact: true }).click();
  await p.waitForTimeout(500);
  const zoneLineAgain = await build.locator(".build-zones .zone-said").innerText().catch(() => "?");
  const zoneChanges = await p.evaluate(() => globalThis.__zoneChanges);
  ok("Add, Undo, Add: the line clears at the undo and the second Add changes the region", zoneLineAfterUndo.trim() === "" && /^Zone \d+ added\./.test(zoneLineAgain.trim()) && zoneChanges > 0, `after undo "${zoneLineAfterUndo.trim()}"; again "${zoneLineAgain.trim()}", ${zoneChanges} change(s)`);
  await p.keyboard.press("b");
  // Round 65 (w6-7): with build mode and the text view both open, Escape closes the layer that holds the focus: the
  // text view (the focus is in it when T opens it), and build mode stays; before, build mode closed behind it.
  await p.keyboard.press("b");
  await p.waitForTimeout(400);
  await p.keyboard.press("t");
  await p.waitForTimeout(500);
  const focusInText = await p.evaluate(() => !!document.activeElement?.closest("#text-view"));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);
  const layersLeft = { build: await build.count(), text: await p.locator("#text-view").count() };
  ok("Escape with the focus in the text view closes the text view and leaves build mode on", focusInText && layersLeft.build === 1 && layersLeft.text === 0, `focus in text view: ${focusInText}; after Escape build sheet ${layersLeft.build}, text view ${layersLeft.text}`);
  await p.keyboard.press("b");
  await p.waitForTimeout(300);

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
  // Round 65 (w6-6): "Remove this zone" (the zone added in build mode above) says so, in Settings' zones part and the live region.
  const zoneGoneRegionBefore = await settingsSheet.locator(".zone-settings .zone-said").count();
  await settingsSheet.getByRole("button", { name: "Remove this zone", exact: true }).first().click().catch((e) => note("remove zone " + e.message.split("\n")[0]));
  await p.waitForTimeout(500);
  const zoneGone = (await settingsSheet.locator(".zone-settings .zone-said").allInnerTexts().catch(() => [])).join(" ").trim();
  ok("removing a zone says so in Settings and in a live region that stood before the line", zoneGoneRegionBefore === 1 && /^Zone \d+ removed\.$/.test(zoneGone) && /Zone \d+ removed\./.test((await p.locator("[aria-live=polite]").allInnerTexts()).join(" ")), `${zoneGone || "(nothing said)"}; region before: ${zoneGoneRegionBefore}`);
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
      // Round 65 (w4-12): Settings › Town's paired selects (a style option for me and for the town) stand in one column
      // on a phone, each wide enough for its chosen words. Before, two columns at 390 px cut "Follow the town (C…".
      await p.getByRole("button", { name: /settings/i }).first().tap();
      await p.waitForTimeout(600);
      const pairs = await p.evaluate(() => {
        const c = document.createElement("canvas").getContext("2d");
        return [...document.querySelectorAll(".style-options .zone-fields")].map((pair) => {
          const selects = [...pair.querySelectorAll("select")];
          const boxes = selects.map((s) => s.getBoundingClientRect());
          const fits = selects.map((s, i) => { const st = getComputedStyle(s); c.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; const text = s.selectedOptions[0]?.textContent ?? ""; return { text, textWidth: Math.round(c.measureText(text).width), boxWidth: Math.round(boxes[i].width), fits: c.measureText(text).width + parseFloat(st.paddingLeft) + parseFloat(st.paddingRight) + 24 <= boxes[i].width }; });
          return { option: pair.dataset.styleOption, stacked: boxes.length === 2 && Math.round(boxes[0].left) === Math.round(boxes[1].left) && boxes[1].top >= boxes[0].bottom, fits };
        });
      });
      await p.locator(".style-options").first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(p, "12g-375-settings-town");
      ok("375: Settings › Town's paired selects stand in one column, their chosen words fitting (round 65, w4-12)", pairs.length > 0 && pairs.every((x) => x.stacked && x.fits.every((f) => f.fits)), pairs.map((x) => `${x.option}: ${x.stacked ? "stacked" : "side by side"}, ${x.fits.map((f) => `"${f.text}" ${f.textWidth} in ${f.boxWidth}${f.fits ? "" : " (cut)"}`).join("; ")}`).join(" | "));
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      // Round 65 (w4-2, s4's review): no key hint is drawn on a touch device. Inside a building with a prop chosen the sheet
      // has its most buttons with a hint: Turn [R], Place [Enter], Done [Esc]. Before, all were on show.
      await p.locator(".world-labels").getByRole("button", { name: /crewhub-loops/ }).first().tap();
      await p.waitForTimeout(2500);
      await p.getByRole("button", { name: /^Build/ }).first().tap();
      await p.waitForTimeout(600);
      await p.locator(".build-sheet").getByRole("button", { name: /Workstation/ }).first().tap();
      await p.waitForTimeout(500);
      const hints = await p.evaluate(() => { const all = [...document.querySelectorAll(".btn-kbd")]; return { inDom: all.length, drawn: all.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent) }; });
      await shot(p, "12h-375-build-no-key-hints");
      ok("375 touch: with a prop chosen no key hint is drawn, though the buttons carry them (round 65, w4-2, s4's review)", hints.inDom > 0 && hints.drawn.length === 0, JSON.stringify(hints));
      await p.getByRole("button", { name: /^Build/ }).first().tap().catch(() => {});
      await p.waitForTimeout(300);
      await p.locator("nav.world-breadcrumb").getByRole("button").first().tap().catch(() => {});
      await p.waitForTimeout(1200);
      // w4-2's row leaves its building and sheet behind it: a fresh load, so w4-10's rows start from the plain town.
      await town(p, 1500);
      // Round 65 (w4-10): on a phone the four speed buttons are one menu button and the slider takes the rest of the bar
      // (before: four buttons took it and the slider was 88 px, 11 s of story a pixel). The menu, tapped, lists the
      // speeds; "4x" chosen, the button says 4x and the playback runs at 4x.
      const barBefore = await p.evaluate(() => { const bar = document.querySelector(".playback-bar"); const scrub = bar?.querySelector(".playback-scrub"); const menu = bar?.querySelector('button[aria-haspopup="menu"]'); const plain = bar ? [...bar.querySelectorAll("button")].filter((b) => /^Play at |^Pause$/.test(b.getAttribute("aria-label") ?? "")).length : -1; return { bar: bar ? Math.round(bar.getBoundingClientRect().width) : null, scrub: scrub ? Math.round(scrub.getBoundingClientRect().width) : null, menu: menu ? (menu.getAttribute("aria-label") ?? menu.textContent ?? "").trim() : null, plainSpeedButtons: plain }; });
      const speedMenu = p.locator('.playback-bar button[aria-haspopup="menu"]').first();
      let chosen = null;
      if (await speedMenu.count()) {
        await speedMenu.tap();
        await p.waitForTimeout(300);
        await shot(p, "12h-375-speed-menu");
        const row = p.getByRole("menuitemradio", { name: /^4x$/ }).or(p.getByRole("menuitem", { name: /^4x$/ })).first();
        if (await row.count()) await row.tap();
        await p.waitForTimeout(400);
        chosen = await p.evaluate(() => { const menu = document.querySelector('.playback-bar button[aria-haspopup="menu"]'); return { label: (menu?.getAttribute("aria-label") ?? menu?.textContent ?? "").trim(), open: (() => { const m = document.querySelector('.playback-bar [role="menu"]'); return !!m && !m.hidden; })(), speed: globalThis.__town?.playback?.speed?.() ?? null }; });
      }
      ok("375: the playback speeds are one menu button and the slider takes the rest; 4x chosen from the menu (round 65, w4-10)", barBefore.menu !== null && barBefore.plainSpeedButtons === 0 && barBefore.scrub !== null && barBefore.bar !== null && barBefore.scrub >= barBefore.bar * 0.45 && chosen !== null && /4x/.test(chosen.label) && !chosen.open, `${JSON.stringify(barBefore)}; chosen ${JSON.stringify(chosen)}`);
      await pause(p).catch((e) => note("pause " + e.message.split("\n")[0]));
      const paused = await p.locator('.playback-bar button[aria-haspopup="menu"]').getAttribute("aria-label").catch(() => "");
      ok("375: the tools' pause reaches the phone's speed menu (round 65, w4-10)", paused === "Playback speed: Pause", String(paused));
      // Asked for the speed it already has (perf's phone stress run does this): nothing to do, no throw, the menu not left
      // open. Before, the checked row's name was "4x ✓", so the exact name found nothing and the click timed out.
      const twice = await speed(p, "4x").then(() => speed(p, "4x")).then(() => pause(p)).then(() => pause(p)).then(() => "ok").catch((e) => e.message.split("\n")[0]);
      const leftOpen = await p.evaluate(() => { const m = document.querySelector('.playback-bar [role="menu"]'); return !!m && !m.hidden; });
      ok("375: the tools' speed and pause, asked for the current choice, do nothing and leave the menu closed (round 65, w4-10, s4's review)", twice === "ok" && !leftOpen, `${twice}; menu ${leftOpen ? "left open" : "closed"}`);
      if (leftOpen) await p.keyboard.press("Escape");
      // w4-10's rows leave the playback paused: a fresh load, so the rows below start from the plain town.
      await town(p, 1500);
      // Round 65 (w4-11): a jump to a town figure centres it in the portrait frame. The jump list, "post", Postman: the
      // postman's label anchor lands within 12 px of the free area's middle sideways and within 40 px of it up and down
      // (sideways the whole width, which the portrait frame spans; up and down the canvas less the chrome's insets). Before, the ground box around the figure reached further
      // away than towards the camera, so the figure landed left of and below the middle (about 40 px each way here).
      await p.getByRole("button", { name: /Jump to/ }).first().tap();
      await p.waitForTimeout(600);
      await p.keyboard.type("post");
      await p.waitForTimeout(500);
      await p.getByRole("dialog", { name: "Jump to" }).getByRole("option", { name: /Postman/ }).first().tap();
      await p.waitForTimeout(2500);
      const landed = await p.evaluate(() => {
        const a = [...document.querySelectorAll(".world-labels .anchor")].find((x) => /Postman/.test(x.textContent ?? ""));
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(a?.getAttribute("style") ?? "");
        const canvas = document.querySelector("main.world-stage canvas");
        const r = canvas?.getBoundingClientRect();
        const ins = globalThis.__town?.insets?.();
        if (!m || !r || !ins) return null;
        const cx = r.left + r.width / 2, cy = r.top + (ins.top + (r.height - ins.bottom)) / 2;
        return { x: Math.round(+m[1]), y: Math.round(+m[2]), cx: Math.round(cx), cy: Math.round(cy), dx: Math.round(+m[1] - cx), dy: Math.round(+m[2] - cy) };
      });
      await shot(p, "12f-375-jump-postman");
      ok("375: a jump to the postman centres it in the portrait frame (round 65, w4-11)", landed !== null && Math.abs(landed.dx) <= 12 && Math.abs(landed.dy) <= 40, landed ? `anchor ${landed.x},${landed.y}; free middle ${landed.cx},${landed.cy}; off by ${landed.dx},${landed.dy}` : "no postman label, canvas or insets");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      // The same jump while he is out on a delivery (the finding's own moment, 0:38 of the story): he walks on after the
      // camera has aimed, and before the fix ended about 40 px from the screen's left edge. He starts at 0:27, whatever a
      // seek to 0:25 skips; seeking any later leaves him standing, so the row also holds that he really walked.
      await seek(p, 25000);
      for (let i = 0; i < 100 && Number(await p.locator("input.playback-scrub").inputValue().catch(() => "0")) < 30000; i++) await p.waitForTimeout(100);
      const postmanAt = () => p.evaluate(() => { const a = globalThis.__town?.walks?.walker?.("postman"); return a ? { x: a.x, z: a.z } : null; });
      const walkFrom = await postmanAt();
      await p.getByRole("button", { name: /Jump to/ }).first().tap();
      await p.waitForTimeout(400);
      await p.keyboard.type("post");
      await p.waitForTimeout(300);
      await p.getByRole("dialog", { name: "Jump to" }).getByRole("option", { name: /Postman/ }).first().tap();
      await p.waitForTimeout(4000);
      const walkTo = await postmanAt();
      const walked = walkFrom && walkTo ? Math.hypot(walkTo.x - walkFrom.x, walkTo.z - walkFrom.z) : 0;
      const walkedTo = await p.evaluate(() => {
        const a = [...document.querySelectorAll(".world-labels .anchor")].find((x) => /Postman/.test(x.textContent ?? ""));
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(a?.getAttribute("style") ?? "");
        return m ? { x: Math.round(+m[1]), middle: Math.round(innerWidth / 2) } : null;
      });
      await shot(p, "12f2-375-jump-postman-walking");
      ok("375: a jump to the postman out on a delivery keeps him in the middle of the frame (round 65, w4-11)", walked >= 3 && walkedTo !== null && Math.abs(walkedTo.x - walkedTo.middle) <= 30, walkedTo ? `walked ${walked.toFixed(1)} units; label at x ${walkedTo.x}, the middle ${walkedTo.middle}` : "no postman label");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      // w4-11's rows seek and leave a figure selected: a fresh load again.
      await town(p, 1500);
      // Round 65 (w4-6): a tap is not the keyboard. A sign tapped and "← Town" tapped leave no expanded plate and no ring
      // on the plot (before, the sign's focus fired the hover intent as the keyboard's Tab does, and the ring lingered);
      // a tap that zooms a room marks its sign with the accent border alone, no focus ring (before, the class drew it).
      await p.locator(".world-labels").getByRole("button", { name: /crewhub-loops/ }).first().tap();
      await p.waitForTimeout(2500);
      await p.locator("nav.world-breadcrumb").getByRole("button").first().tap();
      await p.waitForTimeout(2500);
      const afterBack = await p.evaluate(() => ({ entered: globalThis.__town?.view?.entered ?? null, expanded: document.querySelectorAll(".town-sign.expanded").length, ring: globalThis.__town?.view?.ringVisible ?? null }));
      await shot(p, "12d-375-after-back");
      ok("375 touch: a sign tapped and ← Town tapped leave no expanded plate and no ring on the plot (round 65, w4-6)", afterBack.entered === null && afterBack.expanded === 0 && afterBack.ring === false, JSON.stringify(afterBack));
      await p.locator(".world-labels").getByRole("button", { name: /crewhub-loops/ }).first().tap();
      await p.waitForTimeout(2500);
      const detailsPhone = p.getByRole("button", { name: /^Details/ }).first();
      await detailsPhone.tap();
      await p.waitForTimeout(700);
      const leadAt = await p.evaluate(() => { const a = [...document.querySelectorAll(".world-labels .anchor")].find((x) => /CL Lead/.test(x.textContent ?? "")); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(a?.getAttribute("style") ?? ""); return m ? { x: +m[1], y: +m[2] } : null; });
      if (leadAt) await p.touchscreen.tap(leadAt.x, leadAt.y + 22);
      await p.waitForTimeout(1500);
      const roomSign = await p.evaluate(() => { const s = document.querySelector(".world-labels .room-sign.focused"); return s ? { room: globalThis.__town?.view?.room ?? null, shadow: getComputedStyle(s).boxShadow } : null; });
      await shot(p, "12e-375-room-tapped");
      ok("375 touch: a tap that zooms a room marks its sign without the focus ring (round 65, w4-6)", roomSign !== null && !/0px 0px 0px 4px/.test(roomSign.shadow), roomSign ? `room ${roomSign.room}, shadow ${roomSign.shadow.slice(0, 60)}` : `no zoomed room sign (lead at ${JSON.stringify(leadAt)})`);
      await detailsPhone.tap().catch(() => {});
      await p.waitForTimeout(300);
      // Both rows of this round stand here: w4-6's above want the town, w4-8's below leaves a card open. A fresh load between them.
      await town(p, 1500);
      // Round 65 (sugg/w4-18): inside a building the build sheet covered the lower 45 % of a phone's screen, where the
      // floor is, so a placed prop stood under it. On a phone it shows the palette alone (the status, the groups and the
      // props) and keeps the rest behind More (Undo, Redo, New prop, Layout, Zones, Request a prop), and stands under two
      // fifths of the screen; More gives all of that back, and Props the palette.
      await canvas(p).focus();
      if ((await entered(p)) == null) await p.keyboard.press("Enter");
      await p.waitForTimeout(1200);
      await p.keyboard.press("b");
      await p.waitForTimeout(600);
      const phoneSheet = p.locator(".build-sheet");
      const seen = async () => ({
        layout: await phoneSheet.getByRole("heading", { name: "Layout" }).isVisible().catch(() => false),
        undo: await phoneSheet.getByRole("button", { name: "Undo", exact: true }).isVisible().catch(() => false),
        palette: await phoneSheet.locator(".build-palette").isVisible().catch(() => false),
        status: await phoneSheet.locator(".build-status").isVisible().catch(() => false),
      });
      const parts = phoneSheet.getByRole("group", { name: "Part of the build sheet" });
      const onProps = await seen();
      const sheetBox = await phoneSheet.boundingBox().catch(() => null);
      const vh = await p.evaluate(() => innerHeight);
      await shot(p, "12d-375-build-sheet");
      // A scrolled palette takes neither the two buttons nor the sentence out of the sheet (they went with it in a first
      // try). A short window, so the body really does scroll: `scrolled` must be above 0, or this proves nothing.
      const phoneSize = p.viewportSize();
      await p.setViewportSize({ width: phoneSize.width, height: 480 });
      await p.waitForFunction(() => { const body = document.querySelector(".build-sheet .card-body"); return !!body && body.scrollHeight > body.clientHeight + 20; }, null, { timeout: 10000, polling: 200 }).catch(() => {});
      const held = await p.evaluate(() => {
        const sheetEl = document.querySelector(".build-sheet");
        const body = sheetEl?.querySelector(".card-body");
        if (!sheetEl || !body) return null;
        body.scrollTop = body.scrollHeight;
        const bodyBox = body.getBoundingClientRect();
        const sheetBox = sheetEl.getBoundingClientRect();
        const buttons = sheetEl.querySelector(".build-parts")?.getBoundingClientRect();
        const status = sheetEl.querySelector(".build-status")?.getBoundingClientRect();
        const answer = { scrolled: Math.round(body.scrollTop), parts: !!buttons && buttons.height > 0 && buttons.top >= sheetBox.top - 1 && buttons.bottom <= bodyBox.top + 1, status: !!status && status.height > 0 && status.top >= bodyBox.top - 1 && status.bottom <= bodyBox.bottom + 1 };
        body.scrollTop = 0;
        return answer;
      });
      await p.setViewportSize(phoneSize);
      await p.waitForTimeout(300);
      const more = parts.getByRole("button", { name: "More", exact: true });
      if (await more.isVisible().catch(() => false)) await more.tap();
      await p.waitForTimeout(300);
      const onMore = await seen();
      await shot(p, "12e-375-build-sheet-more");
      const props = parts.getByRole("button", { name: "Props", exact: true });
      if (await props.isVisible().catch(() => false)) await props.tap();
      await p.waitForTimeout(300);
      const backOnProps = await seen();
      const words = (o) => Object.entries(o).filter(([, shown]) => shown).map(([name]) => name).join("+") || "nothing";
      // m1's review: a palette scrolled until a row stands whole at the bottom, the row tapped with no tool scroll: Turn,
      // Place and Done go in above it, and must stand whole in the body, under the sentence. Then More opens at its top, New
      // prop whole. A short phone (664), where the body is shortest. Each read waits for the state; the ceiling only ends a failure.
      const fullSize = p.viewportSize();
      await p.setViewportSize({ width: fullSize.width, height: 664 });
      const scrolledFrom = await p.evaluate(async () => {
        const sheetEl = document.querySelector(".build-sheet");
        const body = sheetEl.querySelector(".card-body");
        for (const group of sheetEl.querySelectorAll(".build-groups .btn")) {
          group.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (sheetEl.querySelectorAll(".palette-item").length > 1) break;
        }
        const row = [...sheetEl.querySelectorAll(".palette-item")].at(-1);
        body.scrollTop = 0;
        body.scrollTop = Math.max(0, row.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 1);
        const from = Math.round(body.scrollTop);
        row.click();
        return from;
      });
      const actionsWhole = await p.waitForFunction(() => {
        const sheetEl = document.querySelector(".build-sheet");
        const box = sheetEl.querySelector(".card-body").getBoundingClientRect();
        const status = sheetEl.querySelector(".build-status").getBoundingClientRect();
        const buttons = [...sheetEl.querySelectorAll(".card-body > .build-actions .btn")].map((b) => b.getBoundingClientRect());
        return buttons.length === 3 && buttons.every((r) => r.top >= status.bottom - 1 && r.bottom <= box.bottom + 1);
      }, null, { timeout: 8000, polling: 200 }).then(() => true).catch(() => false);
      const actionWords = await p.evaluate(() => { const sheetEl = document.querySelector(".build-sheet"); const box = sheetEl.querySelector(".card-body").getBoundingClientRect(); return `body to ${Math.round(box.bottom)}, ` + [...sheetEl.querySelectorAll(".card-body > .build-actions .btn")].map((b) => { const r = b.getBoundingClientRect(); return `${b.textContent.trim()} ${Math.round(r.top)}..${Math.round(r.bottom)}`; }).join(", "); });
      await shot(p, "12f-664-build-sheet-chosen");
      await p.evaluate(() => { const b = document.querySelector(".build-sheet .card-body"); b.scrollTop = b.scrollHeight; [...document.querySelectorAll(".build-parts .btn")].find((x) => x.textContent.trim() === "More").click(); });
      const moreWhole = await p.waitForFunction(() => {
        const sheetEl = document.querySelector(".build-sheet");
        const box = sheetEl.querySelector(".card-body").getBoundingClientRect();
        const bar = sheetEl.querySelector(".build-toolbar").getBoundingClientRect();
        const status = sheetEl.querySelector(".build-status").getBoundingClientRect();
        return sheetEl.dataset.part === "more" && sheetEl.querySelector(".card-body").scrollTop === 0 && bar.top >= box.top - 1 && bar.bottom <= status.top + 1;
      }, null, { timeout: 8000, polling: 200 }).then(() => true).catch(() => false);
      ok("375 x 664: a prop chosen from a scrolled palette shows Turn, Place and Done whole, and More opens at its top with New prop whole (round 65, w4-18, m1's review)", scrolledFrom > 0 && actionsWhole && moreWhole, `palette scrolled ${scrolledFrom}; ${actionWords}; More at its top, New prop whole: ${moreWhole}`);
      await p.setViewportSize(fullSize);
      ok("375: inside a building the build sheet is the palette under two fifths of the screen, and More holds the rest (round 65, w4-18)", onProps.palette && onProps.status && !onProps.layout && !onProps.undo && sheetBox !== null && sheetBox.height <= vh * 0.4 && onMore.layout && onMore.undo && onMore.status && !onMore.palette && backOnProps.palette && !backOnProps.layout && held !== null && held.scrolled > 0 && held.parts && held.status, `scrolled ${held ? held.scrolled : "?"}: buttons ${held?.parts}, sentence ${held?.status}; Props shows ${words(onProps)}, More shows ${words(onMore)}, back shows ${words(backOnProps)}; sheet ${sheetBox ? Math.round(sheetBox.height) : "?"} of ${vh}`);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      // w4-18's rows end inside a building, and w4-8's below wants the town: a fresh load.
      await town(p, 1500);
      // Round 65 (w4-8): on a phone one tap on a figure's name pill (shown with Details on) opens its card. Before, the
      // first tap zoomed the figure's room and the card needed a second tap on the figure itself.
      await canvas(p).focus();
      await p.keyboard.press("ArrowRight");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(2000);
      await p.getByRole("button", { name: "Details (D)", exact: true }).tap().catch((e) => note("375 Details " + e.message.split("\n")[0]));
      await p.waitForTimeout(900);
      const pill = p.locator(".world-labels .agent-anchor .name-pill:not(.person):not(.you-pill)").first();
      const pillName = await pill.evaluate((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()).catch(() => "");
      const box = await pill.boundingBox().catch(() => null);
      if (box) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      const cardOpened = await p.locator(".agent-card").first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
      const cardTitle = (await p.locator(".agent-card .card-title").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      await shot(p, "12d-375-pill-card");
      ok("375: one tap on a figure's name pill opens its card (round 65, w4-8)", cardOpened && pillName.length > 0 && cardTitle.includes(pillName), `pill "${pillName}", card ${cardOpened ? `"${cardTitle}"` : "not open"}`);
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
