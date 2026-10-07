import assert from "node:assert/strict";
import test from "node:test";
import { NavWorld, POST_OFFICE_CELL, standalonePlan, TOWN_GRID, TOWN_HALL_CELL, TOWN_ROOM, townCellAt, townCellCentre, townOpenCells } from "../src/world/navigation.ts";
import { fixturePlan } from "../src/world/planFixture.ts";
import { lotCentre } from "../src/world/settlement.ts";
import { entranceRoad, parkPond, planLanes, settlementDressing, streamRows } from "../src/world/settlementDressing.ts";
import { gardenKind } from "../src/world/townDressing.ts";
import { civicCenter, PLOT_SIZE, type Bounds } from "../src/world/townLayout.ts";
import { building } from "./fixtures.ts";

/* The town's paving and gardens as walkers and neighbours meet them. The tiers themselves are in
   settlementDressing.test.ts. */

const inside = (r: Bounds, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
const open = (cells: Uint8Array, x: number, z: number) => {
  const c = townCellAt(x, z);
  return cells[c.z * TOWN_GRID.width + c.x] === 1;
};

test("lanterns line the lanes and every used plot has a gate and a garden path down to its lane", () => {
  const { dress } = fixturePlan(4);
  const dressing = settlementDressing(dress);
  const lanes = planLanes(dress);
  const lanterns = dressing.filter((d) => d.key === "town.lantern");
  assert.ok(lanterns.length > 30);
  for (const lot of dress.lots) {
    assert.ok(dressing.some((d) => d.key === "town.gate" && Math.abs(d.x - lot.door.x) < 1e-6), "a gate on the garden path");
    assert.ok(lanes.some((l) => inside(l, lot.door.x, lot.lane)), "the path ends on a lane");
    assert.ok(dressing.filter((d) => d.key === "town.hedge" && Math.abs(d.x - lot.centre.x) < PLOT_SIZE / 2 && Math.abs(d.z - lot.centre.z) < PLOT_SIZE / 2).length > 8, "hedges on its rim");
  }
  assert.ok(dressing.some((d) => d.key === "town.crossing"), "crossings where lanes meet");
  assert.ok(dressing.some((d) => d.key === "town.wear"), "worn grass by the paths");
  const tufts = dressing.filter((d) => d.key === "town.grass" || d.key === "town.wildflowers");
  assert.ok(tufts.length > 50 && tufts.every((d) => d.detail), "grass tufts and wild flowers are Fast-quality detail");
  assert.ok(dressing.filter((d) => d.detail).every((d) => d.key === "town.grass" || d.key === "town.wildflowers"));
});

test("the town grid is the paving: lanes, forecourts and garden paths are open; grass, lawns and water are not", () => {
  // Seven buildings: a town, with its park.
  const plan = standalonePlan(Array.from({ length: 7 }, (_, i) => ({ slug: `p${i}` })));
  const cells = townOpenCells(plan);
  for (const s of plan.streets) assert.ok(open(cells, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2), "a street is open");
  // The dressing paves every street the walkers use.
  const lanes = planLanes(plan);
  for (const s of plan.streets) assert.ok(lanes.some((r) => s.x0 >= r.minX - 1.7 && s.x1 <= r.maxX + 1.7 && s.z0 >= r.minZ - 1.7 && s.z1 <= r.maxZ + 1.7), "a street is a paved lane");
  for (const cell of [POST_OFFICE_CELL, TOWN_HALL_CELL]) assert.equal(cells[cell.z * TOWN_GRID.width + cell.x], 1);
  const square = civicCenter("square");
  assert.ok(open(cells, square.x, square.z), "the square is open");
  const green = lotCentre(plan.districts[0]!.greens[0]!);
  assert.ok(!open(cells, green.x, green.z), "a green is closed");
  const pond = parkPond();
  assert.ok(!open(cells, pond.minX + 1, (pond.minZ + pond.maxZ) / 2), "the pond is closed (the bridge is open)");
  assert.ok(open(cells, (pond.minX + pond.maxX) / 2, (pond.minZ + pond.maxZ) / 2), "the bridge is open");
  const c = plan.lots[0]!.centre;
  assert.ok(!open(cells, c.x + PLOT_SIZE / 2 - 0.5, c.z + PLOT_SIZE / 2 - 0.5), "a lawn corner is closed");
  assert.ok(!open(cells, c.x + PLOT_SIZE / 2 + 1, c.z), "the verge beside a lane is closed");
});

test("the postman's and the town hall's cells are paved at every tier", () => {
  for (const count of [0, 1, 3, 7, 12]) {
    const cells = townOpenCells(standalonePlan(Array.from({ length: count }, (_, i) => ({ slug: `p${i}` }))));
    for (const cell of [POST_OFFICE_CELL, TOWN_HALL_CELL]) {
      assert.equal(cells[cell.z * TOWN_GRID.width + cell.x], 1);
      // Not an island: the forecourt or the pad is paved round it.
      assert.equal(cells[(cell.z + 1) * TOWN_GRID.width + cell.x], 1, `${count} buildings: the cell south of it is paved`);
    }
  }
});

test("walkers in the town only ever step on the paving", () => {
  const nav = new NavWorld();
  const buildings = Array.from({ length: 12 }, (_, i) => building(`p${i}`, [], []));
  nav.sync(buildings, undefined, undefined, "classic");
  const cells = townOpenCells(standalonePlan(buildings));
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

test("each building's front garden follows its seed, and an archived one is overgrown", () => {
  const yard = (seed: number, archived = false) => {
    const { dress } = fixturePlan(1);
    const lot = { ...dress.lots[0]!, seed, archived };
    const c = lot.centre;
    return settlementDressing({ ...dress, lots: [lot] }).filter((d) => Math.abs(d.x - c.x) < PLOT_SIZE / 2 && Math.abs(d.z - c.z) < PLOT_SIZE / 2 && d.z > lot.obstacles[0]!.maxZ);
  };
  const expected: Record<string, RegExp> = { lawn: /^town\.bench$/, terrace: /^civic\.cafe-table$/, vegetables: /^town\.veg-bed$/, bikes: /^town\.bike-shelter$/ };
  const seeds = (["lawn", "terrace", "vegetables", "bikes"] as const).map((kind) => Array.from({ length: 200 }, (_, i) => i).find((i) => gardenKind(i) === kind)!);
  for (const seed of seeds) {
    assert.ok(seed !== undefined, "every garden kind occurs");
    const kind = gardenKind(seed);
    assert.ok(yard(seed).some((d) => expected[kind]!.test(d.key)), `a ${kind} garden for seed ${seed}`);
    assert.deepEqual(yard(seed), yard(seed), "the same building always gets the same garden");
  }
  const wild = yard(1, true);
  assert.ok(wild.some((d) => d.key === "town.leaf-pile"), "fallen leaves");
  assert.ok(wild.filter((d) => d.key === "town.tall-grass").length >= 6, "long grass");
  assert.ok(!wild.some((d) => d.key === "town.flower-bed" || d.key === "civic.cafe-table"), "no tended beds or tables");
  assert.ok(wild.some((d) => d.key === "town.gate"), "the gate is still there");
});

test("the stream runs edge to edge across the south of a full district, under the entrance road's bridge, with nothing planted in it", () => {
  const { dress } = fixturePlan(12);
  const dressing = settlementDressing(dress);
  const [row] = streamRows(dress);
  assert.ok(row !== undefined);
  assert.equal(dressing.filter((d) => d.key === "town.stream" && d.variant === "fall").length, 2, "a waterfall at either end");
  const band = { minX: dress.ground.minX, maxX: dress.ground.maxX, minZ: row - 1.4, maxZ: row + 1.4 };
  const road = entranceRoad(dress)!;
  assert.ok(dressing.some((d) => d.key === "town.bridge" && d.x === 0 && inside(band, d.x, d.z)), "the road crosses on a bridge");
  for (const d of dressing.filter((d) => /^town\.(oak|birch|pine|bush|hedge|bench|lantern|fence)|^civic\./.test(d.key))) assert.ok(!inside(band, d.x, d.z), `${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} stands in the stream`);
  assert.ok(road.maxZ > band.maxZ, "the road runs on past the stream to the edge");
});

test("about two trees or bushes in five turn for October, the same ones every time", () => {
  const dressing = settlementDressing(fixturePlan(4).dress);
  const green = dressing.filter((d) => /^town\.(oak|birch|bush)$/.test(d.key)).length,
    autumn = dressing.filter((d) => /^town\.(oak|birch|bush)-autumn$/.test(d.key)).length;
  assert.ok(autumn > 0.3 * (green + autumn) && autumn < 0.5 * (green + autumn), `${autumn} of ${green + autumn}`);
  assert.deepEqual(settlementDressing(fixturePlan(4).dress), dressing);
});
