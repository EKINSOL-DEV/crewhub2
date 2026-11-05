/**
 * The demo group: the jump list, the postman's card, a card that cannot be drawn, the scenario picker and the Studio
 * scenario's Region level (`run`); and the new loops events of round 7 played to the model's state, a seek, and the dock's
 * scripted reply (`runEvents`). The runner calls both under the one group name, each timed on its own.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { contextOptions, drawn, labels, level, levels, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { dressed, list, seek, speed, watch } from "../lib/world.mjs";

export async function run({ pass, page, check, out }) {
  const { browser, origin, base: BASE } = pass;
  const { open, town, canvas, crumbs, demoChip, entered } = page;
  const { ok } = check;
  const { shot } = out;
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
  // 12b. A figure outside the buildings: the jump list lands beside the postman in the town, selected; Enter opens its card there.
  await canvas(p).focus();
  await p.keyboard.press("/");
  await dialog.waitFor({ timeout: 3000 }).catch(() => {});
  await p.keyboard.type("postman");
  await p.waitForTimeout(400);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1500);
  await canvas(p).focus();
  await p.keyboard.press("Enter");
  const townCard = p.locator(".agent-card");
  await townCard.first().waitFor({ timeout: 3000 }).catch(() => {});
  const townCardText = (await townCard.first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("jump list: the postman's card opens in the town", (await entered(p)) == null && (await townCard.count()) > 0 && /the post office/.test(townCardText), townCardText.slice(0, 100) || "no card");
  await shot(p, "15b-town-card");
  await p.context().close();

  // 12c. Round 48 (r48-unknown U5): a card that cannot be drawn says so in its place, and the town stays (it used to
  // take the canvas with it, as a graphics failure). The AgentCard module Vite serves this one page throws when it
  // renders: a route of this check's own, the app has no switch for it. Its console errors are the throw's, on purpose,
  // so this page keeps its own list instead of the run's.
  {
    const ctx = await browser.newContext(contextOptions());
    await ctx.route(/\/src\/components\/AgentCard\.tsx(\?|$)/, async (route) => {
      // Read through the context's request client (the module as Vite serves it), then served rewritten.
      const original = await ctx.request.get(route.request().url());
      const body = (await original.text()).replace("export function AgentCard(", 'export function AgentCard() {\n  throw new Error("regress: this card throws on purpose");\n}\nfunction AgentCardDrawn(');
      await route.fulfill({ status: original.status(), headers: original.headers(), body });
    });
    const pg = await ctx.newPage();
    watch(pg, origin, [], "card throws");
    await town(pg, 2000);
    await canvas(pg).focus();
    await pg.keyboard.press("/");
    await pg.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.type("postman");
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(1500);
    await canvas(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(800);
    const failed = (await pg.locator(".agent-card-failed").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const canvases = await pg.locator(".canvas-host canvas").count();
    const fallback = await pg.locator(".text-sheet.fallback").count();
    ok("a card that cannot be drawn says so in its place, and the town stays", /could not be drawn/.test(failed) && canvases > 0 && fallback === 0, `card "${failed.slice(0, 80)}", canvas ${canvases}, graphics-failure text view ${fallback}`);
    await shot(pg, "15c-card-failed");
    await ctx.close();
  }

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
  // The picker says a choice reloads the page, as Settings › Source does (round 65, w5-18); the menu is still open.
  const pickerText = (await menu.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("scenario picker says a choice reloads the page (w5-18)", /changing it reloads the page\./i.test(pickerText), pickerText.slice(-60));
  await shot(p, "16-picker");
  await p.keyboard.press("Escape");
  const one = await pick("One project");
  // The loaded page gives the Demo chip the focus (round 65, w5-18): before, nothing was focused after the choice.
  const focusedAfterPick = await p.evaluate(() => (document.activeElement?.classList.contains("demo-chip") ? "demo chip" : `${document.activeElement?.tagName.toLowerCase() ?? "none"} ${document.activeElement?.className ?? ""}`.trim()));
  ok("scenario picker: the Demo chip has the focus on the loaded page (w5-18)", focusedAfterPick === "demo chip", focusedAfterPick);
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
}

export async function runEvents({ pass, page, check, out }) {
  const { open, town, canvas, entered } = page;
  const { ok, note } = check;
  const { tag, shot } = out;
  // 15. The new loops events (spec addendum, round 7): the storyline's quiet fact (CR-17 at 8:10) puts dust and a
  // clock tag on the package and a line in the text view; an automation run (8:40 on CR-20, 8:52 failed on CL-76)
  // pins a card on the board by the front door and leaves a line. Each check waits for the model's state (a quiet
  // object, a pinned card), never for the clock, and enters the building by its slug (Enter walks the town in its
  // own order).
  const model = (fn) => p.evaluate((src) => { const t = globalThis.__town; const m = t?.view?.model; return m ? new Function("m", "t", `return (${src})(m, t)`)(m, t) : null; }, fn.toString()).catch(() => null);
  const untilModel = async (check, ms = 20000) => { const d = Date.now() + ms; while (Date.now() < d) { if (await model(check)) return true; await p.waitForTimeout(250); } return false; };
  const pause = () => p.getByRole("button", { name: "Pause", exact: true }).click().catch((e) => note("pause " + e.message.split("\n")[0]));
  const enterSlug = async (slug) => {
    await canvas(p).focus();
    for (let i = 0; i < 8; i++) {
      await p.keyboard.press("Enter");
      await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(1200);
      if ((await entered(p)) === slug) return true;
      for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
      await p.waitForTimeout(800);
      await canvas(p).focus();
      await p.keyboard.press("ArrowRight");
    }
    return false;
  };
  let p = await open();
  await town(p, 2500);
  // a. ticket.quiet: dust and the words
  ok("seek before the quiet fact", await seek(p, 485000));
  await speed(p, "16x").catch((e) => note("16x " + e.message.split("\n")[0]));
  ok("a quiet object in the model within 20 s of play", await untilModel((m) => m.buildings.some((b) => b.objects.some((o) => o.quiet))));
  await pause();
  const quiet = await model((m) => m.buildings.flatMap((b) => b.objects.filter((o) => o.quiet).map((o) => `${o.key} ${o.quiet.status} ${o.quiet.minutes} min`)));
  ok("the quiet fact is CR-17 in review for 30 min", (quiet ?? []).includes("CR-17 review 30 min"), JSON.stringify(quiet));
  ok("entered crewhub", await enterSlug("crewhub"));
  await p.keyboard.press("d");
  await p.waitForTimeout(1200);
  const tags = await p.locator(".world-labels .quiet-tag").allInnerTexts().catch(() => []);
  ok("the clock tag on the dusty package says quiet 30 min", tags.some((t) => /quiet 30 min/.test(t)), tags.join(" | "));
  const quietText = await text(p);
  ok("quiet in the text view", /CR-17 has been quiet in Review for 30 min \(since \d\d:\d\d\): dust on it, a clock tag "quiet 30 min"\./.test(quietText), (quietText.match(/CR-17 has been quiet[^\n]*/) ?? [""])[0]);
  await shot(p, "16-quiet");
  await p.keyboard.press("d");
  for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  // b. automation.ran: the card on the board and the lines
  ok("seek before the first run", await seek(p, 519000));
  await speed(p, "4x").catch((e) => note("4x " + e.message.split("\n")[0]));
  ok("a card pinned on crewhub's board within 20 s of play", await untilModel((m) => m.buildings.some((b) => b.slug === "crewhub" && b.board.some((c) => c.from <= m.now))));
  await pause();
  ok("entered crewhub again", await enterSlug("crewhub"));
  const cards = await p.locator(".world-labels .board-card").allInnerTexts().catch(() => []);
  ok("the card by the front door names the run and its change", cards.some((c) => /Automation "Label stale bugs" ran on CR-20: done; labels changed by the automation/.test(c)), cards.join(" | "));
  const boardText = await text(p);
  ok("the card in the text view", /A card on the board by the front door: Automation "Label stale bugs" ran on CR-20: done/.test(boardText), (boardText.match(/A card on the board[^\n]*/) ?? [""])[0]);
  ok("the run as a line in the text view", /^Automation "Label stale bugs" ran on CR-20: done; labels changed by the automation\.$/m.test(boardText));
  await shot(p, "16-board");
  for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  // c. a failed run says so in words
  ok("seek before the failed run", await seek(p, 530000));
  await speed(p, "4x").catch((e) => note("4x " + e.message.split("\n")[0]));
  ok("a failed card pinned on crewhub-loops' board within 20 s of play", await untilModel((m) => m.buildings.some((b) => b.slug === "crewhub-loops" && b.board.some((c) => c.outcome === "failed" && c.from <= m.now))));
  await pause();
  ok("entered crewhub-loops", await enterSlug("crewhub-loops"));
  const failed = await p.locator(".world-labels .board-card.failed").allInnerTexts().catch(() => []);
  ok("the failed card says failed", failed.some((c) => /Automation "Nudge the reviewer" ran on CL-76: failed/.test(c)), failed.join(" | "));
  const failedText = await text(p);
  ok("the failure in the text view", /Automation "Nudge the reviewer" ran on CL-76: failed\./.test(failedText));
  await shot(p, "16-board-failed");
  for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  // d. Round 9: a snapshot carries the facts the log holds. A seek loads a fresh snapshot, nothing plays: the quiet
  // fact and the runs are there at once, as in a tab opened after the quiet job spoke.
  ok("seek after the quiet fact, paused", await seek(p, 500000));
  await p.waitForTimeout(1500);
  const carriedQuiet = await text(p);
  ok("a fresh snapshot carries the quiet fact: the dust is there without playing", /CR-17 has been quiet in Review for 30 min/.test(carriedQuiet), (carriedQuiet.match(/CR-17 has been quiet[^\n]*/) ?? ["no quiet line"])[0]);
  ok("seek just after the first run, paused", await seek(p, 521000));
  await p.waitForTimeout(1500);
  const carriedRuns = await text(p);
  ok("a fresh snapshot carries the run: the card is pinned and the line is there", /A card on the board by the front door: Automation "Label stale bugs" ran on CR-20: done/.test(carriedRuns) && /^Automation "Label stale bugs" ran on CR-20: done/m.test(carriedRuns), (carriedRuns.match(/A card on the board[^\n]*/) ?? ["no card line"])[0]);
  ok("seek past the comment that ends the quiet stretch", await seek(p, 700000));
  await p.waitForTimeout(1500);
  const ended = await text(p);
  ok("after the comment the snapshot carries no quiet for CR-17", !/CR-17 has been quiet/.test(ended));
  await p.context().close();
  // 14. Round 17: the demo's dock answers feed the same store as the live bubbles: a message to an agent in the dock, its
  // scripted reply as a bubble over the agent, the text view's Recent answers row, and that row opening the agent's card.
  p = await open();
  await town(p, 2000);
  await p.locator("aside.dock button").first().click().catch(() => {});
  await p.waitForTimeout(800);
  await p.locator("textarea").first().fill("Is the reading nook done? (regress, round 17)");
  await p.getByRole("button", { name: "Send" }).click().catch(() => {});
  const demoBubble = p.locator(".bubble.said");
  await demoBubble.first().waitFor({ timeout: 20000 }).catch(() => {});
  const demoBubbleAgent = await demoBubble.first().getAttribute("data-said-agent").catch(() => null);
  const demoBubbleText = (await demoBubble.first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.keyboard.press("t");
  await p.waitForSelector("#text-view .text-recent", { timeout: 5000 }).catch(() => {});
  const demoRecent = (await p.locator("#text-view .text-recent").innerText().catch(() => "")).replace(/\s+/g, " ");
  const demoRows = await p.locator("#text-view .text-recent .recent-row").evaluateAll((els) => els.map((el) => ({ agent: el.getAttribute("data-answer-agent"), label: el.getAttribute("aria-label") }))).catch(() => []);
  await shot(p, "19-demo-recent-answers");
  await p.locator("#text-view .text-recent .recent-row").first().click().catch(() => {});
  await p.locator(".agent-card").first().waitFor({ timeout: 3000 }).catch(() => {});
  const demoCard = (await p.locator(".agent-card").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("demo (round 17): the dock's scripted reply shows as a bubble over the agent, the text view's Recent answers lists it with the demo reply's words, and its row opens that agent's card", demoBubbleAgent !== null && /\(demo reply\)/.test(demoBubbleText) && /^Recent answers \(1\)/.test(demoRecent) && demoRows.length === 1 && demoRows[0].agent === demoBubbleAgent && /\(demo reply\)/.test(demoRows[0].label ?? "") && /Open .*'s card$/.test(demoRows[0].label ?? "") && demoCard !== "", `bubble over ${demoBubbleAgent}: "${demoBubbleText.slice(0, 60)}"; rows ${JSON.stringify(demoRows).slice(0, 160)}; card: ${demoCard.slice(0, 60) || "none"}`);
  await p.context().close();
}
