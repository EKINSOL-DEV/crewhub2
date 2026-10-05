import assert from "node:assert/strict";
import test from "node:test";
import { applyEdit, emptyTownDocument, type TownDocument } from "@crewhub/world-model";
import { allocationEdit, CENTRE_LOT, lotBounds, lotKey, lotKind, reservedBounds } from "../src/world/settlement.ts";
import { oldQuarterLot, planKey, planLot, planTown, type PlanBuilding } from "../src/world/townPlan.ts";

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
