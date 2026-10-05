/* The town plan: the settlement as it stands right now, worked out once from the town document and the buildings and
   read by everything that draws or walks the town (the scene, the dressing, the navigation, the camera). Pure: no
   Three.js, no DOM. The lots come from the document; nothing here chooses or moves one. */
import { DEFAULT_ZONE_ID } from "@crewhub/world-model";
import type { District, DistrictSlot, GridCell, TownDocument } from "@crewhub/world-model";
import {
  CENTRAL_SLOT,
  CENTRE_LOT,
  civicStage,
  districtBorders,
  districtBlocks,
  districtRoads,
  groundExtent,
  landmarksArrived,
  lotBounds,
  lotCentre,
  lotKey,
  slotBounds,
  slotCrossing,
  slotKey,
  slotOf,
  streets,
  tierFor,
  townSeed,
  type CivicStage,
  type DistrictBorder,
  type LandmarkId,
  type Segment,
  type Tier,
} from "./settlement.ts";
import type { Bounds, PlotSpot } from "./townLayout.ts";

/** A building as the plan needs it: who it is, whether it is archived and the zone it belongs to now. */
export interface PlanBuilding {
  slug: string;
  archived?: boolean;
  zoneId?: string;
}

/** A building on its lot. */
export interface PlanLot {
  slug: string;
  /** The lot it is drawn on: its plot's, or a lot of the old quarter when `folded`. */
  cell: GridCell;
  centre: PlotSpot;
  slot: DistrictSlot;
  archived: boolean;
  /** An archived building folded into the old quarter (a viewer setting); its plot in the document is untouched. */
  folded: boolean;
  /** The zone the building belongs to now, and the zone of the district it stands in (they differ after a regroup). */
  zoneId: string;
  districtZoneId: string;
}

/** A district in use. */
export interface PlanDistrict {
  slot: DistrictSlot;
  zoneId: string;
  central: boolean;
  /** The district's buildable ground in world units. */
  bounds: Bounds;
  /** Its main crossing, where the district roads meet. */
  crossing: PlotSpot;
  lots: PlanLot[];
  /** The greens whose block has begun (one of its lots is in use), in the order the blocks grow. */
  greens: GridCell[];
}

export interface TownPlan {
  tier: Tier;
  /** Buildings that are not archived. */
  active: number;
  /** The town's own number (its founding project): what seeded choices in the dressing should use. */
  seed: number;
  /** Every building that has a plot, in the order of the buildings given. */
  lots: PlanLot[];
  districts: PlanDistrict[];
  civic: CivicStage;
  /** The landmarks that have arrived, in the order they came. */
  landmarks: LandmarkId[];
  /** The lot staked out for the first project: only a clearing has one. */
  staked: GridCell | null;
  ground: Bounds;
  streets: Segment[];
  roads: ReturnType<typeof districtRoads>;
  borders: DistrictBorder[];
  /** True when archived buildings are folded into the old quarter. */
  oldQuarter: boolean;
}

/**
 * The old quarter: the open country north of the centre, which no district ever takes. Folded archived buildings
 * stand there in rows of six, the first row nearest the town, in the order of their plots.
 */
export function oldQuarterLot(index: number): GridCell {
  const row = Math.floor(index / 6),
    column = index % 6;
  return { x: CENTRE_LOT.x - 2 + column, z: CENTRE_LOT.z - 4 - row };
}

export interface PlanOptions {
  /** The tier before this plan, for the hysteresis; null at the start. */
  previous?: Tier | null;
  /** Fold archived buildings into the old quarter (a viewer setting, off by default). */
  oldQuarter?: boolean;
}

/** The plan for these buildings on this document. A building without a plot yet (allocation is on its way) is left out. */
export function planTown(doc: Pick<TownDocument, "plots" | "districts">, buildings: readonly PlanBuilding[], options: PlanOptions = {}): TownPlan {
  const districts: readonly District[] = doc.districts ?? [];
  const zoneAt = new Map(districts.map((d) => [slotKey(d.slot), d.zoneId]));
  const plots = new Map(doc.plots.map((p) => [p.slug, p]));
  const fold = options.oldQuarter === true;
  // The old quarter fills in plot order, so an archived building keeps its place there while others come and go.
  const archivedSlugs = new Set(buildings.filter((b) => b.archived).map((b) => b.slug));
  const quarter = new Map(doc.plots.filter((p) => archivedSlugs.has(p.slug)).map((p, i) => [p.slug, oldQuarterLot(i)]));

  const lots: PlanLot[] = [];
  for (const building of buildings) {
    const plot = plots.get(building.slug);
    if (!plot) continue;
    const archived = building.archived === true;
    const folded = fold && archived;
    const cell = folded ? quarter.get(building.slug)! : plot.cell;
    const slot = slotOf(plot.cell);
    lots.push({
      slug: building.slug,
      cell,
      centre: lotCentre(cell),
      slot,
      archived,
      folded,
      zoneId: building.zoneId ?? DEFAULT_ZONE_ID,
      districtZoneId: zoneAt.get(slotKey(slot)) ?? plot.zoneId ?? DEFAULT_ZONE_ID,
    });
  }

  const active = buildings.filter((b) => !b.archived).length;
  const tier = tierFor(active, options.previous ?? null);
  const standing = lots.filter((l) => !l.folded);
  const used = new Set(standing.map((l) => lotKey(l.cell)));
  // A district is in use once a building stands in it; the centre always is.
  const slots = new Map<string, PlanDistrict>();
  const district = (slot: DistrictSlot): PlanDistrict => {
    let d = slots.get(slotKey(slot));
    if (!d) {
      d = { slot, zoneId: zoneAt.get(slotKey(slot)) ?? DEFAULT_ZONE_ID, central: slot.x === 0 && slot.z === 0, bounds: slotBounds(slot), crossing: slotCrossing(slot), lots: [], greens: [] };
      slots.set(slotKey(slot), d);
    }
    return d;
  };
  district(CENTRAL_SLOT);
  for (const lot of standing) district(lot.slot).lots.push(lot);
  for (const d of slots.values()) {
    d.greens = districtBlocks(d.slot).filter((block) => block.lots.some((lot) => used.has(lotKey(lot)))).map((block) => block.green);
  }
  // Districts in the order their slots were given out, the centre first.
  const order = new Map(districts.map((d, i) => [slotKey(d.slot), i + 1]));
  const inUse = [...slots.values()].sort((a, b) => (a.central ? 0 : (order.get(slotKey(a.slot)) ?? 1e6)) - (b.central ? 0 : (order.get(slotKey(b.slot)) ?? 1e6)));
  const usedSlots = inUse.map((d) => d.slot);

  const seed = townSeed(doc.plots);
  const landmarks = landmarksArrived(seed, doc.plots.length);
  const cells = lots.map((l) => l.cell);
  return {
    tier,
    active,
    seed,
    lots,
    districts: inUse,
    civic: civicStage(tier),
    landmarks,
    staked: tier === "clearing" && !used.has(lotKey(CENTRE_LOT)) ? CENTRE_LOT : null,
    ground: groundExtent(tier, cells, landmarks),
    streets: streets(tier, cells),
    roads: districtRoads(usedSlots),
    borders: districtBorders(usedSlots),
    oldQuarter: fold,
  };
}

/** The lot of a building in a plan. */
export function planLot(plan: TownPlan, slug: string): PlanLot | undefined {
  return plan.lots.find((l) => l.slug === slug);
}

/** A stable key of what the plan places where: when it changes, the town must be laid out again. */
export function planKey(plan: TownPlan): string {
  return `${plan.tier}|${plan.oldQuarter ? 1 : 0}|${plan.landmarks.join()}|${plan.lots.map((l) => `${l.slug}@${lotKey(l.cell)}${l.archived ? "a" : ""}`).join(";")}`;
}

/** A plot's ground in world units, with `pad` around it. */
export const planLotBounds = (lot: PlanLot, pad = 0): Bounds => lotBounds(lot.cell, pad);
