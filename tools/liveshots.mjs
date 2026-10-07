/* liveshots.mjs: the world in live mode, in screenshots: the town (light and dark, desktop and phone), the connection
   chip in the state the host is in, Settings > Source and the text view's connection line. Point it at a Vite that
   proxies /world-api to a host (or a stub); start the host in each state you want a chip of and run it again.

   Usage:
     node tools/liveshots.mjs --port <port> [--tag live] [--theme light,dark] [--width 1440,375] [--state live]
                              [--settle 6000] [--out <dir>] [--swiftshader]
   --state names the files (live, stale, loops-down, unauthorized, catching-up); the page decides the chip itself.
   Output: <tag>-<state>-town-<theme>-<width>.png, <tag>-<state>-chip-<theme>-<width>.png, <tag>-<state>-settings-<theme>-<width>.png,
   <tag>-<state>-text-<theme>-<width>.png. */
import { cli, launch, list, problemLines, watch } from "./lib/world.mjs";

const opts = cli("node tools/liveshots.mjs --port <port> [--tag live] [--theme light,dark] [--width 1440,375] [--state live] [--settle 6000] [--out <dir>] [--swiftshader]", {
  options: { tag: "live", theme: "light,dark", width: "1440", state: "live", settle: "6000", views: "town,chip,settings,text" },
});
const widths = list(opts.width).map(Number);
const themes = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const views = list(opts.views, ["town", "chip", "settings", "text"], opts.fail, "view");
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
    const signIn = await p.locator(".chat-sign-in").count();
    notes.push(`${theme} ${width}: chip "${word.trim()}", demo chip ${demoChip}, playback bar ${playback}, sign-in link ${signIn}`);
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
    }
    await ctx.close();
  }
await browser.close();
console.log(`${count} screenshots in ${opts.out}`);
const lines = [...notes, ...problemLines(problems)];
if (lines.length) console.log(lines.join("\n"));
