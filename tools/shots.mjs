/* shots.mjs: the world in screenshots, a list of views x themes x widths.

   Usage:
     node tools/shots.mjs --port <port> [--tag shots] [--views town,building,room] [--theme light,dark]
                          [--width 1440,375] [--cast <id>] [--scenario <id>] [--building <n>] [--room <n>] [--buildings <n>]
                          [--rooms <n>] [--stress <n>] [--out <dir>] [--swiftshader]

   Views:
     town      the home view
     building  Enter on building --building (0, the first, by default)
     room      that building's room --room (0 by default), zoomed
     walk      the first --buildings buildings (6) and each one's --rooms rooms (7), a shot per stop: the critical walk
     stress    the stress fixture (?stress=<n>, dev builds only) at 4x after 12 s: the town, and inside the second
               building; the dev overlay's numbers are printed
   A width of 480 or less is a phone (a touch device, 812 high); every other width is a window 900 high.
   --cast is the viewer's cast choice (Settings > Town > Cast); --scenario a demo scenario by its id (the Demo chip's
   picker, the page's ?scenario=<id>), for every view but stress.

   Output in --out (default tools/out/): <tag>-<view>-<theme>-<width>.png. Page errors, console errors and requests
   that leave the page's origin are printed. */
import { cli, launch, list, problemLines } from "./lib/world.mjs";
import { VIEWS, worldShots } from "./lib/shots.mjs";

const opts = cli(
  "node tools/shots.mjs --port <port> [--tag shots] [--views town,building,room] [--theme light,dark] [--width 1440,375] [--cast <id>] [--scenario <id>] [--building <n>] [--room <n>] [--buildings <n>] [--rooms <n>] [--stress <n>] [--out <dir>] [--swiftshader]",
  { options: { tag: "shots", views: "town,building,room", theme: "light,dark", width: "1440", cast: null, scenario: null, building: "0", room: "0", buildings: "6", rooms: "7", stress: "1" } },
);
const widths = list(opts.width).map(Number);
if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 200)) opts.fail("--width takes whole numbers of pixels, 200 or more");
const browser = await launch(opts);
const problems = [];
const { count, notes } = await worldShots(browser, {
  base: opts.base,
  origin: opts.origin,
  out: opts.out,
  views: list(opts.views, VIEWS, opts.fail, "view"),
  themes: list(opts.theme, ["light", "dark"], opts.fail, "theme"),
  widths,
  cast: opts.cast,
  scenario: opts.scenario,
  stress: opts.stress,
  building: Number(opts.building),
  room: Number(opts.room),
  buildings: Number(opts.buildings),
  rooms: Number(opts.rooms),
  problems,
  name: (view, theme, width) => `${opts.tag}-${view}-${theme}-${width}`,
});
await browser.close();
console.log(`${count} screenshots in ${opts.out}`);
const lines = [...notes, ...problemLines(problems)];
if (lines.length) console.log(lines.join("\n"));
