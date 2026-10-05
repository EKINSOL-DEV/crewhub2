/* The town plan: the settlement as it stands right now, worked out once from the town document and the buildings and
   read by everything that draws or walks the town (the scene, the dressing, the navigation, the camera). Pure: no
   Three.js, no DOM. The lots come from the document; nothing here chooses or moves one. */
import { DEFAULT_ZONE_ID } from "@crewhub/world-model";
import type { District, DistrictSlot, GridCell, TextLine, TownDocument } from "@crewhub/world-model";
import {
  CENTRAL_SLOT,
  CENTRE_LOT,
  civicStage,
  districtBorders,
  districtLots,
  districtBlocks,
  districtRoads,
  groundExtent,
  landmarksArrived,
  lotBounds,
  lotCentre,
  lotKey,
  reservedSpot,
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
import { CIVIC_LOT, CIVIC_SIZE, PLOT_SIZE, type Bounds, type PlotSpot } from "./townLayout.ts";

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
  /** Buildings whose lot is still on its way (the allocation runs right after the world first sees a project). */
  pending: number;
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
    pending: buildings.length - lots.length,
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

/**
 * What the home camera frames, each rectangle with `margin` around it; the camera fits their projected corners. The
 * home view frames what exists:
 * - a clearing: the lodge, the mailbox and the staked-out plot;
 * - a hamlet: the building, with the lodge and the mail hut at the edge of the picture (see `HAMLET_CIVIC`);
 * - a village or a town: every building that stands, the two civic lots and the square;
 * - a region: every district's buildings, and the centre's civic lots.
 * Buildings folded into the old quarter are left out. `compact` (a portrait phone) frames tighter: each plot's
 * building area and the civic buildings without their lawns, so hedges and verges may run off the screen's edges.
 */
export function homeRects(plan: TownPlan, margin = 1.5, compact = false): Bounds[] {
  const square = (c: PlotSpot, half: number): Bounds => ({ minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
  const plotHalf = (compact ? PLOT_SIZE / 2 - 2 : PLOT_SIZE / 2) + margin,
    civicHalf = (compact ? CIVIC_LOT / 2 - 2 : CIVIC_LOT / 2) + margin,
    squareHalf = (compact ? CIVIC_SIZE.square.width / 2 - 1 : CIVIC_SIZE.square.width / 2) + margin;
  const civic = (["post-office", "town-hall"] as const).map((id) => square(reservedSpot(id), civicHalf));
  const green = square(reservedSpot("square"), squareHalf);
  const standing = plan.lots.filter((l) => !l.folded);
  if (plan.tier === "clearing") return [...civic, green, square(lotCentre(plan.staked ?? CENTRE_LOT), plotHalf), ...standing.map((l) => square(l.centre, plotHalf))];
  if (plan.tier === "hamlet") {
    // One project: the building is the picture. Archived neighbours stand outside it; the civic pair is cut to a sliver.
    const home = standing.filter((l) => !l.archived);
    return [...(home.length ? home : standing).map((l) => square(l.centre, plotHalf)), ...civic.map((r) => ({ ...r, minZ: r.maxZ - HAMLET_CIVIC }))];
  }
  return [...standing.map((l) => square(l.centre, plotHalf)), ...civic, green];
}
/**
 * How much of the lodge's and the mail hut's lots a hamlet's home view takes in, from their front edge: enough to
 * see that they are there, so the one building still fills the picture.
 */
const HAMLET_CIVIC = 5;

/**
 * Keyboard focus between buildings, by where they stand: an arrow key goes to the nearest building in that direction
 * (left is west, up is north, as on the old grid), preferring one in the same street; with none that way the focus
 * stays. Home and End go to the first and the last building in reading order (north to south, west to east).
 * `slugs` is the list the focus index counts in (`model.buildings`); returns the new index.
 */
export function moveFocus(plan: TownPlan, slugs: readonly string[], index: number, key: string): number {
  const lots = new Map(plan.lots.map((l) => [l.slug, l.centre]));
  const placed = slugs.map((slug, i) => ({ i, at: lots.get(slug) })).filter((p): p is { i: number; at: PlotSpot } => !!p.at);
  if (!placed.length) return 0;
  const current = placed.find((p) => p.i === index) ?? placed[0]!;
  const reading = [...placed].sort((a, b) => a.at.z - b.at.z || a.at.x - b.at.x);
  if (key === "Home") return reading[0]!.i;
  if (key === "End") return reading[reading.length - 1]!.i;
  const step: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = step[key];
  if (!direction) return current.i;
  let best = current,
    bestCost = Infinity;
  for (const p of placed) {
    const dx = p.at.x - current.at.x,
      dz = p.at.z - current.at.z;
    const along = dx * direction[0] + dz * direction[1],
      across = Math.abs(dx * direction[1]) + Math.abs(dz * direction[0]);
    // Only buildings ahead, and not more to the side than ahead: a diagonal neighbour belongs to the other axis.
    if (along <= 0 || across > along) continue;
    const cost = along + across * 2;
    if (cost < bestCost) {
      best = p;
      bestCost = cost;
    }
  }
  return best.i;
}

/** A lot a building can be moved to by hand: free, in a district that is in use. */
export interface FreeLot {
  cell: GridCell;
  centre: PlotSpot;
  slot: DistrictSlot;
  /** The zone whose district the lot lies in. */
  zoneId: string;
  /** The lot's number in its district: its place in the growth sequence, from 1. */
  number: number;
  /** The district's next free lot: where its zone's next project would go. */
  next: boolean;
}
/** Every free lot of the districts in use, district by district in growth order. */
export function freeLots(plan: TownPlan, plots: readonly { cell: GridCell }[]): FreeLot[] {
  const taken = new Set(plots.map((p) => lotKey(p.cell)));
  return plan.districts.flatMap((d) => {
    let next = true;
    return districtLots(d.slot).flatMap((cell, index): FreeLot[] => {
      if (taken.has(lotKey(cell))) return [];
      const lot = { cell, centre: lotCentre(cell), slot: d.slot, zoneId: d.zoneId, number: index + 1, next };
      next = false;
      return [lot];
    });
  });
}

const TIER_WORDS: Record<Tier, string> = { clearing: "a clearing", hamlet: "a hamlet", village: "a village", town: "a town", region: "a region" };
const LANDMARK_WORDS: Record<LandmarkId, string> = { windmill: "the windmill", chapel: "the chapel", bandstand: "the bandstand", farm: "the farm corner", "cottages-west": "the west cottages", "cottages-east": "the east cottages" };
const list = (words: readonly string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

/**
 * The text view's lines about the settlement: what it is at this size, what has arrived, and where the archived
 * buildings are. `nameOf` gives a building's name for its slug.
 */
export function describePlan(plan: TownPlan, nameOf: (slug: string) => string): TextLine[] {
  const lines: TextLine[] = [];
  const line = (text: string) => lines.push({ section: "Town layout", text, kind: "cosmetic" });
  const archived = plan.lots.filter((l) => l.archived);
  const count = `${plan.active} project${plan.active === 1 ? "" : "s"}`;
  if (plan.tier === "clearing") line("The settlement is a clearing: a lodge, a mailbox and one staked-out plot, waiting for the first project.");
  else line(`The settlement is ${TIER_WORDS[plan.tier]} of ${count}${plan.districts.length > 1 ? ` in ${plan.districts.length} districts` : ""}. A building keeps its plot; only Tidy the town or a move by hand (build mode) changes one.`);
  if (plan.landmarks.length) line(`Grown with the town: ${list(plan.landmarks.map((id) => LANDMARK_WORDS[id]))}.`);
  if (archived.length) {
    const names = list(archived.map((l) => nameOf(l.slug)));
    line(plan.oldQuarter ? `Archived, folded into the old quarter behind the town (your setting): ${names}. Their plots stay theirs.` : `Archived, boarded up on ${archived.length === 1 ? "its plot" : "their plots"}: ${names}.`);
  }
  const elsewhere = plan.lots.filter((l) => !l.folded && l.zoneId !== l.districtZoneId);
  if (elsewhere.length) line(`Standing in another district than their zone's: ${list(elsewhere.map((l) => nameOf(l.slug)))}.`);
  if (plan.pending) line(`${plan.pending} new project${plan.pending === 1 ? " is" : "s are"} getting a plot.`);
  return lines;
}
