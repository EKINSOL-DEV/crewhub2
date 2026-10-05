import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_SIGN, fixturePlan } from "../src/world/planFixture.ts";
import { civicLabel, civicWords, entranceRoad, planLanes, planPaths, planPieces, settlementDressing, streamRows } from "../src/world/settlementDressing.ts";
import type { Dressing } from "../src/world/townDressing.ts";
import type { Bounds } from "../src/world/townLayout.ts";

const inside = (r: Bounds, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
/** Pieces that stand up out of the ground; paving, lawns, water, bridges and decals lie on it. */
const STANDING = /^(town\.(oak|birch|pine|fruit-tree|bush|oak-autumn|birch-autumn|bush-autumn|hedge|bench|signpost|bike-rack|mailbox|flower-bed|fence|swing|slide|sandpit|shed|veg-bed|bike-shelter|leaf-pile|bus|market-stall|washing-line|bandstand|pumpkin|hay-bale|sheep|chapel|cottage|cottage-timber|lantern|plot-sign|staked-plot)|civic\.(cafe-table|planter|notice-board|fountain)|crate|cart|pallet)$/;
/** Every size worth looking at: each tier, a single-zone region and regions of several zones. */
const SIZES: [count: number, zones: number, archived: number][] = [
  [0, 1, 0],
  [1, 1, 0],
  [3, 1, 0],
  [4, 2, 0],
  [7, 1, 1],
  [12, 1, 0],
  [20, 4, 2],
  [40, 3, 0],
];
const keys = (dressing: readonly Dressing[]) => new Set(dressing.map((d) => d.key));

test("every size dresses the same way twice and stays on its ground", () => {
  for (const [count, zones, archived] of SIZES) {
    const { dress } = fixturePlan(count, zones, archived);
    const a = settlementDressing(dress);
    assert.deepEqual(a, settlementDressing(fixturePlan(count, zones, archived).dress), `${count} projects`);
    const g = dress.ground;
    // A stream's waterfalls hang over the diorama's edge, just outside it.
    const pad = (d: Dressing) => (d.variant === "fall" ? 0.5 : 0);
    for (const d of a) assert.ok(d.x >= g.minX - pad(d) && d.x <= g.maxX + pad(d) && d.z >= g.minZ && d.z <= g.maxZ, `${count} projects: ${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} is off the ground`);
    for (const p of planPieces(dress)) assert.ok(inside(g, p.x, p.z), `${count} projects: ${p.key} is off the ground`);
  }
});

test("nothing that stands up blocks a path, a building or a civic piece's door", () => {
  for (const [count, zones, archived] of SIZES) {
    const { dress } = fixturePlan(count, zones, archived);
    const paths = planPaths(dress);
    const obstacles = dress.lots.flatMap((lot) => lot.obstacles);
    for (const d of settlementDressing(dress).filter((d) => STANDING.test(d.key))) {
      // A lantern, a bench or a board may stand on a forecourt's or a square's own paving; nothing stands in a lane.
      for (const r of planLanes(dress)) assert.ok(!inside(r, d.x, d.z), `${count} projects: ${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} stands in a lane`);
      for (const r of dress.lots.map((lot) => ({ minX: lot.door.x - 0.7, maxX: lot.door.x + 0.7, minZ: lot.door.z - 0.5, maxZ: lot.lane })))
        assert.ok(!inside(r, d.x, d.z), `${count} projects: ${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} stands on a garden path`);
      for (const r of obstacles) assert.ok(!inside(r, d.x, d.z), `${count} projects: ${d.key} at ${d.x.toFixed(1)},${d.z.toFixed(1)} stands on a building`);
    }
    assert.ok(paths.length > 3);
  }
});

test("a clearing is a real place: the lodge, a post box, the welcome sign and a staked plot that says what to do", () => {
  const { dress } = fixturePlan(0);
  const pieces = planPieces(dress).map((p) => p.key);
  assert.deepEqual(pieces.sort(), ["civic.welcome-sign", "town.lodge", "town.post-box"]);
  const dressing = settlementDressing(dress);
  const sign = dressing.find((d) => d.key === "town.plot-sign");
  assert.equal(sign?.text, FIXTURE_SIGN);
  const stakes = dressing.find((d) => d.key === "town.staked-plot")!;
  assert.ok(Math.abs(stakes.x - dress.staked!.x) < 1 && Math.abs(stakes.z - dress.staked!.z) < 4, "the stakes stand on the lot the first building takes");
  assert.equal(dressing.filter((d) => d.key === "town.hedge").length, 0, "no garden waits for a building");
  assert.ok(dressing.filter((d) => /^town\.(oak|birch|pine)/.test(d.key)).length > 150, "it stands in the woods");
  assert.equal(entranceRoad(dress), null);
});

test("the civic pieces grow in place with the tiers", () => {
  const at = (count: number, key: string) => planPieces(fixturePlan(count).dress).find((p) => p.key === key);
  // The hamlet's building takes the staked plot; the mail hut replaces the post box on the same spot.
  assert.ok(!keys(settlementDressing(fixturePlan(1).dress)).has("town.staked-plot"));
  assert.ok(at(1, "town.mail-hut") && at(1, "town.lodge") && !at(1, "civic.square"));
  assert.ok(at(3, "civic.square") && at(3, "town.lodge") && at(3, "town.mail-hut") && !at(3, "civic.cafe"), "a village has the square, still the lodge");
  for (const key of ["town-hall", "post-office", "civic.square", "civic.cafe", "civic.bus-stop", "civic.greenhouse"]) assert.ok(at(7, key), `a town has its ${key}`);
  assert.ok(Math.abs(at(1, "town.lodge")!.x - at(7, "town-hall")!.x) < 0.01, "the town hall stands where the lodge stood");
  assert.ok(Math.abs(at(1, "town.mail-hut")!.x - at(7, "post-office")!.x) < 0.01, "the post office where the mail hut stood");
  assert.ok(keys(settlementDressing(fixturePlan(7).dress)).has("town.pond"));
  assert.ok(!keys(settlementDressing(fixturePlan(3).dress)).has("town.pond"), "the park comes with the town");
});

test("landmarks are dressed only once they have arrived", () => {
  for (const count of [2, 3, 6, 12]) {
    const { plan, dress } = fixturePlan(count);
    const dressing = keys(settlementDressing(dress));
    const pieces = planPieces(dress).map((p) => p.key);
    assert.equal(dressing.has("town.bandstand"), plan.landmarks.includes("bandstand"));
    assert.equal(dressing.has("town.chapel"), plan.landmarks.includes("chapel"));
    assert.equal(dressing.has("town.sheep") || !plan.landmarks.includes("farm"), true);
    assert.equal(pieces.includes("civic.windmill"), plan.landmarks.includes("windmill"));
    assert.equal(dressing.has("town.cottage") || dressing.has("town.cottage-timber"), plan.landmarks.some((id) => id.startsWith("cottages")));
  }
  assert.equal(fixturePlan(2).plan.landmarks.length, 0);
  assert.equal(fixturePlan(12).plan.landmarks.length, 6);
});

test("a single zone's blocks are neighbourhoods round greens, without names", () => {
  const { dress } = fixturePlan(12);
  const dressing = settlementDressing(dress);
  assert.ok(dress.greens.length >= 2);
  assert.equal(dressing.filter((d) => d.key === "town.district-gate").length, 0);
  assert.ok(dressing.every((d) => d.district === undefined), "one unnamed zone needs no district looks");
  for (const green of dress.greens) assert.ok(dressing.some((d) => d.key === "plot" && d.x === green.x && d.z === green.z), "each green is a pocket park");
});

test("districts are joined by roads under a gate with their name, and parted by a stream or a hedgerow", () => {
  const { plan, dress } = fixturePlan(20, 4);
  const dressing = settlementDressing(dress);
  const gates = dressing.filter((d) => d.key === "town.district-gate");
  assert.equal(gates.length, plan.roads.length);
  assert.deepEqual(gates.map((g) => g.text).sort(), ["Low Meadow", "Mill Side", "Orchard Row"]);
  assert.ok(gates.every((g) => g.accent), "each gate wears its zone's colour");
  // Every stream crosses the whole ground, and a road that crosses one has a bridge.
  const rows = streamRows(dress);
  assert.ok(rows.length >= 1);
  const south = plan.roads.filter((r) => Math.abs(r.x0 - r.x1) < 0.01);
  for (const road of south) {
    const row = rows.find((z) => z > Math.min(road.z0, road.z1) && z < Math.max(road.z0, road.z1))!;
    assert.ok(dressing.some((d) => d.key === "town.bridge" && Math.abs(d.x - road.x0) < 0.5 && Math.abs(d.z - row) < 2), "a bridge where the road crosses the stream");
  }
  assert.ok(dressing.filter((d) => d.key === "town.hedge" && d.y < 0.1).length > 10, "a hedgerow between east and west neighbours");
  // Each outer district has its small centre, and its pieces carry its zone for the district's look.
  assert.equal(dressing.filter((d) => d.key === "civic.fountain").length, dress.greens.filter((g) => g.centre).length);
  assert.deepEqual([...new Set(dressing.map((d) => d.district).filter(Boolean))].sort(), ["default", "low-meadow", "mill-side", "orchard-row"]);
});

test("no settlement costs more dressing per building than the fixed town of four did", () => {
  // The fixed 4 x 3 grid dressed twelve plots for four buildings: 1225 pieces without the Fast-quality detail, as
  // measured before it was replaced.
  const before = 1225 / 4;
  const perLot = (count: number, zones: number) => settlementDressing(fixturePlan(count, zones).dress).filter((d) => !d.detail).length / count;
  for (const [count, zones] of [
    [4, 1],
    [7, 1],
    [12, 1],
    [20, 4],
    [40, 3],
  ] as const)
    assert.ok(perLot(count, zones) < before * 0.75, `${count} projects in ${zones} zones: ${perLot(count, zones).toFixed(0)} pieces a building, the fixed town: ${before.toFixed(0)}`);
  // A settlement of one is small in all: about half of the fixed town.
  assert.ok(settlementDressing(fixturePlan(1).dress).length < before * 4 * 0.6);
});

test("the civic places go by what stands there: the lodge and the mailbox before the town hall and the post office", () => {
  const words = (count: number) => civicWords(fixturePlan(count).plan.civic);
  assert.deepEqual(words(0), { hall: "lodge", post: "mailbox" });
  assert.deepEqual(words(1), { hall: "lodge", post: "mail hut" });
  assert.deepEqual(words(3), { hall: "lodge", post: "mail hut" });
  assert.deepEqual(words(7), { hall: "town hall", post: "post office" });
  assert.equal(civicLabel(words(1).post), "Mail hut");
});
