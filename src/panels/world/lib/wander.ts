// Idle wander (EKI-62): v1's botMovement "no-grid wander" rewritten as a pure
// step function — state in, state out, rng injected. The component layer just
// folds this inside useFrame; under prefers-reduced-motion it never calls it.
import type { WorldBounds } from "./layout";

export const WANDER_SPEED = 0.8; // m/s — a gentle stroll
export const ARRIVE_EPS = 0.15;
export const WAIT_MIN_S = 2;
export const WAIT_MAX_S = 6;

export interface WanderState {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  /** Seconds left standing around before picking the next target. */
  waitS: number;
  /** Facing angle (radians, atan2(dx, dz) — three.js Y-rotation convention). */
  heading: number;
  /** True while walking — drives the walk bob/phase. */
  moving: boolean;
}

export function initialWander(x: number, z: number): WanderState {
  return { x, z, targetX: x, targetZ: z, waitS: 0, heading: 0, moving: false };
}

/**
 * Advance the wander state by `dt` seconds inside `bounds`.
 * Arrive → wait (WAIT_MIN..WAIT_MAX via rng) → pick a new in-bounds target → walk.
 */
export function wanderStep(
  s: WanderState,
  dt: number,
  bounds: WorldBounds,
  rng: () => number,
  speed: number = WANDER_SPEED,
): WanderState {
  const dx = s.targetX - s.x;
  const dz = s.targetZ - s.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= ARRIVE_EPS) {
    if (s.waitS > dt) return { ...s, waitS: s.waitS - dt, moving: false };
    // Wait over — pick a fresh target uniformly inside the bounds.
    const targetX = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const targetZ = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
    const waitS = WAIT_MIN_S + rng() * (WAIT_MAX_S - WAIT_MIN_S);
    return { ...s, targetX, targetZ, waitS, moving: false };
  }

  const step = Math.min(speed * dt, dist);
  const nx = s.x + (dx / dist) * step;
  const nz = s.z + (dz / dist) * step;
  const arrived = dist - step <= ARRIVE_EPS;
  return {
    ...s,
    x: Math.min(bounds.maxX, Math.max(bounds.minX, nx)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, nz)),
    heading: Math.atan2(dx, dz),
    moving: !arrived,
    waitS: arrived ? WAIT_MIN_S + rng() * (WAIT_MAX_S - WAIT_MIN_S) : s.waitS,
  };
}
