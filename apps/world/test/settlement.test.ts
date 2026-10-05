import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, emptyTownDocument, type TownContext, type TownDocument, type TownEdit } from "@crewhub/world-model";
import {
  allocate,
  allocationEdit,
  canMoveTo,
  CENTRAL_SLOT,
  CENTRE_LOT,
  civicStage,
  districtBorders,
  districtLots,
  districtGreens,
  districtRoads,
  districtZoneAt,
  groundExtent,
  LANDMARK_IDS,
  landmarkArrivals,
  landmarksArrived,
  lotAt,
  lotBounds,
  lotCentre,
  lotKey,
  lotKind,
  moveEdit,
  nextFreeLot,
  RESERVED_SPOTS,
  reservedBounds,
  reservedLots,
  settlementOf,
  slotAllowed,
  slotBounds,
  slotKey,
  slotOf,
  slotSpiral,
  spotBounds,
  streets,
  tidyEdit,
  tierFor,
  TIERS,
  townSeed,
  type Settler,
  type Tier,
} from "../src/world/settlement.ts";
import { PITCH, PLOT_SIZE, type Bounds } from "../src/world/townLayout.ts";

const CONTEXT: TownContext = { knownStyles: ["greenhouse"], builtinIds: [] };
const overlaps = (a: Bounds, b: Bounds) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const contains = (outer: Bounds, inner: Bounds) => inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ;
function edit(doc: TownDocument, e: TownEdit): TownDocument {
  const result = applyEdit(doc, e, CONTEXT);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.doc;
}
/** A small deterministic generator for the stability runs. */
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("lots sit on today's pitch, the centre lot where the second building always stood", () => {
  assert.deepEqual(lotCentre(CENTRE_LOT), { x: -PITCH / 2, z: -PITCH / 2 });
  assert.deepEqual(lotCentre({ x: 66, z: 65 }), { x: 1.5 * PITCH, z: PITCH / 2 });
  for (const cell of [CENTRE_LOT, { x: 0, z: 0 }, { x: 127, z: 127 }, { x: 70, z: 59 }]) {
    const c = lotCentre(cell);
    assert.deepEqual(lotAt(c.x, c.z), cell);
    assert.deepEqual(lotAt(c.x - PLOT_SIZE / 2 + 0.1, c.z + PLOT_SIZE / 2 - 0.1), cell, "a plot's corners are its lot's");
  }
});

test("a district's growth sequence starts by its green, then blocks of four to six around greens, and never leaves its cell", () => {
  const central = districtLots(CENTRAL_SLOT);
  assert.deepEqual(central[0], CENTRE_LOT, "the hamlet's lot");
  assert.deepEqual(central.slice(0, 4).map((l) => l.z), [64, 64, 64, 64], "the village is one street");
  assert.deepEqual(central.slice(0, 4).map((l) => l.x).sort(), [63, 64, 65, 66]);
  const square = RESERVED_SPOTS.find((s) => s.id === "square")!;
  assert.ok(Math.abs(lotCentre(central[0]!).x - square.x) <= PITCH / 2 && lotCentre(central[0]!).z - square.z <= PITCH + 1, "beside the square");

  for (const slot of [CENTRAL_SLOT, { x: 1, z: 0 }, { x: -3, z: 2 }, { x: 8, z: -8 }]) {
    const lots = districtLots(slot),
      greens = districtGreens(slot);
    const keys = new Set([...lots, ...greens].map(lotKey));
    assert.equal(keys.size, lots.length + greens.length, "no lot twice, no lot on a green");
    for (const lot of [...lots, ...greens]) {
      assert.deepEqual(slotOf(lot), slot);
      assert.ok(lot.x >= 0 && lot.z >= 0 && lot.x <= 127 && lot.z <= 127);
      assert.ok(contains(slotBounds(slot), lotBounds(lot)));
    }
    lots.forEach((lot, index) => assert.deepEqual(lotKind(lot), { kind: "lot", slot, index }));
    for (const green of greens) assert.equal(lotKind(green).kind, "green");
    // An outer district grows block by block: five lots around each green, in the order of the greens.
    const touches = (lot: { x: number; z: number }, green: { x: number; z: number }) => Math.abs(lot.x - green.x) <= 1 && Math.abs(lot.z - green.z) <= 1;
    if (slot !== CENTRAL_SLOT) greens.forEach((green, block) => assert.ok(lots.slice(block * 5, block * 5 + 5).every((lot) => touches(lot, green)), `block ${block} of ${slotKey(slot)}`));
    for (const green of greens) assert.ok(lots.filter((lot) => touches(lot, green)).length >= 4);
    // The sequence grows outward, it does not scatter: every lot touches the settlement so far.
    lots.forEach((lot, i) => {
      if (i === 0) return;
      assert.ok(lots.slice(0, i).some((l) => Math.abs(l.x - lot.x) <= 1 && Math.abs(l.z - lot.z) <= 1), `lot ${i} touches the settlement so far`);
    });
  }
  assert.equal(districtLots({ x: 2, z: 1 }).length, 20);
  assert.equal(central.length, 16);
});

test("district slots spiral out from the centre and never overlap; the column north of the centre stays open", () => {
  const spiral = slotSpiral();
  assert.deepEqual(spiral.slice(0, 4), [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }]);
  assert.equal(new Set(spiral.map(slotKey)).size, spiral.length);
  assert.ok(!slotAllowed({ x: 0, z: -1 }) && !slotAllowed({ x: 9, z: 0 }) && slotAllowed({ x: -8, z: 8 }));
  const rings = spiral.map((s) => Math.max(Math.abs(s.x), Math.abs(s.z)));
  assert.deepEqual(rings, [...rings].sort((a, b) => a - b), "ring by ring");
  const near = spiral.slice(0, 24);
  for (const a of near) for (const b of near) if (a !== b) assert.ok(!overlaps(slotBounds(a), slotBounds(b)), `${slotKey(a)} and ${slotKey(b)}`);
  assert.equal(lotKind({ x: 68, z: 64 }).kind, "border", "the column between two districts");
  assert.equal(lotKind({ x: 64, z: 58 }).kind, "border", "north of the centre");
});

test("the reserved spots lie on reserved ground that no growth sequence touches", () => {
  const ground = reservedBounds();
  for (const spot of RESERVED_SPOTS) assert.ok(contains(ground, spotBounds(spot)), `${spot.id} is on reserved ground`);
  const reserved = new Set(reservedLots().map(lotKey));
  for (const slot of slotSpiral().slice(0, 30)) for (const lot of [...districtLots(slot), ...districtGreens(slot)]) {
    assert.ok(!reserved.has(lotKey(lot)));
    assert.ok(!overlaps(ground, lotBounds(lot)), `lot ${lotKey(lot)} keeps off the reserved ground`);
  }
  for (const lot of reservedLots()) assert.equal(lotKind(lot).kind, "reserved");
  // Landmarks do not stand on each other or on the civic pieces (the café and the bus stop sit by the square).
  const big = RESERVED_SPOTS.filter((s) => s.id !== "cafe" && s.id !== "bus-stop");
  for (const a of big) for (const b of big) if (a !== b) assert.ok(!overlaps(spotBounds(a), spotBounds(b)), `${a.id} and ${b.id}`);
  assert.deepEqual([...LANDMARK_IDS].sort(), RESERVED_SPOTS.filter((s) => s.kind === "landmark").map((s) => s.id).sort());
});

test("tiers are entered at their threshold and left two below it", () => {
  assert.deepEqual([0, 1, 2, 4, 5, 9, 10, 40].map((n) => tierFor(n)), ["clearing", "hamlet", "village", "village", "town", "town", "region", "region"]);
  assert.equal(tierFor(9, "region"), "region");
  assert.equal(tierFor(8, "region"), "town");
  assert.equal(tierFor(4, "town"), "town");
  assert.equal(tierFor(3, "town"), "village");
  assert.equal(tierFor(1, "village"), "village");
  assert.equal(tierFor(0, "village"), "clearing", "no project is always a clearing");
  assert.equal(tierFor(4, "region"), "town", "a big drop still holds on one tier up");
  assert.equal(tierFor(3, "region"), "village");
  assert.equal(tierFor(12, "village"), "region", "growing ignores the previous tier");
  // Walking up and down never flaps: around every threshold a tier holds for at least two steps on the way down.
  let tier: Tier | null = null;
  const seen: Tier[] = [];
  for (const n of [9, 10, 9, 10, 9, 8, 9, 10]) seen.push((tier = tierFor(n, tier)));
  assert.deepEqual(seen, ["town", "region", "region", "region", "region", "town", "town", "region"]);
  assert.deepEqual(TIERS.map((t) => civicStage(t).post), ["mailbox", "mail-hut", "mail-hut", "post-office", "post-office"]);
  assert.deepEqual(TIERS.map((t) => civicStage(t).hall), ["lodge", "lodge", "lodge", "town-hall", "town-hall"]);
});

test("landmarks arrive with growth, the same way for the same town", () => {
  const seed = townSeed([{ slug: "crewhub" }]);
  assert.deepEqual(landmarkArrivals(seed), landmarkArrivals(seed));
  assert.deepEqual(Object.values(landmarkArrivals(seed)).sort((a, b) => a - b), [3, 4, 6, 7, 9, 12]);
  assert.deepEqual(landmarksArrived(seed, 2), []);
  assert.equal(landmarksArrived(seed, 40).length, LANDMARK_IDS.length);
  for (let n = 1; n < 14; n++) assert.deepEqual(landmarksArrived(seed, n), landmarksArrived(seed, n + 1).slice(0, landmarksArrived(seed, n).length), "a landmark that came stays");
  const orders = new Set(["crewhub", "atlas", "loops", "studio", "garden", "press"].map((slug) => landmarksArrived(townSeed([{ slug }]), 40).join()));
  assert.ok(orders.size > 1, "two towns do not grow the same way");
  assert.equal(townSeed([]), 0);
});

test("the ground covers every allocated lot and grows with the tier, the streets run between the lots in use", () => {
  const lots = districtLots(CENTRAL_SLOT);
  const clearing = groundExtent("clearing", []),
    hamlet = groundExtent("hamlet", lots.slice(0, 1)),
    village = groundExtent("village", lots.slice(0, 4)),
    town = groundExtent("town", lots.slice(0, 9), ["windmill", "chapel"]);
  assert.ok(contains(clearing, lotBounds(CENTRE_LOT)), "the staked-out plot is on the clearing");
  assert.deepEqual(hamlet, clearing, "the first building goes up on the clearing as it is");
  assert.ok(contains(village, hamlet) && contains(town, village));
  assert.ok(village.maxX - village.minX < 5 * PITCH + 1, "a village is not a grid of empty plots");
  for (const tier of TIERS) for (const n of [0, 1, 5, 16]) for (const lot of lots.slice(0, n)) assert.ok(contains(groundExtent(tier, lots.slice(0, n)), lotBounds(lot, 6)));
  const far = districtLots({ x: 2, z: 1 })[0]!;
  assert.ok(contains(groundExtent("hamlet", [far]), lotBounds(far, 6)), "an archived far building is still on the ground");

  const lane = streets("hamlet", lots.slice(0, 1));
  assert.deepEqual(lane, [
    { x0: -PITCH, z0: -PITCH, x1: PITCH, z1: -PITCH },
    { x0: -PITCH, z0: 0, x1: 0, z1: 0 },
    { x0: 0, z0: -PITCH, x1: 0, z1: 0 },
  ], "one lane: the civic lane, the main street past the building, its gate");
  const grid = streets("village", lots.slice(0, 4));
  assert.deepEqual(grid.filter((s) => s.z0 === s.z1), [
    { x0: -2 * PITCH, z0: -PITCH, x1: 2 * PITCH, z1: -PITCH },
    { x0: -2 * PITCH, z0: 0, x1: 2 * PITCH, z1: 0 },
  ]);
  assert.equal(grid.filter((s) => s.x0 === s.x1).length, 5);
  // Every used lot has a street on all four sides at a village and up.
  for (const lot of lots.slice(0, 12)) {
    const b = lotBounds(lot, 3);
    const all = streets("town", lots.slice(0, 12));
    for (const [x, z] of [[(b.minX + b.maxX) / 2, b.minZ], [(b.minX + b.maxX) / 2, b.maxZ], [b.minX, (b.minZ + b.maxZ) / 2], [b.maxX, (b.minZ + b.maxZ) / 2]] as const)
      assert.ok(all.some((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1), `a street by ${lotKey(lot)}`);
  }
});

test("roads join every district to the centre along street lines, borders lie between neighbours", () => {
  const slots = [CENTRAL_SLOT, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: -2, z: -1 }];
  const roads = districtRoads(slots);
  for (const road of roads) assert.ok(road.x0 === road.x1 || road.z0 === road.z1, "straight");
  // From every district the roads lead to the centre.
  for (const slot of slots.slice(1)) {
    let at = slot;
    for (let guard = 0; guard < 20 && slotKey(at) !== "0,0"; guard++) at = roads.find((r) => slotKey(r.from) === slotKey(at))!.to;
    assert.deepEqual(at, CENTRAL_SLOT);
  }
  assert.ok(roads.every((r) => slotAllowed(r.to)), "no road through the column north of the centre");
  assert.equal(new Set(roads.map((r) => slotKey(r.from))).size, roads.length);
  const ground = reservedBounds();
  for (const r of roads) assert.ok(!overlaps(ground, { minX: Math.min(r.x0, r.x1) - 1, maxX: Math.max(r.x0, r.x1) + 1, minZ: Math.min(r.z0, r.z1) - 1, maxZ: Math.max(r.z0, r.z1) + 1 }), "no road over the civic ground");

  const borders = districtBorders(slots);
  assert.equal(borders.length, 4, "the four neighbours of the 2 by 2 block");
  for (const border of borders) {
    for (const slot of slots) for (const lot of districtLots(slot)) assert.ok(!overlaps(border.strip, lotBounds(lot)), "a border holds no lot");
    assert.ok(overlaps(border.strip, { minX: slotBounds(border.a).minX, maxX: slotBounds(border.b).maxX, minZ: slotBounds(border.a).minZ, maxZ: slotBounds(border.b).maxZ }));
  }
  assert.equal(borders.filter((b) => b.crossing).length, 3, "the south-east district reaches the centre through the east one");
});

/** Runs `steps` against a town document the way the app does: allocate whatever has no plot, never anything else. */
function grow(order: readonly Settler[], options: { archive?: () => number } = {}) {
  let doc = emptyTownDocument();
  const first = new Map<string, string>();
  const archived = new Set<string>();
  const reservedGround = reservedBounds();
  const check = (present: readonly Settler[]) => {
    const cells = new Set<string>();
    for (const plot of doc.plots) {
      const key = lotKey(plot.cell);
      assert.ok(!cells.has(key), `two buildings on ${key}`);
      cells.add(key);
      assert.equal(lotKind(plot.cell).kind, "lot", `${plot.slug} stands on a lot`);
      assert.ok(!overlaps(reservedGround, lotBounds(plot.cell)), `${plot.slug} keeps off the reserved ground`);
      for (const spot of RESERVED_SPOTS) assert.ok(!overlaps(spotBounds(spot), lotBounds(plot.cell)), `${plot.slug} keeps off the ${spot.id}`);
      const before = first.get(plot.slug);
      if (before) assert.equal(key, before, `${plot.slug} moved`);
      else first.set(plot.slug, key);
      const zone = plot.zoneId ?? "default";
      assert.equal(districtZoneAt(settlementOf(doc), plot.cell), zone, `${plot.slug} stands in its zone's district`);
    }
    assert.equal(doc.plots.length, first.size, "no plot was lost");
    for (const s of present) assert.ok(first.has(s.slug));
    const slots = new Set((doc.districts ?? []).map((d) => slotKey(d.slot)));
    assert.equal(slots.size, (doc.districts ?? []).length);
    // The ground of every tier the count can have covers every lot, archived ones too.
    const active = present.filter((s) => !archived.has(s.slug)).length;
    const tier = tierFor(active);
    const ground = groundExtent(tier, doc.plots.map((p) => p.cell), landmarksArrived(townSeed(doc.plots), doc.plots.length));
    for (const plot of doc.plots) assert.ok(contains(ground, lotBounds(plot.cell, 6)));
  };
  const present: Settler[] = [];
  check(present);
  for (const settler of order) {
    present.push(settler);
    // The world lists every project it knows on every pass (archived ones too), in whatever order the source has.
    const listed = options.archive ? [...present].reverse() : present;
    const e = allocationEdit(doc, listed);
    assert.ok(e, `${settler.slug} gets a lot`);
    doc = edit(doc, e);
    assert.equal(allocationEdit(doc, listed), null, "a second pass changes nothing");
    if (options.archive) {
      // Archive or restore one project; neither is the layout's business, so nothing may change.
      const victim = present[options.archive() % present.length]!.slug;
      if (archived.has(victim)) archived.delete(victim);
      else archived.add(victim);
    }
    check(present);
  }
  return doc;
}

test("stability: projects added one by one from 0 to 40 keep their lots, in any order, over one to four zones", () => {
  const slugs = Array.from({ length: 40 }, (_, i) => `project-${i + 1}`);
  const zones = ["default", "studio", "labs", "garden"];
  for (let zoneCount = 1; zoneCount <= 4; zoneCount++) {
    for (let run = 0; run < 6; run++) {
      const rand = random(zoneCount * 100 + run + 1);
      const order = [...slugs];
      if (run === 1) order.reverse();
      if (run >= 2) for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      // Runs 0 to 2 deal the zones evenly, run 3 fills one zone before the next, 4 and 5 are lopsided.
      const zoneOf = (i: number): string => {
        if (run <= 2) return zones[i % zoneCount]!;
        if (run === 3) return zones[Math.min(zoneCount - 1, Math.floor((i * zoneCount) / order.length))]!;
        return zones[rand() < 0.7 ? 0 : Math.floor(rand() * zoneCount)]!;
      };
      const settlers = order.map((slug, i): Settler => (zoneOf(i) === "default" ? { slug } : { slug, zoneId: zoneOf(i) }));
      const archive = run % 2 === 1 ? () => Math.floor(rand() * 1000) : undefined;
      const doc = grow(settlers, archive ? { archive } : {});
      assert.equal(doc.plots.length, 40);
      assert.equal(new Set((doc.districts ?? []).map((d) => d.zoneId)).size, new Set(settlers.map((s) => s.zoneId ?? "default")).size);
    }
  }
});

test("stability: a town grows the same way however its projects arrive in batches", () => {
  const settlers: Settler[] = Array.from({ length: 24 }, (_, i) => ({ slug: `p${i}`, ...(i % 3 === 2 ? { zoneId: "labs" } : {}) }));
  const oneByOne = grow(settlers);
  let doc = emptyTownDocument();
  for (const size of [1, 3, 9, 24]) doc = edit(doc, allocationEdit(doc, settlers.slice(0, size))!);
  assert.deepEqual(doc.plots, oneByOne.plots);
  assert.deepEqual(doc.districts, oneByOne.districts);
  assert.deepEqual(doc.districts, [{ zoneId: "default", slot: { x: 0, z: 0 } }, { zoneId: "labs", slot: { x: 1, z: 0 } }]);
  // Sixteen lots in the centre: the seventeenth project of one zone opens a second district next to the first.
  const big = grow(Array.from({ length: 40 }, (_, i) => ({ slug: `p${i}` })));
  assert.deepEqual(big.districts, [{ zoneId: "default", slot: { x: 0, z: 0 } }, { zoneId: "default", slot: { x: 1, z: 0 } }, { zoneId: "default", slot: { x: 0, z: 1 } }]);
  assert.deepEqual(big.plots.slice(0, 4).map((p) => p.cell), [{ x: 64, z: 64 }, { x: 65, z: 64 }, { x: 63, z: 64 }, { x: 66, z: 64 }]);
});

test("a project that changes zone stays where it stands; Tidy and a hand move are the only ways to rehouse it", () => {
  const settlers: Settler[] = [{ slug: "a" }, { slug: "b" }, { slug: "c", zoneId: "labs" }, { slug: "d", zoneId: "labs" }];
  let doc = edit(emptyTownDocument(), allocationEdit(emptyTownDocument(), settlers)!);
  const before = doc.plots.map((p) => lotKey(p.cell));
  // "b" moves to labs in the source: nothing to allocate, nothing moves.
  const regrouped: Settler[] = [{ slug: "a" }, { slug: "b", zoneId: "labs" }, { slug: "c", zoneId: "labs" }, { slug: "d", zoneId: "labs" }];
  assert.equal(allocationEdit(doc, regrouped), null);
  assert.equal(districtZoneAt(settlementOf(doc), doc.plots[1]!.cell), "default", "it stands in its old district");

  // A hand move to the zone: the next free lot of labs, and a manual assignment.
  const toZone = moveEdit(doc, "b", { zoneId: "labs" })!;
  const moved = edit(doc, toZone);
  assert.deepEqual(moved.plots[1], { slug: "b", cell: nextFreeLot(settlementOf(doc), "labs")!.cell, zoneId: "labs" });
  assert.deepEqual(moved.assignments, { b: "labs" });
  assert.deepEqual(moved.plots.filter((p) => p.slug !== "b").map((p) => lotKey(p.cell)), before.filter((_, i) => i !== 1), "nobody else moved");
  // The lot it left is the next one its old zone gives out.
  assert.deepEqual(allocate(settlementOf(moved), [{ slug: "e" }]).plots[0]?.cell, doc.plots[1]!.cell);

  // A hand move to a lot: free lots only, never a green, the civic ground or a border.
  const settlement = settlementOf(doc);
  assert.ok(!canMoveTo(settlement, doc.plots[0]!.cell), "taken");
  assert.ok(!canMoveTo(settlement, districtGreens(CENTRAL_SLOT)[0]!), "a green");
  assert.ok(!canMoveTo(settlement, { x: 64, z: 63 }), "the civic row");
  assert.ok(!canMoveTo(settlement, { x: 68, z: 64 }), "a border");
  assert.equal(moveEdit(doc, "a", { cell: { x: 64, z: 63 } }), null);
  assert.equal(moveEdit(doc, "nobody", { cell: { x: 66, z: 64 } }), null);
  const far = districtLots({ x: -1, z: 0 })[3]!;
  const out = edit(doc, moveEdit(doc, "a", { cell: far })!);
  assert.deepEqual(out.plots[0]?.cell, far);
  assert.deepEqual(out.districts?.at(-1), { zoneId: "default", slot: { x: -1, z: 0 } }, "a lot in open country opens a district there");
  assert.equal(out.assignments, undefined);

  // Tidy: one edit, the zones in the order asked for, every project on the first lots of its zone.
  const tidy = edit(moved, tidyEdit(moved, regrouped, ["labs"]));
  assert.equal(tidy.revision, moved.revision + 1);
  assert.deepEqual(tidy.districts, [{ zoneId: "labs", slot: { x: 0, z: 0 } }, { zoneId: "default", slot: { x: 1, z: 0 } }]);
  assert.deepEqual(tidy.plots.map((p) => [p.slug, lotKey(p.cell)]), [
    ["a", lotKey(districtLots({ x: 1, z: 0 })[0]!)],
    ["b", lotKey(districtLots(CENTRAL_SLOT)[0]!)],
    ["c", lotKey(districtLots(CENTRAL_SLOT)[1]!)],
    ["d", lotKey(districtLots(CENTRAL_SLOT)[2]!)],
  ]);
  // A plot of a project the world does not list now is kept, after the others.
  const partial = edit(moved, tidyEdit(moved, regrouped.slice(0, 2)));
  assert.equal(partial.plots.length, 4);
  assert.equal(new Set(partial.plots.map((p) => lotKey(p.cell))).size, 4);
  // Tidying a tidy town changes no lot.
  assert.deepEqual(edit(tidy, tidyEdit(tidy, regrouped, ["labs"])).plots, tidy.plots);
});
