import assert from "node:assert/strict";
import test from "node:test";
import { nudgeStacks, overRobot, type Label, type RobotBox } from "../src/world/labelLayout.ts";

/** A visible label hanging at (x, y): its box is `half` either side and `height` above y. */
function label(id: string, x: number, y: number, half = 30, height = 20, extra: Partial<Label> = {}): Label {
  return {
    el: null as unknown as HTMLElement,
    id,
    half,
    height,
    stack: !id.startsWith("r:"),
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
