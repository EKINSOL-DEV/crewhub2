// Seeded decor scatter (EKI-111): deterministic pseudo-random placement on a
// grid ring around the building — v1's trick, no Math.random() so renders are
// stable across frames, StrictMode remounts, and tests. Pure math, no three.
import type { WorldBounds } from "../lib/layout";

export interface ScatterPoint {
  x: number;
  z: number;
  /** Three independent uniforms in [0,1) — scale / rotation / variant picks. */
  r: number;
  r2: number;
  r3: number;
}

/** Deterministic pseudo-random in [0,1) from integer grid coords + salt. */
export function cellRandom(ix: number, iz: number, salt: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface ScatterOptions {
  /** Grid pitch between candidate cells. */
  step: number;
  /** Keep-out inflation around the bounds (decor never inside bounds+margin). */
  margin: number;
  /** How far beyond the keep-out the field extends. */
  extent: number;
  /** Distinguishes prop families sharing the same grid. */
  salt: number;
  /** Cell survives when its roll is below this density (0..1). */
  density: number;
}

/**
 * Scatter points on the ring around the (inflated) world bounds. Each
 * surviving cell is jittered inside its own cell so the grid never shows.
 */
export function scatterAround(bounds: WorldBounds, opts: ScatterOptions): ScatterPoint[] {
  const { step, margin, extent, salt, density } = opts;
  const keepOut = {
    minX: bounds.minX - margin,
    maxX: bounds.maxX + margin,
    minZ: bounds.minZ - margin,
    maxZ: bounds.maxZ + margin,
  };
  const minX = Math.floor((keepOut.minX - extent) / step);
  const maxX = Math.ceil((keepOut.maxX + extent) / step);
  const minZ = Math.floor((keepOut.minZ - extent) / step);
  const maxZ = Math.ceil((keepOut.maxZ + extent) / step);

  const points: ScatterPoint[] = [];
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iz = minZ; iz <= maxZ; iz++) {
      if (cellRandom(ix, iz, salt) >= density) continue;
      const jx = (cellRandom(ix, iz, salt + 1) - 0.5) * step * 0.8;
      const jz = (cellRandom(ix, iz, salt + 2) - 0.5) * step * 0.8;
      const x = ix * step + jx;
      const z = iz * step + jz;
      const inside = x > keepOut.minX && x < keepOut.maxX && z > keepOut.minZ && z < keepOut.maxZ;
      if (inside) continue;
      points.push({
        x,
        z,
        r: cellRandom(ix, iz, salt + 3),
        r2: cellRandom(ix, iz, salt + 4),
        r3: cellRandom(ix, iz, salt + 5),
      });
    }
  }
  return points;
}
