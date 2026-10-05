/* A dressing plan for a made-up settlement of `count` projects, allocated one by one as the world allocates them: for
   the tier preview page and the dressing's tests. Pure. */
import { plotDoor, plotObstacles } from "./navigation.ts";
import { allocate, CENTRAL_SLOT, CENTRE_LOT, civicStage, districtBorders, districtGreens, districtLots, districtRoads, groundExtent, landmarksArrived, lotCentre, lotKey, slotBounds, slotKey, slotOf, streets, tierFor, townSeed } from "./settlement.ts";
import { dressPlan, type DressPlan, type SettlementPlan } from "./settlementDressing.ts";
import { plotCenter, type Bounds } from "./townLayout.ts";

/** The fixture's zones: the default one and three named ones with a colour each. */
export const FIXTURE_ZONES = [
  { id: "default", name: null, accent: null },
  { id: "orchard-row", name: "Orchard Row", accent: "coral" },
  { id: "mill-side", name: "Mill Side", accent: "circle" },
  { id: "low-meadow", name: "Low Meadow", accent: "tangerine" },
] as const;
export const FIXTURE_SIGN = "Create a project\nin crewhub-loops";

/** The settlement of `count` projects spread over `zones` zones, the last `archived` of them boarded up. */
export function fixturePlan(count: number, zones = 1, archived = 0): { plan: SettlementPlan; dress: DressPlan } {
  const settlers = Array.from({ length: count }, (_, i) => ({ slug: `project-${i + 1}`, zoneId: FIXTURE_ZONES[i % zones]!.id }));
  const laid = allocate({ plots: [], districts: [] }, settlers);
  const tier = tierFor(count - archived);
  const cells = laid.plots.map((p) => p.cell);
  const used = new Set(cells.map(lotKey));
  const slots = new Map([[slotKey(CENTRAL_SLOT), CENTRAL_SLOT], ...cells.map((c) => [slotKey(slotOf(c)), slotOf(c)] as const)]);
  const zoneAt = new Map(laid.districts.map((d) => [slotKey(d.slot), d.zoneId]));
  const seed = townSeed(laid.plots);
  const landmarks = landmarksArrived(seed, count);
  const plan: SettlementPlan = {
    tier,
    seed,
    ground: groundExtent(tier, cells, landmarks),
    streets: streets(tier, cells),
    roads: districtRoads([...slots.values()]),
    borders: districtBorders([...slots.values()]),
    civic: civicStage(tier),
    landmarks,
    lots: laid.plots.map((p, i) => ({ slug: p.slug, centre: lotCentre(p.cell), archived: i >= count - archived })),
    districts: [...slots.values()].map((slot) => {
      const lots = districtLots(slot);
      const central = slot.x === 0 && slot.z === 0;
      // A green shows once a lot of its block is in use: blocks of five (the centre's begin after its street of four).
      const greens = districtGreens(slot).filter((_, block) => (central ? lots.slice(4 + block * 5, 9 + block * 5) : lots.slice(block * 5, block * 5 + 5)).some((lot) => used.has(lotKey(lot))));
      return { slot, zoneId: zoneAt.get(slotKey(slot)) ?? "default", central, bounds: slotBounds(slot), greens };
    }),
    staked: tier === "clearing" ? CENTRE_LOT : null,
  };
  const centres = new Map(plan.lots.map((lot) => [lot.slug, lot.centre]));
  // A lot's door and footprints: those of the old grid's plot 0 (lot 63,64), moved to the lot.
  const FIRST_LOT = { x: 63, z: 64 };
  const shift = (slug: string) => ({ x: centres.get(slug)!.x - plotCenter(0).x, z: centres.get(slug)!.z - plotCenter(0).z });
  const dress = dressPlan(plan, {
    door: (slug) => ({ x: plotDoor(FIRST_LOT).x + shift(slug).x, z: plotDoor(FIRST_LOT).z + shift(slug).z }),
    obstacles: (slug) => plotObstacles(FIRST_LOT).map((r): Bounds => ({ minX: r.minX + shift(slug).x, maxX: r.maxX + shift(slug).x, minZ: r.minZ + shift(slug).z, maxZ: r.maxZ + shift(slug).z })),
    zone: (id) => FIXTURE_ZONES.find((z) => z.id === id),
    lotCentre,
    stakedText: FIXTURE_SIGN,
  });
  return { plan, dress };
}
