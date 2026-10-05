/* castshots.mjs: the casting room (/cast-preview) in screenshots.

   Usage:
     node tools/castshots.mjs --port <port> [--cast <id,...>] [--theme light,dark] [--states <state,...>]
                              [--only states,extras,side] [--out <dir>] [--swiftshader]

   Every given cast (default: every cast the casting room offers) in every state (near), per theme, plus the extras
   (the walk, team and carry-on scenes, dusk, reduced motion, Fast, the town-distance view and the drone on its way to
   a desk) and the side-by-side view near and far with the whole page once.
   --states narrows the states, --only the groups, --theme the themes.

   Output in --out (default tools/out/): room-<cast>-<what>-<theme>.png, room-side-<what>-<theme>.png and
   room-page-<theme>.png. Page errors, console errors and requests that leave the page's origin are printed. */
import { cli, launch, list, problemLines, watch } from "./lib/world.mjs";

const ALL_STATES = ["working", "idle", "done", "blocked", "waiting", "attention", "stale", "proxy", "walking", "carrying"];
const opts = cli("node tools/castshots.mjs --port <port> [--cast <id,...>] [--theme light,dark] [--states <state,...>] [--only states,extras,side] [--out <dir>] [--swiftshader]", {
  options: { cast: null, theme: "light,dark", states: ALL_STATES.join(","), only: "states,extras,side" },
});
const OUT = opts.out;
const BASE = `${opts.base}cast-preview`;
const STATES = list(opts.states, ALL_STATES, opts.fail, "state");
const ONLY = list(opts.only, ["states", "extras", "side"], opts.fail, "group");
const SCHEMES = list(opts.theme, ["light", "dark"], opts.fail, "theme");
const browser = await launch(opts);
const problems = [];
const notes = [];
let count = 0;
for (const scheme of SCHEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  const p = await ctx.newPage();
  watch(p, opts.origin, problems, scheme);
  // The stage only (the room), after the scene drew and settled; `wait` longer for scenes that should be mid-motion.
  const shot = async (query, name, wait = 900) => {
    await p.goto(`${BASE}?${query}`);
    await p.waitForSelector(".cast-stage[data-ready]", { timeout: 30000 });
    await p.waitForTimeout(wait);
    await p.locator(".cast-stage").screenshot({ path: `${OUT}room-${name}-${scheme}.png` });
    count++;
  };
  await p.goto(BASE);
  await p.waitForSelector(".cast-stage[data-ready]", { timeout: 30000 });
  const offered = await p.locator("select").first().locator("option").evaluateAll((os) => os.map((o) => o.value));
  const casts = opts.cast ? list(opts.cast) : offered;
  for (const cast of casts) {
    if (!offered.includes(cast)) {
      notes.push(`cast "${cast}" is not in the casting room (it offers: ${offered.join(", ")})`);
      continue;
    }
    if (ONLY.includes("states")) for (const state of STATES) await shot(`cast=${cast}&state=${state}`, `${cast}-${state}`);
    if (ONLY.includes("extras")) {
      await shot(`cast=${cast}&state=working&scene=walk`, `${cast}-scene-walk`, 2500);
      await shot(`cast=${cast}&state=working&scene=team`, `${cast}-scene-team`, 4000);
      await shot(`cast=${cast}&state=working&scene=carry-on`, `${cast}-scene-carry-on`, 3000);
      await shot(`cast=${cast}&state=working&scene=at-desk`, `${cast}-scene-at-desk`, 2500);
      await shot(`cast=${cast}&state=working&light=dusk`, `${cast}-working-dusk`);
      await shot(`cast=${cast}&state=blocked&motion=reduced`, `${cast}-blocked-reduced`);
      await shot(`cast=${cast}&state=walking&motion=reduced`, `${cast}-walking-reduced`);
      await shot(`cast=${cast}&state=working&quality=fast`, `${cast}-working-fast`);
      await shot(`cast=${cast}&state=working&view=far`, `${cast}-far-working`);
      await shot(`cast=${cast}&state=blocked&view=far&scene=walk`, `${cast}-far-walk`, 2500);
      // The drone on its way to a desk.
      await p.goto(`${BASE}?cast=${cast}&state=idle`);
      await p.waitForSelector(".cast-stage[data-ready]");
      await p.getByRole("button", { name: "Send a ticket by drone" }).click();
      await p.waitForTimeout(1900);
      await p.locator(".cast-stage").screenshot({ path: `${OUT}room-${cast}-drone-${scheme}.png` });
      count++;
    }
  }
  if (ONLY.includes("side")) {
    await shot("side=1&state=working", "side-working");
    await shot("side=1&state=blocked", "side-blocked");
    await shot("side=1&state=waiting", "side-waiting");
    await shot("side=1&state=working&scene=team", "side-team", 4000);
    await shot("side=1&state=working&scene=at-desk", "side-at-desk", 2500);
    await shot("side=1&state=working&view=far", "side-far");
    await shot("side=1&state=working&light=dusk", "side-dusk");
    // The whole page once, with its controls.
    await p.goto(`${BASE}?side=1&state=working`);
    await p.waitForSelector(".cast-stage[data-ready]");
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}room-page-${scheme}.png`, fullPage: true });
    count++;
  }
  await ctx.close();
}
await browser.close();
console.log(`${count} screenshots in ${OUT}`);
const lines = [...new Set(notes), ...problemLines(problems)];
if (lines.length) console.log(lines.join("\n"));
