import assert from "node:assert/strict";
import test from "node:test";
import { keepOffChrome, keepStacksOffChrome, nudgeStacks, overRobot, type Label, type Rect, type RobotBox } from "../src/world/labelLayout.ts";

/** A visible label hanging at (x, y): its box is `half` either side and `height` above y. A room sign (`r:`) sits
    beside its anchor as world.css places it: from 10 % of its width left of the anchor, centred on it vertically. */
function label(id: string, x: number, y: number, half = 30, height = 20, extra: Partial<Label> = {}): Label {
  const sign = id.startsWith("r:");
  return {
    el: null as unknown as HTMLElement,
    id,
    half,
    height,
    ox: sign ? -half * 0.2 : -half,
    oy: sign ? -height / 2 : -height,
    stack: !id.startsWith("r:"),
    card: false,
    sign: id.startsWith("r:"),
    robot: id.startsWith("a:"),
    picked: false,
    shown: false,
    x: Number.NaN,
    y: Number.NaN,
    nx: x,
    ny: y,
    ay: y,
    visible: true,
    far: false,
    yields: false,
    ...extra,
  };
}

/** A robot whose label anchor (just over its head) is at (x, top), 30 px wide and 60 px tall. */
const robot = (id: string, x: number, top: number): RobotBox => ({ id, x, left: x - 15, right: x + 15, top, bottom: top + 60 });

test("a robot's own stack stays over its head and a desk chip over the robot steps aside to its anchor's side", () => {
  const lead = label("a:hq:lead", 200, 100);
  const tag = label("o:hq:CR-23", 190, 140); // a desk tag hanging over the lead's body, anchored left of its centre
  const chip = label("rule:hq:bug-jar", 215, 150); // a rule chip right of its centre
  const stacks = [tag, chip, lead];
  nudgeStacks(stacks, [], [robot("a:hq:lead", 200, 100)], 1);
  assert.deepEqual([lead.nx, lead.ny], [200, 100], "the name pill keeps its place just over the head");
  assert.ok(tag.nx + tag.half <= 185, "the tag moved left, clear of the robot");
  assert.ok(chip.nx - chip.half >= 215, "the chip moved right, clear of the robot");
  assert.equal(tag.ny, 140, "sideways, not up: it stays by its desk");
});

test("robots' stacks are placed before the desk labels even when those are lower on screen", () => {
  const lead = label("a:hq:lead", 200, 100);
  const tag = label("o:hq:CR-23", 200, 105); // right where the pill is, and lower on screen
  nudgeStacks([tag, lead], [], [], 0);
  assert.deepEqual([lead.nx, lead.ny], [200, 100]);
  assert.ok(Math.abs(tag.nx - lead.nx) >= tag.half + lead.half, "the tag stepped aside from the pill");
});

test("two robots' stacks: the one further back moves up above the nearer one; neither leaves its robot for another", () => {
  const front = label("a:hq:a", 200, 200);
  const back = label("a:hq:b", 205, 190);
  nudgeStacks([back, front], [], [robot("a:hq:a", 200, 200), robot("a:hq:b", 205, 190)], 2);
  assert.deepEqual([front.nx, front.ny], [200, 200], "the front stack stays over its robot, even over the other's body");
  assert.ok(back.ny <= front.ny - front.height - 3, "the back stack sits above the front one");
});

test("the picked robot's plate is placed first", () => {
  const plate = label("a:hq:lead", 200, 100, 80, 90, { picked: true });
  const other = label("a:hq:dev", 210, 120);
  nudgeStacks([other, plate], [], [], 0);
  assert.deepEqual([plate.nx, plate.ny], [200, 100], "the plate keeps its place");
  assert.ok(other.ny <= plate.ny - plate.height, "the other stack moved up above it");
});

test("a room sign over a robot steps back; desk labels still keep off room signs", () => {
  const sign = label("r:hq:lead", 190, 130, 40, 20);
  assert.equal(overRobot(sign, [], [robot("a:hq:lead", 200, 100)], 1), true);
  assert.equal(overRobot(sign, [], [robot("a:hq:lead", 600, 100)], 1), false);
  const chip = label("p:hq:dispatch", 200, 135);
  nudgeStacks([chip], [sign], [], 0);
  assert.ok(chip.ny <= sign.ny - sign.height / 2, "the chip moved up above the sign");
});

test("a rack sign hangs over its rail: a name tag that would cover it moves up above the sign's real box", () => {
  // The sign's box is where the CSS puts it (translate(-50%, -100%)): centred on and above its anchor, not beside it.
  const sign = label("r:hq:rack-review", 850, 270, 25, 30, { ox: -25, oy: -30 });
  const tag = label("o:hq:CR-7", 840, 262, 28, 18); // a "Nicky (dev)" tag anchored on a package on the rack
  nudgeStacks([tag], [sign], [], 0);
  assert.ok(tag.ny <= sign.ny - sign.height - 3, `the tag sits above the sign's box (${tag.ny} vs ${sign.ny - sign.height})`);
  assert.equal(tag.nx, 840, "straight up, not aside");
  const clear = label("o:hq:CR-8", 920, 262, 28, 18); // right of the sign's real box, where the old beside-box was
  nudgeStacks([clear], [sign], [], 0);
  assert.deepEqual([clear.nx, clear.ny], [920, 262], "a tag clear of the sign's real box does not move");
  assert.equal(overRobot(sign, [], [robot("a:hq:lead", 850, 250)], 1), true, "the robot under the hanging sign is seen");
  assert.equal(overRobot(sign, [], [robot("a:hq:lead", 850, 300)], 1), false, "a robot below the sign's box is not");
});

test("a label under the fixed UI moves the shortest way out of it and stays on the canvas", () => {
  const width = 375,
    height = 812;
  const toolbar: Rect = { left: 315, right: 360, top: 480, bottom: 740 };
  const corner: Rect = { left: 16, right: 370, top: 16, bottom: 166 };
  const chrome = [corner, toolbar];
  // The town hall's label (a town sign standing under its anchor) at the right edge, under the toolbar.
  const hall = label("c:town-hall", 340, 600, 25, 20, { ox: -25, oy: 8 });
  assert.equal(keepOffChrome(hall, chrome, width, height), true);
  assert.ok(hall.nx + 25 + 3 <= toolbar.left, `sideways, left of the toolbar (${hall.nx})`);
  assert.equal(hall.ny, 600, "not up or down: the column is narrow");
  // A building's attention pin hanging near the top, under the wide corner: down is the shortest way out.
  const pin = label("n:crewhub", 200, 150, 40, 24);
  assert.equal(keepOffChrome(pin, chrome, width, height), true);
  assert.equal(pin.nx, 200);
  assert.ok(pin.ny - 24 >= corner.bottom + 3, `below the corner (${pin.ny})`);
  // A label clear of the chrome does not move.
  const free = label("b:ops", 150, 400, 40, 24, { ox: -40, oy: 8 });
  assert.equal(keepOffChrome(free, chrome, width, height), false);
  assert.deepEqual([free.nx, free.ny], [150, 400]);
  // A sign wider than the free width beside the toolbar goes up or down instead, and one that fits nowhere stays.
  const wide = label("b:launch", 190, 600, 170, 60, { ox: -170, oy: 8 });
  assert.equal(keepOffChrome(wide, chrome, width, height), true);
  assert.ok(wide.ny + 8 >= toolbar.bottom + 3 || wide.ny + 8 + 60 <= toolbar.top - 3, `above or below the column (${wide.ny})`);
  const everywhere = label("b:huge", 190, 600, 190, 900, { ox: -190, oy: 8 });
  assert.equal(keepOffChrome(everywhere, chrome, width, height), false);
});

test("a tag that cannot go up above a sign (the corner sits there) hangs below the sign instead", () => {
  const clearOf = (l: Label, r: Rect) => l.nx + l.half + 3 <= r.left || l.nx - l.half - 3 >= r.right || l.ny + 3 <= r.top || l.ny - l.height - 3 >= r.bottom;
  // A phone's top band across the whole width, a rack sign just under it (it left the band itself), and a rule tag
  // anchored on the rack's rail: sideways is no way out, so it goes under the sign.
  const band: Rect = { left: 0, right: 375, top: 0, bottom: 166 };
  const sign = label("r:hq:rack-backlog", 180, 199, 30, 30, { ox: -30, oy: -30 });
  const tag = label("rule:hq:banner", 170, 196, 50, 18);
  nudgeStacks([tag], [sign], [], 0);
  assert.ok(tag.ny <= sign.ny - sign.height - 3, "the nudge sends it up above the sign, into the band");
  keepStacksOffChrome([tag], [sign], [band], 375, 812);
  assert.ok(tag.ny - tag.height >= sign.ny + 3, `below the sign, out of the band (${tag.ny})`);
  assert.ok(clearOf(tag, band));
  // On a wide screen the corner ends: the tag steps out beside it and stays clear of the sign.
  const corner: Rect = { left: 16, right: 520, top: 16, bottom: 110 };
  const sign2 = label("r:hq:rack-backlog", 588, 143, 30, 30, { ox: -30, oy: -30 });
  const tag2 = label("rule:hq:banner", 560, 140, 50, 18);
  nudgeStacks([tag2], [sign2], [], 0);
  keepStacksOffChrome([tag2], [sign2], [corner], 1440, 900);
  assert.ok(clearOf(tag2, corner), `out of the corner (${tag2.nx}, ${tag2.ny})`);
  assert.ok(clearOf(tag2, { left: 558, right: 618, top: 113, bottom: 143 }), `clear of the sign (${tag2.nx}, ${tag2.ny})`);
});
