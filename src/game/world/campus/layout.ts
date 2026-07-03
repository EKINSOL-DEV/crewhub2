// Campus ground truth (M0 T8) — pure, seeded, three.js-free. One quad, a
// plaza at the origin, four path arms to the edges, four building plots
// (M1+ buildings land there), and seeded nature scatter everywhere else.
import { mulberry32 } from "@/game/sim/rand";

// plazaRadius grew with HQ (M9 polish): HQ_RECT's farthest corner is now
// hypot(9, 7) ≈ 11.4 (see buildings.ts) — 11 keeps the circular path ring
// surrounding HQ with breathing room instead of clipping its walls.
export const CAMPUS = { half: 40, plazaRadius: 11, pathHalfWidth: 1.1 } as const;

export interface Placement {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type ScatterKind =
  | "treeDefault"
  | "treeOak"
  | "treeDetailed"
  | "treeFat"
  | "treePine"
  | "rockLarge"
  | "rockSmall"
  | "flowerRed"
  | "flowerYellow"
  | "flowerPurple"
  | "bush"
  | "grassTuft";

export type PropKind = "lantern" | "bench" | "hedge" | "banner";

export interface CampusLayout {
  pathTiles: Placement[];
  plots: Rect[];
  scatter: Record<ScatterKind, Placement[]>;
  props: Record<PropKind, Placement[]>;
}

/** Local alias — tiny seeded PRNG; the world must render identically forever. */
const rng = mulberry32;

export function insidePlaza(x: number, z: number, margin: number): boolean {
  return Math.hypot(x, z) < CAMPUS.plazaRadius + margin;
}

export function nearPath(x: number, z: number, margin: number): boolean {
  const w = CAMPUS.pathHalfWidth + margin;
  return (Math.abs(x) < w && Math.abs(z) < CAMPUS.half) || (Math.abs(z) < w && Math.abs(x) < CAMPUS.half);
}

export function insidePlot(x: number, z: number, plots: Rect[], margin: number): boolean {
  return plots.some((p) => Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin);
}

const SEED = 0x517ec0de;

export function campusLayout(): CampusLayout {
  const rand = rng(SEED);
  const { half, plazaRadius } = CAMPUS;

  // Path arms: the solid path silhouette comes from Terrain's cream strips
  // (M0 visual pass); these stone tiles scatter on top as accents, rotated
  // deterministically so the pattern never visibly repeats.
  const pathTiles: Placement[] = [];
  let armIdx = 0;
  for (let d = plazaRadius + 1.5; d <= half - 2; d += 2.6) {
    const rot = ((armIdx++ % 4) * Math.PI) / 2 + d * 0.7;
    pathTiles.push({ x: d, z: 0, rot, scale: 1.8 });
    pathTiles.push({ x: -d, z: 0, rot: rot + Math.PI / 2, scale: 1.8 });
    pathTiles.push({ x: 0, z: d, rot: rot + Math.PI, scale: 1.8 });
    pathTiles.push({ x: 0, z: -d, rot: rot - Math.PI / 2, scale: 1.8 });
  }
  // Plaza ring: tiles laid tangentially around the fountain.
  const RING = 16;
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    pathTiles.push({
      x: Math.sin(a) * (plazaRadius - 1),
      z: Math.cos(a) * (plazaRadius - 1),
      rot: a + Math.PI / 2,
      scale: 2,
    });
  }

  // Four building plots on the diagonals — buildings arrive in M1+.
  const plots: Rect[] = [
    { x: 22, z: 22, w: 14, d: 12 },
    { x: -22, z: 22, w: 14, d: 12 },
    { x: 22, z: -22, w: 14, d: 12 },
    { x: -22, z: -22, w: 14, d: 12 },
  ];

  const taken: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, minR: number): boolean =>
    Math.abs(x) <= half - 2 &&
    Math.abs(z) <= half - 2 &&
    !insidePlaza(x, z, 2) &&
    !nearPath(x, z, 1.5) &&
    !insidePlot(x, z, plots, 1) &&
    !taken.some((t) => Math.hypot(t.x - x, t.z - z) < Math.max(t.r, minR));
  const place = (
    count: number,
    minR: number,
    scaleLo: number,
    scaleHi: number,
    /** Chance that an accepted placement spawns a grove companion nearby. */
    cluster = 0,
  ): Placement[] => {
    const out: Placement[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 60) {
      const x = (rand() * 2 - 1) * (half - 2);
      const z = (rand() * 2 - 1) * (half - 2);
      if (!free(x, z, minR)) continue;
      taken.push({ x, z, r: minR });
      out.push({ x, z, rot: rand() * Math.PI * 2, scale: scaleLo + rand() * (scaleHi - scaleLo) });
      // Groves read like a designed park; lone even sprinkle reads random.
      if (out.length < count && rand() < cluster) {
        const a = rand() * Math.PI * 2;
        const d = minR * (0.8 + rand() * 0.4);
        const cx = x + Math.sin(a) * d;
        const cz = z + Math.cos(a) * d;
        if (free(cx, cz, minR * 0.7)) {
          taken.push({ x: cx, z: cz, r: minR * 0.7 });
          out.push({
            x: cx,
            z: cz,
            rot: rand() * Math.PI * 2,
            scale: scaleLo + rand() * (scaleHi - scaleLo) * 0.8,
          });
        }
      }
    }
    return out;
  };

  const scatter: Record<ScatterKind, Placement[]> = {
    treeDefault: place(20, 3.4, 2.0, 3.1, 0.55),
    treeOak: place(15, 3.4, 2.0, 3.1, 0.55),
    treeDetailed: place(12, 3.4, 2.0, 2.9, 0.5),
    treeFat: place(10, 3.4, 2.0, 2.9, 0.5),
    treePine: place(12, 3.4, 2.4, 3.6, 0.6),
    rockLarge: place(8, 2.5, 1.2, 2),
    rockSmall: place(14, 1, 0.8, 1.4),
    flowerRed: place(14, 0.6, 1, 1.6),
    flowerYellow: place(14, 0.6, 1, 1.6),
    flowerPurple: place(14, 0.6, 1, 1.6),
    bush: place(18, 1.6, 1.2, 2),
    grassTuft: place(80, 0.5, 0.9, 1.5),
  };

  // Lanterns flank the four arms every 8 units, alternating sides.
  const lantern: Placement[] = [];
  let side = 1;
  for (let d = plazaRadius + 3; d <= half - 6; d += 8) {
    const off = (CAMPUS.pathHalfWidth + 0.9) * side;
    lantern.push({ x: d, z: off, rot: 0, scale: 1.4 });
    lantern.push({ x: -d, z: -off, rot: 0, scale: 1.4 });
    lantern.push({ x: off, z: d, rot: 0, scale: 1.4 });
    lantern.push({ x: -off, z: -d, rot: 0, scale: 1.4 });
    side = -side;
  }

  // Benches ring HQ from outside its walls (M6 — HQ now stands where the
  // fountain used to be the plaza's only centerpiece; M9 regrew HQ itself).
  // Candidates sit on the 8 compass points at r=13, which clears HQ_RECT's
  // farthest corner (hypot(9,7)≈11.40); the four cardinal ones fall in a
  // door's walk-in lane (within 1.5u of the x=0 or z=0 axis a door opens
  // onto) and are filtered out, leaving the same four diagonal spots as
  // before M6, just relocated outside HQ's (now wider) wingspan.
  const BENCH_RING_RADIUS = 13;
  const DOOR_LANE_HALF_WIDTH = 1.5;
  const bench: Placement[] = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((deg) => {
      const a = (deg / 180) * Math.PI;
      return {
        x: Math.sin(a) * BENCH_RING_RADIUS,
        z: Math.cos(a) * BENCH_RING_RADIUS,
        rot: a + Math.PI,
        scale: 1.3,
      };
    })
    .filter((p) => Math.abs(p.x) > DOOR_LANE_HALF_WIDTH && Math.abs(p.z) > DOOR_LANE_HALF_WIDTH);

  // Hedge arcs between the plaza exits.
  const hedge: Placement[] = [];
  const HEDGES = 16;
  for (let i = 0; i < HEDGES; i++) {
    const a = (i / HEDGES) * Math.PI * 2 + Math.PI / HEDGES;
    // Skip segments blocking the four path exits (near the axes).
    const nearAxis = Math.abs(Math.sin(a)) < 0.28 || Math.abs(Math.cos(a)) < 0.28;
    if (nearAxis) continue;
    hedge.push({
      x: Math.sin(a) * (plazaRadius + 1.2),
      z: Math.cos(a) * (plazaRadius + 1.2),
      rot: a + Math.PI / 2,
      scale: 1.6,
    });
  }

  // A banner where each path meets the world edge — "welcome to campus".
  const banner: Placement[] = [
    { x: half - 3, z: 1.8, rot: Math.PI / 2, scale: 1.6 },
    { x: -(half - 3), z: -1.8, rot: -Math.PI / 2, scale: 1.6 },
    { x: 1.8, z: half - 3, rot: 0, scale: 1.6 },
    { x: -1.8, z: -(half - 3), rot: Math.PI, scale: 1.6 },
  ];

  return { pathTiles, plots, scatter, props: { lantern, bench, hedge, banner } };
}
