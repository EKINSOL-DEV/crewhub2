/* shots.mjs: the world in screenshots, a list of views x themes x widths.

   Usage:
     node tools/shots.mjs --port <port> [--tag shots] [--views town,building,room,walk,stress,person,events] [--theme light,dark]
                          [--width 1440,375] [--cast <id>] [--scenario <id>] [--building <n>] [--room <n>] [--buildings <n>]
                          [--rooms <n>] [--stress <n>] [--plan three|classic] [--seek <ms>] [--frames <n>] [--every <ms>]
                          [--zoom] [--speed 1x|4x|16x] [--out <dir>] [--swiftshader]

   Views:
     town      the home view
     building  Enter on building --building (0, the first, by default)
     room      that building's room --room (0 by default), zoomed
     walk      the first --buildings buildings (6) and each one's --rooms rooms (7), a shot per stop: the critical walk
     stress    the stress fixture (?stress=<n>, dev builds only) at 4x after 12 s: the town, and inside the second
               building; the dev overlay's numbers are printed
     events    the new loops events (round 7): the storyline played to the quiet fact (dust and a clock tag on CR-17,
               Details on), to the card an automation run pins on crewhub's board by the front door, and to the failed
               run's card in crewhub-loops: three shots, each waiting for the model's state, playback paused for it
     person    a person carrying work into Done: the demo sought to --seek ms (200000, 3:20, just before the
               storyline's first move into Done at 3:28), Enter on --building, then --frames shots (12) --every ms
               (2000) at --speed (1x; 4x or 16x to check the walk at a faster playback); a line per frame says where
               the person is (dev builds); --zoom zooms hall --room first and clicks the figure once it holds the
               package, for a shot of its plate
   A width of 480 or less is a phone (a touch device, 812 high); every other width is a window 900 high.
   --cast is the viewer's cast choice (Settings > Town > Cast); --scenario a demo scenario by its id (the Demo chip's
   picker, the page's ?scenario=<id>), for every view but stress; --plan the building plan (the page's
   ?rooms=three|classic: the three halls of the spec addendum, or the classic ten rooms).

   Output in --out (default tools/out/): <tag>-<view>-<theme>-<width>.png. Page errors, console errors and requests
   that leave the page's origin are printed. */
import { cli, launch, list, problemLines } from "./lib/world.mjs";
import { VIEWS, worldShots } from "./lib/shots.mjs";

const opts = cli(
  "node tools/shots.mjs --port <port> [--tag shots] [--views town,building,room,walk,stress,person,events] [--theme light,dark] [--width 1440,375] [--cast <id>] [--scenario <id>] [--building <n>] [--room <n>] [--buildings <n>] [--rooms <n>] [--stress <n>] [--plan three|classic] [--seek <ms>] [--frames <n>] [--every <ms>] [--zoom] [--speed 1x|4x|16x] [--out <dir>] [--swiftshader]",
  { options: { tag: "shots", views: "town,building,room", theme: "light,dark", width: "1440", cast: null, scenario: null, building: "0", room: "0", buildings: "6", rooms: "7", stress: "1", plan: null, seek: "200000", frames: "12", every: "2000", speed: "1x" }, flags: ["zoom"] },
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
  plan: opts.plan,
  building: Number(opts.building),
  room: Number(opts.room),
  buildings: Number(opts.buildings),
  rooms: Number(opts.rooms),
  seekMs: Number(opts.seek),
  frames: Number(opts.frames),
  everyMs: Number(opts.every),
  zoom: !!opts.zoom,
  personSpeed: opts.speed,
  problems,
  name: (view, theme, width) => `${opts.tag}-${view}-${theme}-${width}`,
});
await browser.close();
console.log(`${count} screenshots in ${opts.out}`);
const lines = [...notes, ...problemLines(problems)];
if (lines.length) console.log(lines.join("\n"));
