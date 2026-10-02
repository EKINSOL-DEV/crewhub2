/* The small town around the buildings: where every street, garden path, tree, hedge, lantern and bench goes. Pure and
   deterministic (no Three.js, no DOM, no Math.random), so it runs under `node --test` and the same town always looks
   the same. TownScene asks the style for each piece by key and instances what repeats; navigation.ts walks the same
   paths, so the postman and walking agents keep to the paving.

   The plan, in world units (x east, z south):
   - Cobbled lanes run down the middle of every street between and around the plots, and along the civic row.
   - Every used plot has a lawn with hedges on its rim, a garden path from its front door down to the lane, a flower
     bed either side of the gate, a mailbox and two gate lanterns. An empty plot has a character of its own (`plotUse`):
     a meadow, an orchard, an allotment garden, a playground or a picnic lawn.
   - The civic row: the post office and the town hall on their lots with paved forecourts, the square with the
     fountain at the head of the main street, the café and the bus stop. West of it a park with a pond and a little
     bridge, east of it an orchard.
   - A green belt of trees rings the town. */
import { civicCenter, CIVIC_LOT, CIVIC_SIZE, PITCH, PLOT_SIZE, plotCenter, STREET, TOWN_CAPACITY, TOWN_COLUMNS, TOWN_ROWS, townBounds, type Bounds } from "./townLayout.ts";

/** Width of the cobbled lanes down the streets; grass verges are left either side. */
export const LANE = 3.2;
/** Width of a garden path from a front door to the lane. */
export const GARDEN_PATH = 1.6;
/** Top heights: the street grass, the paving on it, a lawn (plots and civic lots). Paving is 0.04 thick. */
export const GRASS_Y = 0.02;
export const COBBLE_Y = 0.06;
export const LAWN_Y = 0.17;

/** One piece of town dressing: a style model key and where it stands. */
export interface Dressing {
  key: string;
  x: number;
  y: number;
  z: number;
  /** Turn around y, radians. */
  rotation: number;
  scale: number;
  seed?: number;
  variant?: string;
  /** For stretchable pieces (paving, hedges, the pond, the bridge, fences, flower beds, lawns, wear). */
  size?: { width: number; height: number; depth: number };
  /** Small detail the Fast quality leaves out (grass tufts, wild flowers). */
  detail?: boolean;
}

/**
 * A landmark with a reserved spot, drawn whole (it may animate) and only once the style covers its key: the welcome
 * sign by the town's entrance road, the windmill at the meadow's edge, the greenhouse in the park, the water tower,
 * the clock post and the ducks on the pond.
 */
export interface Landmark {
  key: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
}

/** A used plot as the dressing sees it: its index, its front door on the town side and what stands on it. */
export interface DressedPlot {
  index: number;
  /** World position of the town cell just outside the front door. */
  door: { x: number; z: number };
  /** Footprints on the plot that dressing must keep clear of (the building, the parked truck). */
  obstacles: readonly Bounds[];
  /** Picks the front garden (`gardenKind`); the same building always gets the same garden. */
  seed?: number;
  /** An archived building's garden is overgrown. */
  archived?: boolean;
}

/** A front garden: a lawn with a tree, a terrace with tables, a vegetable patch or a bike shelter. */
export type GardenKind = "lawn" | "terrace" | "vegetables" | "bikes";
const GARDENS: readonly GardenKind[] = ["lawn", "terrace", "vegetables", "bikes"];
export function gardenKind(seed: number): GardenKind {
  return GARDENS[Math.min(GARDENS.length - 1, Math.floor(noise(Math.abs(Math.floor(seed)) % 100003, 17) * GARDENS.length))]!;
}
/** A stable number for a building slug, for `DressedPlot.seed`. */
export function slugSeed(slug: string): number {
  let h = 7;
  for (let i = 0; i < slug.length; i++) h = (Math.imul(h, 31) + slug.charCodeAt(i)) >>> 0;
  return h;
}

const rect = (cx: number, cz: number, width: number, depth: number): Bounds => ({
  minX: cx - width / 2,
  maxX: cx + width / 2,
  minZ: cz - depth / 2,
  maxZ: cz + depth / 2,
});
const span = (minX: number, maxX: number, minZ: number, maxZ: number): Bounds => ({ minX, maxX, minZ, maxZ });
const inside = (r: Bounds, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const overlaps = (a: Bounds, b: Bounds, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;

/* ── The street plan ──────────────────────────────────────────────────── */

/** x of the north-south streets: west of every column and east of the last. */
export function streetXs(): number[] {
  const first = plotCenter(0).x - PITCH / 2;
  return Array.from({ length: TOWN_COLUMNS + 1 }, (_, i) => first + i * PITCH);
}
/** z of the east-west streets: in front of the civic row and south of every building row. */
export function streetZs(): number[] {
  const first = plotCenter(0).z - PITCH / 2;
  return Array.from({ length: TOWN_ROWS + 1 }, (_, i) => first + i * PITCH);
}

/** The cobbled lanes: one per street, crossing at the corners. */
export function laneRects(): Bounds[] {
  const xs = streetXs(),
    zs = streetZs();
  const x0 = xs[0]! - LANE / 2,
    x1 = xs[xs.length - 1]! + LANE / 2;
  const z0 = zs[0]! - LANE / 2,
    z1 = zs[zs.length - 1]! + LANE / 2;
  return [...zs.map((z) => span(x0, x1, z - LANE / 2, z + LANE / 2)), ...xs.map((x) => span(x - LANE / 2, x + LANE / 2, z0, z1))];
}

/** The street in front of a building row: the lane its garden paths run down to. */
function laneSouthOf(z: number): number {
  return streetZs().find((s) => s > z) ?? streetZs()[streetZs().length - 1]!;
}

/** A garden path from a front door straight down to the lane in front of the plot. */
export function gardenPath(door: { x: number; z: number }): Bounds {
  return span(door.x - GARDEN_PATH / 2, door.x + GARDEN_PATH / 2, door.z - 0.6, laneSouthOf(door.z));
}

const CIVIC_LANE = streetZs()[0]!;
const POND = (() => {
  const post = civicCenter("post-office");
  const x = (post.x - CIVIC_LOT / 2 + plotCenter(0).x - PLOT_SIZE / 2) / 2;
  return rect(x, post.z - 1, 9, 5.6);
})();
const PARK_PATH_X = (POND.minX + POND.maxX) / 2;

/**
 * The paved places of the civic row: the forecourts of the post office and the town hall, the square and the main
 * street up to it, the café's and the bus stop's paths, and the park path over the bridge to the far bench.
 */
export function civicPaths(): Bounds[] {
  const square = civicCenter("square");
  return [...civicPaving(), rect(square.x, square.z, CIVIC_SIZE.square.width, CIVIC_SIZE.square.depth), rect(PARK_PATH_X, (POND.minZ + POND.maxZ) / 2, 1.6, POND.maxZ - POND.minZ + 1.4)];
}

/** The civic paths the town paves itself: all but the square (the square model brings its own paving) and the bridge. */
function civicPaving(): Bounds[] {
  const out: Bounds[] = [];
  for (const place of ["post-office", "town-hall"] as const) {
    const c = civicCenter(place);
    out.push(span(c.x - 4.5, c.x + 4.5, c.z + 0.2, c.z + CIVIC_LOT / 2));
    out.push(span(c.x - 1.2, c.x + 1.2, c.z + CIVIC_LOT / 2 - 0.1, CIVIC_LANE));
  }
  const square = civicCenter("square");
  out.push(span(square.x - LANE / 2, square.x + LANE / 2, square.z + CIVIC_SIZE.square.depth / 2 - 0.1, CIVIC_LANE));
  // The promenade: from each civic lot to the square, just behind the café, so the civic row reads as one place.
  out.push(...promenades());
  const cafe = civicCenter("cafe");
  out.push(span(cafe.x - 1, cafe.x + 1, cafe.z + CIVIC_SIZE.cafe.depth / 2, CIVIC_LANE));
  const stop = civicCenter("bus-stop");
  out.push(span(stop.x - 2, stop.x + 2, stop.z + CIVIC_SIZE["bus-stop"].depth / 2, CIVIC_LANE));
  // The park path: up from the lane to the pond and, past the bridge, on to the bench at the far side.
  out.push(span(PARK_PATH_X - 0.8, PARK_PATH_X + 0.8, POND.maxZ + 0.6, CIVIC_LANE));
  out.push(span(PARK_PATH_X - 0.8, PARK_PATH_X + 0.8, POND.minZ - 3.4, POND.minZ - 0.6));
  return out;
}

/** The bus's lay-by: a paved bay east of the stop, between it and the lane. */
export function busBay(): Bounds {
  const stop = civicCenter("bus-stop");
  return span(stop.x + CIVIC_SIZE["bus-stop"].width / 2 + 0.6, stop.x + CIVIC_SIZE["bus-stop"].width / 2 + 5.4, CIVIC_LANE - LANE / 2 - 1.9, CIVIC_LANE - LANE / 2);
}

/** The two halves of the promenade, lot edge to square edge. */
function promenades(): Bounds[] {
  const square = civicCenter("square"),
    post = civicCenter("post-office"),
    hall = civicCenter("town-hall");
  const z0 = square.z - 2.4,
    z1 = square.z - 0.2;
  return [span(post.x + CIVIC_LOT / 2, square.x - CIVIC_SIZE.square.width / 2 + 0.1, z0, z1), span(square.x + CIVIC_SIZE.square.width / 2 - 0.1, hall.x - CIVIC_LOT / 2, z0, z1)];
}

/** The stream along the town's southern edge: a gentle meander from the west edge to the east, under the entrance road. */
export const STREAM = { z: 66.5, width: 1.5, amplitude: 0.7 };
export function streamPath(): { x: number; z: number }[] {
  const b = townBounds();
  const points: { x: number; z: number }[] = [];
  for (let x = b.minX; x <= b.maxX + 1e-6; x += 6) points.push({ x, z: STREAM.z + Math.sin(x * 0.11 + 0.7) * STREAM.amplitude * (0.6 + 0.4 * Math.sin(x * 0.037)) });
  return points;
}
/** Where the stream runs, with its banks: nothing is planted there. */
export function streamBand(): Bounds {
  const b = townBounds();
  const pad = STREAM.amplitude + STREAM.width / 2 + 0.6;
  return { minX: b.minX, maxX: b.maxX, minZ: STREAM.z - pad, maxZ: STREAM.z + pad };
}

/** The town's entrance road: the main street, on south from the last lane through the green belt to the edge. */
export function entranceRoad(): Bounds {
  const zs = streetZs();
  const x = civicCenter("square").x;
  return span(x - LANE / 2, x + LANE / 2, zs[zs.length - 1]!, townBounds().maxZ - 0.2);
}

/** Every walkable paved rectangle: the lanes, the entrance road, the civic paths and one garden path per door. */
export function townPaths(doors: readonly { x: number; z: number }[]): Bounds[] {
  return [...laneRects(), entranceRoad(), ...civicPaths(), ...doors.map(gardenPath)];
}

/** The landmarks' reserved spots (see `Landmark`), with the radius dressing keeps clear around each. */
export function landmarks(): (Landmark & { clear: number })[] {
  const b = townBounds();
  const road = entranceRoad();
  const post = civicCenter("post-office"),
    hall = civicCenter("town-hall");
  const pond = POND,
    cz = (pond.minZ + pond.maxZ) / 2;
  return [
    { key: "civic.welcome-sign", x: road.maxX + 1.6, y: GRASS_Y, z: b.maxZ - 5.8, rotation: 0, clear: 1.8 },
    { key: "civic.windmill", x: hall.x + 13, y: GRASS_Y, z: b.minZ + 6.2, rotation: -0.5, clear: 3.6 },
    { key: "civic.water-tower", x: post.x + 8, y: GRASS_Y, z: b.minZ + 5.6, rotation: 0, clear: 2.8 },
    { key: "civic.greenhouse", x: pond.maxX + 2.6, y: GRASS_Y, z: pond.minZ - 4.2, rotation: 0, clear: 2.6 },
    { key: "civic.clock-post", x: civicCenter("square").x - LANE / 2 - 1.1, y: GRASS_Y, z: CIVIC_LANE + LANE / 2 + 1.1, rotation: 0, clear: 0.9 },
    { key: "civic.duck", x: pond.minX + 2.6, y: GRASS_Y + 0.09, z: cz + 1.2, rotation: 0.6, clear: 0 },
    { key: "civic.duck", x: pond.minX + 3.3, y: GRASS_Y + 0.09, z: cz + 1.7, rotation: 0.9, clear: 0 },
    { key: "civic.duck", x: pond.maxX - 2.4, y: GRASS_Y + 0.09, z: cz - 1.1, rotation: -2.4, clear: 0 },
  ];
}

/** The pond in the park (the bridge crosses it on the park path). */
export function pondRect(): Bounds {
  return POND;
}

/* ── Dressing ─────────────────────────────────────────────────────────── */

/** A small deterministic hash in [0, 1) of a few numbers. */
export function noise(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= Math.round(v * 1000);
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

const TREES = ["town.oak", "town.birch", "town.pine"] as const;

/**
 * The whole town dressing for the plots in use, in a fixed order. Empty plots (indices not in `plots`) are meadows.
 */
export function townDressing(plots: readonly DressedPlot[]): Dressing[] {
  const out: Dressing[] = [];
  const add = (key: string, x: number, y: number, z: number, extra: Partial<Dressing> = {}) =>
    out.push({ key, x, y, z, rotation: 0, scale: 1, ...extra });
  const paths = townPaths(plots.map((p) => p.door));
  const bounds = townBounds();
  const used = new Map(plots.map((p) => [p.index, p]));
  /** Keep-out zones for trees, benches and the like: paths, civic pieces, lots, used plots' buildings. */
  const blocked: Bounds[] = [...paths];
  for (const place of ["post-office", "town-hall"] as const) {
    const c = civicCenter(place);
    blocked.push(rect(c.x, c.z, CIVIC_LOT, CIVIC_LOT));
  }
  for (const place of ["square", "cafe", "bus-stop"] as const) {
    const c = civicCenter(place);
    blocked.push(rect(c.x, c.z, CIVIC_SIZE[place].width + 1, CIVIC_SIZE[place].depth + 1));
  }
  blocked.push(rect(PARK_PATH_X, (POND.minZ + POND.maxZ) / 2, POND.maxX - POND.minX + 1, POND.maxZ - POND.minZ + 1));
  for (const p of plots) {
    const c = plotCenter(p.index);
    blocked.push(rect(c.x, c.z, PLOT_SIZE, PLOT_SIZE));
  }
  for (const l of landmarks()) if (l.clear) blocked.push(rect(l.x, l.z, l.clear * 2, l.clear * 2));
  blocked.push(streamBand());
  blocked.push(busBay());
  for (const r of promenades()) blocked.push({ ...r, minZ: r.minZ - 1.2, maxZ: r.maxZ + 2.2 });
  const free = (x: number, z: number, pad: number) => !blocked.some((b) => inside(b, x, z, pad));
  const tree = (x: number, z: number, y: number, seed: number, scale = 1) => {
    const kind = TREES[Math.floor(noise(seed, 7) * TREES.length)]!;
    add(kind, x, y, z, { rotation: noise(seed, 3) * Math.PI * 2, scale: scale * (0.85 + noise(seed, 5) * 0.35), seed: Math.floor(noise(seed, 11) * 1000) });
  };

  /* The ground: grass everywhere, cobbled lanes, flagstone paths. */
  add("ground", (bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2, {
    size: { width: bounds.maxX - bounds.minX, height: 0.5, depth: bounds.maxZ - bounds.minZ },
  });
  for (const r of [...laneRects(), entranceRoad()]) paving(add, r, "cobble", GRASS_Y);
  // Crossings: a square of darker setts where two lanes meet, and grass worn bare where people cut the corners.
  for (const x of streetXs())
    for (const z of streetZs()) {
      add("town.crossing", x, GRASS_Y, z, { size: { width: LANE, height: 0.045, depth: LANE } });
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        if (noise(x, z, dx, dz) < 0.6) wear(add, x + dx * (LANE / 2 + 0.25), GRASS_Y, z + dz * (LANE / 2 + 0.25), 1.3, 1.3, noise(x, dz, z) * 3);
    }
  const lots = (["post-office", "town-hall"] as const).map((place) => rect(civicCenter(place).x, civicCenter(place).z, CIVIC_LOT, CIVIC_LOT));
  for (const r of civicPaving()) {
    const onLot = lots.some((l) => r.minX >= l.minX && r.maxX <= l.maxX && r.minZ >= l.minZ && r.maxZ <= l.maxZ);
    // Paths stop at the lane's edge; the cobbles carry on underneath for the walkers.
    paving(add, { ...r, maxZ: Math.min(r.maxZ, CIVIC_LANE - LANE / 2) }, "flag", onLot ? LAWN_Y : GRASS_Y + 0.002);
  }

  /* The plots: lawns with hedges and front gardens, or meadows. */
  for (let i = 0; i < TOWN_CAPACITY; i++) {
    const c = plotCenter(i);
    const plot = used.get(i);
    const use = plotUse(i);
    const wild = !plot && (use === "meadow" || use === "orchard" || use === "picnic");
    add("plot", c.x, 0, c.z, { size: { width: PLOT_SIZE, height: 0.16, depth: PLOT_SIZE }, ...(wild || plot?.archived ? { variant: "meadow" } : {}) });
    if (plot) garden(add, plot, tree);
    else if (use === "orchard") plotOrchard(add, i);
    else if (use === "allotment") allotment(add, i);
    else if (use === "playground") playground(add, i, tree);
    else if (use === "picnic") picnic(add, i, tree);
    else meadow(add, i, tree);
  }

  /* The civic row: lots, the park, the orchard. */
  for (const place of ["post-office", "town-hall"] as const) {
    const c = civicCenter(place);
    add("plot", c.x, 0, c.z, { size: { width: CIVIC_LOT, height: 0.16, depth: CIVIC_LOT } });
    const side = place === "post-office" ? -1 : 1;
    add("town.flower-bed", c.x - 5.1, LAWN_Y, c.z + 1.8, { size: { width: 0.9, height: 0.2, depth: 3.2 }, seed: 3 + side });
    add("town.flower-bed", c.x + 5.1, LAWN_Y, c.z + 1.8, { size: { width: 0.9, height: 0.2, depth: 3.2 }, seed: 5 + side });
    add("town.bike-rack", c.x + side * 5.3, LAWN_Y, c.z + 4.8, { rotation: Math.PI / 2 });
    add("town.lantern", c.x - 1.9, GRASS_Y, c.z + CIVIC_LOT / 2 + 0.6, { seed: 1 });
    add("town.lantern", c.x + 1.9, GRASS_Y, c.z + CIVIC_LOT / 2 + 0.6, { seed: 2 });
  }
  const post = civicCenter("post-office");
  const court = LAWN_Y + 0.04;
  add("cart", post.x + 3.6, court, post.z + 1.6, { rotation: -0.4, scale: 1.4 });
  add("crate", post.x - 3.7, court, post.z + 1.1, { scale: 1.3, rotation: 0.2 });
  add("crate", post.x - 3.2, court, post.z + 1.9, { scale: 1.1, rotation: -0.3 });
  add("crate", post.x - 3.5, court + 0.42, post.z + 1.4, { scale: 0.9, rotation: 0.6 });
  add("town.mailbox", post.x + 5.2, LAWN_Y, post.z + 5.1, { rotation: -Math.PI / 2 });
  const cafe = civicCenter("cafe");
  add("town.bike-rack", cafe.x + 2.6, GRASS_Y, cafe.z + 3.6, { rotation: Math.PI / 2 });
  add("crate", cafe.x - 3.3, GRASS_Y, cafe.z - 0.8, { scale: 1.2, rotation: 0.3 });
  add("crate", cafe.x - 3.1, GRASS_Y, cafe.z + 0.1, { scale: 1, rotation: -0.2 });
  const square = civicCenter("square");
  // String lights over the square, pole to pole across it.
  for (const dz of [-2.6, 2.6]) add("town.string-lights", square.x, GRASS_Y, square.z + dz, { size: { width: CIVIC_SIZE.square.width + 1.6, height: 2.7, depth: 0.1 } });
  for (const dx of [-1, 1]) add("town.lantern", square.x + dx * 2.6, GRASS_Y, square.z + CIVIC_SIZE.square.depth / 2 + 0.8, { seed: dx });
  const road = entranceRoad();
  for (const [x, z] of [
    [road.minX - 0.7, road.minZ + 3.4],
    [road.maxX + 0.7, road.minZ + 3.4],
  ] as const)
    add("town.lantern", x, GRASS_Y, z, { seed: Math.round(z) });
  stream(add);
  // Flower beds along the promenade's north side, with gaps to step through, and a lantern at each end.
  for (const r of promenades()) {
    for (let x = r.minX + 1.2; x + 3 < r.maxX - 0.8; x += 4.6)
      add("town.flower-bed", x + 1.5, GRASS_Y, r.minZ - 0.65, { size: { width: 3, height: 0.2, depth: 0.8 }, seed: Math.round(x) });
    for (const x of [r.minX + 0.6, r.maxX - 0.6]) add("town.lantern", x, GRASS_Y, r.maxZ + 0.45, { seed: Math.round(x) });
  }
  // A little market on the promenade east of the square: three stalls facing it, and further on two shade trees and
  // a bench facing the promenade.
  const east = promenades()[1]!;
  for (const [k, dx] of [2.4, 4.9, 7.4].entries()) add("town.market-stall", east.minX + dx, GRASS_Y, east.maxZ + 1.1, { rotation: Math.PI, scale: 1.15, seed: k });
  for (const [dx, dz, k] of [
    [13.5, 4.2, 0],
    [17.5, 5.6, 1],
  ] as const)
    if (free(east.minX + dx, east.maxZ + dz, 1.2)) tree(east.minX + dx, east.maxZ + dz, GRASS_Y, 83 + k, 1.3);
  if (free(east.minX + 15.5, east.maxZ + 1.6, 0.8)) add("town.bench", east.minX + 15.5, GRASS_Y, east.maxZ + 1.6, { rotation: Math.PI });
  // The bus waits in a paved bay beside its stop, clear of the lane.
  const bay = busBay();
  paving(add, bay, "cobble", GRASS_Y);
  add("town.bus", (bay.minX + bay.maxX) / 2, GRASS_Y + 0.04, (bay.minZ + bay.maxZ) / 2, { scale: 1.3 });
  // A pair of trees in the back corners of the town hall's lot frames it, clear of its podium and roof.
  for (const side of [-1, 1]) tree(civicCenter("town-hall").x + side * 5.4, civicCenter("town-hall").z - 5.4, LAWN_Y, 71 + side, 0.9);
  park(add, tree);
  orchard(add);

  /* Street furniture along the lanes: lanterns on one verge, street trees and benches on the other. */
  streets(add, free, tree, used);

  /* The green belt round the town, and grass and wild flowers wherever there is room. */
  belt(add, tree, free);
  for (let i = 0; i < 420; i++) {
    const x = bounds.minX + 1 + noise(i, 41) * (bounds.maxX - bounds.minX - 2),
      z = bounds.minZ + 1 + noise(i, 43) * (bounds.maxZ - bounds.minZ - 2);
    if (!free(x, z, 0.5)) continue;
    const key = noise(i, 47) < 0.55 ? "town.grass" : noise(i, 61) < 0.5 ? "town.flowers" : "town.wildflowers";
    add(key, x, GRASS_Y, z, { rotation: noise(i, 53) * 6.28, scale: 1.6 + noise(i, 59) * 0.8, seed: i, ...detail(key) });
  }
  // October: about one oak, birch or bush in five is turning (gold and orange) among the green.
  for (const d of out) if (AUTUMN.test(d.key) && noise(d.x, d.z, 77) < 0.2) d.key = `${d.key}-autumn`;
  return out;
}

const AUTUMN = /^town\.(oak|birch|bush)$/;

/** Grass tufts and wild flowers are detail the Fast quality leaves out. */
const detail = (key: string): Partial<Dressing> => (key === "town.grass" || key === "town.wildflowers" ? { detail: true } : {});

/** A soft patch of worn ground, `width` by `depth`, turned by `rotation`. */
function wear(add: Add, x: number, y: number, z: number, width: number, depth: number, rotation = 0) {
  add("town.wear", x, y + 0.004, z, { size: { width, height: 0, depth }, rotation });
}

type Add = (key: string, x: number, y: number, z: number, extra?: Partial<Dressing>) => void;
type Tree = (x: number, z: number, y: number, seed: number, scale?: number) => void;

/** Paving over a rectangle, standing on the ground at `y`. */
function paving(add: Add, r: Bounds, variant: "cobble" | "flag", y: number) {
  add("town.paving", (r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2, {
    variant,
    size: { width: r.maxX - r.minX, height: 0.04, depth: r.maxZ - r.minZ },
  });
}

/** A used plot: hedges on the rim, the garden path with beds and gate lanterns, trees in the free corners. */
function garden(add: Add, plot: DressedPlot, tree: Tree) {
  const c = plotCenter(plot.index);
  const half = PLOT_SIZE / 2;
  const path = gardenPath(plot.door);
  const keepOut = [...plot.obstacles, path];
  const clear = (r: Bounds, pad = 0.3) => !keepOut.some((o) => overlaps(o, r, pad));
  // The flagstone path across the lawn and the verge.
  paving(add, span(path.minX, path.maxX, path.minZ, c.z + half), "flag", LAWN_Y);
  paving(add, span(path.minX, path.maxX, c.z + half, laneSouthOf(c.z) - LANE / 2), "flag", GRASS_Y + 0.002);
  // Hedges along the rim in short runs, so a run that would cross the path or the truck is simply left out.
  const RUN = 3.4,
    INSET = 0.45;
  const runs = Math.floor(PLOT_SIZE / RUN);
  const step = PLOT_SIZE / runs;
  for (let i = 0; i < runs; i++) {
    const a = -half + (i + 0.5) * step;
    const length = step - 0.15;
    const edges: [number, number, boolean][] = [
      [c.x + a, c.z - half + INSET, false],
      [c.x - half + INSET, c.z + a, true],
      [c.x + half - INSET, c.z + a, true],
    ];
    for (const [x, z, turned] of edges) {
      const r = turned ? rect(x, z, 0.7, length) : rect(x, z, length, 0.7);
      if (!clear(r)) continue;
      add("town.hedge", x, LAWN_Y, z, { size: { width: length, height: 0.5, depth: 0.7 }, rotation: turned ? Math.PI / 2 : 0, seed: plot.index * 31 + i });
    }
  }
  // The front hedge runs up to the gate on either side, in runs that skip the truck.
  const southZ = c.z + half - INSET;
  for (const [from, to] of [
    [c.x - half + 0.1, path.minX - 0.65],
    [path.maxX + 0.65, c.x + half - 0.1],
  ] as const) {
    const pieces = Math.max(1, Math.ceil((to - from) / RUN));
    const length = (to - from) / pieces;
    for (let i = 0; i < pieces; i++) {
      const x = from + (i + 0.5) * length;
      if (length < 0.8 || !clear(rect(x, southZ, length - 0.15, 0.7), 0.3)) continue;
      add("town.hedge", x, LAWN_Y, southZ, { size: { width: length - 0.15, height: 0.5, depth: 0.7 }, seed: plot.index * 37 + i });
    }
  }
  add("town.gate", plot.door.x, LAWN_Y, southZ, { seed: plot.index });
  // Grass worn bare either side of where the garden path meets the lane.
  const laneEdge = laneSouthOf(c.z) - LANE / 2;
  for (const side of [-1, 1]) wear(add, plot.door.x + side * (GARDEN_PATH / 2 + 0.3), GRASS_Y, laneEdge - 0.35, 0.9, 0.7);
  // Flower beds either side of the garden path, then the mailbox and two lanterns at the gate.
  const gateZ = c.z + half - 1.5;
  for (const side of [-1, 1]) {
    const bed = rect(plot.door.x + side * (GARDEN_PATH / 2 + 1.5), gateZ, 2.4, 0.9);
    if (!clear(bed, 0.1)) continue;
    if (plot.archived) {
      // Gone to seed: wild flowers and long grass where the bed was.
      for (let k = 0; k < 4; k++)
        add(k % 2 ? "town.wildflowers" : "town.tall-grass", bed.minX + 0.3 + k * 0.6, LAWN_Y, gateZ + ((k % 3) - 1) * 0.2, { seed: plot.index * 9 + k, scale: 1.6, rotation: k });
    } else add("town.flower-bed", (bed.minX + bed.maxX) / 2, LAWN_Y, gateZ, { size: { width: 2.4, height: 0.2, depth: 0.9 }, seed: plot.index * 7 + side });
  }
  for (const side of [-1, 1]) {
    const lantern = { x: plot.door.x + side * (GARDEN_PATH / 2 + 0.35), z: c.z + half - 0.35 };
    if (clear(rect(lantern.x, lantern.z, 0.3, 0.3), 0)) add("town.lantern", lantern.x, LAWN_Y, lantern.z, { seed: plot.index + side, scale: 0.85 });
  }
  const box = { x: plot.door.x + GARDEN_PATH / 2 + 0.45, z: c.z + half - 1.1 };
  if (clear(rect(box.x, box.z, 0.3, 0.3), 0)) add("town.mailbox", box.x, LAWN_Y, box.z, { rotation: -Math.PI / 2 });
  frontGarden(add, plot, tree, clear);
  // Trees and bushes in the corners the building leaves free.
  const corners: [number, number][] = [
    [c.x - half + 1.3, c.z + half - 1.3],
    [c.x + half - 1.3, c.z + half - 1.3],
    [c.x + half - 1.3, c.z - half + 1.3],
    [c.x - half + 1.3, c.z - half + 1.3],
  ];
  corners.forEach(([x, z], i) => {
    if (!clear(rect(x, z, 1.6, 1.6), 0.2)) return;
    if (i < 3) tree(x, z, LAWN_Y, plot.index * 13 + i, 1.05);
    else add("town.bush", x, LAWN_Y, z, { seed: plot.index + i });
  });
}

/**
 * The front garden in the yard east of the garden path, between the building and the front hedge: a lawn with a tree
 * and a bench, a terrace with café tables, a vegetable patch or a bike shelter, by the building's seed. An archived
 * building's yard has gone wild instead: long grass, wild flowers and a heap of fallen leaves, still pretty.
 */
function frontGarden(add: Add, plot: DressedPlot, tree: Tree, clear: (r: Bounds, pad?: number) => boolean) {
  const c = plotCenter(plot.index);
  const half = PLOT_SIZE / 2;
  const building = plot.obstacles[0];
  const x0 = plot.door.x + GARDEN_PATH / 2 + 3.4,
    x1 = c.x + half - 2.4;
  const z0 = (building ? building.maxZ : c.z + half - 5) + 0.35,
    z1 = c.z + half - 1.05;
  if (x1 - x0 < 3 || z1 - z0 < 2) return;
  const cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  const put = (key: string, x: number, z: number, w: number, d: number, extra: Partial<Dressing> = {}) => {
    if (clear(rect(x, z, w, d), 0.1)) add(key, x, extra.y ?? LAWN_Y, z, extra);
  };
  const seed = plot.seed ?? plot.index;
  if (plot.archived) {
    put("town.leaf-pile", cx + 0.8, cz + 0.2, 1.8, 1.2, { rotation: 0.4, scale: 1.3 });
    tree(x1 - 0.6, z0 + 0.9, LAWN_Y, seed + 3, 1.1);
    for (let k = 0; k < 14; k++) {
      const x = x0 + noise(seed, k, 1) * (x1 - x0),
        z = z0 + noise(seed, k, 2) * (z1 - z0);
      if (Math.hypot(x - cx - 0.8, z - cz - 0.2) < 1.2 || Math.hypot(x - x1 + 0.6, z - z0 - 0.9) < 1.1) continue;
      add(k % 3 ? "town.tall-grass" : "town.wildflowers", x, LAWN_Y, z, { seed: seed + k, scale: 1.5 + noise(seed, k, 3), rotation: k * 0.9 });
    }
    return;
  }
  switch (gardenKind(seed)) {
    case "lawn":
      tree(cx + 1.2, cz - 0.2, LAWN_Y, seed, 1.15);
      put("town.bench", cx - 1.4, cz + 0.4, 1.8, 0.8, { rotation: 0.3 });
      for (let k = 0; k < 4; k++) put("town.flowers", x0 + 0.4 + k * 0.9, z1 - 0.3, 0.5, 0.5, { seed: seed + k, scale: 1.8 });
      break;
    case "terrace":
      paving(add, span(x0, x1, z0 + 0.2, z1 - 0.2), "flag", LAWN_Y);
      put("civic.cafe-table", cx - 1.4, cz, 1.4, 1.4, { y: LAWN_Y + 0.04, rotation: 0.3 });
      put("civic.cafe-table", cx + 1.4, cz + 0.2, 1.4, 1.4, { y: LAWN_Y + 0.04, rotation: -0.4 });
      put("civic.planter", x1 - 0.4, z0 + 0.6, 0.8, 0.8, { y: LAWN_Y + 0.04 });
      put("civic.planter", x0 + 0.4, z0 + 0.6, 0.8, 0.8, { y: LAWN_Y + 0.04 });
      break;
    case "vegetables":
      for (const [dx, dz] of [
        [-1.3, -0.6],
        [1.3, -0.6],
        [-1.3, 0.75],
        [1.3, 0.75],
      ] as const)
        put("town.veg-bed", cx + dx, cz + dz, 2.3, 1, { seed: seed + dx * 3 + dz });
      put("town.bush", x1 - 0.2, z1 - 0.2, 0.8, 0.8, { seed });
      break;
    case "bikes":
      put("town.bike-shelter", cx, z0 + 0.95, 3.4, 1.6);
      for (let k = 0; k < 3; k++) put("town.flowers", cx - 1.4 + k * 1.4, z1 - 0.25, 0.5, 0.5, { seed: seed + k, scale: 1.8 });
      put("town.bush", x1 - 0.2, z1 - 0.3, 0.8, 0.8, { seed });
      break;
  }
}

/** What an empty plot is, by index: fixed, so the town keeps its places as it grows. */
export type PlotUse = "meadow" | "orchard" | "allotment" | "playground" | "picnic";
const PLOT_USES: readonly PlotUse[] = ["meadow", "picnic", "orchard", "playground", "orchard", "playground", "allotment", "picnic", "meadow", "picnic", "meadow", "orchard"];
export function plotUse(index: number): PlotUse {
  return PLOT_USES[index % PLOT_USES.length]!;
}

/** Wild flowers and grass scattered over a plot, clear of `spots`. */
function scatter(add: Add, index: number, count: number, spots: readonly { x: number; z: number; r: number }[]) {
  const c = plotCenter(index);
  const half = PLOT_SIZE / 2 - 1;
  for (let i = 0; i < count; i++) {
    const x = c.x + (noise(index, i, 15) * 2 - 1) * half,
      z = c.z + (noise(index, i, 16) * 2 - 1) * half;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r)) continue;
    const key = i % 3 ? (i % 2 ? "town.flowers" : "town.wildflowers") : "town.grass";
    add(key, x, LAWN_Y, z, { rotation: noise(index, i, 17) * 6.28, seed: index * 5 + i, scale: 1.6 + noise(index, i, 18) * 0.8, ...detail(key) });
  }
}

/** An orchard plot: fruit trees in staggered rows, a bench in their shade. */
function plotOrchard(add: Add, index: number) {
  const c = plotCenter(index);
  const spots: { x: number; z: number; r: number }[] = [];
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) {
      const x = c.x - 8.4 + k * 5.6 + (r % 2 ? 1.4 : -0.4),
        z = c.z - 8.4 + r * 5.6;
      if ((r === 3 && k === 2) || x > c.x + 10.5) continue;
      add("town.fruit-tree", x, LAWN_Y, z, { rotation: noise(index, r, k) * 6.28, scale: 1.15 + noise(index, k, r) * 0.3, seed: r * 4 + k });
      spots.push({ x, z, r: 1.6 });
    }
  add("town.bench", c.x + 3, LAWN_Y, c.z + 8.6, { rotation: 0.1 });
  spots.push({ x: c.x + 3, z: c.z + 8.6, r: 1.5 });
  scatter(add, index, 22, spots);
}

/** An allotment garden: raised vegetable beds either side of a flagstone path, a shed, a water butt of bushes. */
function allotment(add: Add, index: number) {
  const c = plotCenter(index);
  paving(add, span(c.x - 0.8, c.x + 0.8, c.z - 9.5, c.z + PLOT_SIZE / 2), "flag", LAWN_Y);
  for (let r = 0; r < 6; r++)
    for (const side of [-1, 1]) {
      const x = c.x + side * (2.6 + (r % 2) * 0.2),
        z = c.z - 8 + r * 3;
      add("town.veg-bed", x, LAWN_Y, z, { rotation: side < 0 ? 0 : Math.PI });
      add("town.veg-bed", x + side * 3.4, LAWN_Y, z, { rotation: side < 0 ? 0 : Math.PI });
    }
  add("town.shed", c.x + 8.5, LAWN_Y, c.z - 9, { rotation: -Math.PI / 2 });
  add("town.washing-line", c.x - 8.6, LAWN_Y, c.z - 4, { rotation: Math.PI / 2 });
  add("town.bush", c.x + 9.6, LAWN_Y, c.z - 6.4, { seed: index });
  add("town.bush", c.x - 9.6, LAWN_Y, c.z - 9.6, { seed: index + 1 });
  add("town.bench", c.x - 8.8, LAWN_Y, c.z + 9.4, { rotation: 0.2 });
  for (let i = 0; i < 6; i++) add("town.flowers", c.x + 9.6, LAWN_Y, c.z - 2 + i * 1.8, { seed: index + i, scale: 2 });
}

/** A playground: a swing, a slide and a sandpit on the lawn, benches for the grown-ups, shade trees. */
function playground(add: Add, index: number, tree: Tree) {
  const c = plotCenter(index);
  add("town.swing", c.x - 4, LAWN_Y, c.z - 3, { rotation: 0.3, scale: 1.4 });
  add("town.slide", c.x + 4, LAWN_Y, c.z - 4, { rotation: -0.5, scale: 1.4 });
  add("town.sandpit", c.x + 1, LAWN_Y, c.z + 3, { scale: 1.4 });
  wear(add, c.x - 4, LAWN_Y, c.z - 3, 3.4, 1.4, 0.3);
  add("town.bench", c.x - 5, LAWN_Y, c.z + 5, { rotation: 0.5 });
  add("town.bench", c.x + 6, LAWN_Y, c.z + 4, { rotation: -0.6 });
  const trees: [number, number][] = [
    [-8.5, -8.5],
    [8.5, -8.5],
    [-9, 7],
    [9, 9],
  ];
  trees.forEach(([x, z], i) => tree(c.x + x, c.z + z, LAWN_Y, index * 19 + i, 1.4));
  border(add, index, 6.5);
  for (const [x, z] of [
    [-6.8, -6.6],
    [6.6, -6.4],
    [7.4, 7.6],
  ] as const)
    add("town.bush", c.x + x, LAWN_Y, c.z + z, { seed: index + x, scale: 1.3 });
  scatter(add, index, 10, [
    { x: c.x - 4, z: c.z - 3, r: 2.6 },
    { x: c.x + 4, z: c.z - 4, r: 2 },
    { x: c.x + 1, z: c.z + 3, r: 1.8 },
    ...trees.map(([x, z]) => ({ x: c.x + x, z: c.z + z, r: 1.6 })),
  ]);
}

/** A tight drift of wild flowers and long grass round (x, z): a patch that reads from afar, not a sprinkle of dots. */
function drift(add: Add, x: number, z: number, rx: number, rz: number, count: number, seed: number) {
  for (let i = 0; i < count; i++) {
    // Sunflower spiral: even cover of the ellipse, denser at the heart.
    const r = Math.sqrt((i + 0.5) / count),
      a = i * 2.39996 + noise(seed, i) * 0.6;
    const key = i % 4 === 3 ? "town.tall-grass" : i % 3 ? "town.wildflowers" : "town.flowers";
    add(key, x + Math.cos(a) * r * rx, LAWN_Y, z + Math.sin(a) * r * rz, { rotation: noise(seed, i, 1) * 6.28, seed: seed + i, scale: 1.7 + noise(seed, i, 2) * 0.7, ...detail(key) });
  }
}

/** A tended border of flower beds along the plot's lane side, with a gap where people walk in. */
function border(add: Add, index: number, length: number) {
  const c = plotCenter(index);
  const z = c.z + PLOT_SIZE / 2 - 1.3;
  for (const side of [-1, 1])
    add("town.flower-bed", c.x + side * (1.6 + length / 2), LAWN_Y, z, { size: { width: length, height: 0.2, depth: 0.85 }, seed: index * 3 + side });
}

/** A copse: trees close together round (x, z) with bushes at their feet; returns the trees' spots. */
function copse(add: Add, tree: Tree, x: number, z: number, count: number, seed: number, scale: number) {
  const spots: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + noise(seed, i) * 0.8,
      r = i === 0 ? 0 : 2.3 + noise(seed, i, 1) * 0.8;
    const tx = x + Math.cos(a) * r,
      tz = z + Math.sin(a) * r;
    tree(tx, tz, LAWN_Y, seed + i, scale * (i === 0 ? 1.15 : 0.9 + noise(seed, i, 2) * 0.2));
    spots.push({ x: tx, z: tz, r: 1.8 });
  }
  for (let i = 0; i < 3; i++) {
    const a = noise(seed, i, 5) * Math.PI * 2;
    add("town.bush", x + Math.cos(a) * 3.9, LAWN_Y, z + Math.sin(a) * 3.9, { seed: seed + i, scale: 1.2 });
  }
  return spots;
}

/** A picnic lawn: blankets in the shade of a tree group, a bench beside them, a flower border along the lane. */
function picnic(add: Add, index: number, tree: Tree) {
  const c = plotCenter(index);
  const flip = index % 2 ? -1 : 1;
  const grove = { x: c.x - 4.5 * flip, z: c.z - 5 };
  const spots = copse(add, tree, grove.x, grove.z, 3, index * 23, 1.6);
  const blankets: [number, number, number][] = [
    [grove.x + 3.8 * flip, grove.z + 3.6, 0.4],
    [grove.x + 6.4 * flip, grove.z + 5.6, -0.3],
    [grove.x + 2.4 * flip, grove.z + 6.6, 1.2],
  ];
  for (const [x, z, rotation] of blankets) {
    add("town.picnic-blanket", x, LAWN_Y, z, { rotation });
    spots.push({ x, z, r: 1.5 });
  }
  add("town.bench", grove.x + 8.6 * flip, LAWN_Y, grove.z + 2.4, { rotation: -0.5 * flip });
  spots.push({ x: grove.x + 8.6 * flip, z: grove.z + 2.4, r: 1.5 });
  border(add, index, 7.5);
  drift(add, c.x + 6.5 * flip, c.z - 6.5, 2.4, 1.8, 12, index * 31);
  scatter(add, index, 8, [...spots, { x: c.x + 6.5 * flip, z: c.z - 6.5, r: 3 }, { x: c.x, z: c.z + PLOT_SIZE / 2 - 1.3, r: 0 }]);
}

/** An empty plot: a meadow with a copse of trees and a bench facing it, and a drift of wild flowers. */
function meadow(add: Add, index: number, tree: Tree) {
  const c = plotCenter(index);
  const sx = noise(index, 1) < 0.5 ? -1 : 1,
    sz = noise(index, 2) < 0.5 ? -1 : 1;
  const grove = { x: c.x + sx * 5, z: c.z + sz * 4.5 };
  const spots = copse(add, tree, grove.x, grove.z, 4 + Math.floor(noise(index, 3) * 2), index * 17, 1.45);
  const bench = { x: grove.x - sx * 5, z: grove.z - sz * 1.2 };
  add("town.bench", bench.x, LAWN_Y, bench.z, { rotation: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
  spots.push({ ...bench, r: 1.4 });
  const field = { x: c.x - sx * 5, z: c.z - sz * 5 };
  drift(add, field.x, field.z, 3.6, 2.8, 26, index * 29);
  spots.push({ ...field, r: 4 });
  scatter(add, index, 8, spots);
}

/** The stream: overlapping stretches along its course, square-cut at the diorama's edges where it spills over in a
 *  little waterfall, a timber bridge for the entrance road (its lanterns stand by the lane), reeds and stones along the banks. */
function stream(add: Add) {
  const points = streamPath();
  const b = townBounds();
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!,
      c = points[i + 1]!;
    const edge = i === 0 || i + 2 === points.length;
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    // The end stretches run straight out to the edge, square-cut; the others overlap with round ends.
    add("town.stream", (a.x + c.x) / 2, GRASS_Y, (a.z + c.z) / 2, {
      size: { width: length + (edge ? 0 : STREAM.width), height: 0, depth: STREAM.width },
      rotation: Math.atan2(-(c.z - a.z), c.x - a.x),
      ...(edge ? { variant: "cut" } : {}),
    });
  }
  for (const end of [points[0]!, points[points.length - 1]!])
    add("town.stream", end.x < 0 ? b.minX - 0.28 : b.maxX + 0.28, GRASS_Y, end.z, { size: { width: 0, height: 0, depth: STREAM.width }, variant: "fall", rotation: end.x < 0 ? Math.PI : 0 });
  const road = entranceRoad();
  const at = streamAt(0);
  add("town.bridge", 0, GRASS_Y + 0.02, at, { size: { width: road.maxX - road.minX + 0.4, height: 0.28, depth: STREAM.width + 2.2 } });
  // Reeds and stones along both banks, thinning out; none by the bridge.
  for (let i = 0; i < 70; i++) {
    const x = b.minX + 1.5 + noise(i, 81) * (b.maxX - b.minX - 3);
    if (Math.abs(x) < 3) continue;
    const side = noise(i, 82) < 0.5 ? -1 : 1;
    const z = streamAt(x) + side * (STREAM.width / 2 + 0.25 + noise(i, 83) * 0.35);
    const pick = noise(i, 84);
    if (pick < 0.6) add("town.tall-grass", x, GRASS_Y, z, { seed: 700 + i, rotation: noise(i, 85) * 6.28, scale: 1.5 + noise(i, 86) * 1.2 });
    else if (pick < 0.85) add("town.rock", x, GRASS_Y, z, { seed: 700 + i, rotation: noise(i, 85) * 6.28, scale: 0.6 + noise(i, 86) * 0.6 });
    else add("town.lily", x, GRASS_Y + 0.07, streamAt(x) + (noise(i, 87) - 0.5) * 0.5, { seed: 700 + i, rotation: noise(i, 85) * 6.28 });
  }
}

/** The stream's centre line at `x` (between the course's points). */
function streamAt(x: number): number {
  const points = streamPath();
  const i = Math.max(0, Math.min(points.length - 2, Math.floor((x - points[0]!.x) / 6)));
  const a = points[i]!,
    c = points[i + 1]!;
  return a.z + ((x - a.x) / (c.x - a.x)) * (c.z - a.z);
}

/** The park west of the post office: the pond, the bridge, willows and birches, benches and a low fence. */
function park(add: Add, tree: Tree) {
  const pond = POND;
  const cx = PARK_PATH_X,
    cz = (pond.minZ + pond.maxZ) / 2;
  add("town.pond", cx, GRASS_Y, cz, { size: { width: pond.maxX - pond.minX, height: 0.1, depth: pond.maxZ - pond.minZ } });
  add("town.bridge", cx, GRASS_Y, cz, { size: { width: 1.6, height: 0.5, depth: pond.maxZ - pond.minZ + 1.4 } });
  const parkX0 = plotCenter(0).x - PLOT_SIZE / 2,
    parkX1 = civicCenter("post-office").x - CIVIC_LOT / 2;
  const z0 = civicCenter("post-office").z - PLOT_SIZE / 2,
    z1 = CIVIC_LANE - LANE / 2 - 1.2;
  // Trees round the pond, leaving the path and the water clear.
  const ring: [number, number][] = [
    [pond.minX - 1.6, cz - 1.6],
    [pond.minX - 1.2, cz + 2.2],
    [pond.maxX + 1.4, cz - 2],
    [pond.maxX + 1.8, cz + 1.8],
    [parkX0 + 1.4, z0 + 1.6],
    [parkX1 - 1.6, z0 + 1.4],
    [parkX0 + 1.8, z1 - 1],
    [parkX1 - 1.4, z1 - 1.2],
  ];
  const reserved = landmarks().filter((l) => l.clear);
  ring.forEach(([x, z], i) => {
    if (!reserved.some((l) => Math.hypot(l.x - x, l.z - z) < l.clear + 1)) tree(x, z, GRASS_Y, 500 + i, 1.3);
  });
  for (const [x, z, seed] of [
    [pond.minX + 0.8, pond.maxZ + 0.9, 1],
    [pond.maxX - 1.2, pond.maxZ + 0.9, 2],
    [pond.minX + 1.6, pond.minZ - 0.9, 3],
  ] as const)
    add("town.flower-bed", x, GRASS_Y, z, { size: { width: 1.8, height: 0.2, depth: 0.7 }, seed: 40 + seed });
  add("town.bench", cx + 1.6, GRASS_Y, pond.minZ - 2.6, { rotation: Math.PI });
  add("town.picnic-blanket", pond.maxX + 2.4, GRASS_Y, cz + 0.6, { rotation: -0.5 });
  add("town.picnic-blanket", pond.minX - 1.6, GRASS_Y, pond.maxZ + 3.4, { rotation: 0.3 });
  add("town.bench", cx - 2.6, GRASS_Y, pond.maxZ + 1.9, { rotation: Math.PI / 2 + 0.2 });
  // Lanterns at both ends of the bridge, so the pond glows in the evening.
  for (const [dx, z] of [
    [-1.3, pond.maxZ + 0.9],
    [1.3, pond.maxZ + 0.9],
    [-1.3, pond.minZ - 0.9],
    [1.3, pond.minZ - 0.9],
  ] as const)
    add("town.lantern", cx + dx, GRASS_Y, z, { seed: 80 + dx * 2 + z, scale: 0.85 });
  add("town.lantern", cx - 1.2, GRASS_Y, pond.maxZ + 3.2, { seed: 70 });
  add("town.lantern", cx + 1.2, GRASS_Y, pond.minZ - 1.8, { seed: 71 });
  for (const [x, z] of [
    [pond.minX + 1.4, cz + 0.4],
    [pond.maxX - 1.6, cz - 0.6],
  ] as const)
    add("town.lily", x, GRASS_Y + 0.04, z, { seed: Math.round(x) });
  // A low fence along the lane, with a gap for the path.
  fence(add, parkX0 + 0.5, CIVIC_LANE - LANE / 2 - 0.7, cx - 1.2);
  fence(add, cx + 1.2, CIVIC_LANE - LANE / 2 - 0.7, parkX1 - 0.5);
}

/** The orchard east of the town hall: fruit trees in rows behind a low fence, and a picnic bench. */
function orchard(add: Add) {
  const x0 = civicCenter("town-hall").x + CIVIC_LOT / 2 + 1.5,
    x1 = plotCenter(TOWN_COLUMNS - 1).x + PLOT_SIZE / 2 - 1.5;
  const z0 = civicCenter("town-hall").z - PLOT_SIZE / 2 + 2,
    z1 = CIVIC_LANE - LANE / 2 - 2.6;
  const columns = 4,
    rows = 4;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < columns; k++) {
      const x = x0 + ((k + 0.5) / columns) * (x1 - x0) + (r % 2 ? 1.2 : -0.6),
        z = z0 + ((r + 0.5) / rows) * (z1 - z0);
      if (r === rows - 1 && k === 1) continue;
      add("town.fruit-tree", x, GRASS_Y, z, { rotation: noise(r, k) * 6.28, scale: 0.9 + noise(k, r, 1) * 0.25, seed: r * 4 + k });
    }
  add("town.bench", x0 + ((1.5 / columns) * (x1 - x0)) - 0.6, GRASS_Y, z1 - 1.1, { rotation: 0.15 });
  fence(add, x0 - 0.6, CIVIC_LANE - LANE / 2 - 0.7, x1 + 0.6);
}

/** A low fence from x0 to x1 at z, in sections the style stretches. */
function fence(add: Add, x0: number, z: number, x1: number) {
  const sections = Math.max(1, Math.round((x1 - x0) / 3));
  const length = (x1 - x0) / sections;
  for (let i = 0; i < sections; i++) add("town.fence", x0 + (i + 0.5) * length, GRASS_Y, z, { size: { width: length, height: 0.5, depth: 0.1 } });
}

/**
 * Lanterns every few metres on one verge of each lane, street trees and the odd bench on the other, signposts at a
 * few crossings and a pair of lanterns where each garden path meets the lane.
 */
function streets(add: Add, free: (x: number, z: number, pad: number) => boolean, tree: Tree, used: ReadonlyMap<number, DressedPlot>) {
  const xs = streetXs(),
    zs = streetZs();
  const verge = LANE / 2 + (STREET - LANE) / 4;
  const crossing = (x: number, z: number) => xs.some((sx) => Math.abs(sx - x) < STREET / 2 + 0.8) && zs.some((sz) => Math.abs(sz - z) < STREET / 2 + 0.8);
  const LANTERN = 9,
    TREE = 13;
  zs.forEach((z, row) => {
    for (let x = xs[0]! + 4; x < xs[xs.length - 1]! - 3; x += LANTERN) {
      const lz = z + (row % 2 ? verge : -verge);
      if (!crossing(x, lz) && free(x, lz, 0.35)) add("town.lantern", x, GRASS_Y, lz, { seed: row * 50 + x });
    }
    for (let x = xs[0]! + 8.5; x < xs[xs.length - 1]! - 3; x += TREE) {
      const tz = z + (row % 2 ? -verge : verge);
      if (crossing(x, tz) || !free(x, tz, 0.8)) continue;
      const seed = row * 70 + Math.round(x);
      if (noise(seed, 1) < 0.22) add("town.bench", x, GRASS_Y, tz, { rotation: row % 2 ? 0 : Math.PI });
      else tree(x, tz, GRASS_Y, seed, 1);
    }
  });
  xs.forEach((x, column) => {
    for (let z = zs[0]! + 5; z < zs[zs.length - 1]! - 3; z += LANTERN) {
      const lx = x + (column % 2 ? -verge : verge);
      if (!crossing(lx, z) && free(lx, z, 0.35)) add("town.lantern", lx, GRASS_Y, z, { seed: column * 30 + z, rotation: Math.PI / 2 });
    }
    for (let z = zs[0]! + 9.5; z < zs[zs.length - 1]! - 3; z += TREE) {
      const tx = x + (column % 2 ? verge : -verge);
      if (crossing(tx, z) || !free(tx, z, 0.8)) continue;
      tree(tx, z, GRASS_Y, column * 90 + Math.round(z), 1);
    }
  });
  // Signposts on the corner of a few crossings, pointing along the streets.
  const signs: [number, number][] = [
    [2, 0],
    [1, 1],
    [3, 2],
    [2, 2],
  ];
  for (const [xi, zi] of signs) {
    const x = xs[xi]! + verge,
      z = zs[zi]! + verge;
    if (free(x, z, 0.2)) add("town.signpost", x, GRASS_Y, z, { scale: 1.35, rotation: (xi + zi) % 2 ? Math.PI / 4 : -Math.PI / 4, seed: xi * 4 + zi });
  }
  // The odd bike rack and crate by the lanes in front of the used plots.
  for (const plot of used.values()) {
    const c = plotCenter(plot.index);
    const z = laneSouthOf(c.z) - verge;
    const x = plot.door.x + 3.4;
    if (plot.index % 3 === 1 && free(x, z, 0.3)) add("town.bike-rack", x, GRASS_Y, z, { rotation: 0 });
    if (plot.index % 4 === 2 && free(x + 2, z, 0.3)) add("crate", x + 2, GRASS_Y, z, { scale: 1.2, rotation: 0.4 });
  }
}

/** The green belt: two loose rows of trees and bushes along the town's edge. */
function belt(add: Add, tree: Tree, free: (x: number, z: number, pad: number) => boolean) {
  const b = townBounds();
  let seed = 900;
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const count = Math.floor(length / 2.4);
    for (let i = 0; i <= count; i++) {
      seed++;
      const t = i / count;
      const nx = -(z1 - z0) / length,
        nz = (x1 - x0) / length;
      const depth = 0.9 + noise(seed, 2) * 4.3;
      const x = clamp(x0 + (x1 - x0) * t + nx * depth + (noise(seed, 3) - 0.5) * 0.8, b.minX + 0.9, b.maxX - 0.9),
        z = clamp(z0 + (z1 - z0) * t + nz * depth + (noise(seed, 4) - 0.5) * 0.8, b.minZ + 0.9, b.maxZ - 0.9);
      if (!free(x, z, 1)) continue;
      if (noise(seed, 5) < 0.2) add("town.bush", x, GRASS_Y, z, { seed, scale: 1 + noise(seed, 6) * 0.4 });
      else tree(x, z, GRASS_Y, seed, 1.5);
    }
    // The rim itself: tall grass, rocks and bushes right at the lip, so the edge line never runs straight.
    const rim = Math.floor(length / 1.7);
    for (let i = 0; i <= rim; i++) {
      seed++;
      const t = (i + noise(seed, 7) * 0.6) / rim;
      const nx = -(z1 - z0) / length,
        nz = (x1 - x0) / length;
      const inset = 0.25 + noise(seed, 8) * 0.5;
      const x = clamp(x0 + (x1 - x0) * t + nx * inset, b.minX + 0.2, b.maxX - 0.2),
        z = clamp(z0 + (z1 - z0) * t + nz * inset, b.minZ + 0.2, b.maxZ - 0.2);
      if (!free(x, z, 0.4)) continue;
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
