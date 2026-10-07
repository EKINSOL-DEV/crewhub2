import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, emptyTownDocument, type TownDocument } from "@crewhub/world-model";
import { allocationEdit, CENTRE_LOT, lotBounds, lotKey, lotKind, reservedBounds } from "../src/world/settlement.ts";
import { describePlan, freeLots, homeRects, moveFocus, oldQuarterLot, planKey, planLot, planTown, type PlanBuilding } from "../src/world/townPlan.ts";
import { reservedSpot, spotBounds } from "../src/world/settlement.ts";

const CONTEXT = { knownStyles: ["greenhouse"], builtinIds: [] };
function town(buildings: readonly PlanBuilding[]): TownDocument {
  const e = allocationEdit(emptyTownDocument(), buildings);
  if (!e) return emptyTownDocument();
  const result = applyEdit(emptyTownDocument(), e, CONTEXT);
  assert.ok(result.ok);
  return result.doc;
}
const projects = (n: number, zones = 1): PlanBuilding[] => Array.from({ length: n }, (_, i) => ({ slug: `p${i}`, ...(i % zones ? { zoneId: `zone-${i % zones}` } : {}) }));

test("the plan fits its content: a clearing stakes one lot, a hamlet is one building, a region has districts", () => {
  const clearing = planTown(emptyTownDocument(), []);
  assert.deepEqual([clearing.tier, clearing.staked, clearing.lots.length, clearing.districts.length], ["clearing", CENTRE_LOT, 0, 1]);
  assert.equal(clearing.civic.post, "mailbox");

  const one = projects(1);
  const hamlet = planTown(town(one), one);
  assert.deepEqual([hamlet.tier, hamlet.staked, hamlet.lots[0]?.cell], ["hamlet", null, CENTRE_LOT]);
  assert.deepEqual(hamlet.ground, clearing.ground, "the first building goes up where the stakes stood, on the same ground");
  assert.equal(hamlet.streets.length, 3, "one lane");

  const studio = projects(20, 4);
  const region = planTown(town(studio), studio);
  assert.equal(region.tier, "region");
  assert.deepEqual(region.districts.map((d) => [d.zoneId, d.lots.length, d.greens.length]), [["default", 5, 1], ["zone-1", 5, 1], ["zone-2", 5, 1], ["zone-3", 5, 1]]);
  assert.equal(region.roads.length, 3);
  assert.ok(region.borders.length >= 2);
  for (const lot of region.lots) {
    const b = lotBounds(lot.cell, 6);
    assert.ok(b.minX >= region.ground.minX && b.maxX <= region.ground.maxX && b.minZ >= region.ground.minZ && b.maxZ <= region.ground.maxZ);
    assert.equal(lot.zoneId, lot.districtZoneId);
  }
  // A building without a plot yet is left out until the allocation lands; nothing else changes.
  const early = planTown(town(studio.slice(0, 19)), studio);
  assert.equal(early.lots.length, 19);
  assert.deepEqual(early.lots.map((l) => lotKey(l.cell)), region.lots.slice(0, 19).map((l) => lotKey(l.cell)));
});

test("a tier change, an archive and a regroup move nothing; the old quarter is an explicit fold", () => {
  const all = projects(12);
  const doc = town(all);
  const before = planTown(doc, all);
  const where = (plan: ReturnType<typeof planTown>) => Object.fromEntries(plan.lots.map((l) => [l.slug, lotKey(l.cell)]));
  const archived = all.map((b, i) => (i === 1 || i === 7 ? { ...b, archived: true } : b));
  const after = planTown(doc, archived, { previous: before.tier });
  assert.deepEqual(where(after), where(before));
  assert.deepEqual([before.tier, after.tier, after.active], ["region", "region", 10]);
  assert.equal(planTown(doc, archived).tier, "region");
  assert.equal(planTown(doc, all.map((b, i) => ({ ...b, archived: i > 2 })), { previous: "region" }).tier, "village", "boarded-up buildings do not count");
  assert.notEqual(planKey(after), planKey(before), "boarding up is a change of the town");

  const regrouped = planTown(doc, all.map((b, i) => (i === 3 ? { ...b, zoneId: "labs" } : b)));
  assert.deepEqual(where(regrouped), where(before));
  assert.deepEqual([planLot(regrouped, "p3")?.zoneId, planLot(regrouped, "p3")?.districtZoneId], ["labs", "default"], "it belongs elsewhere and stands where it stood");

  const folded = planTown(doc, archived, { oldQuarter: true });
  assert.deepEqual([planLot(folded, "p1")?.cell, planLot(folded, "p7")?.cell], [oldQuarterLot(0), oldQuarterLot(1)]);
  assert.ok(planLot(folded, "p1")?.folded && !planLot(folded, "p0")?.folded);
  assert.deepEqual(Object.entries(where(folded)).filter(([slug]) => slug !== "p1" && slug !== "p7"), Object.entries(where(before)).filter(([slug]) => slug !== "p1" && slug !== "p7"));
  // The old quarter is ground no district and no civic piece ever takes.
  const civic = reservedBounds();
  for (let i = 0; i < 30; i++) {
    const lot = oldQuarterLot(i),
      b = lotBounds(lot);
    assert.equal(lotKind(lot).kind, "border");
    assert.ok(b.maxZ <= civic.minZ, "behind the civic ground");
  }
  assert.equal(new Set(Array.from({ length: 30 }, (_, i) => lotKey(oldQuarterLot(i)))).size, 30);
});

test("the home view frames what exists: the building for a hamlet, the settlement for a village or town, the districts for a region", () => {
  const frame = (n: number, zones = 1, compact = false) => {
    const all = projects(n, zones);
    const rects = homeRects(planTown(town(all), all), compact ? 0 : 1.5, compact);
    return { rects, minX: Math.min(...rects.map((r) => r.minX)), maxX: Math.max(...rects.map((r) => r.maxX)), minZ: Math.min(...rects.map((r) => r.minZ)), maxZ: Math.max(...rects.map((r) => r.maxZ)) };
  };
  const width = (f: ReturnType<typeof frame>) => f.maxX - f.minX;
  const holds = (f: ReturnType<typeof frame>, b: { minX: number; maxX: number; minZ: number; maxZ: number }) => f.rects.some((r) => r.minX <= b.minX && r.maxX >= b.maxX && r.minZ <= b.minZ && r.maxZ >= b.maxZ);
  const post = spotBounds(reservedSpot("post-office"));
  const clearing = frame(0),
    hamlet = frame(1),
    village = frame(4),
    twelve = frame(12),
    region = frame(20, 4);
  assert.ok(holds(clearing, lotBounds(CENTRE_LOT)) && holds(clearing, post), "a clearing shows the lodge, the mailbox and the staked plot");
  assert.ok(holds(hamlet, lotBounds(CENTRE_LOT)), "a hamlet shows its building");
  assert.ok(!holds(hamlet, post), "not a map of the civic row");
  assert.ok(hamlet.maxZ - hamlet.minZ < clearing.maxZ - clearing.minZ, "so the building fills the picture");
  const centre = lotBounds(CENTRE_LOT);
  assert.equal(hamlet.minX + hamlet.maxX, centre.minX + centre.maxX, "and stands in its middle");
  assert.ok(holds(village, post) && width(village) > width(hamlet));
  assert.ok(width(twelve) > width(village) && width(region) > 1.5 * width(twelve));
  for (const all of [projects(4), projects(12), projects(20, 4)]) {
    const plan = planTown(town(all), all);
    const rects = homeRects(plan);
    for (const lot of plan.lots) assert.ok(rects.some((r) => r.minX <= lot.centre.x - 12 && r.maxX >= lot.centre.x + 12 && r.minZ <= lot.centre.z - 12 && r.maxZ >= lot.centre.z + 12), `${lot.slug} is in the picture`);
    // The phone's compact frame is tighter and still holds every building.
    const tight = homeRects(plan, 0, true);
    assert.equal(tight.length, rects.length);
    tight.forEach((t, i) => assert.ok(t.minX > rects[i]!.minX && t.maxX < rects[i]!.maxX && t.maxX - t.minX >= 8));
  }
  // Folded into the old quarter, an archived building leaves the picture; boarded up on its plot, it stays.
  const all = projects(6).map((b, i) => ({ ...b, archived: i === 5 }));
  assert.equal(homeRects(planTown(town(all), all)).length, 6 + 3);
  assert.equal(homeRects(planTown(town(all), all, { oldQuarter: true })).length, 5 + 3);
});

test("keyboard focus follows the layout: the nearest building that way, and it stays put at an edge", () => {
  const all = projects(9);
  const plan = planTown(town(all), all);
  const slugs = all.map((b) => b.slug);
  const at = (index: number) => lotKey(plan.lots[index]!.cell);
  const go = (index: number, key: string) => at(moveFocus(plan, slugs, index, key));
  // The village street is 63..66 on row 64, in the order p2, p0, p1, p3.
  assert.equal(at(0), "64,64");
  assert.equal(go(0, "ArrowRight"), "65,64");
  assert.equal(go(0, "ArrowLeft"), "63,64");
  assert.equal(go(2, "ArrowLeft"), "63,64", "nothing further west: stay");
  assert.equal(go(1, "ArrowDown"), "65,65", "the building in front");
  assert.equal(go(4, "ArrowDown"), "65,66");
  assert.equal(go(6, "ArrowDown"), "65,66", "nothing further south: stay");
  assert.equal(go(6, "ArrowUp"), "65,65");
  assert.equal(go(0, "ArrowUp"), "64,64", "the civic row holds no building");
  assert.equal(go(3, "Home"), "63,64");
  assert.equal(go(3, "End"), "65,66");
  assert.equal(go(3, "KeyA"), at(3));
  // Every building can be reached from every other with the arrow keys.
  for (const zones of [1, 4]) {
    const many = projects(20, zones);
    const big = planTown(town(many), many);
    const names = many.map((b) => b.slug);
    const seen = new Set([0]);
    const queue = [0];
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      const next = moveFocus(big, names, i, key);
      if (!seen.has(next)) queue.push((seen.add(next), next));
    }
    assert.equal(seen.size, 20, `all twenty buildings in ${zones} zone(s)`);
  }
  // A building without a lot yet is skipped; an empty town has nothing to focus.
  assert.equal(moveFocus(planTown(town(all.slice(0, 2)), all), slugs, 0, "End"), 1);
  assert.equal(moveFocus(planTown(town([]), []), [], 3, "ArrowRight"), 0);
});

test("the text view says what the settlement is, what grew with it and where the archived buildings are", () => {
  const words = (plan: ReturnType<typeof planTown>) => describePlan(plan, (slug) => slug.toUpperCase()).map((l) => l.text);
  assert.match(words(planTown(emptyTownDocument(), []))[0]!, /^The settlement is a clearing/);
  const all = projects(7).map((b, i) => ({ ...b, archived: i === 6, ...(i === 2 ? { zoneId: "labs" } : {}) }));
  const doc = town(projects(7));
  const lines = words(planTown(doc, all));
  assert.match(lines[0]!, /^The settlement is a town of 6 projects\. A building keeps its plot/);
  assert.ok(lines.some((l) => /^Grown with the town: /.test(l)));
  assert.ok(lines.includes("Archived, boarded up on its plot: P6."));
  assert.ok(lines.includes("Standing in another district than their zone's: P2."));
  assert.ok(words(planTown(doc, all, { oldQuarter: true })).some((l) => l.startsWith("Archived, folded into the old quarter behind the town (your setting): P6.")));
  assert.ok(words(planTown(town(projects(6)), all)).includes("1 new project is getting a plot."));
});

test("the free plots a building can move to: every district in use, numbered in growth order", () => {
  const all = projects(8, 2);
  const doc = town(all);
  const plan = planTown(doc, all);
  const free = freeLots(plan, doc.plots);
  assert.equal(free.length, 16 - 4 + 20 - 4);
  assert.deepEqual(free.filter((l) => l.next).map((l) => [l.zoneId, l.number]), [["default", 5], ["zone-1", 5]]);
  const taken = new Set(doc.plots.map((p) => lotKey(p.cell)));
  for (const lot of free) {
    assert.ok(!taken.has(lotKey(lot.cell)));
    assert.equal(lotKind(lot.cell).kind, "lot");
    assert.equal(lotKind(lot.cell).index + 1, lot.number);
  }
});

test("a region's ground is its districts and the roads between them, not the box around them", () => {
  const area = (rects: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[]) => rects.reduce((sum, r) => sum + (r.maxX - r.minX) * (r.maxZ - r.minZ), 0);
  const inside = (rects: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[], x: number, z: number) => rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  // One district: one piece, the whole ground.
  const village = planTown(town(projects(4)), projects(4));
  assert.deepEqual(village.grounds, [village.ground]);
  for (const [count, zones] of [[20, 4], [40, 4], [40, 1], [12, 3]] as const) {
    const all = projects(count, zones);
    const plan = planTown(town(all), all);
    assert.equal(plan.grounds.length, plan.districts.length + plan.roads.length);
    for (const piece of plan.grounds) assert.ok(piece.minX >= plan.ground.minX && piece.maxX <= plan.ground.maxX && piece.minZ >= plan.ground.minZ && piece.maxZ <= plan.ground.maxZ);
    // Every building's plot with its street, every begun green and every step of every road lies on a piece.
    for (const lot of plan.lots) for (const dx of [-18, 18]) for (const dz of [-18, 18]) assert.ok(inside(plan.grounds, lot.centre.x + dx, lot.centre.z + dz), `${lot.slug}`);
    for (const road of plan.roads) for (let t = 0; t <= 1; t += 0.05) assert.ok(inside(plan.grounds, road.x0 + (road.x1 - road.x0) * t, road.z0 + (road.z1 - road.z0) * t), "a road runs on ground");
    for (const street of plan.streets) assert.ok(inside(plan.grounds, (street.x0 + street.x1) / 2, (street.z0 + street.z1) / 2), "a street runs on ground");
  }
  const studio = projects(20, 4);
  const region = planTown(town(studio), studio);
  assert.ok(area(region.grounds) < 0.5 * area([region.ground]), "less than half the box is ground");
  // An archived building folded into the old quarter stands on a piece of its own, behind the town.
  const some = projects(6).map((b, i) => ({ ...b, archived: i === 5 }));
  const folded = planTown(town(some), some, { oldQuarter: true });
  assert.equal(folded.grounds.length, 2);
  assert.ok(folded.grounds[1]!.maxZ < folded.grounds[0]!.minZ + 40, "close behind the centre");
  assert.ok(inside(folded.grounds, planLot(folded, "p5")!.centre.x, planLot(folded, "p5")!.centre.z));
});
