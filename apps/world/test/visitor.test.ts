import assert from "node:assert/strict";
import test from "node:test";
import { isTownRoom, NavWorld, roomId } from "../src/world/navigation.ts";
import { keysDirection, sightClear, Visitor, VISITOR_RADIUS, WALK_SPEED, WALK_TILTS, walkTilt, worldDirection } from "../src/world/visitor.ts";
import { agent, building } from "./fixtures.ts";

const world = () => {
  const nav = new NavWorld();
  nav.sync([building("p0", [agent("p0/dev-0", "workers"), agent("p0-analyst-1", "analyst")]), building("p1", [agent("p1/dev-0", "workers")])], undefined, undefined, "classic");
  return nav;
};
const STEP = 1 / 60;
/** True when the visitor's whole disc stands on open cells of its room. */
function onOpenCells(v: Visitor): boolean {
  const state = v.nav.graph.room(v.room)!;
  const { width, depth, cellSize } = state.layout.grid;
  const o = v.nav.toWorld({ room: v.room, cell: { x: 0, z: 0 } });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = Math.floor((v.x + sx * VISITOR_RADIUS * 0.999 - o.x) / cellSize + 0.5),
        z = Math.floor((v.z + sz * VISITOR_RADIUS * 0.999 - o.z) / cellSize + 0.5);
      if (x < 0 || z < 0 || x >= width || z >= depth || state.blocked[z * width + x] !== -1) return false;
    }
  return true;
}

test("the visitor walks at its speed over open cells and stops at a wall", () => {
  const nav = world();
  const v = new Visitor(nav, nav.lobby("p0")!);
  const start = { x: v.x, z: v.z };
  // North, into the lobby: one tenth of a second.
  for (let i = 0; i < 6; i++) v.step(0, -1, STEP);
  assert.ok(Math.abs(start.z - v.z - WALK_SPEED * 0.1) < 1e-6, "it covers speed times time");
  assert.equal(v.heading, Math.atan2(0, -1));
  // Then west for a long while: it ends against something, still on open cells, in the same building.
  for (let i = 0; i < 1200; i++) v.step(-1, 0, STEP, true);
  assert.equal(v.building, "p0");
  assert.ok(onOpenCells(v));
  assert.equal(v.step(-1, 0, STEP), false, "a wall stops it");
  assert.equal(v.moving, false);
});

test("a random walk never leaves the open cells and changes rooms only at doors", () => {
  const nav = world();
  const v = new Visitor(nav, nav.lobby("p0")!);
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let dx = 0,
    dz = -1,
    rooms = new Set<string>([v.room]);
  for (let i = 0; i < 40_000; i++) {
    if (i % 90 === 0) {
      dx = random();
      dz = random();
    }
    const before = v.room,
      wasCrossing = v.crossing;
    v.step(dx, dz, STEP, i % 2 === 0);
    if (v.room !== before) assert.ok(wasCrossing, "a room changes at the end of a door crossing only");
    assert.ok(v.valid, "it stays valid, in a door too");
    if (!v.crossing) assert.ok(onOpenCells(v), `on open cells in ${v.room} at step ${i}`);
    rooms.add(v.room);
  }
  assert.ok(rooms.size > 1, "it found a door");
});

test("the front door: out of the lobby to the street and back in", () => {
  const nav = world();
  const v = new Visitor(nav, nav.lobby("p0")!);
  assert.equal(v.building, "p0");
  // South through the entrance: the lobby cell inside the door, the door cell, then the glide to the town side.
  for (let i = 0; i < 240 && v.building; i++) v.step(0, 1, STEP);
  assert.equal(v.building, null, "it stands in the town");
  assert.ok(isTownRoom(v.room));
  const door = nav.graph.door("p0/entrance")!;
  assert.deepEqual(v.location, door.b);
  // Sideways on the door cell does not cross; pushing at the door does.
  v.step(1, 0, STEP);
  assert.equal(v.crossing, false);
  v.place(door.b);
  for (let i = 0; i < 240 && !v.building; i++) v.step(0, -1, STEP);
  assert.equal(v.room, roomId("p0", "lobby"));
  assert.ok(onOpenCells(v));
});

test("a visitor whose room left the graph is no longer valid", () => {
  const nav = world();
  const v = new Visitor(nav, nav.lobby("p1")!);
  assert.equal(v.valid, true);
  nav.sync([building("p0", [agent("p0/dev-0", "workers")])], undefined, undefined, "classic");
  assert.equal(v.valid, false);
});

test("keys and the camera's yaw give a world direction", () => {
  assert.deepEqual(keysDirection(new Set(["w", "arrowright"])), { x: 1, y: 1 });
  assert.deepEqual(keysDirection(new Set(["a", "d", "s"])), { x: 0, y: -1 });
  // The camera stands south of the visitor (yaw 0 is +z): forward is north, right is east.
  const forward = worldDirection({ x: 0, y: 1 }, 0);
  assert.ok(Math.abs(forward.x) < 1e-9 && Math.abs(forward.z + 1) < 1e-9);
  const right = worldDirection({ x: 1, y: 0 }, 0);
  assert.ok(Math.abs(right.x - 1) < 1e-9 && Math.abs(right.z) < 1e-9);
  // From the east (yaw a quarter turn), forward is west.
  const west = worldDirection({ x: 0, y: 1 }, Math.PI / 2);
  assert.ok(Math.abs(west.x + 1) < 1e-9 && Math.abs(west.z) < 1e-9);
});

test("the follow camera pulls in over what stands between it and the visitor", () => {
  const wall = [{ minX: -5, maxX: 5, minZ: 1, maxZ: 2 }];
  // The camera is south (+z) of a visitor who stands just north of a two-unit wall.
  assert.equal(sightClear(0, 0.5, 0, 0, WALK_TILTS[0]!, wall, 2), false);
  assert.equal(sightClear(0, 0.5, 0, Math.PI, WALK_TILTS[0]!, wall, 2), true, "from the north nothing is in the way");
  const tilt = walkTilt(0, 0.5, 0, 0, wall, 2);
  assert.ok(tilt < WALK_TILTS[0]!, "it looks from steeper");
  assert.ok(sightClear(0, 0.5, 0, 0, tilt, wall, 2));
  assert.equal(walkTilt(0, 0.5, 0, 0, [], 2), WALK_TILTS[0]);
  assert.equal(walkTilt(0, 0.5, 0.95, 0, wall, 2), WALK_TILTS[WALK_TILTS.length - 1], "right against it: the steepest");
});
