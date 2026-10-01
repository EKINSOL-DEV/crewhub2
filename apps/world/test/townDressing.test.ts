import assert from "node:assert/strict";
import test from "node:test";
import { NavWorld, plotDoor, plotObstacles, POST_OFFICE_CELL, TOWN_GRID, TOWN_HALL_CELL, TOWN_ROOM, townCellAt, townCellCentre, townOpenCells } from "../src/world/navigation.ts";
import { gardenPath, laneRects, plotUse, pondRect, townDressing, townPaths, type Dressing } from "../src/world/townDressing.ts";
import { civicCenter, PLOT_SIZE, plotCenter, TOWN_CAPACITY, townBounds, type Bounds } from "../src/world/townLayout.ts";
import { building } from "./fixtures.ts";

const plots = (n: number) => Array.from({ length: n }, (_, index) => ({ index, door: plotDoor(index), obstacles: plotObstacles(index) }));
const inside = (r: Bounds, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
const open = (cells: Uint8Array, x: number, z: number) => {
  const c = townCellAt(x, z);
  return cells[c.z * TOWN_GRID.width + c.x] === 1;
};
/** Pieces that stand up out of the ground; paving, lawns, the pond, the bridge and the lantern pools lie on it. */
const STANDING = /^town\.(oak|birch|pine|fruit-tree|bush|hedge|bench|signpost|bike-rack|mailbox|flower-bed|fence|swing|slide|sandpit|shed|veg-bed)$/;

test("the dressing is deterministic and stays on the town ground", () => {
  const a = townDressing(plots(4)),
    b = townDressing(plots(4));
  assert.deepEqual(a, b);
  assert.ok(a.length > 300, "a dressed town, not a bare one");
  const all = townBounds();
  for (const d of a) assert.ok(d.x >= all.minX && d.x <= all.maxX && d.z >= all.minZ && d.z <= all.maxZ, `${d.key} at ${d.x},${d.z}`);
  const kinds = new Set(a.map((d) => d.key));
  for (const key of ["town.oak", "town.birch", "town.pine", "town.hedge", "town.lantern", "town.bench", "town.signpost", "town.pond", "town.bridge", "town.fence"])
    assert.ok(kinds.has(key), `the town has a ${key}`);
});

test("nothing that stands up blocks a path, a front door or what stands on a used plot", () => {
  for (const n of [1, 4, 12]) {
    const used = plots(n);
    const paths = townPaths(used.map((p) => p.door));
    const obstacles = used.flatMap((p) => p.obstacles);
    for (const d of townDressing(used).filter((d: Dressing) => STANDING.test(d.key))) {
      for (const r of paths) assert.ok(!inside(r, d.x, d.z), `${n} plots: ${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} stands on a path`);
      for (const r of obstacles) assert.ok(!inside(r, d.x, d.z), `${n} plots: ${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} stands on a building`);
    }
  }
});

test("lanterns line the paths and every used plot has a garden path to the lane", () => {
  const used = plots(4);
  const paths = townPaths(used.map((p) => p.door));
  const near = (x: number, z: number) => paths.some((r) => x > r.minX - 2.5 && x < r.maxX + 2.5 && z > r.minZ - 2.5 && z < r.maxZ + 2.5);
  const lanterns = townDressing(used).filter((d) => d.key === "town.lantern");
  assert.ok(lanterns.length > 40);
  for (const l of lanterns) assert.ok(near(l.x, l.z), `lantern at ${l.x},${l.z} is by a path`);
  const lanes = laneRects();
  for (const p of used) {
    const path = gardenPath(p.door);
    assert.ok(inside(path, p.door.x, p.door.z + 0.1), "the path starts at the door");
    assert.ok(lanes.some((l) => path.maxZ > l.minZ && path.maxZ <= l.maxZ), "and ends on a lane");
  }
});

test("empty plots each have a character; used plots are lawns with hedges", () => {
  const dressing = townDressing(plots(2));
  const on = (index: number, key: RegExp) => {
    const c = plotCenter(index);
    return dressing.filter((d) => key.test(d.key) && Math.abs(d.x - c.x) < PLOT_SIZE / 2 && Math.abs(d.z - c.z) < PLOT_SIZE / 2);
  };
  assert.ok(on(0, /^town\.hedge$/).length > 8);
  assert.equal(on(8, /^town\.hedge$/).length, 0);
  assert.equal(plotUse(8), "meadow");
  assert.ok(on(8, /^town\.(oak|birch|pine)$/).length >= 3);
  assert.equal(dressing.find((d) => d.key === "plot" && d.x === plotCenter(8).x && d.z === plotCenter(8).z)?.variant, "meadow");
  const uses = new Set(Array.from({ length: TOWN_CAPACITY - 4 }, (_, i) => plotUse(i + 4)));
  assert.deepEqual([...uses].sort(), ["allotment", "meadow", "orchard", "picnic", "playground"], "the demo's empty plots show every character");
  assert.ok(on(4, /^town\.fruit-tree$/).length >= 10, "an orchard");
  assert.ok(on(6, /^town\.veg-bed$/).length >= 12 && on(6, /^town\.shed$/).length === 1, "an allotment garden");
  assert.ok(on(5, /^town\.(swing|slide|sandpit)$/).length === 3, "a playground");
  assert.ok(on(7, /^town\.picnic-blanket$/).length >= 2, "a picnic lawn");
  assert.equal(dressing.find((d) => d.key === "plot" && d.x === plotCenter(0).x && d.z === plotCenter(0).z)?.variant, undefined);
});

test("the town grid is the paving: lanes, forecourts and garden paths are open; grass, lawns and water are not", () => {
  const cells = townOpenCells([0, 1, 2, 3]);
  for (const r of laneRects()) assert.ok(open(cells, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2), "a lane is open");
  for (const cell of [POST_OFFICE_CELL, TOWN_HALL_CELL]) assert.equal(cells[cell.z * TOWN_GRID.width + cell.x], 1);
  const square = civicCenter("square");
  assert.ok(open(cells, square.x, square.z), "the square is open");
  assert.ok(!open(cells, plotCenter(7).x, plotCenter(7).z), "an empty plot's meadow is closed");
  const pond = pondRect();
  assert.ok(!open(cells, pond.minX + 1, (pond.minZ + pond.maxZ) / 2), "the pond is closed (the bridge is open)");
  const c = plotCenter(1);
  assert.ok(!open(cells, c.x + PLOT_SIZE / 2 - 0.5, c.z + PLOT_SIZE / 2 - 0.5), "a lawn corner is closed");
  assert.ok(!open(cells, c.x + PLOT_SIZE / 2 + 1, c.z), "the verge beside a lane is closed");
});

test("walkers in the town only ever step on the paving", () => {
  const nav = new NavWorld();
  const buildings = Array.from({ length: TOWN_CAPACITY }, (_, i) => building(`p${i}`, [], []));
  nav.sync(buildings);
  const cells = townOpenCells(buildings.map((_, i) => i));
  const post = { room: TOWN_ROOM, cell: POST_OFFICE_CELL };
  for (const slug of nav.slugs()) {
    const front = nav.front(slug)!;
    const plan = nav.graph.planRoute(post, front);
    assert.ok(plan, `${slug}'s front is reachable along the paths`);
    for (const cell of plan.path) {
      const at = townCellCentre(cell);
      assert.equal(cells[cell.z * TOWN_GRID.width + cell.x], 1, `${slug}: the route crosses ${at.x.toFixed(1)},${at.z.toFixed(1)} off the path`);
    }
  }
});
