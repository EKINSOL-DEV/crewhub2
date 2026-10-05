/* The dressing of a settlement at any size: a clearing, a hamlet, a village, a town or a region of districts. Pure and
   deterministic like townDressing.ts (no Three.js, no DOM, no Math.random), whose pieces it reuses: the same plan
   always gives the same town. It reads a `DressPlan` (`dressPlan` makes one from the town plan of townPlan.ts), so
   nothing here decides where a lot, a street or a civic spot is; it decides what stands there.

   What a tier looks like:
   - Clearing: a glade in the woods. The lodge, a post box on a flagstone pad, the welcome sign on a small green and one
     staked-out plot with a sign that says what to do next, joined by one lane.
   - Hamlet: the first building on the staked plot's spot, the lodge and the mail hut close by, the lane and the green.
   - Village: one street, the paved square with its fountain, the promenade between the lodge and the mail hut.
   - Town: the town hall, the post office, the café, the bus stop, the park with its pond, the orchard and the market.
   - Region: districts joined by roads. A stream runs along the border between a district and the one south of it, a
     hedgerow between a district and the one east of it; a road crosses on a bridge or through a gap, under a gate with
     the district's name. A district's first green is its small centre; the other greens are pocket parks, so with one
     zone the blocks read as neighbourhoods without names.
   Landmarks (bandstand, chapel, windmill, farm corner, cottages) are dressed once the plan says they have arrived. */
import { civicCenter, CIVIC_LOT, CIVIC_SIZE, PITCH, PLOT_SIZE, type Bounds, type PlotSpot } from "./townLayout.ts";
import {
  COBBLE_Y,
  detail,
  drift,
  fence,
  garden,
  GARDEN_PATH,
  GRASS_Y,
  LANE,
  LAWN_Y,
  noise,
  paving,
  pocket,
  slugSeed,
  wear,
  type Add,
  type DressedPlot,
  type Dressing,
  type PlotUse,
  type Tree,
} from "./townDressing.ts";

export type Tier = "clearing" | "hamlet" | "village" | "town" | "region";

/** A straight piece of street or road: its centre line, along x or along z (settlement.ts's `Segment`). */
export interface PlanSegment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** A lot with a building on it. */
export interface PlanLot extends DressedPlot {
  centre: PlotSpot;
  /** z of the middle of the lane the garden path runs down to. */
  lane: number;
}
/** A green whose block has begun: a pocket park, or (`centre`) the small centre of an outer district. */
export interface PlanGreen {
  x: number;
  z: number;
  seed: number;
  centre?: boolean;
}
/** A district in use: its buildable ground and what its gate says. */
export interface PlanDistrict {
  /** The zone's id; `Dressing.district` carries it, so the renderer can build the pieces in the zone's look. */
  id: string;
  name: string | null;
  /** The zone's colour as a palette name, for the gate's board. */
  accent: string | null;
  /** The zone's emblem, for the mark on the gate's beam. */
  emblem?: string | null;
  bounds: Bounds;
}
/** A road between two neighbouring district crossings, from the outer one (x0, z0) towards the centre; `name` and
 *  `accent` are those of the district it leads out to. */
export interface PlanRoad extends PlanSegment {
  name: string | null;
  accent: string | null;
  emblem?: string | null;
}
/** The border strip between two neighbouring districts in use. */
export interface PlanBorder {
  strip: Bounds;
  /** Where the districts' road crosses it, or null. */
  crossing: PlotSpot | null;
}
export interface PlanCivic {
  hall: "lodge" | "town-hall";
  post: "mailbox" | "mail-hut" | "post-office";
  square: "green" | "square";
  cafe: boolean;
  busStop: boolean;
}
export type PlanLandmark = "windmill" | "chapel" | "bandstand" | "farm" | "cottages-west" | "cottages-east";

export interface DressPlan {
  tier: Tier;
  /** The whole ground. */
  ground: Bounds;
  /** The town's own number (its founding project), for what varies from town to town. */
  seed: number;
  lots: readonly PlanLot[];
  greens: readonly PlanGreen[];
  streets: readonly PlanSegment[];
  roads: readonly PlanRoad[];
  borders: readonly PlanBorder[];
  districts: readonly PlanDistrict[];
  civic: PlanCivic;
  landmarks: readonly PlanLandmark[];
  /** The clearing's staked-out plot: the centre of the lot the first building will take. */
  staked: PlotSpot | null;
  /** The words on the staked plot's sign. */
  stakedText?: string;
}

/** The part of the town plan (townPlan.ts) the dressing reads. */
export interface SettlementPlan {
  tier: Tier;
  seed: number;
  ground: Bounds;
  streets: readonly PlanSegment[];
  roads: readonly (PlanSegment & { from: { x: number; z: number } })[];
  borders: readonly PlanBorder[];
  civic: PlanCivic;
  landmarks: readonly string[];
  lots: readonly { slug: string; centre: PlotSpot; archived: boolean }[];
  districts: readonly { slot: { x: number; z: number }; zoneId: string; central: boolean; bounds: Bounds; greens: readonly { x: number; z: number }[] }[];
  staked: { x: number; z: number } | null;
}
/** What the dressing needs beside the plan: each building's door and footprint, and the zones' names and colours. */
export interface DressExtras {
  /** World position of the town cell just outside a building's front door. */
  door(slug: string): PlotSpot;
  /** Footprints on the plot that dressing keeps clear of (the building, the parked truck). */
  obstacles(slug: string): readonly Bounds[];
  zone?(id: string): { name: string | null; accent: string | null; emblem?: string | null } | undefined;
  /** World position of a lot's centre (settlement.ts's `lotCentre`). */
  lotCentre(cell: { x: number; z: number }): PlotSpot;
  stakedText?: string;
}

/** The dressing's plan from the town plan. */
export function dressPlan(plan: SettlementPlan, extras: DressExtras): DressPlan {
  const zone = (id: string): { name: string | null; accent: string | null; emblem?: string | null } => extras.zone?.(id) ?? { name: null, accent: null };
  return {
    tier: plan.tier,
    ground: plan.ground,
    seed: plan.seed,
    lots: plan.lots.map((lot, index) => ({
      index,
      centre: lot.centre,
      lane: lot.centre.z + PITCH / 2,
      door: extras.door(lot.slug),
      obstacles: extras.obstacles(lot.slug),
      seed: slugSeed(lot.slug),
      archived: lot.archived,
    })),
    greens: plan.districts.flatMap((d) => d.greens.map((cell, i) => ({ ...extras.lotCentre(cell), seed: cell.x * 131 + cell.z, ...(!d.central && i === 0 ? { centre: true } : {}) }))),
    streets: plan.streets,
    roads: plan.roads.map((road) => {
      const out = plan.districts.find((d) => d.slot.x === road.from.x && d.slot.z === road.from.z);
      return { x0: road.x0, z0: road.z0, x1: road.x1, z1: road.z1, ...(out ? zone(out.zoneId) : { name: null, accent: null }) };
    }),
    borders: plan.borders,
    districts: plan.districts.map((d) => ({ id: d.zoneId, ...zone(d.zoneId), bounds: d.bounds })),
    civic: plan.civic,
    landmarks: plan.landmarks.filter((id): id is PlanLandmark => LANDMARKS.includes(id as PlanLandmark)),
    staked: plan.staked ? extras.lotCentre(plan.staked) : null,
    ...(extras.stakedText ? { stakedText: extras.stakedText } : {}),
  };
}
const LANDMARKS: readonly PlanLandmark[] = ["windmill", "chapel", "bandstand", "farm", "cottages-west", "cottages-east"];

/** A whole model with a spot of its own (it may animate, and is drawn once): the civic buildings and the landmarks. */
export interface PlanPiece {
  key: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}

const rect = (cx: number, cz: number, width: number, depth: number): Bounds => ({ minX: cx - width / 2, maxX: cx + width / 2, minZ: cz - depth / 2, maxZ: cz + depth / 2 });
const span = (minX: number, maxX: number, minZ: number, maxZ: number): Bounds => ({ minX, maxX, minZ, maxZ });
const inside = (r: Bounds, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const along = (s: PlanSegment): "x" | "z" => (Math.abs(s.x1 - s.x0) >= Math.abs(s.z1 - s.z0) ? "x" : "z");
const small = (tier: Tier) => tier === "clearing" || tier === "hamlet";

/* ── The fixed places of the civic rows (settlement.ts reserves them; the numbers are today's town) ─────────────── */

const POST = civicCenter("post-office"),
  HALL = civicCenter("town-hall"),
  SQUARE = civicCenter("square"),
  CAFE = civicCenter("cafe"),
  STOP = civicCenter("bus-stop");
/** The lane in front of the civic row. */
const CIVIC_LANE = POST.z + PITCH / 2;
/** Half the street between two plots. */
const STREET_HALF = () => (PITCH - PLOT_SIZE) / 2;
const POND = rect((POST.x - CIVIC_LOT / 2 + POST.x - PITCH / 2 - PLOT_SIZE / 2) / 2, POST.z - 1, 9, 5.6);
const PARK_X = (POND.minX + POND.maxX) / 2;
const BANDSTAND = { x: 14.5, z: POST.z - 7.6, scale: 1.6 };
const CHAPEL = { x: 0, z: POST.z - 16.5, scale: 3 };
const CHAPEL_GROUND: Bounds = { minX: -4.6, maxX: 4.6, minZ: POST.z - 22.8, maxZ: POST.z - 4.2 };
const WINDMILL = { x: HALL.x + 13, z: POST.z - 17.8 };
const FARM: Bounds = { minX: 48, maxX: 63, minZ: POST.z - 22.6, maxZ: POST.z - 12.5 };
const COTTAGES: Record<"cottages-west" | "cottages-east", PlotSpot> = { "cottages-west": { x: -2.5 * PITCH, z: POST.z }, "cottages-east": { x: 2.5 * PITCH, z: POST.z } };
/** The stream's place in the border row south of a district row, and its shape. */
const STREAM = { offset: 66.5, period: 6 * PITCH, width: 1.5, amplitude: 0.7 };
/** How the lodge, the mail hut and the post box stand on their spots. */
const LODGE = { x: HALL.x, z: HALL.z - 2.2, scale: 2.3 };
const HUT = { x: POST.x, z: POST.z - 2.2, scale: 2.2 };
const BOX = { x: POST.x + 0.9, z: POST.z - 1.3, scale: 2.5 };

/** The two halves of the promenade behind the square, lot edge to square edge. */
function promenades(): Bounds[] {
  const z0 = SQUARE.z - 2.4,
    z1 = SQUARE.z - 0.2;
  return [span(POST.x + CIVIC_LOT / 2, SQUARE.x - CIVIC_SIZE.square.width / 2 + 0.1, z0, z1), span(SQUARE.x + CIVIC_SIZE.square.width / 2 - 0.1, HALL.x - CIVIC_LOT / 2, z0, z1)];
}
function busBay(): Bounds {
  return span(STOP.x + CIVIC_SIZE["bus-stop"].width / 2 + 0.6, STOP.x + CIVIC_SIZE["bus-stop"].width / 2 + 5.4, CIVIC_LANE - LANE / 2 - 1.9, CIVIC_LANE - LANE / 2);
}
/** The pond in the town's park (the bridge crosses it on the park path). */
export function parkPond(): Bounds {
  return POND;
}

/* ── Streets, roads and paths ─────────────────────────────────────────── */

const laneRect = (s: PlanSegment): Bounds => span(Math.min(s.x0, s.x1) - LANE / 2, Math.max(s.x0, s.x1) + LANE / 2, Math.min(s.z0, s.z1) - LANE / 2, Math.max(s.z0, s.z1) + LANE / 2);

/** The cobbled lanes of a plan: its streets and its district roads. */
export function planLanes(plan: DressPlan): Bounds[] {
  return [...plan.streets, ...plan.roads].map(laneRect);
}

/**
 * The entrance road of a village or anything larger: the main street, on south from its last crossing to the ground's
 * edge. Null in a clearing or a hamlet (their lane ends at the gate), and where a district road already runs there.
 */
export function entranceRoad(plan: Pick<DressPlan, "tier" | "streets" | "roads" | "ground">): Bounds | null {
  if (small(plan.tier)) return null;
  const main = [...plan.streets, ...plan.roads].filter((s) => along(s) === "z" && Math.abs(s.x0 - SQUARE.x) < 0.01);
  const south = Math.max(CIVIC_LANE + PITCH, ...main.map((s) => Math.max(s.z0, s.z1)));
  if (south >= plan.ground.maxZ - 1) return null;
  return span(SQUARE.x - LANE / 2, SQUARE.x + LANE / 2, south, plan.ground.maxZ - 0.2);
}

/** z of every stream in the plan: one along each border row that has a district in use on both sides, edge to edge. */
export function streamRows(plan: DressPlan): number[] {
  const rows = new Set<number>();
  for (const b of plan.borders) if (b.strip.maxX - b.strip.minX > b.strip.maxZ - b.strip.minZ) rows.add(b.strip.minZ + STREAM.offset - 2 * PITCH);
  // The central district's own southern edge has the stream as soon as the ground reaches it.
  const home = STREAM.offset;
  if (plan.ground.maxZ > home + 2.4 && plan.ground.minZ < home - 3) rows.add(home);
  return [...rows].filter((z) => plan.ground.maxZ > z + 2.4 && plan.ground.minZ < z - 3).sort((a, b) => a - b);
}
/** The stream's centre line at `x` on the row at `z`. */
function streamAt(row: number, x: number): number {
  return row + Math.sin(x * 0.11 + 0.7 + row) * STREAM.amplitude * (0.6 + 0.4 * Math.sin(x * 0.037));
}

/** What the civic rows' paths depend on: the tier, the civic stage, the landmarks that have arrived and the streets. */
export type CivicPlan = Pick<DressPlan, "tier" | "civic" | "landmarks" | "streets">;

/**
 * Every walkable paved rectangle of the civic rows: forecourts and their stems, the green's path or the square and
 * its promenade, the café's and the bus stop's paths, the park path over its bridge and the footpaths to the
 * landmarks. The navigation opens exactly these (with the streets, roads and garden paths), so walkers stay on what
 * the dressing paves.
 */
export function civicWalkways(plan: CivicPlan): Bounds[] {
  const paths = [...civicPaving(plan).map((p) => p.rect), ...sidePaths(plan)];
  if (plan.civic.square === "square") paths.push(rect(SQUARE.x, SQUARE.z, CIVIC_SIZE.square.width, CIVIC_SIZE.square.depth));
  if (plan.civic.busStop) paths.push(busBay());
  if (hasPark(plan)) paths.push(rect(PARK_X, (POND.minZ + POND.maxZ) / 2, 1.6, POND.maxZ - POND.minZ + 1.4));
  return paths;
}

/** The paved places of the civic rows at the plan's stage: forecourts, the stems down to the lane, the promenade. */
function civicPaving(plan: CivicPlan): { rect: Bounds; lawn: boolean }[] {
  const out: { rect: Bounds; lawn: boolean }[] = [];
  const court = (c: PlotSpot, half: number, from: number) => {
    out.push({ rect: span(c.x - half, c.x + half, c.z + from, c.z + CIVIC_LOT / 2), lawn: true });
    out.push({ rect: span(c.x - 1.2, c.x + 1.2, c.z + CIVIC_LOT / 2 - 0.1, CIVIC_LANE), lawn: false });
  };
  court(HALL, plan.civic.hall === "lodge" ? 3.6 : 4.5, plan.civic.hall === "lodge" ? 0.6 : 0.2);
  if (plan.civic.post === "mailbox") {
    out.push({ rect: span(POST.x - 2.6, POST.x + 2.6, POST.z - 2.4, POST.z + 2.4), lawn: false });
    out.push({ rect: span(POST.x - 0.9, POST.x + 0.9, POST.z + 2.3, CIVIC_LANE), lawn: false });
  } else court(POST, plan.civic.post === "mail-hut" ? 3.6 : 4.5, plan.civic.post === "mail-hut" ? 0.6 : 0.2);
  // The green's path up to the welcome sign, or the square's stem.
  if (plan.civic.square === "green") out.push({ rect: span(SQUARE.x - 0.9, SQUARE.x + 0.9, SQUARE.z + 1.6, CIVIC_LANE), lawn: false });
  else {
    out.push({ rect: span(SQUARE.x - LANE / 2, SQUARE.x + LANE / 2, SQUARE.z + CIVIC_SIZE.square.depth / 2 - 0.1, CIVIC_LANE), lawn: false });
    for (const r of promenades()) out.push({ rect: r, lawn: false });
  }
  if (plan.civic.cafe) out.push({ rect: span(CAFE.x - 1, CAFE.x + 1, CAFE.z + CIVIC_SIZE.cafe.depth / 2, CIVIC_LANE), lawn: false });
  if (plan.civic.busStop) out.push({ rect: span(STOP.x - 2, STOP.x + 2, STOP.z + CIVIC_SIZE["bus-stop"].depth / 2, CIVIC_LANE), lawn: false });
  if (hasPark(plan)) {
    out.push({ rect: span(PARK_X - 0.8, PARK_X + 0.8, POND.maxZ + 0.6, CIVIC_LANE), lawn: false });
    out.push({ rect: span(PARK_X - 0.8, PARK_X + 0.8, POND.minZ - 3.4, POND.minZ - 0.6), lawn: false });
  }
  return out;
}
/** The park, the orchard and the market belong to a town: the full civic set. */
const hasPark = (plan: Pick<DressPlan, "tier">) => plan.tier === "town" || plan.tier === "region";

/** The footpaths to the landmarks that have arrived. */
function sidePaths(plan: CivicPlan): Bounds[] {
  const out: Bounds[] = [];
  const has = (id: PlanLandmark) => plan.landmarks.includes(id);
  if (has("bandstand")) out.push(span(BANDSTAND.x - 0.6, BANDSTAND.x + 0.6, BANDSTAND.z + 2.5, plan.civic.square === "square" ? promenades()[1]!.minZ : CIVIC_LANE));
  if (has("chapel")) out.push(span(CHAPEL.x - 0.7, CHAPEL.x + 0.7, CHAPEL.z + 5.1, plan.civic.square === "square" ? SQUARE.z - CIVIC_SIZE.square.depth / 2 + 0.1 : SQUARE.z - 2.2));
  for (const id of ["cottages-west", "cottages-east"] as const) {
    if (!has(id)) continue;
    // From the cottages' yard down to the civic lane's line, and along it to where the lane ends.
    const c = COTTAGES[id],
      side = Math.sign(c.x);
    const lane = plan.streets.filter((s) => along(s) === "x" && Math.abs(s.z0 - CIVIC_LANE) < 0.01);
    const end = side > 0 ? Math.max(SQUARE.x, ...lane.map((s) => Math.max(s.x0, s.x1))) : Math.min(SQUARE.x, ...lane.map((s) => Math.min(s.x0, s.x1)));
    out.push(span(c.x - 0.7, c.x + 0.7, c.z + 1, CIVIC_LANE + 0.7));
    if (Math.abs(end) < Math.abs(c.x)) out.push(span(Math.min(end, c.x) - 0.7, Math.max(end, c.x) + 0.7, CIVIC_LANE - 0.7, CIVIC_LANE + 0.7));
  }
  return out;
}

/** A garden path from a lot's front door down to its lane. */
const gardenPath = (lot: PlanLot): Bounds => span(lot.door.x - GARDEN_PATH / 2, lot.door.x + GARDEN_PATH / 2, lot.door.z - 0.6, lot.lane);

/** Every walkable paved rectangle of a plan: lanes, roads, the entrance road, civic paths, footpaths and garden paths. */
export function planPaths(plan: DressPlan): Bounds[] {
  const road = entranceRoad(plan);
  return [...planLanes(plan), ...(road ? [road] : []), ...civicWalkways(plan), ...plan.lots.map(gardenPath)];
}

/* ── The pieces with a spot of their own ──────────────────────────────── */

/**
 * The civic buildings and landmarks of a plan, each drawn whole: the lodge or the town hall, the post box, the mail
 * hut or the post office, the square, the café, the bus stop, the welcome sign, and whatever has arrived.
 */
export function planPieces(plan: DressPlan): PlanPiece[] {
  const out: PlanPiece[] = [];
  const add = (key: string, x: number, y: number, z: number, rotation = 0, scale = 1) => out.push({ key, x, y, z, rotation, scale });
  if (plan.civic.hall === "lodge") add("town.lodge", LODGE.x, LAWN_Y, LODGE.z, 0, LODGE.scale);
  else add("town-hall", HALL.x, LAWN_Y, HALL.z);
  if (plan.civic.post === "mailbox") add("town.post-box", BOX.x, GRASS_Y + 0.04, BOX.z, 0, BOX.scale);
  else if (plan.civic.post === "mail-hut") add("town.mail-hut", HUT.x, LAWN_Y, HUT.z, 0, HUT.scale);
  else add("post-office", POST.x, LAWN_Y, POST.z);
  if (plan.civic.square === "square") {
    add("civic.square", SQUARE.x, GRASS_Y, SQUARE.z);
    add("civic.clock-post", SQUARE.x - LANE / 2 - 1.1, GRASS_Y, CIVIC_LANE + LANE / 2 + 1.1);
  }
  const sign = welcomeSign(plan);
  add("civic.welcome-sign", sign.x, sign.y, sign.z);
  if (plan.civic.cafe) add("civic.cafe", CAFE.x, GRASS_Y, CAFE.z);
  if (plan.civic.busStop) add("civic.bus-stop", STOP.x, GRASS_Y, STOP.z);
  if (hasPark(plan)) {
    const cz = (POND.minZ + POND.maxZ) / 2;
    add("civic.greenhouse", POND.maxX + 2.6, GRASS_Y, POND.minZ - 4.2);
    add("civic.duck", POND.minX + 2.6, GRASS_Y + 0.09, cz + 1.2, 0.6);
    add("civic.duck", POND.minX + 3.3, GRASS_Y + 0.09, cz + 1.7, 0.9);
    add("civic.duck", POND.maxX - 2.4, GRASS_Y + 0.09, cz - 1.1, -2.4);
  }
  if (plan.landmarks.includes("windmill")) add("civic.windmill", WINDMILL.x, GRASS_Y, WINDMILL.z, -0.5);
  return out;
}

/** The welcome sign: in the middle of the green while the town is small, at the head of the main street after. */
function welcomeSign(plan: DressPlan): { x: number; y: number; z: number } {
  if (plan.civic.square === "green") return { x: SQUARE.x, y: LAWN_Y, z: SQUARE.z - 0.4 };
  return { x: SQUARE.x + LANE / 2 + 2.1, y: GRASS_Y, z: CIVIC_LANE + LANE / 2 + 0.75 };
}

/* ── Dressing ─────────────────────────────────────────────────────────── */

const TREES = ["town.oak", "town.birch", "town.pine"] as const;
const AUTUMN = /^town\.(oak|birch|bush)$/;
const USES: readonly PlotUse[] = ["picnic", "playground", "orchard", "allotment", "meadow"];

/** The whole dressing of a plan, in a fixed order. Each piece inside a district's ground carries that district's id. */
export function settlementDressing(plan: DressPlan): Dressing[] {
  const out: Dressing[] = [];
  const add: Add = (key, x, y, z, extra = {}) => out.push({ key, x, y, z, rotation: 0, scale: 1, ...extra });
  const g = plan.ground;
  const paths = planPaths(plan);
  const has = (id: PlanLandmark) => plan.landmarks.includes(id);
  const town = hasPark(plan);

  /* Keep-out zones for trees, benches and the like. */
  const blocked: Bounds[] = [...paths];
  for (const lot of plan.lots) blocked.push(rect(lot.centre.x, lot.centre.z, PLOT_SIZE, PLOT_SIZE));
  // A green at the ground's edge waits until the ground has grown round it.
  const greens = plan.greens.filter((green) => inside(g, green.x, green.z, -PLOT_SIZE / 2 - 1));
  for (const green of greens) blocked.push(rect(green.x, green.z, PLOT_SIZE, PLOT_SIZE));
  if (plan.staked) blocked.push(rect(plan.staked.x, plan.staked.z, PLOT_SIZE, PLOT_SIZE));
  blocked.push(rect(HALL.x, HALL.z, CIVIC_LOT, CIVIC_LOT));
  blocked.push(plan.civic.post === "mailbox" ? rect(POST.x, POST.z, 7, 7) : rect(POST.x, POST.z, CIVIC_LOT, CIVIC_LOT));
  blocked.push(rect(SQUARE.x, SQUARE.z, CIVIC_SIZE.square.width + 1, CIVIC_SIZE.square.depth + 1));
  if (plan.civic.cafe) blocked.push(rect(CAFE.x, CAFE.z, CIVIC_SIZE.cafe.width + 1, CIVIC_SIZE.cafe.depth + 1));
  if (plan.civic.busStop) blocked.push(rect(STOP.x, STOP.z, CIVIC_SIZE["bus-stop"].width + 1, CIVIC_SIZE["bus-stop"].depth + 1), busBay());
  if (plan.civic.square === "square") for (const r of promenades()) blocked.push({ ...r, minZ: r.minZ - 1.2, maxZ: r.maxZ + 2.2 });
  if (town) blocked.push(rect(PARK_X, (POND.minZ + POND.maxZ) / 2, POND.maxX - POND.minX + 1, POND.maxZ - POND.minZ + 1), rect(POND.maxX + 2.6, POND.minZ - 4.2, 5.2, 5.2), orchardGround());
  if (has("bandstand")) blocked.push(span(BANDSTAND.x - 3.4, BANDSTAND.x + 3.4, BANDSTAND.z - 3.2, BANDSTAND.z + 4));
  if (has("chapel")) blocked.push(CHAPEL_GROUND);
  if (has("windmill")) blocked.push(rect(WINDMILL.x, WINDMILL.z, 7.2, 7.2));
  if (has("farm")) blocked.push(FARM);
  for (const id of ["cottages-west", "cottages-east"] as const) if (has(id)) blocked.push(rect(COTTAGES[id].x, COTTAGES[id].z, 17, 15));
  const sign = welcomeSign(plan);
  blocked.push(rect(sign.x, sign.z, 3.8, 2.4));
  const streams = streamRows(plan);
  for (const z of streams) blocked.push(span(g.minX, g.maxX, z - STREAM.amplitude - STREAM.width / 2 - 0.6, z + STREAM.amplitude + STREAM.width / 2 + 0.6));
  const gates = districtGates(plan);
  for (const gate of gates) blocked.push(rect(gate.x, gate.z, gate.rotation ? 2.4 : gate.width + 2.6, gate.rotation ? gate.width + 2.6 : 2.4));
  const free = (x: number, z: number, pad: number) => inside(g, x, z, -0.6) && !blocked.some((b) => inside(b, x, z, pad));
  const tree: Tree = (x, z, y, seed, scale = 1) => {
    const kind = TREES[Math.floor(noise(seed, 7) * TREES.length)]!;
    add(kind, x, y, z, { rotation: noise(seed, 3) * Math.PI * 2, scale: scale * (0.85 + noise(seed, 5) * 0.35), seed: Math.floor(noise(seed, 11) * 1000) });
  };

  /* The ground, the lanes and their crossings. */
  add("ground", (g.minX + g.maxX) / 2, 0, (g.minZ + g.maxZ) / 2, { size: { width: g.maxX - g.minX, height: 0.5, depth: g.maxZ - g.minZ } });
  const lanes = planLanes(plan);
  const road = entranceRoad(plan);
  for (const r of [...lanes, ...(road ? [road] : [])]) paving(add, r, "cobble", GRASS_Y);
  const reaches = (x: number, z: number) => lanes.some((r) => inside(r, x, z, 0)) || (road ? inside(road, x, z, 0) : false);
  for (const node of nodes(plan)) {
    const arms = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dz]) => reaches(node.x + dx! * LANE, node.z + dz! * LANE));
    // A crossing where lanes meet or turn; a dead end and a straight run have none.
    const turns = arms.length >= 3 || (arms.length === 2 && arms[0]![0] !== -arms[1]![0]!);
    if (!turns) continue;
    add("town.crossing", node.x, GRASS_Y, node.z, { size: { width: LANE, height: 0.045, depth: LANE } });
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      if (noise(node.x, node.z, dx, dz) < 0.6) wear(add, node.x + dx * (LANE / 2 + 0.25), GRASS_Y, node.z + dz * (LANE / 2 + 0.25), 1.3, 1.3, noise(node.x, dz, node.z) * 3);
  }
  for (const p of civicPaving(plan)) paving(add, { ...p.rect, maxZ: Math.min(p.rect.maxZ, CIVIC_LANE - LANE / 2) }, "flag", p.lawn ? LAWN_Y : GRASS_Y + 0.002);
  for (const r of sidePaths(plan)) paving(add, r, "flag", GRASS_Y + 0.002);

  /* The lots: lawns with hedges and front gardens. */
  for (const lot of plan.lots) {
    add("plot", lot.centre.x, 0, lot.centre.z, { size: { width: PLOT_SIZE, height: 0.16, depth: PLOT_SIZE }, ...(lot.archived ? { variant: "meadow" } : {}) });
    garden(add, lot, tree);
  }
  if (plan.staked) stakedPlot(add, plan.staked, plan.stakedText ?? "");

  /* The greens: a district's small centre, or a pocket park by its seed. */
  for (const green of greens) {
    const c = { x: green.x, z: green.z };
    const use = USES[Math.floor(noise(green.seed, plan.seed % 1009, 5) * USES.length)]!;
    const wild = !green.centre && (use === "meadow" || use === "orchard" || use === "picnic");
    add("plot", c.x, 0, c.z, { size: { width: PLOT_SIZE, height: 0.16, depth: PLOT_SIZE }, ...(wild ? { variant: "meadow" } : {}) });
    if (green.centre) districtCentre(add, c, green.seed, tree);
    else pocket(add, use, c, green.seed, tree);
  }

  /* The civic rows. */
  civic(add, plan, tree, free);
  // Hanging baskets on the civic rows' lanterns, the arms pointing either way along the lane.
  for (const d of [...out]) if (d.key === "town.lantern" && d.z < CIVIC_LANE - LANE / 2) add("town.hanging-basket", d.x, d.y, d.z, { scale: d.scale, rotation: Math.round(d.x) % 2 ? Math.PI : 0 });
  if (has("bandstand")) {
    add("town.bandstand", BANDSTAND.x, GRASS_Y, BANDSTAND.z, { scale: BANDSTAND.scale });
    for (const side of [-1, 1]) add("town.bench", BANDSTAND.x + side * 3.6, GRASS_Y, BANDSTAND.z + 1.4, { rotation: side * (Math.PI / 2 + 0.5) });
  }
  if (has("chapel")) {
    add("town.chapel", CHAPEL.x, GRASS_Y, CHAPEL.z, { scale: CHAPEL.scale });
    for (const side of [-1, 1]) {
      add("town.pine", CHAPEL.x + side * 3.6, GRASS_Y, CHAPEL.z + 4.2, { scale: 1.25, seed: 120 + side, rotation: side });
      add("town.bush", CHAPEL.x + side * 1.6, GRASS_Y, CHAPEL.z + 5.4, { scale: 0.9, seed: 124 + side });
    }
    add("town.bench", CHAPEL.x + 2.4, GRASS_Y, CHAPEL.z + 9, { rotation: -Math.PI / 2 });
  }
  if (has("farm")) farm(add);
  for (const id of ["cottages-west", "cottages-east"] as const) if (has(id)) cottages(add, COTTAGES[id], id === "cottages-west" ? 1 : 2, tree);
  if (has("windmill")) for (let i = 0; i < 5; i++) add("town.tall-grass", WINDMILL.x - 2.6 + i * 1.3, GRASS_Y, WINDMILL.z + 3.9, { seed: 300 + i, scale: 1.8, rotation: i });

  /* Streams and their bridges, hedgerows, district gates. */
  const crossers = [...lanes, ...(road ? [road] : [])].filter((r) => r.maxX - r.minX < r.maxZ - r.minZ);
  for (const z of streams) stream(add, g, z, crossers.filter((r) => r.minZ < z - 2 && r.maxZ > z + 2));
  for (const border of plan.borders) if (border.strip.maxZ - border.strip.minZ > border.strip.maxX - border.strip.minX) hedgerow(add, border, tree, free);
  for (const gate of gates) {
    add("town.district-gate", gate.x, GRASS_Y, gate.z, { rotation: gate.rotation, size: { width: gate.width, height: 3.3, depth: 0.6 }, ...(gate.name ? { text: gate.name } : {}), ...(gate.accent ? { accent: gate.accent } : {}) });
    // The zone's mark on the beam, over the name (the style's medallion: its back on the beam, facing out).
    if (gate.accent || gate.emblem)
      add("town.zone-mark", gate.x + (gate.rotation ? 0.15 : 0), GRASS_Y + 3.2, gate.z + (gate.rotation ? 0 : 0.15), { rotation: gate.rotation, ...(gate.accent ? { accent: gate.accent } : {}), ...(gate.emblem ? { variant: gate.emblem } : {}) });
    // A road that runs east to west shows the home camera its gate edge-on, so the name also stands on a board
    // beside the road, facing south.
    if (gate.rotation && gate.name) add("town.plot-sign", gate.x - gate.inward * 3.2, GRASS_Y, gate.z + gate.width / 2 + 2.6, { scale: 1.5, text: gate.name, ...(gate.accent ? { accent: gate.accent } : {}) });
    // A lantern beside each pier, on the town side.
    for (const side of [-1, 1]) {
      const [x, z] = gate.rotation ? [gate.x + gate.inward * 1.3, gate.z + side * (gate.width / 2 + 1.5)] : [gate.x + side * (gate.width / 2 + 1.5), gate.z + gate.inward * 1.3];
      add("town.lantern", x, GRASS_Y, z, { seed: Math.round(x + z), scale: 0.9 });
    }
  }

  /* Street furniture, then the woods, the fields and the rim. */
  streets(add, plan, free, tree);
  avenues(add, plan, free);
  if (plan.civic.square === "square" && plan.streets.some((s) => along(s) === "z" && Math.abs(s.x0 - SQUARE.x) < 0.01)) {
    // Bunting across the main street on the way up to the square.
    const lamps = out.filter((d) => d.key === "town.lantern");
    for (const dz of [6, 12, 20]) {
      const z = CIVIC_LANE + dz,
        half = LANE / 2 + 0.6;
      if (lamps.some((l) => Math.abs(Math.abs(l.x - SQUARE.x) - half) < 0.7 && Math.abs(l.z - z) < 0.7)) continue;
      add("town.bunting", SQUARE.x, GRASS_Y, z, { size: { width: half * 2, height: 3.4, depth: 0.1 }, seed: Math.round(z) });
    }
  }
  features(add, out, plan, free);
  countryside(add, plan, tree, free);
  belt(add, g, tree, free, small(plan.tier) ? 2 : 1);
  const area = (g.maxX - g.minX) * (g.maxZ - g.minZ);
  // A wide region is seen from far: its loose tufts thin out, so the country costs no more than a town's verges.
  const tufts = Math.min(900, Math.round(area * 0.023));
  for (let i = 0; i < tufts; i++) {
    const x = g.minX + 1 + noise(i, 41) * (g.maxX - g.minX - 2),
      z = g.minZ + 1 + noise(i, 43) * (g.maxZ - g.minZ - 2);
    if (!free(x, z, 0.5)) continue;
    const key = noise(i, 47) < 0.55 ? "town.grass" : noise(i, 61) < 0.5 ? "town.flowers" : "town.wildflowers";
    add(key, x, GRASS_Y, z, { rotation: noise(i, 53) * 6.28, scale: 1.6 + noise(i, 59) * 0.8, seed: i, ...detail(key) });
  }
  // After the rain: a puddle on the cobbles beside about one lane lantern in four, its reflection towards the lantern.
  for (const l of out.filter((d) => d.key === "town.lantern")) {
    if (noise(l.x, l.z, 91) > 0.25) continue;
    const lane = lanes.find((r) => l.x > r.minX - 2 && l.x < r.maxX + 2 && l.z > r.minZ - 2 && l.z < r.maxZ + 2 && !inside(r, l.x, l.z, 0));
    if (!lane || lane.maxX - lane.minX < 2.4 || lane.maxZ - lane.minZ < 2.4) continue;
    const cx = clamp(l.x, lane.minX + 1.1, lane.maxX - 1.1),
      cz = clamp(l.z, lane.minZ + 1.1, lane.maxZ - 1.1);
    const width = 1.5 + noise(l.x, l.z, 92) * 1;
    add("town.puddle", cx, COBBLE_Y, cz, { size: { width, height: 0, depth: width * 0.6 }, rotation: Math.atan2(l.z - cz, -(l.x - cx)) });
  }
  // October: about one oak, birch or bush in five is turning (gold and orange) among the green.
  for (const d of [...out])
    if (AUTUMN.test(d.key) && noise(d.x, d.z, 77) < 0.2) {
      d.key = `${d.key}-autumn`;
      const lx = d.x + 0.9,
        lz = d.z + 0.6;
      if (d.key !== "town.bush-autumn" && noise(d.x, d.z, 112) < 0.5 && free(lx, lz, 0.9)) add("town.leaf-pile", lx, d.y, lz, { rotation: noise(d.x, d.z, 113) * 6.28, scale: 0.55 });
    }
  // Which district a piece stands in, for the district's own look.
  if (plan.districts.length > 1 || plan.districts.some((d) => d.id !== "default"))
    for (const d of out) {
      if (d.key === "ground") continue;
      const district = plan.districts.find((district) => inside(district.bounds, d.x, d.z, 0));
      if (district) d.district = district.id;
    }
  return out;
}

/** Where lanes end or meet: every segment's two ends, and where a street along x crosses one along z. */
function nodes(plan: DressPlan): PlotSpot[] {
  const all = [...plan.streets, ...plan.roads];
  const found = new Map<string, PlotSpot>();
  const put = (x: number, z: number) => found.set(`${Math.round(x * 10)},${Math.round(z * 10)}`, { x, z });
  for (const s of all) {
    put(s.x0, s.z0);
    put(s.x1, s.z1);
  }
  for (const h of all.filter((s) => along(s) === "x"))
    for (const v of all.filter((s) => along(s) === "z")) {
      const x = v.x0,
        z = h.z0;
      if (x >= Math.min(h.x0, h.x1) - 0.01 && x <= Math.max(h.x0, h.x1) + 0.01 && z >= Math.min(v.z0, v.z1) - 0.01 && z <= Math.max(v.z0, v.z1) + 0.01) put(x, z);
    }
  const road = entranceRoad(plan);
  if (road) put((road.minX + road.maxX) / 2, road.minZ);
  return [...found.values()];
}

/**
 * The clearing's staked-out plot: a meadow with the stakes and string where the first building will stand, a sign at
 * its gate that says what to do next, a stack of timber, a crate and a wheelbarrow's worth of flowers round it.
 */
function stakedPlot(add: Add, c: PlotSpot, text: string) {
  const half = PLOT_SIZE / 2;
  add("plot", c.x, 0, c.z, { size: { width: PLOT_SIZE, height: 0.16, depth: PLOT_SIZE }, variant: "meadow" });
  // The building's own ground, staked: a little north of the middle, as the buildings stand.
  add("town.staked-plot", c.x, LAWN_Y, c.z - 2.2, { size: { width: 16, height: 0, depth: 11 }, seed: 3 });
  wear(add, c.x, LAWN_Y, c.z - 2.2, 13, 8.4, 0.05);
  add("town.plot-sign", c.x - 3.6, LAWN_Y, c.z + half - 3.4, { rotation: 0.1, scale: 2.3, ...(text ? { text } : {}) });
  // Building materials waiting: planks on a pallet, crates, a bale of string.
  add("pallet", c.x + 5.6, LAWN_Y, c.z + half - 3.6, { rotation: 0.3, scale: 1.5 });
  add("crate", c.x + 7.6, LAWN_Y, c.z + half - 2.6, { rotation: -0.4, scale: 1.4 });
  add("crate", c.x + 8.3, LAWN_Y, c.z + half - 3.9, { rotation: 0.5, scale: 1.1 });
  add("town.bench", c.x - 9.6, LAWN_Y, c.z + half - 2.2, { rotation: 0.25 });
  drift(add, c.x - 8.5, c.z - 8, 2.6, 2, 16, 611);
  drift(add, c.x + 9, c.z - 7.5, 2, 2.4, 12, 613);
  for (const [dx, dz, s] of [
    [-10.2, 6.5, 1],
    [10.4, 3, 2],
    [-10.6, -3, 3],
  ] as const)
    add("town.bush", c.x + dx, LAWN_Y, c.z + dz, { seed: 620 + s, scale: 1.2 });
}

/**
 * An outer district's small centre on its first green: a round of flagstones with a fountain, benches and lanterns
 * round it, a notice board, flower beds at the corners and a shade tree.
 */
function districtCentre(add: Add, c: PlotSpot, seed: number, tree: Tree) {
  paving(add, rect(c.x, c.z, 9, 9), "flag", LAWN_Y);
  paving(add, span(c.x - 0.9, c.x + 0.9, c.z + 4.4, c.z + PLOT_SIZE / 2), "flag", LAWN_Y);
  add("civic.fountain", c.x, LAWN_Y + 0.04, c.z, { scale: 1.5 });
  for (const [dx, dz, r] of [
    [-3.4, 0, Math.PI / 2],
    [3.4, 0, -Math.PI / 2],
    [0, -3.4, 0],
  ] as const)
    add("town.bench", c.x + dx, LAWN_Y + 0.04, c.z + dz, { rotation: r });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add("town.lantern", c.x + sx * 4.1, LAWN_Y, c.z + sz * 4.1, { seed: seed + sx * 2 + sz, scale: 0.9 });
      add("town.flower-bed", c.x + sx * 7.2, LAWN_Y, c.z + sz * 6.2, { size: { width: 4.4, height: 0.2, depth: 0.9 }, seed: seed + sx + sz * 3 });
    }
  add("civic.notice-board", c.x + 2.6, LAWN_Y + 0.04, c.z + 3.6, { rotation: -0.5, scale: 1.3 });
  for (const [dx, dz, k] of [
    [-8.6, -8.6, 0],
    [8.6, -8.6, 1],
    [-8.8, 8.4, 2],
    [8.8, 8.4, 3],
  ] as const)
    tree(c.x + dx, c.z + dz, LAWN_Y, seed * 7 + k, 1.3);
  for (const side of [-1, 1]) add("town.market-stall", c.x + side * 7.6, LAWN_Y, c.z - 1, { rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2, scale: 1.15, seed: seed + side });
}

/** The civic rows at the plan's stage. */
function civic(add: Add, plan: DressPlan, tree: Tree, free: (x: number, z: number, pad: number) => boolean) {
  const court = LAWN_Y + 0.04;
  /* The hall's lot: the lodge among trees, or the town hall. */
  add("plot", HALL.x, 0, HALL.z, { size: { width: CIVIC_LOT, height: 0.16, depth: CIVIC_LOT } });
  for (const side of [-1, 1]) {
    add("town.lantern", HALL.x + side * 1.9, GRASS_Y, HALL.z + CIVIC_LOT / 2 + 0.6, { seed: 1 + side });
    tree(HALL.x + side * 5.4, HALL.z - 5.4, LAWN_Y, 71 + side, 0.9);
  }
  if (plan.civic.hall === "lodge") {
    add("town.flower-bed", HALL.x - 4.8, LAWN_Y, HALL.z + 3.2, { size: { width: 0.9, height: 0.2, depth: 3.6 }, seed: 4 });
    add("town.flower-bed", HALL.x + 4.8, LAWN_Y, HALL.z + 3.2, { size: { width: 0.9, height: 0.2, depth: 3.6 }, seed: 6 });
    add("town.bench", HALL.x - 2.6, court, HALL.z + 1.4, { rotation: 0 });
    add("civic.notice-board", HALL.x + 2.9, court, HALL.z + 4.6, { rotation: -0.3, scale: 1.25 });
    add("town.bush", HALL.x - 5.2, LAWN_Y, HALL.z - 1.2, { seed: 75, scale: 1.1 });
  } else {
    add("town.flower-bed", HALL.x - 5.1, LAWN_Y, HALL.z + 1.8, { size: { width: 0.9, height: 0.2, depth: 3.2 }, seed: 4 });
    add("town.flower-bed", HALL.x + 5.1, LAWN_Y, HALL.z + 1.8, { size: { width: 0.9, height: 0.2, depth: 3.2 }, seed: 6 });
    add("town.bike-rack", HALL.x + 5.3, LAWN_Y, HALL.z + 4.8, { rotation: Math.PI / 2 });
  }
  /* The post: a box on a pad, the hut, or the post office. */
  if (plan.civic.post === "mailbox") {
    add("town.bench", POST.x - 1.4, GRASS_Y + 0.04, POST.z - 1.5, { rotation: 0.15 });
    add("town.lantern", POST.x + 2.1, GRASS_Y, POST.z + 2.9, { seed: 2 });
    add("town.bush", POST.x - 3.4, GRASS_Y, POST.z - 1.6, { seed: 31, scale: 1.2 });
    add("town.bush", POST.x + 3.5, GRASS_Y, POST.z - 2.4, { seed: 32, scale: 1 });
    drift(add, POST.x + 4.6, POST.z + 0.6, 1.6, 1.4, 9, 633);
    wear(add, POST.x, GRASS_Y, POST.z + 3.4, 2.6, 1.4);
  } else {
    add("plot", POST.x, 0, POST.z, { size: { width: CIVIC_LOT, height: 0.16, depth: CIVIC_LOT } });
    for (const side of [-1, 1]) add("town.lantern", POST.x + side * 1.9, GRASS_Y, POST.z + CIVIC_LOT / 2 + 0.6, { seed: side });
    if (plan.civic.post === "mail-hut") {
      add("cart", POST.x + 3.2, court, POST.z + 2.6, { rotation: -0.4, scale: 1.3 });
      add("crate", POST.x - 3.0, court, POST.z + 1.5, { scale: 1.2, rotation: 0.2 });
      add("town.flower-bed", POST.x - 4.8, LAWN_Y, POST.z + 3.6, { size: { width: 0.9, height: 0.2, depth: 3 }, seed: 2 });
      add("town.flower-bed", POST.x + 4.8, LAWN_Y, POST.z + 3.6, { size: { width: 0.9, height: 0.2, depth: 3 }, seed: 4 });
      for (const side of [-1, 1]) tree(POST.x + side * 5.3, POST.z - 5.2, LAWN_Y, 61 + side, 0.9);
    } else {
      add("town.flower-bed", POST.x - 5.1, LAWN_Y, POST.z + 1.8, { size: { width: 0.9, height: 0.2, depth: 3.2 }, seed: 2 });
      add("town.flower-bed", POST.x + 5.1, LAWN_Y, POST.z + 1.8, { size: { width: 0.9, height: 0.2, depth: 3.2 }, seed: 4 });
      add("town.bike-rack", POST.x - 5.3, LAWN_Y, POST.z + 4.8, { rotation: Math.PI / 2 });
      add("cart", POST.x + 3.6, court, POST.z + 1.6, { rotation: -0.4, scale: 1.4 });
      add("crate", POST.x - 3.7, court, POST.z + 1.1, { scale: 1.3, rotation: 0.2 });
      add("crate", POST.x - 3.2, court, POST.z + 1.9, { scale: 1.1, rotation: -0.3 });
      add("crate", POST.x - 3.5, court + 0.42, POST.z + 1.4, { scale: 0.9, rotation: 0.6 });
      add("town.mailbox", POST.x + 5.2, LAWN_Y, POST.z + 5.1, { rotation: -Math.PI / 2 });
    }
  }
  /* The green with the welcome sign, or the square. */
  if (plan.civic.square === "green") {
    add("plot", SQUARE.x, 0, SQUARE.z, { size: { width: CIVIC_SIZE.square.width, height: 0.16, depth: CIVIC_SIZE.square.depth } });
    for (const side of [-1, 1]) {
      add("town.bench", SQUARE.x + side * 3.4, LAWN_Y, SQUARE.z + 2.6, { rotation: side * -0.5 });
      add("town.flower-bed", SQUARE.x + side * 2.9, LAWN_Y, SQUARE.z + 4.3, { size: { width: 2.8, height: 0.2, depth: 0.85 }, seed: 20 + side });
      add("town.lantern", SQUARE.x + side * 1.6, GRASS_Y, SQUARE.z + CIVIC_SIZE.square.depth / 2 + 0.7, { seed: 9 + side, scale: 0.9 });
      add("town.bush", SQUARE.x + side * 4.1, LAWN_Y, SQUARE.z - 3.9, { seed: 40 + side, scale: 1.1 });
    }
    tree(SQUARE.x - 0.2, SQUARE.z - 3.4, LAWN_Y, 77, 1.5);
  } else {
    for (const dz of [-2.6, 2.6]) add("town.string-lights", SQUARE.x, GRASS_Y, SQUARE.z + dz, { size: { width: CIVIC_SIZE.square.width + 1.6, height: 2.7, depth: 0.1 } });
    for (const dx of [-1, 1]) add("town.lantern", SQUARE.x + dx * 2.6, GRASS_Y, SQUARE.z + CIVIC_SIZE.square.depth / 2 + 0.8, { seed: dx });
    // Flower beds along the promenade's north side, with gaps to step through, and a lantern at each end.
    for (const r of promenades()) {
      for (let x = r.minX + 1.2; x + 3 < r.maxX - 0.8; x += 4.6) {
        if (plan.landmarks.includes("bandstand") && Math.abs(x + 1.5 - BANDSTAND.x) < 2.2) continue;
        add("town.flower-bed", x + 1.5, GRASS_Y, r.minZ - 0.65, { size: { width: 3, height: 0.2, depth: 0.8 }, seed: Math.round(x) });
      }
      for (const x of [r.minX + 0.6, r.maxX - 0.6]) add("town.lantern", x, GRASS_Y, r.maxZ + 0.45, { seed: Math.round(x) });
    }
    const east = promenades()[1]!;
    for (const [dx, dz, k] of [
      [13.5, 4.2, 0],
      [17.5, 5.6, 1],
    ] as const)
      if (free(east.minX + dx, east.maxZ + dz, 1.2)) tree(east.minX + dx, east.maxZ + dz, GRASS_Y, 83 + k, 1.3);
    if (free(east.minX + 15.5, east.maxZ + 1.6, 0.8)) add("town.bench", east.minX + 15.5, GRASS_Y, east.maxZ + 1.6, { rotation: Math.PI });
    // A village has one stall on the promenade; a town has its market.
    const stalls = plan.tier === "village" ? [4.9] : [2.4, 4.9, 7.4];
    for (const [k, dx] of stalls.entries()) add("town.market-stall", east.minX + dx, GRASS_Y, east.maxZ + 1.1, { rotation: Math.PI, scale: 1.15, seed: k });
  }
  if (plan.civic.cafe) {
    add("town.bike-rack", CAFE.x + 2.6, GRASS_Y, CAFE.z + 3.6, { rotation: Math.PI / 2 });
    add("crate", CAFE.x - 3.3, GRASS_Y, CAFE.z - 0.8, { scale: 1.2, rotation: 0.3 });
    add("crate", CAFE.x - 3.1, GRASS_Y, CAFE.z + 0.1, { scale: 1, rotation: -0.2 });
  }
  if (plan.civic.busStop) {
    const bay = busBay();
    paving(add, bay, "cobble", GRASS_Y);
    add("town.bus", (bay.minX + bay.maxX) / 2, GRASS_Y + 0.04, (bay.minZ + bay.maxZ) / 2, { scale: 1.3 });
  }
  if (hasPark(plan)) {
    park(add, tree);
    orchard(add);
  }
}

/** The park west of the post office: the pond, the bridge, trees, benches and a low fence along the lane. */
function park(add: Add, tree: Tree) {
  const cx = PARK_X,
    cz = (POND.minZ + POND.maxZ) / 2;
  add("town.pond", cx, GRASS_Y, cz, { size: { width: POND.maxX - POND.minX, height: 0.1, depth: POND.maxZ - POND.minZ } });
  add("town.bridge", cx, GRASS_Y, cz, { size: { width: 1.6, height: 0.5, depth: POND.maxZ - POND.minZ + 1.4 } });
  const x0 = POST.x - PITCH + STREET_HALF(),
    x1 = POST.x - CIVIC_LOT / 2;
  const z0 = POST.z - PLOT_SIZE / 2,
    z1 = CIVIC_LANE - LANE / 2 - 1.2;
  const ring: [number, number][] = [
    [POND.minX - 1.6, cz - 1.6],
    [POND.minX - 1.2, cz + 2.2],
    [POND.maxX + 1.4, cz - 2],
    [POND.maxX + 1.8, cz + 1.8],
    [x0 + 1.4, z0 + 1.6],
    [x1 - 1.6, z0 + 1.4],
    [x0 + 1.8, z1 - 1],
    [x1 - 1.4, z1 - 1.2],
  ];
  const glass = { x: POND.maxX + 2.6, z: POND.minZ - 4.2 };
  ring.forEach(([x, z], i) => {
    if (Math.hypot(glass.x - x, glass.z - z) > 3.6) tree(x, z, GRASS_Y, 500 + i, 1.3);
  });
  for (const [x, z, seed] of [
    [POND.minX + 0.8, POND.maxZ + 0.9, 1],
    [POND.maxX - 1.2, POND.maxZ + 0.9, 2],
    [POND.minX + 1.6, POND.minZ - 0.9, 3],
  ] as const)
    add("town.flower-bed", x, GRASS_Y, z, { size: { width: 1.8, height: 0.2, depth: 0.7 }, seed: 40 + seed });
  add("town.bench", cx + 1.6, GRASS_Y, POND.minZ - 2.6, { rotation: Math.PI });
  add("town.picnic-blanket", POND.maxX + 2.4, GRASS_Y, cz + 0.6, { rotation: -0.5 });
  add("town.picnic-blanket", POND.minX - 1.6, GRASS_Y, POND.maxZ + 3.4, { rotation: 0.3 });
  add("town.bench", cx - 2.6, GRASS_Y, POND.maxZ + 1.9, { rotation: Math.PI / 2 + 0.2 });
  for (const [dx, z] of [
    [-1.3, POND.maxZ + 0.9],
    [1.3, POND.maxZ + 0.9],
    [-1.3, POND.minZ - 0.9],
    [1.3, POND.minZ - 0.9],
  ] as const)
    add("town.lantern", cx + dx, GRASS_Y, z, { seed: 80 + dx * 2 + z, scale: 0.85 });
  add("town.lantern", cx - 1.2, GRASS_Y, POND.maxZ + 3.2, { seed: 70 });
  add("town.lantern", cx + 1.2, GRASS_Y, POND.minZ - 1.8, { seed: 71 });
  for (const [x, z] of [
    [POND.minX + 1.4, cz + 0.4],
    [POND.maxX - 1.6, cz - 0.6],
  ] as const)
    add("town.lily", x, GRASS_Y + 0.04, z, { seed: Math.round(x) });
  fence(add, x0 + 0.5, CIVIC_LANE - LANE / 2 - 0.7, cx - 1.2);
  fence(add, cx + 1.2, CIVIC_LANE - LANE / 2 - 0.7, x1 - 0.5);
}

/** The orchard's ground east of the town hall. */
function orchardGround(): Bounds {
  return span(HALL.x + CIVIC_LOT / 2 + 1, HALL.x + PITCH - STREET_HALF() - 1, HALL.z - PLOT_SIZE / 2 + 1.4, CIVIC_LANE - LANE / 2 - 0.4);
}
/** The orchard east of the town hall: fruit trees in rows behind a low fence, and a bench. */
function orchard(add: Add) {
  const o = orchardGround();
  const x0 = o.minX + 0.5,
    x1 = o.maxX - 0.5,
    z0 = o.minZ + 0.6,
    z1 = o.maxZ - 2.2;
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) {
      if (r === 3 && k === 1) continue;
      const x = x0 + ((k + 0.5) / 4) * (x1 - x0) + (r % 2 ? 1.2 : -0.6),
        z = z0 + ((r + 0.5) / 4) * (z1 - z0);
      add("town.fruit-tree", x, GRASS_Y, z, { rotation: noise(r, k) * 6.28, scale: 0.9 + noise(k, r, 1) * 0.25, seed: r * 4 + k });
    }
  add("town.bench", x0 + (1.5 / 4) * (x1 - x0) - 0.6, GRASS_Y, z1 - 1.1, { rotation: 0.15 });
  fence(add, x0 - 0.6, CIVIC_LANE - LANE / 2 - 0.7, x1 + 0.6);
}

/** October by the windmill: round hay bales, sheep grazing, pumpkins along a low fence. */
function farm(add: Add) {
  const f = FARM;
  fence(add, f.minX + 0.4, f.maxZ - 0.3, f.maxX - 0.4);
  for (const [x, z, r] of [
    [f.minX + 2.2, f.minZ + 2.4, 0.3],
    [f.minX + 3.6, f.minZ + 3.4, 1.4],
    [f.minX + 2.6, f.minZ + 5, 0.8],
  ] as const)
    add("town.hay-bale", x, GRASS_Y, z, { rotation: r, scale: 1.3 });
  for (let i = 0; i < 6; i++) {
    const x = f.minX + 6 + noise(i, 101) * (f.maxX - f.minX - 7.5),
      z = f.minZ + 1.5 + noise(i, 102) * (f.maxZ - f.minZ - 3.5);
    add("town.sheep", x, GRASS_Y, z, { rotation: noise(i, 103) * Math.PI * 2, scale: 1.3 + noise(i, 104) * 0.2, seed: i });
  }
  for (let i = 0; i < 7; i++) add("town.pumpkin", f.minX + 1.4 + i * 1.6 + noise(i, 105) * 0.5, GRASS_Y, f.maxZ - 1.2 - noise(i, 106) * 0.6, { rotation: noise(i, 107) * 6.28, scale: 1.4 + noise(i, 108) * 0.8 });
}

/** A handful of cottages round a little yard: three houses facing it, a washing line, a vegetable bed and a shade tree. */
function cottages(add: Add, c: PlotSpot, seed: number, tree: Tree) {
  const houses: [number, number, number, string][] = [
    [-5.2, -1.6, Math.PI / 2, "town.cottage"],
    [5.2, -1.2, -Math.PI / 2, seed % 2 ? "town.cottage-timber" : "town.cottage"],
    [0, -5.4, 0, seed % 2 ? "town.cottage" : "town.cottage-timber"],
  ];
  for (const [dx, dz, rotation, key] of houses) add(key, c.x + dx, GRASS_Y, c.z + dz, { rotation, scale: 1.6 });
  wear(add, c.x, GRASS_Y, c.z - 0.6, 5, 4.2, 0.2);
  add("town.washing-line", c.x - 5.6, GRASS_Y, c.z + 3.6, { rotation: 0.2 });
  add("town.veg-bed", c.x + 4.6, GRASS_Y, c.z + 3.4, { rotation: 0.1 });
  add("town.veg-bed", c.x + 4.8, GRASS_Y, c.z + 4.8, { rotation: 0.1 });
  add("town.bench", c.x - 2.2, GRASS_Y, c.z - 2.6, { rotation: 0.6 });
  add(noise(seed, 132) < 0.5 ? "town.bush" : "town.pumpkin", c.x + 1.6, GRASS_Y, c.z - 3.2, { scale: 1.4, seed });
  add("town.lantern", c.x + 1.3, GRASS_Y, c.z + 1.6, { seed: seed * 3, scale: 0.9 });
  tree(c.x - 7.6, c.z - 5.8, GRASS_Y, 440 + seed, 1.4);
  tree(c.x + 7.4, c.z - 6, GRASS_Y, 450 + seed, 1.3);
}

/**
 * A stream along a border row, edge to edge: overlapping stretches of a gentle meander, square-cut where it spills
 * over the diorama's edge in a little waterfall, a timber bridge wherever a road or the main street crosses, reeds,
 * stones and lilies along the banks.
 */
function stream(add: Add, g: Bounds, row: number, crossers: readonly Bounds[]) {
  const points: PlotSpot[] = [];
  for (let x = g.minX; x < g.maxX - 1e-6; x += 6) points.push({ x, z: streamAt(row, x) });
  points.push({ x: g.maxX, z: streamAt(row, g.maxX) });
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!,
      c = points[i + 1]!;
    const edge = i === 0 || i + 2 === points.length;
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    add("town.stream", (a.x + c.x) / 2, GRASS_Y, (a.z + c.z) / 2, {
      size: { width: length + (edge ? 0 : STREAM.width), height: 0, depth: STREAM.width },
      rotation: Math.atan2(-(c.z - a.z), c.x - a.x),
      ...(edge ? { variant: "cut" } : {}),
    });
  }
  for (const end of [points[0]!, points[points.length - 1]!])
    add("town.stream", end === points[0] ? g.minX - 0.28 : g.maxX + 0.28, GRASS_Y, end.z, { size: { width: 0, height: 0, depth: STREAM.width }, variant: "fall", rotation: end === points[0] ? Math.PI : 0 });
  const bridges = crossers.map((r) => (r.minX + r.maxX) / 2);
  for (const [i, x] of bridges.entries()) add("town.bridge", x, GRASS_Y + 0.02, streamAt(row, x), { size: { width: crossers[i]!.maxX - crossers[i]!.minX + 0.4, height: 0.28, depth: STREAM.width + 2.2 } });
  const count = Math.round((g.maxX - g.minX) * 0.5);
  for (let i = 0; i < count; i++) {
    const x = g.minX + 1.5 + noise(i, 81, row) * (g.maxX - g.minX - 3);
    if (bridges.some((b) => Math.abs(x - b) < 3)) continue;
    const side = noise(i, 82, row) < 0.5 ? -1 : 1;
    const z = streamAt(row, x) + side * (STREAM.width / 2 + 0.25 + noise(i, 83) * 0.35);
    const pick = noise(i, 84, row);
    if (pick < 0.6) add("town.tall-grass", x, GRASS_Y, z, { seed: 700 + i, rotation: noise(i, 85) * 6.28, scale: 1.5 + noise(i, 86) * 1.2 });
    else if (pick < 0.85) add("town.rock", x, GRASS_Y, z, { seed: 700 + i, rotation: noise(i, 85) * 6.28, scale: 0.6 + noise(i, 86) * 0.6 });
    else add("town.lily", x, GRASS_Y + 0.07, streamAt(row, x) + (noise(i, 87) - 0.5) * 0.5, { seed: 700 + i, rotation: noise(i, 85) * 6.28 });
  }
}

/**
 * The border between a district and the one east of it: a hedgerow down the middle of the strip, a line of trees and
 * bushes either side of it, with a gap where the road goes through.
 */
function hedgerow(add: Add, border: PlanBorder, tree: Tree, free: (x: number, z: number, pad: number) => boolean) {
  const s = border.strip;
  const x = (s.minX + s.maxX) / 2;
  const RUN = 3.6;
  for (let z = s.minZ + 2; z + RUN < s.maxZ - 1; z += RUN + 0.2) {
    const mid = z + RUN / 2;
    if (border.crossing && Math.abs(mid - border.crossing.z) < 5.5) continue;
    const hx = x + Math.sin(mid * 0.09) * 1.6;
    if (free(hx, mid, 0.6)) add("town.hedge", hx, GRASS_Y, mid, { size: { width: RUN, height: 0.7, depth: 0.9 }, rotation: Math.PI / 2, seed: Math.round(mid) });
    const seed = Math.round(mid * 3 + x);
    const side = noise(seed, 1) < 0.5 ? -1 : 1;
    const tx = hx + side * (2.4 + noise(seed, 2) * 3.4),
      tz = mid + (noise(seed, 3) - 0.5) * 2;
    if (!free(tx, tz, 1)) continue;
    if (noise(seed, 4) < 0.7) tree(tx, tz, GRASS_Y, seed, 1.35);
    else add("town.bush", tx, GRASS_Y, tz, { seed, scale: 1.2 });
  }
}

/** A district gate: where it stands, how wide its opening is and which way the town lies (`inward`). */
interface Gate {
  x: number;
  z: number;
  /** 0 for a road along z, a quarter turn for a road along x. */
  rotation: number;
  width: number;
  inward: number;
  name: string | null;
  accent: string | null;
  emblem: string | null;
}
/**
 * One gate per district road, in the border strip it crosses, on the outer district's side: past the bridge on a road
 * that runs north to south, in the hedgerow's gap on one that runs east to west.
 */
function districtGates(plan: DressPlan): Gate[] {
  return plan.roads.map((road) => {
    const width = LANE + 1;
    if (along(road) === "x") {
      // The strip is the column east of the western district: its middle is 3.5 lots east of that district's crossing.
      const west = Math.min(road.x0, road.x1);
      const outward = Math.sign(road.x0 - road.x1) || 1;
      return { x: west + 3.5 * PITCH + outward * 8, z: road.z0, rotation: Math.PI / 2, width, inward: -outward, name: road.name, accent: road.accent, emblem: road.emblem ?? null };
    }
    const north = Math.min(road.z0, road.z1);
    const outward = Math.sign(road.z0 - road.z1) || 1;
    return { x: road.x0, z: north + STREAM.offset + outward * 5.6, rotation: 0, width, inward: -outward, name: road.name, accent: road.accent, emblem: road.emblem ?? null };
  });
}

/**
 * Lanterns every few metres on one verge of each street, street trees and the odd bench on the other, a signpost at a
 * few crossings and the odd bike rack by a used lot's gate.
 */
function streets(add: Add, plan: DressPlan, free: (x: number, z: number, pad: number) => boolean, tree: Tree) {
  const verge = LANE / 2 + (PITCH - PLOT_SIZE - LANE) / 4;
  const corners = nodes(plan);
  const crossing = (x: number, z: number) => corners.some((n) => Math.abs(n.x - x) < (PITCH - PLOT_SIZE) / 2 + 0.8 && Math.abs(n.z - z) < (PITCH - PLOT_SIZE) / 2 + 0.8);
  const LANTERN = 9,
    TREE = 13;
  for (const s of plan.streets) {
    const row = Math.round((along(s) === "x" ? s.z0 : s.x0) / PITCH);
    const odd = Math.abs(row) % 2 === 1;
    if (along(s) === "x") {
      const x0 = Math.min(s.x0, s.x1),
        x1 = Math.max(s.x0, s.x1);
      for (let x = Math.ceil((x0 + 3) / LANTERN) * LANTERN - 5; x < x1 - 3; x += LANTERN) {
        if (x < x0 + 3) continue;
        const z = s.z0 + (odd ? verge : -verge);
        if (!crossing(x, z) && free(x, z, 0.35)) add("town.lantern", x, GRASS_Y, z, { seed: row * 50 + x });
      }
      for (let x = Math.ceil((x0 + 3) / TREE) * TREE - 4.5; x < x1 - 3; x += TREE) {
        if (x < x0 + 3) continue;
        const z = s.z0 + (odd ? -verge : verge);
        if (crossing(x, z) || !free(x, z, 0.8)) continue;
        const seed = row * 70 + Math.round(x);
        if (noise(seed, 1) < 0.22) add("town.bench", x, GRASS_Y, z, { rotation: odd ? 0 : Math.PI });
        else tree(x, z, GRASS_Y, seed, 1);
      }
    } else {
      const z0 = Math.min(s.z0, s.z1),
        z1 = Math.max(s.z0, s.z1);
      for (let z = Math.ceil((z0 + 3) / LANTERN) * LANTERN - 4; z < z1 - 3; z += LANTERN) {
        if (z < z0 + 3) continue;
        const x = s.x0 + (odd ? -verge : verge);
        if (!crossing(x, z) && free(x, z, 0.35)) add("town.lantern", x, GRASS_Y, z, { seed: row * 30 + z, rotation: Math.PI / 2 });
      }
      for (let z = Math.ceil((z0 + 3) / TREE) * TREE - 3.5; z < z1 - 3; z += TREE) {
        if (z < z0 + 3) continue;
        const x = s.x0 + (odd ? verge : -verge);
        if (crossing(x, z) || !free(x, z, 0.8)) continue;
        tree(x, z, GRASS_Y, row * 90 + Math.round(z), 1);
      }
    }
  }
  // A signpost on the corner of about one crossing in three, pointing along the streets.
  for (const n of corners) {
    if (noise(n.x, n.z, 201) > 0.34) continue;
    const x = n.x + verge,
      z = n.z + verge;
    if (free(x, z, 0.2)) add("town.signpost", x, GRASS_Y, z, { scale: 1.35, rotation: noise(n.x, n.z, 202) < 0.5 ? Math.PI / 4 : -Math.PI / 4, seed: Math.round(n.x + n.z) });
  }
  for (const lot of plan.lots) {
    const z = lot.lane - verge,
      x = lot.door.x + 3.4;
    const pick = Math.floor(noise(lot.centre.x, lot.centre.z, 203) * 12);
    if (pick % 3 === 1 && free(x, z, 0.3)) add("town.bike-rack", x, GRASS_Y, z, { rotation: 0 });
    if (pick % 4 === 2 && free(x + 2, z, 0.3)) add("crate", x + 2, GRASS_Y, z, { scale: 1.2, rotation: 0.4 });
  }
}

/**
 * What stands between the buildings: `town.feature` on the verge in front of each used lot, either side of its garden
 * path, facing the lane. The key is the planting's to fill (a stall, a ladder and crates, a little pool, a beehive); a
 * style or a look with nothing to say leaves the grass. Kept clear of the lanterns, trees and benches.
 */
function features(add: Add, placed: readonly Dressing[], plan: DressPlan, free: (x: number, z: number, pad: number) => boolean) {
  const taken = placed.filter((d) => /^town\.(lantern|oak|birch|pine|bench|bike-rack|signpost)$|^crate$/.test(d.key));
  for (const lot of plan.lots) {
    const c = lot.centre;
    const z = c.z + PLOT_SIZE / 2 + (PITCH - PLOT_SIZE - LANE) / 4;
    for (const [k, dx] of [-6.5, 6.5, -11].entries()) {
      const x = clamp(lot.door.x + dx, c.x - PLOT_SIZE / 2 + 1.5, c.x + PLOT_SIZE / 2 - 1.5);
      if (Math.abs(x - lot.door.x) < 3 || !free(x, z, 0.6) || taken.some((d) => Math.hypot(d.x - x, d.z - z) < 1.7)) continue;
      add("town.feature", x, GRASS_Y, z, { seed: (lot.seed ?? lot.index) * 3 + k });
    }
  }
}

/** The roads between districts: an avenue of trees on both verges and a lantern now and then. */
function avenues(add: Add, plan: DressPlan, free: (x: number, z: number, pad: number) => boolean) {
  const off = LANE / 2 + 1.5;
  for (const road of plan.roads) {
    const length = Math.hypot(road.x1 - road.x0, road.z1 - road.z0);
    const ux = (road.x1 - road.x0) / length,
      uz = (road.z1 - road.z0) / length;
    for (let d = 7; d < length - 5; d += 11) {
      for (const side of [-1, 1]) {
        const x = road.x0 + ux * d - uz * off * side,
          z = road.z0 + uz * d + ux * off * side;
        // Only out in the open: inside a district the road is one of its streets, dressed as such.
        if (plan.districts.some((district) => inside(district.bounds, x, z, 1)) || !free(x, z, 0.9)) continue;
        const seed = Math.round(x * 3 + z * 7);
        if ((Math.round(d / 11) + (side > 0 ? 0 : 1)) % 4 === 3) add("town.lantern", x, GRASS_Y, z, { seed });
        else add("town.birch", x, GRASS_Y, z, { rotation: noise(seed, 3) * 6.28, scale: 1.25 + noise(seed, 5) * 0.3, seed });
      }
    }
  }
}

/**
 * The open country inside the ground: every lattice lot that holds nothing is a wood, a meadow in flower, a hayfield
 * with a few sheep or plain grass, by its place. A clearing or a hamlet stands in the woods, so most of it is trees.
 */
function countryside(add: Add, plan: DressPlan, tree: Tree, free: (x: number, z: number, pad: number) => boolean) {
  const g = plan.ground;
  const woods = small(plan.tier) ? 0.8 : 0.4;
  const first = (v: number) => Math.floor((v + PITCH / 2) / PITCH) * PITCH - PITCH / 2;
  // The civic rows of a village or more are tended ground, not country.
  const reach = hasPark(plan) ? 2 * PITCH : PITCH + CIVIC_LOT / 2;
  const tended = small(plan.tier) ? null : span(-reach, reach, CIVIC_LANE - PITCH, CIVIC_LANE);
  // A field's own ground: a paler patch, where the whole lot is open and inside the ground.
  const field = (cx: number, cz: number) => {
    const half = PLOT_SIZE / 2 - 1;
    const open = [-1, 0, 1].every((dx) => [-1, 0, 1].every((dz) => free(cx + dx * half, cz + dz * half, 0.5)));
    if (open && inside(g, cx, cz, -half - 2)) add("town.field", cx, GRASS_Y, cz, { size: { width: PLOT_SIZE - 2, height: 0, depth: PLOT_SIZE - 2 }, rotation: (noise(cx, cz, 314) - 0.5) * 0.5 });
  };
  for (let cx = first(g.minX); cx < g.maxX + PITCH / 2; cx += PITCH)
    for (let cz = first(g.minZ); cz < g.maxZ + PITCH / 2; cz += PITCH) {
      if (tended && inside(tended, cx, cz, 0)) continue;
      const pick = noise(cx, cz, plan.seed % 1009, 301);
      if (pick < woods) {
        // A wood: trees close together round a heart that is off the lot's middle, bushes at their feet.
        const count = small(plan.tier) ? 9 : 8;
        const spread = small(plan.tier) ? PITCH - 3 : 17;
        const hx = cx + (noise(cx, cz, 312) - 0.5) * (PITCH - 3 - spread),
          hz = cz + (noise(cx, cz, 313) - 0.5) * (PITCH - 3 - spread);
        for (let i = 0; i < count; i++) {
          const x = hx + (noise(cx, cz, i, 302) - 0.5) * spread,
            z = hz + (noise(cx, cz, i, 303) - 0.5) * spread;
          if (!free(x, z, 1.6)) continue;
          if (i % 5 === 4) add("town.bush", x, GRASS_Y, z, { seed: i, scale: 1.1 + noise(cx, cz, i, 304) * 0.4 });
          else tree(x, z, GRASS_Y, Math.round(cx * 7 + cz * 13 + i), 1.3 + noise(cx, cz, i, 305) * 0.4);
        }
      } else if (pick < woods + 0.28) {
        // A meadow in flower: a field left to grow, with two drifts of wild flowers and long grass.
        field(cx, cz);
        for (let i = 0; i < 2; i++) {
          const x = cx + (noise(cx, cz, i, 306) - 0.5) * 14,
            z = cz + (noise(cx, cz, i, 307) - 0.5) * 14;
          if (free(x, z, 3.2) && inside(g, x, z, -3.6)) drift(add, x, z, 2.8, 2.2, 12, Math.round(cx + cz * 3 + i));
        }
      } else if (pick < woods + 0.45 && !small(plan.tier)) {
        // A hayfield: bales in a loose row and a few sheep.
        field(cx, cz);
        for (let i = 0; i < 5; i++) {
          const x = cx - 8 + i * 4 + noise(cx, cz, i, 308) * 1.6,
            z = cz + (noise(cx, cz, i, 309) - 0.5) * 12;
          if (!free(x, z, 1.4)) continue;
          if (i % 2) add("town.sheep", x, GRASS_Y, z, { rotation: noise(cx, cz, i, 310) * 6.28, scale: 1.3, seed: i });
          else add("town.hay-bale", x, GRASS_Y, z, { rotation: noise(cx, cz, i, 311) * 3, scale: 1.3 });
        }
      }
    }
}

/**
 * The green belt: loose rows of trees and bushes along the ground's edge (`rows` deep), and a ragged rim. A long edge
 * (a region's) is planted more loosely, so the belt of a region costs about what a town's does.
 */
function belt(add: Add, b: Bounds, tree: Tree, free: (x: number, z: number, pad: number) => boolean, rows: number) {
  let seed = 900;
  const loose = clamp((b.maxX - b.minX + b.maxZ - b.minZ) / 300, 1, 2.6);
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const nx = -(z1 - z0) / length,
      nz = (x1 - x0) / length;
    const count = Math.floor((length / (2.4 * loose)) * rows);
    for (let i = 0; i <= count; i++) {
      seed++;
      const t = i / count;
      const depth = 0.9 + noise(seed, 2) * (4.3 + (rows - 1) * 4.5);
      const x = clamp(x0 + (x1 - x0) * t + nx * depth + (noise(seed, 3) - 0.5) * 0.8, b.minX + 0.9, b.maxX - 0.9),
        z = clamp(z0 + (z1 - z0) * t + nz * depth + (noise(seed, 4) - 0.5) * 0.8, b.minZ + 0.9, b.maxZ - 0.9);
      if (!free(x, z, 1)) continue;
      if (noise(seed, 5) < 0.2) add("town.bush", x, GRASS_Y, z, { seed, scale: 1 + noise(seed, 6) * 0.4 });
      else tree(x, z, GRASS_Y, seed, 1.5);
    }
    const rim = Math.floor(length / (1.7 * loose));
    for (let i = 0; i <= rim; i++) {
      seed++;
      const t = (i + noise(seed, 7) * 0.6) / rim;
      const inset = 0.25 + noise(seed, 8) * 0.5;
      const x = clamp(x0 + (x1 - x0) * t + nx * inset, b.minX + 0.2, b.maxX - 0.2),
        z = clamp(z0 + (z1 - z0) * t + nz * inset, b.minZ + 0.2, b.maxZ - 0.2);
      if (!inside(b, x, z, 0) || !free(x, z, 0.4)) continue;
      const pick = noise(seed, 9);
      if (pick < 0.5) add("town.tall-grass", x, GRASS_Y, z, { seed, rotation: noise(seed, 10) * 6.28, scale: 1.6 + noise(seed, 11) * 1.4 });
      else if (pick < 0.68) add("town.rock", x, GRASS_Y, z, { seed, rotation: noise(seed, 10) * 6.28, scale: 0.8 + noise(seed, 11) * 1.1 });
      else if (pick < 0.8) add("town.bush", x, GRASS_Y, z, { seed, scale: 0.9 + noise(seed, 11) * 0.5 });
    }
  };
  // Clockwise, so the inward normal points into the town.
  edge(b.minX, b.minZ, b.maxX, b.minZ);
  edge(b.maxX, b.minZ, b.maxX, b.maxZ);
  edge(b.maxX, b.maxZ, b.minX, b.maxZ);
  edge(b.minX, b.maxZ, b.minX, b.minZ);
}
