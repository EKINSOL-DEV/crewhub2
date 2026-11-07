/* castworld.mjs: the world as each cast draws it, in screenshots.

   Usage:
     node tools/castworld.mjs --port <port> [--cast <id,...>] [--tag world] [--views town,building,room,stress]
                              [--theme light,dark] [--width 1440,375] [--stress <n>] [--out <dir>] [--swiftshader]

   For every given cast (default: every cast the casting room offers) as the viewer's choice (Settings > Town > Cast):
   the town, the first building and its first room per theme and width, and the stress fixture (dev builds only) in
   the town and inside, with the dev overlay's numbers printed. The views are those of shots.mjs.

   Output in --out (default tools/out/): <tag>-<cast>-<view>-<theme>-<width>.png. Page errors, console errors and
   requests that leave the page's origin are printed. */
import { cli, launch, list, problemLines } from "./lib/world.mjs";
import { VIEWS, worldShots } from "./lib/shots.mjs";

const opts = cli("node tools/castworld.mjs --port <port> [--cast <id,...>] [--tag world] [--views town,building,room,stress] [--theme light,dark] [--width 1440,375] [--stress <n>] [--out <dir>] [--swiftshader]", {
  options: { cast: null, tag: "world", views: "town,building,room,stress", theme: "light,dark", width: "1440,375", stress: "1" },
});
const browser = await launch(opts);
const problems = [];
let casts = opts.cast ? list(opts.cast) : null;
if (!casts) {
  // The casts on offer, as the casting room lists them.
  const p = await browser.newPage();
  await p.goto(`${opts.base}cast-preview`);
  await p.waitForSelector(".cast-stage[data-ready]", { timeout: 30000 });
  casts = await p.locator("select").first().locator("option").evaluateAll((os) => os.map((o) => o.value));
  await p.context().close();
}
const views = list(opts.views, VIEWS, opts.fail, "view");
const themes = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const widths = list(opts.width).map(Number);
let total = 0;
const lines = [];
for (const cast of casts) {
  // The stress fixture is a desktop measurement: once per cast, light, at the widest width.
  const { count, notes } = await worldShots(browser, {
    base: opts.base, origin: opts.origin, out: opts.out, views: views.filter((v) => v !== "stress"), themes, widths, cast, problems,
    name: (view, theme, width) => `${opts.tag}-${cast}-${view}-${theme}-${width}`,
  });
  total += count;
  lines.push(...notes);
  if (views.includes("stress")) {
    const stress = await worldShots(browser, {
      base: opts.base, origin: opts.origin, out: opts.out, views: ["stress"], themes: [themes[0]], widths: [Math.max(...widths)], cast, stress: opts.stress, problems,
      name: (view, theme, width) => `${opts.tag}-${cast}-${view}-${theme}-${width}`,
    });
    total += stress.count;
    lines.push(...stress.notes.map((n) => `${cast} ${n}`));
  }
}
await browser.close();
console.log(`${total} screenshots in ${opts.out}`);
lines.push(...problemLines(problems));
if (lines.length) console.log(lines.join("\n"));
