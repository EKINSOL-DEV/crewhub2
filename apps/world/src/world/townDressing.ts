/* The pieces every settlement is dressed with: a used plot's garden, the pocket parks (a meadow, an orchard, an
   allotment, a playground, a picnic lawn), paving, worn grass, fences, drifts of flowers and the seeded noise that
   places them. Pure and deterministic (no Three.js, no DOM, no Math.random), so it runs under `node --test` and the
   same town always looks the same. settlementDressing.ts decides what stands where at each tier and calls these;
   TownScene asks the style for each piece by key and instances what repeats. */
import { PLOT_SIZE, type Bounds, type PlotSpot } from "./townLayout.ts";

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
  /** Words painted on the piece (the staked plot's sign, a district gate's name). */
  text?: string;
  /** A palette name for the piece's accent (a district's colour on its gate). */
  accent?: string;
  /** The zone whose district the piece stands in (settlementDressing.ts), for the district's own look. */
  district?: string;
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
  /** The centre of the lot the plot stands on. */
  centre: PlotSpot;
  /** z of the middle of the lane the garden path runs down to. */
  lane: number;
}

/** What a green or an unbuilt plot is. */
export type PlotUse = "meadow" | "orchard" | "allotment" | "playground" | "picnic";

/** A garden path from a front door towards the lane in front of its plot. */
function gardenPath(door: { x: number; z: number }, lane: number): Bounds {
  return span(door.x - GARDEN_PATH / 2, door.x + GARDEN_PATH / 2, door.z - 0.6, lane);
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
const overlaps = (a: Bounds, b: Bounds, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;

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

/** Grass tufts and wild flowers are detail the Fast quality leaves out. */
export const detail = (key: string): Partial<Dressing> => (key === "town.grass" || key === "town.wildflowers" ? { detail: true } : {});

/** A soft patch of worn ground, `width` by `depth`, turned by `rotation`. */
export function wear(add: Add, x: number, y: number, z: number, width: number, depth: number, rotation = 0) {
  add("town.wear", x, y + 0.004, z, { size: { width, height: 0, depth }, rotation });
}

export type Add = (key: string, x: number, y: number, z: number, extra?: Partial<Dressing>) => void;
export type Tree = (x: number, z: number, y: number, seed: number, scale?: number) => void;

/** Paving over a rectangle, standing on the ground at `y`. */
export function paving(add: Add, r: Bounds, variant: "cobble" | "flag", y: number) {
  add("town.paving", (r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2, {
    variant,
    size: { width: r.maxX - r.minX, height: 0.04, depth: r.maxZ - r.minZ },
  });
}

/** A used plot: hedges on the rim, the garden path with beds and gate lanterns, trees in the free corners. */
export function garden(add: Add, plot: DressedPlot, tree: Tree) {
  const c = plot.centre;
  const half = PLOT_SIZE / 2;
  const path = gardenPath(plot.door, plot.lane);
  const keepOut = [...plot.obstacles, path];
  const clear = (r: Bounds, pad = 0.3) => !keepOut.some((o) => overlaps(o, r, pad));
  // The flagstone path across the lawn and the verge.
  paving(add, span(path.minX, path.maxX, path.minZ, c.z + half), "flag", LAWN_Y);
  paving(add, span(path.minX, path.maxX, c.z + half, plot.lane - LANE / 2), "flag", GRASS_Y + 0.002);
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
  const laneEdge = plot.lane - LANE / 2;
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
    if (!clear(rect(lantern.x, lantern.z, 0.3, 0.3), 0)) continue;
    add("town.lantern", lantern.x, LAWN_Y, lantern.z, { seed: plot.index + side, scale: 0.85 });
    // A hanging basket on each gate lantern, its arm reaching away from the path (not on a closed building's).
    if (!plot.archived) add("town.hanging-basket", lantern.x, LAWN_Y, lantern.z, { scale: 0.85, rotation: side < 0 ? Math.PI : 0 });
    // October: a pumpkin or two on the lawn by the gate.
    if (!plot.archived && noise(plot.index, side, 109) < 0.6) add("town.pumpkin", lantern.x + side * 0.55, LAWN_Y, lantern.z - 0.35, { rotation: noise(plot.index, side) * 6.28, scale: 1.5 });
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
  const c = plot.centre;
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

/** An unbuilt plot or a neighbourhood green dressed by its use, centred on `c`; `seed` varies it. */
export function pocket(add: Add, use: PlotUse, c: PlotSpot, seed: number, tree: Tree) {
  if (use === "orchard") plotOrchard(add, c, seed);
  else if (use === "allotment") allotment(add, c, seed);
  else if (use === "playground") playground(add, c, seed, tree);
  else if (use === "picnic") picnic(add, c, seed, tree);
  else meadow(add, c, seed, tree);
}

/** Wild flowers and grass scattered over a plot, clear of `spots`. */
function scatter(add: Add, c: PlotSpot, index: number, count: number, spots: readonly { x: number; z: number; r: number }[]) {
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
function plotOrchard(add: Add, c: PlotSpot, index: number) {
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
  scatter(add, c, index, 22, spots);
}

/** An allotment garden: raised vegetable beds either side of a flagstone path, a shed, a water butt of bushes. */
function allotment(add: Add, c: PlotSpot, index: number) {
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
  // A pumpkin patch at the allotment's far end.
  for (let i = 0; i < 9; i++) add("town.pumpkin", c.x - 9.4 + (i % 3) * 1.2 + noise(index, i, 110) * 0.4, LAWN_Y, c.z + 5.6 + Math.floor(i / 3) * 1.1, { rotation: noise(index, i) * 6.28, scale: 1.2 + noise(index, i, 111) * 0.9 });
  add("town.bush", c.x + 9.6, LAWN_Y, c.z - 6.4, { seed: index });
  add("town.bush", c.x - 9.6, LAWN_Y, c.z - 9.6, { seed: index + 1 });
  add("town.bench", c.x - 8.8, LAWN_Y, c.z + 9.4, { rotation: 0.2 });
  for (let i = 0; i < 6; i++) add("town.flowers", c.x + 9.6, LAWN_Y, c.z - 2 + i * 1.8, { seed: index + i, scale: 2 });
}

/** A playground: a swing, a slide and a sandpit on the lawn, benches for the grown-ups, shade trees. */
function playground(add: Add, c: PlotSpot, index: number, tree: Tree) {
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
  border(add, c, index, 6.5);
  for (const [x, z] of [
    [-6.8, -6.6],
    [6.6, -6.4],
    [7.4, 7.6],
  ] as const)
    add("town.bush", c.x + x, LAWN_Y, c.z + z, { seed: index + x, scale: 1.3 });
  scatter(add, c, index, 10, [
    { x: c.x - 4, z: c.z - 3, r: 2.6 },
    { x: c.x + 4, z: c.z - 4, r: 2 },
    { x: c.x + 1, z: c.z + 3, r: 1.8 },
    ...trees.map(([x, z]) => ({ x: c.x + x, z: c.z + z, r: 1.6 })),
  ]);
}

/** A tight drift of wild flowers and long grass round (x, z): a patch that reads from afar, not a sprinkle of dots. */
export function drift(add: Add, x: number, z: number, rx: number, rz: number, count: number, seed: number) {
  for (let i = 0; i < count; i++) {
    // Sunflower spiral: even cover of the ellipse, denser at the heart.
    const r = Math.sqrt((i + 0.5) / count),
      a = i * 2.39996 + noise(seed, i) * 0.6;
    const key = i % 4 === 3 ? "town.tall-grass" : i % 3 ? "town.wildflowers" : "town.flowers";
    add(key, x + Math.cos(a) * r * rx, LAWN_Y, z + Math.sin(a) * r * rz, { rotation: noise(seed, i, 1) * 6.28, seed: seed + i, scale: 1.7 + noise(seed, i, 2) * 0.7, ...detail(key) });
  }
}

/** A tended border of flower beds along the plot's lane side, with a gap where people walk in. */
function border(add: Add, c: PlotSpot, index: number, length: number) {
  const z = c.z + PLOT_SIZE / 2 - 1.3;
  for (const side of [-1, 1])
    add("town.flower-bed", c.x + side * (1.6 + length / 2), LAWN_Y, z, { size: { width: length, height: 0.2, depth: 0.85 }, seed: index * 3 + side });
}

/** A copse: trees close together round (x, z) with bushes at their feet; returns the trees' spots. */
export function copse(add: Add, tree: Tree, x: number, z: number, count: number, seed: number, scale: number) {
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
function picnic(add: Add, c: PlotSpot, index: number, tree: Tree) {
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
  border(add, c, index, 7.5);
  drift(add, c.x + 6.5 * flip, c.z - 6.5, 2.4, 1.8, 12, index * 31);
  scatter(add, c, index, 8, [...spots, { x: c.x + 6.5 * flip, z: c.z - 6.5, r: 3 }, { x: c.x, z: c.z + PLOT_SIZE / 2 - 1.3, r: 0 }]);
}

/** An empty plot: a meadow with a copse of trees and a bench facing it, and a drift of wild flowers. */
function meadow(add: Add, c: PlotSpot, index: number, tree: Tree) {
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
  scatter(add, c, index, 8, spots);
}

/** A low fence from x0 to x1 at z, in sections the style stretches. */
export function fence(add: Add, x0: number, z: number, x1: number) {
  const sections = Math.max(1, Math.round((x1 - x0) / 3));
  const length = (x1 - x0) / sections;
  for (let i = 0; i < sections; i++) add("town.fence", x0 + (i + 0.5) * length, GRASS_Y, z, { size: { width: length, height: 0.5, depth: 0.1 } });
}
