/* A dressing plan for a made-up settlement of `count` projects, allocated one by one as the world allocates them: for
   the tier preview page and the dressing's tests. Pure. */
import { emptyTownDocument } from "@crewhub/world-model";
import { plotDoor, plotObstacles } from "./navigation.ts";
import { allocate, lotCentre } from "./settlement.ts";
import { dressPlan, STAKED_SIGN, type DressPlan } from "./settlementDressing.ts";
import { planTown, type TownPlan } from "./townPlan.ts";

/** The fixture's zones: the default one and three named ones with a colour each. */
export const FIXTURE_ZONES = [
  { id: "default", name: null, accent: null },
  { id: "orchard-row", name: "Orchard Row", accent: "coral" },
  { id: "mill-side", name: "Mill Side", accent: "circle" },
  { id: "low-meadow", name: "Low Meadow", accent: "tangerine" },
] as const;
export const FIXTURE_SIGN = STAKED_SIGN;

/** The settlement of `count` projects spread over `zones` zones, the last `archived` of them boarded up. */
export function fixturePlan(count: number, zones = 1, archived = 0): { plan: TownPlan; dress: DressPlan } {
  const buildings = Array.from({ length: count }, (_, i) => ({ slug: `project-${i + 1}`, zoneId: FIXTURE_ZONES[i % zones]!.id, archived: i >= count - archived }));
  const laid = allocate({ plots: [], districts: [] }, buildings);
  const plan = planTown({ ...emptyTownDocument(), plots: laid.plots, districts: laid.districts }, buildings);
  const cells = new Map(plan.lots.map((lot) => [lot.slug, lot.cell]));
  const dress = dressPlan(plan, {
    door: (slug) => plotDoor(cells.get(slug)!),
    obstacles: (slug) => plotObstacles(cells.get(slug)!),
    zone: (id) => FIXTURE_ZONES.find((z) => z.id === id),
    lotCentre,
    stakedText: STAKED_SIGN,
  });
  return { plan, dress };
}
