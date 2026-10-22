/* tourshots.mjs: the introduction inside the world (round 20) in pictures: two steps of the tour over the demo town, in
   both themes at 1440 and 375. The tour never starts in a tool's browser by itself (navigator.webdriver), so the page is
   asked for it with `?tour=on`.

   Usage: node tools/tourshots.mjs --port <vite port> [--steps 1,2] [--theme light,dark] [--width 1440,375] [--out <dir>] [--swiftshader]
   Output in --out: tour-step<N>-<theme>-<width>.png. Prints `tourshots: <passed>/<total>` last; exit 0 at full marks. */
import { cli, dressed, launch, list, problemLines, watch } from "./lib/world.mjs";

const opts = cli("node tools/tourshots.mjs --port <vite port> [--steps 1,2] [--theme light,dark] [--width 1440,375] [--out <dir>] [--swiftshader]", { options: { steps: "1,2", theme: "light,dark", width: "1440,375" } });
const steps = list(opts.steps).map(Number);
const themes = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const widths = list(opts.width).map(Number);
if (steps.some((s) => !Number.isInteger(s) || s < 1 || s > 6)) opts.fail("--steps takes step numbers from 1 to 6");

const browser = await launch(opts);
const problems = [];
let passed = 0;
let total = 0;
const ok = (name, condition, detail = "") => {
  total++;
  if (condition) passed++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

for (const theme of themes)
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: width <= 480 ? 812 : 900 }, ...(width <= 480 ? { isMobile: true, hasTouch: true } : {}), deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage();
    watch(p, opts.origin, problems, `${theme} ${width}`);
    await p.goto(`${opts.base}?tour=on`, { waitUntil: "load" });
    await dressed(p, 60000).catch(() => undefined);
    const card = p.locator(".tour-card");
    const came = await card.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    ok(`${theme} ${width}: the tour's first step came`, came);
    if (!came) {
      await ctx.close();
      continue;
    }
    let at = 1;
    for (const step of [...steps].sort((a, b) => a - b)) {
      while (at < step) {
        await p.getByRole("button", { name: "Next" }).click();
        at++;
        await p.waitForTimeout(300);
      }
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${opts.out}tour-step${step}-${theme}-${width}.png` });
      const box = await card.boundingBox();
      ok(`${theme} ${width}: step ${step} shot, the card inside the viewport`, box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= (width <= 480 ? 812 : 900) + 1, box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : "no card");
    }
    await ctx.close();
  }

await browser.close();
const lines = problemLines(problems);
if (lines.length) console.log(lines.join("\n"));
ok("no page errors, console errors or requests that leave the page", lines.length === 0, String(lines.length));
console.log(`tourshots: ${passed}/${total}`);
process.exit(passed === total ? 0 : 1);
