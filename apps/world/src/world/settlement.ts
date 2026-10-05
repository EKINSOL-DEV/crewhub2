/* The settlement: where everything in the town stands, at any size. Pure (no Three.js, no DOM), so it runs under
   `node --test`; every other part of the world reads it. See "Scale and zones" in the demo-mode spec.

   Lots. The town stands on a lattice of square lots of one pitch (a 24-unit plot plus a 6-unit street). A plot in
   the town document is a lot coordinate, with the centre lot at { x: 64, z: 64 }. World units: x east, z south
   (towards the home camera).

   Districts. Each zone owns a district: a cell of the coarse lattice (`DISTRICT_SPAN` lots), given out as slots that
   spiral out from the centre. A district has a fixed growth sequence, a list of lot offsets that depends on nothing
   but the index: the hamlet's lot by the green first, then the lots around that green, then further blocks around
   small greens of their own. The last column and row of a district cell are never built on: they are the border to
   the next district (the stream, a hedge, a bridge, a gate). A zone that fills its district gets a further slot.

   Reserved. The central district keeps two rows north of its first street for the town itself: the lodge that
   becomes the town hall, the mail hut that becomes the post office, the square, the café, the bus stop and the
   landmarks. No project ever stands there, so the civic buildings grow in place and never move either.

   Nothing here moves a building. `allocate` only adds: a project gets the next free lot of its zone's sequence the
   first time it is seen, and keeps it. `tidy` and a hand move are the only ways a lot changes, and both are explicit
   edits of the town document. */
import { DEFAULT_ZONE_ID } from "@crewhub/world-model";
import type { District, DistrictSlot, GridCell, PlotLot, TownDocument, TownEdit } from "@crewhub/world-model";
import { GREEN_BELT, PITCH, PLOT_SIZE, STREET, type Bounds, type PlotSpot } from "./townLayout.ts";

/* ── Lots ─────────────────────────────────────────────────────────────── */

export const CENTRE_LOT: GridCell = { x: 64, z: 64 };
/** The lattice's range (the town document's cell range). */
export const LOT_MAX = 127;

/** World position of a lot's centre. The centre lot sits just south-west of the town's main crossing. */
export function lotCentre(cell: GridCell): PlotSpot {
  return { x: (cell.x - CENTRE_LOT.x) * PITCH - PITCH / 2, z: (cell.z - CENTRE_LOT.z) * PITCH - PITCH / 2 };
}
/** The lot whose plot or surrounding street holds a world position. */
export function lotAt(x: number, z: number): GridCell {
  return { x: Math.floor(x / PITCH) + CENTRE_LOT.x + 1, z: Math.floor(z / PITCH) + CENTRE_LOT.z + 1 };
}
/** A lot's plot in world units, without the street around it. */
export function lotBounds(cell: GridCell, pad = 0): Bounds {
  const c = lotCentre(cell),
    half = PLOT_SIZE / 2 + pad;
  return { minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half };
}
export const lotKey = (cell: GridCell): string => `${cell.x},${cell.z}`;
const sameLot = (a: GridCell, b: GridCell) => a.x === b.x && a.z === b.z;

/* ── Districts ────────────────────────────────────────────────────────── */

/** A district cell in lots: six columns and five rows to build on, and one column and one row of border. */
export const DISTRICT_SPAN = { x: 7, z: 6 } as const;
/** District-local offsets of the buildable area, relative to the district's origin lot. */
const LOCAL = { minX: -2, maxX: 3, minZ: -2, maxZ: 2 } as const;
/** Slots run from `-SLOT_MAX` to `SLOT_MAX` on both axes (the town document's limit), so every lot stays in range. */
export const SLOT_MAX = 8;
export const CENTRAL_SLOT: DistrictSlot = { x: 0, z: 0 };

type Offset = readonly [dx: number, dz: number];

/**
 * The central district. Its first four lots are the village's street, facing the square across the civic lane; the
 * hamlet's lot is the first, beside the main street. Then two blocks grow south of the street, either side of the
 * main street and each around a green of its own, and the street's two ends come last.
 */
const CENTRAL_LOTS: readonly Offset[] = [
  [0, 0], [1, 0], [-1, 0], [2, 0],
  [1, 1], [0, 1], [1, 2], [0, 2], [3, 1], [-2, 1], [2, 2], [-1, 2], [3, 2], [-2, 2],
  [3, 0], [-2, 0],
];
const CENTRAL_GREENS: readonly Offset[] = [[2, 1], [-1, 1]];
/**
 * Any other district: four blocks of five lots, each a U around its green and open to the south, so the home camera
 * looks into it. The first lot is the one that faces the first green; every later lot touches the ones before it.
 */
const OUTER_LOTS: readonly Offset[] = [
  [-1, -1], [-2, -1], [0, -1], [-2, 0], [0, 0],
  [1, -1], [2, -1], [3, -1], [1, 0], [3, 0],
  [-1, 1], [-2, 1], [0, 1], [-2, 2], [0, 2],
  [2, 1], [1, 1], [3, 1], [1, 2], [3, 2],
];
const OUTER_GREENS: readonly Offset[] = [[-1, 0], [2, 0], [-1, 2], [2, 2]];

export const slotKey = (slot: DistrictSlot): string => `${slot.x},${slot.z}`;
const isCentral = (slot: DistrictSlot) => slot.x === 0 && slot.z === 0;
/**
 * Whether a district may stand on a slot. The column straight north of the centre stays open country: the chapel
 * and the windmill keep the skyline behind the square, and no road has to cross the civic rows.
 */
export function slotAllowed(slot: DistrictSlot): boolean {
  return Math.abs(slot.x) <= SLOT_MAX && Math.abs(slot.z) <= SLOT_MAX && !(slot.x === 0 && slot.z < 0);
}

/** The district's origin lot: the lot north-west of its main crossing. */
export function slotOrigin(slot: DistrictSlot): GridCell {
  return { x: CENTRE_LOT.x + slot.x * DISTRICT_SPAN.x, z: CENTRE_LOT.z + slot.z * DISTRICT_SPAN.z };
}
const absolute = (slot: DistrictSlot, offsets: readonly Offset[]): GridCell[] => {
  const o = slotOrigin(slot);
  return offsets.map(([dx, dz]) => ({ x: o.x + dx, z: o.z + dz }));
};
/** A district's growth sequence as lots, in order. It depends on the slot only. */
export function districtLots(slot: DistrictSlot): GridCell[] {
  return absolute(slot, isCentral(slot) ? CENTRAL_LOTS : OUTER_LOTS);
}
/** A district's greens as lots, in the order their blocks grow. The central district's first green is the square. */
export function districtGreens(slot: DistrictSlot): GridCell[] {
  return absolute(slot, isCentral(slot) ? CENTRAL_GREENS : OUTER_GREENS);
}
/**
 * A district's blocks: each green with the lots that stand around it as one neighbourhood, in the order the blocks
 * grow. The central district's first four lots belong to no block: their green is the square.
 */
export function districtBlocks(slot: DistrictSlot): { green: GridCell; lots: GridCell[] }[] {
  const lots = districtLots(slot);
  return districtGreens(slot).map((green, block) => ({
    green,
    lots: isCentral(slot) ? lots.slice(4, 14).filter((lot) => (lot.x > CENTRE_LOT.x) === (green.x > CENTRE_LOT.x)) : lots.slice(block * 5, block * 5 + 5),
  }));
}
/** The slot whose district cell holds a lot. */
export function slotOf(cell: GridCell): DistrictSlot {
  return {
    x: Math.floor((cell.x - CENTRE_LOT.x - LOCAL.minX) / DISTRICT_SPAN.x),
    z: Math.floor((cell.z - CENTRE_LOT.z - LOCAL.minZ) / DISTRICT_SPAN.z),
  };
}

export type LotKind = "lot" | "green" | "reserved" | "border";
/**
 * What a lot is for. Only a `lot` can hold a building; `index` is its place in the district's growth sequence.
 * `reserved` is the central district's civic ground, `border` everything no district builds on.
 */
export function lotKind(cell: GridCell): { kind: LotKind; slot: DistrictSlot; index: number } {
  const slot = slotOf(cell);
  const none = { slot, index: -1 };
  if (cell.x < 0 || cell.z < 0 || cell.x > LOT_MAX || cell.z > LOT_MAX || !slotAllowed(slot)) return { kind: "border", ...none };
  const index = districtLots(slot).findIndex((lot) => sameLot(lot, cell));
  if (index >= 0) return { kind: "lot", slot, index };
  if (districtGreens(slot).some((green) => sameLot(green, cell))) return { kind: "green", ...none };
  if (isCentral(slot) && reservedLots().some((lot) => sameLot(lot, cell))) return { kind: "reserved", ...none };
  return { kind: "border", ...none };
}

/** The slots in the order they are given out: ring by ring from the centre, east first, then south, west, north. */
export function slotSpiral(): DistrictSlot[] {
  const slots: DistrictSlot[] = [];
  for (let x = -SLOT_MAX; x <= SLOT_MAX; x++) for (let z = -SLOT_MAX; z <= SLOT_MAX; z++) if (slotAllowed({ x, z })) slots.push({ x, z });
  // East is angle 0; z grows south, so the turn runs east, south, west, north.
  const turn = (s: DistrictSlot) => (Math.atan2(s.z, s.x) + 2 * Math.PI) % (2 * Math.PI);
  const ring = (s: DistrictSlot) => Math.max(Math.abs(s.x), Math.abs(s.z));
  return slots.sort((a, b) => ring(a) - ring(b) || Math.abs(a.x) + Math.abs(a.z) - (Math.abs(b.x) + Math.abs(b.z)) || turn(a) - turn(b));
}
const SPIRAL = slotSpiral();

/** A district cell in world units: its buildable lots with their streets, without the border column and row. */
export function slotBounds(slot: DistrictSlot): Bounds {
  const o = slotOrigin(slot);
  const a = lotBounds({ x: o.x + LOCAL.minX, z: o.z + LOCAL.minZ }, STREET / 2),
    b = lotBounds({ x: o.x + LOCAL.maxX, z: o.z + LOCAL.maxZ }, STREET / 2);
  return { minX: a.minX, maxX: b.maxX, minZ: a.minZ, maxZ: b.maxZ };
}
/** The district's main crossing: south-east corner of its origin lot, on the street lines the district roads follow. */
export function slotCrossing(slot: DistrictSlot): PlotSpot {
  const c = lotCentre(slotOrigin(slot));
  return { x: c.x + PITCH / 2, z: c.z + PITCH / 2 };
}

/* ── The reserved civic ground ────────────────────────────────────────── */

export type CivicSpotId = "town-hall" | "post-office" | "square" | "cafe" | "bus-stop";
export type LandmarkId = "windmill" | "chapel" | "bandstand" | "farm" | "cottages-west" | "cottages-east";
export type SpotId = CivicSpotId | LandmarkId;
export const LANDMARK_IDS: readonly LandmarkId[] = ["bandstand", "cottages-west", "windmill", "chapel", "farm", "cottages-east"];

/** A spot on the reserved ground: the centre and the size of what will stand there, in world units. */
export interface ReservedSpot {
  id: SpotId;
  kind: "civic" | "landmark";
  x: number;
  z: number;
  width: number;
  depth: number;
}

const CIVIC_Z = lotCentre({ x: CENTRE_LOT.x, z: CENTRE_LOT.z - 1 }).z;
/**
 * The reserved spots, all in the central district's two civic rows. The town hall's spot is the lodge's (a clearing
 * and a hamlet have the lodge), the post office's is the mailbox's and the mail hut's: they grow in place.
 */
export const RESERVED_SPOTS: readonly ReservedSpot[] = [
  { id: "post-office", kind: "civic", x: -PITCH, z: CIVIC_Z, width: 12, depth: 12 },
  { id: "town-hall", kind: "civic", x: PITCH, z: CIVIC_Z, width: 12, depth: 12 },
  { id: "square", kind: "civic", x: 0, z: CIVIC_Z + 1, width: 10, depth: 10 },
  { id: "cafe", kind: "civic", x: -13, z: CIVIC_Z + 3, width: 5, depth: 4 },
  { id: "bus-stop", kind: "civic", x: 13.5, z: CIVIC_Z + 11.4, width: 3, depth: 1.5 },
  { id: "bandstand", kind: "landmark", x: 14.5, z: CIVIC_Z - 7.6, width: 6.8, depth: 6.4 },
  { id: "chapel", kind: "landmark", x: 0, z: CIVIC_Z - 13.5, width: 9.2, depth: 18.6 },
  { id: "windmill", kind: "landmark", x: 43, z: CIVIC_Z - 17.8, width: 7.2, depth: 7.2 },
  { id: "farm", kind: "landmark", x: 55.5, z: CIVIC_Z - 17.5, width: 15, depth: 10 },
  { id: "cottages-west", kind: "landmark", x: -2.5 * PITCH, z: CIVIC_Z, width: 20, depth: 20 },
  { id: "cottages-east", kind: "landmark", x: 2.5 * PITCH, z: CIVIC_Z, width: 20, depth: 20 },
];
export function reservedSpot(id: SpotId): ReservedSpot {
  return RESERVED_SPOTS.find((spot) => spot.id === id)!;
}
export const spotBounds = (spot: ReservedSpot, pad = 0): Bounds => ({
  minX: spot.x - spot.width / 2 - pad,
  maxX: spot.x + spot.width / 2 + pad,
  minZ: spot.z - spot.depth / 2 - pad,
  maxZ: spot.z + spot.depth / 2 + pad,
});

/** The lots no project ever takes: the central district's two civic rows, the full width of the district. */
export function reservedLots(): GridCell[] {
  const lots: GridCell[] = [];
  for (let dz = LOCAL.minZ; dz < 0; dz++) for (let dx = LOCAL.minX; dx <= LOCAL.maxX; dx++) lots.push({ x: CENTRE_LOT.x + dx, z: CENTRE_LOT.z + dz });
  return lots;
}
/** The reserved ground in world units: the reserved lots and the streets between them, up to the civic lane. */
export function reservedBounds(): Bounds {
  const lots = reservedLots();
  const a = lotBounds(lots[0]!, STREET / 2),
    b = lotBounds(lots[lots.length - 1]!, STREET / 2);
  return { minX: a.minX, maxX: b.maxX, minZ: a.minZ, maxZ: b.maxZ };
}

/* ── Tiers ────────────────────────────────────────────────────────────── */

export type Tier = "clearing" | "hamlet" | "village" | "town" | "region";
export const TIERS: readonly Tier[] = ["clearing", "hamlet", "village", "town", "region"];
/** The number of projects that are not archived at which a tier is entered. */
export const TIER_THRESHOLD: Record<Tier, number> = { clearing: 0, hamlet: 1, village: 2, town: 5, region: 10 };
/** A tier is left only this many projects below its threshold, so one project coming and going does not flap it. */
export const TIER_HYSTERESIS = 2;

/**
 * The tier for `count` projects that are not archived. Growing enters a tier at its threshold; shrinking leaves the
 * `previous` tier only `TIER_HYSTERESIS` below it. No project at all is always a clearing.
 */
export function tierFor(count: number, previous: Tier | null = null): Tier {
  if (count <= 0) return "clearing";
  let base: Tier = "hamlet";
  for (const tier of TIERS) if (count >= TIER_THRESHOLD[tier]) base = tier;
  if (!previous || TIERS.indexOf(previous) <= TIERS.indexOf(base)) return base;
  for (let i = TIERS.indexOf(previous); i > TIERS.indexOf(base); i--) if (count > TIER_THRESHOLD[TIERS[i]!] - TIER_HYSTERESIS) return TIERS[i]!;
  return base;
}

/** What the civic spots hold at a tier. The pieces grow in place: the lodge into the town hall, and so on. */
export interface CivicStage {
  hall: "lodge" | "town-hall";
  post: "mailbox" | "mail-hut" | "post-office";
  /** A small green with the welcome sign, or the paved square with the fountain. */
  square: "green" | "square";
  cafe: boolean;
  busStop: boolean;
}
export function civicStage(tier: Tier): CivicStage {
  const town = tier === "town" || tier === "region";
  return {
    hall: town ? "town-hall" : "lodge",
    post: town ? "post-office" : tier === "clearing" ? "mailbox" : "mail-hut",
    square: tier === "clearing" || tier === "hamlet" ? "green" : "square",
    cafe: town,
    busStop: town,
  };
}

/** A stable number for a town: its founding project's slug (the first plot), 0 for an empty town. */
export function townSeed(plots: readonly { slug: string }[]): number {
  const slug = plots[0]?.slug ?? "";
  let h = slug ? 7 : 0;
  for (let i = 0; i < slug.length; i++) h = (Math.imul(h, 31) + slug.charCodeAt(i)) >>> 0;
  return h;
}
/** The plot counts at which landmarks arrive; which landmark gets which count is the town's own (its seed). */
const ARRIVALS = [3, 4, 6, 7, 9, 12] as const;
/**
 * The number of plots (archived ones included: a town does not lose its windmill) at which each landmark arrives.
 * Seeded by the town, so the same town always grows the same way and two towns do not.
 */
export function landmarkArrivals(seed: number): Record<LandmarkId, number> {
  const order = [...LANDMARK_IDS];
  let s = (seed >>> 0) || 1;
  for (let i = order.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return Object.fromEntries(order.map((id, i) => [id, ARRIVALS[i]!])) as Record<LandmarkId, number>;
}
/** The landmarks that have arrived in a town of `plotCount` plots, in the order they came. */
export function landmarksArrived(seed: number, plotCount: number): LandmarkId[] {
  const arrivals = landmarkArrivals(seed);
  return LANDMARK_IDS.filter((id) => arrivals[id] <= plotCount).sort((a, b) => arrivals[a] - arrivals[b]);
}

/* ── Ground, streets, roads and borders ───────────────────────────────── */

const union = (rects: readonly Bounds[]): Bounds => ({
  minX: Math.min(...rects.map((r) => r.minX)),
  maxX: Math.max(...rects.map((r) => r.maxX)),
  minZ: Math.min(...rects.map((r) => r.minZ)),
  maxZ: Math.max(...rects.map((r) => r.maxZ)),
});
/** Street and green belt around whatever stands at the ground's edge. */
const GROUND_MARGIN = STREET + GREEN_BELT;

/**
 * The ground at a tier: the tier's civic core, every landmark that has arrived and every allocated lot (in use or
 * boarded up), with a street and the green belt around them. It only ever grows with the lots: a tier never moves one.
 */
export function groundExtent(tier: Tier, lots: readonly GridCell[], arrived: readonly LandmarkId[] = []): Bounds {
  const core: Bounds[] = (["post-office", "town-hall", "square"] as const).map((id) => spotBounds(reservedSpot(id)));
  // The staked-out plot of a clearing is the hamlet's lot, so the first building goes up where the stakes stood.
  core.push(lotBounds(CENTRE_LOT));
  if (tier !== "clearing" && tier !== "hamlet") for (const lot of districtLots(CENTRAL_SLOT).slice(0, 4)) core.push(lotBounds(lot), lotBounds({ x: lot.x, z: lot.z - 1 }));
  if (tier === "town" || tier === "region") for (const id of ["cafe", "bus-stop"] as const) core.push(spotBounds(reservedSpot(id)));
  const all = union([...core, ...arrived.map((id) => spotBounds(reservedSpot(id))), ...lots.map((lot) => lotBounds(lot))]);
  return { minX: all.minX - GROUND_MARGIN, maxX: all.maxX + GROUND_MARGIN, minZ: all.minZ - GROUND_MARGIN, maxZ: all.maxZ + GROUND_MARGIN };
}

/** A straight piece of street or road: its centre line, along x or along z. */
export interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * The streets between the lots in use, as centre lines on the lattice's street lines, joined into straight runs.
 * A village and anything larger has a street on every side of every used lot. A clearing and a hamlet have one lane:
 * from the mail hut along the civic lane to the lodge, and down the main street past the hamlet's lot to its gate.
 */
export function streets(tier: Tier, lots: readonly GridCell[]): Segment[] {
  // Unit edges by lattice line: `h` runs along x on the north side of lot (x, z), `v` along z on its west side.
  const h = new Set<string>(),
    v = new Set<string>();
  const around = (lot: GridCell) => {
    h.add(lotKey(lot)).add(lotKey({ x: lot.x, z: lot.z + 1 }));
    v.add(lotKey(lot)).add(lotKey({ x: lot.x + 1, z: lot.z }));
  };
  const small = tier === "clearing" || tier === "hamlet";
  h.add(lotKey(CENTRE_LOT)).add(lotKey({ x: CENTRE_LOT.x + 1, z: CENTRE_LOT.z }));
  for (const lot of lots) {
    if (small && sameLot(lot, CENTRE_LOT)) {
      v.add(lotKey({ x: lot.x + 1, z: lot.z }));
      h.add(lotKey({ x: lot.x, z: lot.z + 1 }));
    } else around(lot);
  }
  const cells = (set: Set<string>) => [...set].map((key) => key.split(",").map(Number) as [number, number]);
  const runs: Segment[] = [];
  const join = (edges: [number, number][], along: 0 | 1) => {
    const lines = new Map<number, number[]>();
    for (const edge of edges) lines.set(edge[1 - along]!, [...(lines.get(edge[1 - along]!) ?? []), edge[along]!]);
    for (const [line, at] of [...lines].sort((a, b) => a[0] - b[0])) {
      at.sort((a, b) => a - b);
      for (let i = 0; i < at.length; ) {
        let j = i;
        while (j + 1 < at.length && at[j + 1] === at[j]! + 1) j++;
        // The lot's north-west street corner; a run ends at the corner past its last lot.
        const from = lotCentre(along === 0 ? { x: at[i]!, z: line } : { x: line, z: at[i]! }),
          to = lotCentre(along === 0 ? { x: at[j]! + 1, z: line } : { x: line, z: at[j]! + 1 });
        runs.push({ x0: from.x - PITCH / 2, z0: from.z - PITCH / 2, x1: to.x - PITCH / 2, z1: to.z - PITCH / 2 });
        i = j + 1;
      }
    }
  };
  join(cells(h), 0);
  join(cells(v), 1);
  return runs;
}

/** The slot one step closer to the centre: along z first, so no road runs through the column north of the centre. */
function towardsCentre(slot: DistrictSlot): DistrictSlot {
  if (slot.z !== 0 && (slot.x !== 0 || slot.z > 0)) return { x: slot.x, z: slot.z - Math.sign(slot.z) };
  return { x: slot.x - Math.sign(slot.x), z: slot.z };
}
/**
 * The roads that join districts to the centre: one straight piece per step, crossing to crossing, along street lines
 * (so inside a district a road is one of its streets). A district behind an empty slot still gets its road through it.
 */
export function districtRoads(slots: readonly DistrictSlot[]): (Segment & { from: DistrictSlot; to: DistrictSlot })[] {
  const roads = new Map<string, Segment & { from: DistrictSlot; to: DistrictSlot }>();
  for (let slot of slots)
    while (!isCentral(slot)) {
      const to = towardsCentre(slot);
      const a = slotCrossing(slot),
        b = slotCrossing(to);
      if (roads.has(slotKey(slot))) break;
      roads.set(slotKey(slot), { x0: a.x, z0: a.z, x1: b.x, z1: b.z, from: slot, to });
      slot = to;
    }
  return [...roads.values()];
}

/** The border between two neighbouring districts: the strip of lots neither builds on, and where the road crosses it. */
export interface DistrictBorder {
  a: DistrictSlot;
  b: DistrictSlot;
  /** The strip in world units: one lot wide between east-west neighbours, between north-south neighbours too. */
  strip: Bounds;
  /** Where the districts' road crosses the strip (a bridge, a gate), or null when no road runs between the two. */
  crossing: PlotSpot | null;
}
/** The borders between every two districts in use that touch, west to east and north to south. */
export function districtBorders(slots: readonly DistrictSlot[]): DistrictBorder[] {
  const used = new Set(slots.map(slotKey));
  const roads = districtRoads(slots);
  const joined = (a: DistrictSlot, b: DistrictSlot) => roads.some((r) => (slotKey(r.from) === slotKey(a) && slotKey(r.to) === slotKey(b)) || (slotKey(r.from) === slotKey(b) && slotKey(r.to) === slotKey(a)));
  const borders: DistrictBorder[] = [];
  for (const a of slots) {
    const o = slotOrigin(a),
      area = slotBounds(a),
      cross = slotCrossing(a);
    const east = { x: a.x + 1, z: a.z },
      south = { x: a.x, z: a.z + 1 };
    if (used.has(slotKey(east))) {
      const gap = lotBounds({ x: o.x + LOCAL.maxX + 1, z: o.z }, STREET / 2);
      borders.push({ a, b: east, strip: { minX: gap.minX, maxX: gap.maxX, minZ: area.minZ, maxZ: area.maxZ + PITCH }, crossing: joined(a, east) ? { x: (gap.minX + gap.maxX) / 2, z: cross.z } : null });
    }
    if (used.has(slotKey(south))) {
      const gap = lotBounds({ x: o.x, z: o.z + LOCAL.maxZ + 1 }, STREET / 2);
      borders.push({ a, b: south, strip: { minX: area.minX, maxX: area.maxX + PITCH, minZ: gap.minZ, maxZ: gap.maxZ }, crossing: joined(a, south) ? { x: cross.x, z: (gap.minZ + gap.maxZ) / 2 } : null });
    }
  }
  return borders;
}

/* ── Allocation ───────────────────────────────────────────────────────── */

/** The part of the town document the layout reads and writes. */
export interface Settlement {
  plots: readonly PlotLot[];
  districts: readonly District[];
}
/** A project as the layout sees it: its slug and the zone it belongs to now. */
export interface Settler {
  slug: string;
  zoneId?: string;
}
export const settlementOf = (doc: Pick<TownDocument, "plots" | "districts">): Settlement => ({ plots: doc.plots, districts: doc.districts ?? [] });
const zoneOf = (item: { zoneId?: string }) => item.zoneId ?? DEFAULT_ZONE_ID;

/** The zone whose district a lot lies in, or null where no district stands (yet). */
export function districtZoneAt(settlement: Settlement, cell: GridCell): string | null {
  const key = slotKey(slotOf(cell));
  return settlement.districts.find((d) => slotKey(d.slot) === key)?.zoneId ?? null;
}

/** The free slot nearest to `near` (the centre for a zone's first district, its first slot for a further one). */
function freeSlot(districts: readonly District[], near: DistrictSlot): DistrictSlot | null {
  const taken = new Set(districts.map((d) => slotKey(d.slot)));
  for (const step of SPIRAL) {
    const slot = { x: near.x + step.x, z: near.z + step.z };
    if (slotAllowed(slot) && !taken.has(slotKey(slot))) return slot;
  }
  return null;
}

/**
 * The next free lot of a zone's growth sequence: the first lot, through the zone's districts in the order they were
 * given out, that no plot stands on. A zone without a district, or with every lot taken, gets a new slot; it is
 * returned in `districts` and must be stored with the plot. Null only when the lattice is full.
 */
export function nextFreeLot(settlement: Settlement, zoneId: string = DEFAULT_ZONE_ID): { cell: GridCell; districts: District[] } | null {
  const taken = new Set(settlement.plots.map((p) => lotKey(p.cell)));
  const mine = settlement.districts.filter((d) => d.zoneId === zoneId);
  for (const district of mine) for (const lot of districtLots(district.slot)) if (!taken.has(lotKey(lot))) return { cell: lot, districts: [] };
  const opened: District[] = [];
  // A hand move may have filled a fresh district before its zone got there, so keep opening until a lot is free.
  for (;;) {
    const slot = freeSlot([...settlement.districts, ...opened], mine[0]?.slot ?? opened[0]?.slot ?? CENTRAL_SLOT);
    if (!slot) return null;
    opened.push({ zoneId, slot });
    for (const lot of districtLots(slot)) if (!taken.has(lotKey(lot))) return { cell: lot, districts: opened };
  }
}

/**
 * Gives every newcomer that has no plot yet the next free lot of its zone, in the order given. Existing plots and
 * districts are never touched. Returns only what is new.
 */
export function allocate(settlement: Settlement, newcomers: readonly Settler[]): { plots: PlotLot[]; districts: District[] } {
  const plots: PlotLot[] = [],
    districts: District[] = [];
  const known = new Set(settlement.plots.map((p) => p.slug));
  for (const settler of newcomers) {
    if (known.has(settler.slug)) continue;
    const zoneId = zoneOf(settler);
    const found = nextFreeLot({ plots: [...settlement.plots, ...plots], districts: [...settlement.districts, ...districts] }, zoneId);
    if (!found) break;
    known.add(settler.slug);
    districts.push(...found.districts);
    plots.push(zoneId === DEFAULT_ZONE_ID ? { slug: settler.slug, cell: found.cell } : { slug: settler.slug, cell: found.cell, zoneId });
  }
  return { plots, districts };
}

/** The edit that gives the buildings without a plot their lots, or null when every building has one. */
export function allocationEdit(doc: Pick<TownDocument, "plots" | "districts">, buildings: readonly Settler[]): TownEdit | null {
  const { plots, districts } = allocate(settlementOf(doc), buildings);
  if (!plots.length) return null;
  return districts.length ? { type: "allocate", plots, districts } : { type: "allocate", plots };
}

/**
 * "Tidy the town": every project re-laid by the current rules, as if they had arrived in this order today. Zones get
 * their districts in the order of `zoneOrder` (then in order of appearance), so the first zone holds the centre.
 * Plots of projects the world does not know now are kept, after the others. Apply it as one edit: one undo step.
 */
export function tidyEdit(doc: Pick<TownDocument, "plots" | "districts">, buildings: readonly Settler[], zoneOrder: readonly string[] = []): TownEdit {
  const present = new Set(buildings.map((b) => b.slug));
  const settlers: Settler[] = [...buildings, ...doc.plots.filter((p) => !present.has(p.slug)).map((p) => ({ slug: p.slug, zoneId: zoneOf(p) }))];
  const districts: District[] = [];
  for (const zoneId of [...zoneOrder, ...settlers.map(zoneOf)]) {
    if (districts.some((d) => d.zoneId === zoneId) || !settlers.some((s) => zoneOf(s) === zoneId)) continue;
    const slot = freeSlot(districts, CENTRAL_SLOT);
    if (slot) districts.push({ zoneId, slot });
  }
  const laid = allocate({ plots: [], districts }, settlers);
  return { type: "tidy", plots: laid.plots, districts: [...districts, ...laid.districts] };
}

/** Whether a building may be moved onto a lot by hand: a lot of some district's sequence that nothing stands on. */
export function canMoveTo(settlement: Settlement, cell: GridCell): boolean {
  return lotKind(cell).kind === "lot" && !settlement.plots.some((p) => sameLot(p.cell, cell));
}
/**
 * The edit that moves a building by hand: to a lot (`cell`), or to another zone (`zoneId`), where it takes the zone's
 * next free lot. Null when the lot cannot be built on or is taken. A lot outside any district in use opens that
 * district for the building's zone, so its streets and borders are drawn.
 */
export function moveEdit(doc: Pick<TownDocument, "plots" | "districts">, slug: string, to: { cell: GridCell } | { zoneId: string }): TownEdit | null {
  const settlement = settlementOf(doc);
  const current = doc.plots.find((p) => p.slug === slug);
  if (!current) return null;
  if ("zoneId" in to) {
    const found = nextFreeLot({ plots: settlement.plots.filter((p) => p.slug !== slug), districts: settlement.districts }, to.zoneId);
    if (!found) return null;
    return { type: "move-plot", slug, cell: found.cell, zoneId: to.zoneId, ...(found.districts.length ? { districts: found.districts } : {}) };
  }
  if (!canMoveTo(settlement, to.cell)) return null;
  const slot = slotOf(to.cell);
  const open = settlement.districts.some((d) => slotKey(d.slot) === slotKey(slot));
  return { type: "move-plot", slug, cell: { ...to.cell }, ...(open ? {} : { districts: [{ zoneId: zoneOf(current), slot }] }) };
}
