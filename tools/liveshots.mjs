/* liveshots.mjs: the world in live mode, in screenshots: the town (light and dark, desktop and phone), the connection
   chip in the state the host is in, Settings > Source and the text view's connection line. Point it at a Vite that
   proxies /world-api to a host (or a stub); start the host in each state you want a chip of and run it again.

   Usage:
     node tools/liveshots.mjs --port <port> [--tag live] [--theme light,dark] [--width 1440,375] [--state live]
                              [--settle 6000] [--views town,chip,settings,text,chat,card] [--card <agent>] [--out <dir>] [--swiftshader]
   --state names the files (live, stale, loops-down, unauthorized, catching-up); the page decides the chip itself.
   --card <agent> opens the agent card of that agent (the jump list lands beside it, Enter opens the card) and adds the
   `card` view: the page with the card open and the card itself. Several agents: a comma list, one file each.
   The `chat` view opens the Chat panel from the chip: the frame shows the loops web the host names (its sign-in, in a
   headless browser that is signed in nowhere), and the notes say which URL the frame holds.
   Output: <tag>-<state>-town-<theme>-<width>.png, <tag>-<state>-chip-<theme>-<width>.png, <tag>-<state>-settings-<theme>-<width>.png,
   <tag>-<state>-text-<theme>-<width>.png, <tag>-<state>-chat-<theme>-<width>.png, <tag>-<state>-card-<agent>-<theme>-<width>.png (the page) and
   <tag>-<state>-cardonly-<agent>-<theme>-<width>.png (the card). The card's text goes on stdout, so a check can read it. */
import { cli, launch, list, problemLines, watch } from "./lib/world.mjs";

const opts = cli("node tools/liveshots.mjs --port <port> [--tag live] [--theme light,dark] [--width 1440,375] [--state live] [--settle 6000] [--views town,chip,settings,text,chat,card] [--card <agent>] [--out <dir>] [--swiftshader]", {
  options: { tag: "live", theme: "light,dark", width: "1440", state: "live", settle: "6000", views: "town,chip,settings,text", card: "" },
});
const widths = list(opts.width).map(Number);
const themes = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const cards = opts.card ? list(opts.card) : [];
const views = list(cards.length && !opts.views.includes("card") ? `${opts.views},card` : opts.views, ["town", "chip", "settings", "text", "chat", "card"], opts.fail, "view");
if (views.includes("card") && !cards.length) opts.fail("the card view needs --card <agent>");

/** Opens the card of `agent` from the town: the jump list (/) lands beside the figure with it selected, Enter opens the card. */
async function openCard(p, agent) {
  const canvas = p.locator("canvas").first();
  await canvas.focus();
  await p.keyboard.press("/");
  await p.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
  await p.keyboard.type(agent);
  await p.waitForTimeout(400);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await canvas.focus();
  await p.keyboard.press("Enter");
  await p.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(800);
  return p.locator(".agent-card");
}
const viewport = (width) => (width <= 480 ? { viewport: { width, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
const browser = await launch(opts);
const problems = [];
const notes = [];
let count = 0;
const name = (view, theme, width) => `${opts.out}${opts.tag}-${opts.state}-${view}-${theme}-${width}.png`;
for (const theme of themes)
  for (const width of widths) {
    const ctx = await browser.newContext({ ...viewport(width), deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage();
    watch(p, opts.origin, problems, `${theme} ${width}`);
    await p.goto(`${opts.base}?source=live`, { waitUntil: "load" });
    await p.waitForSelector("canvas", { timeout: 60000 }).catch(() => notes.push(`${theme} ${width}: no canvas`));
    await p.waitForTimeout(Number(opts.settle));
    const chip = p.locator(".connection-chip").first();
    const word = (await chip.count()) ? await chip.innerText() : "(no connection chip)";
    const demoChip = await p.locator(".demo-chip").count();
    const playback = await p.locator(".playback-bar").count();
    const chatChip = await p.locator(".chat-open").count();
    notes.push(`${theme} ${width}: chip "${word.trim()}", demo chip ${demoChip}, playback bar ${playback}, chat chip ${chatChip}`);
    if (views.includes("town")) (await p.screenshot({ path: name("town", theme, width) }), count++);
    if (views.includes("chip") && (await chip.count())) (await p.locator(".world-brand").screenshot({ path: name("chip", theme, width) }), count++);
    if (views.includes("settings")) {
      await p.getByRole("button", { name: "Settings", exact: true }).click();
      await p.waitForSelector(".source-settings", { timeout: 5000 });
      await p.locator(".source-settings").scrollIntoViewIfNeeded();
      await p.screenshot({ path: name("settings", theme, width) });
      count++;
      await p.keyboard.press("Escape");
    }
    if (views.includes("text")) {
      await p.keyboard.press("t");
      await p.waitForSelector(".text-connection", { timeout: 5000 }).catch(() => notes.push(`${theme} ${width}: no text connection line`));
      await p.screenshot({ path: name("text", theme, width) });
      count++;
      await p.keyboard.press("t");
      await p.waitForTimeout(300);
    }
    if (views.includes("chat")) {
      // The Chat panel (round 12): the chip opens it; the frame is the loops web the host names, so the shot shows loops'
      // own sign-in (or the chat, when this browser is signed in: never headless). The frame's URL goes in the notes.
      await p.locator(".chat-open").click().catch(() => notes.push(`${theme} ${width}: no chat chip`));
      await p.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => notes.push(`${theme} ${width}: no chat panel`));
      await p.waitForTimeout(Number(opts.settle));
      const framed = p.frames().map((f) => f.url()).filter((u) => u !== "about:blank" && !u.startsWith(opts.origin));
      notes.push(`${theme} ${width}: chat panel frames ${framed.length ? framed.join(", ") : "(nothing yet)"}`);
      await p.screenshot({ path: name("chat", theme, width) });
      count++;
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
    }
    if (views.includes("card"))
      for (const agent of cards) {
        // Back to the town between agents: Escape closes the card, Escape again leaves the building.
        const card = await openCard(p, agent);
        const text = (await card.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        if (!(await card.count())) notes.push(`${theme} ${width}: no card for ${agent}`);
        else {
          notes.push(`${theme} ${width}: card ${agent}: ${text}`);
          await p.screenshot({ path: name(`card-${agent}`, theme, width) });
          await card.screenshot({ path: name(`cardonly-${agent}`, theme, width) });
          count += 2;
          // The card body scrolls: a third shot with the Lane section at the top, when there is one (behind the More
          // disclosure since round 22: opened first, so the shot shows it).
          const more = card.locator("details.agent-card-more:not([open]) > summary");
          if (await more.count()) {
            await more.click();
            await p.waitForTimeout(200);
            notes.push(`${theme} ${width}: card ${agent} More opened: ${(await card.locator("details.agent-card-more").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 400)}`);
          }
          const lane = card.locator(".agent-card-section").filter({ has: p.locator("h3", { hasText: /^Lane$/ }) }).first();
          if (await lane.count()) {
            await lane.evaluate((el) => el.scrollIntoView({ block: "start" }));
            await p.waitForTimeout(300);
            await card.screenshot({ path: name(`cardlane-${agent}`, theme, width) });
            count++;
          }
        }
        for (let i = 0; i < 3; i++) {
          await p.keyboard.press("Escape");
          await p.waitForTimeout(400);
        }
        await p.waitForTimeout(1200);
      }
    await ctx.close();
  }
await browser.close();
console.log(`${count} screenshots in ${opts.out}`);
const lines = [...notes, ...problemLines(problems)];
if (lines.length) console.log(lines.join("\n"));
