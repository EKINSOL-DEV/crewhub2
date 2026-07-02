// RTS camera math (M0 T6) — pure, three.js-free, fully tested. Two Point
// style: fixed pitch, yaw orbit, distance zoom, target pans on the ground
// plane. The rig component owns input + damping; this module owns truth.

export interface RtsCamera {
  targetX: number;
  targetZ: number;
  /** Radians around Y. 0 = camera south of target looking north. */
  yaw: number;
  distance: number;
}

export interface RtsBounds {
  /** Target may roam ±half on both axes. */
  half: number;
  minDistance: number;
  maxDistance: number;
}

/** Fixed camera elevation angle — the Two Point diorama tilt. */
export const PITCH = 0.85;
const PAN_SPEED = 0.0016; // world units per px per unit distance
const ZOOM_SPEED = 0.0016;

export const DEFAULT_CAMERA: RtsCamera = { targetX: 0, targetZ: 0, yaw: 0.6, distance: 34 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function pan(cam: RtsCamera, dxPx: number, dyPx: number, bounds: RtsBounds): RtsCamera {
  const s = cam.distance * PAN_SPEED;
  // Screen right = camera-right on the ground; screen up = camera-forward.
  const rightX = Math.cos(cam.yaw);
  const rightZ = -Math.sin(cam.yaw);
  const fwdX = -Math.sin(cam.yaw);
  const fwdZ = -Math.cos(cam.yaw);
  return {
    ...cam,
    targetX: clamp(cam.targetX - (dxPx * rightX + -dyPx * fwdX) * s, -bounds.half, bounds.half),
    targetZ: clamp(cam.targetZ - (dxPx * rightZ + -dyPx * fwdZ) * s, -bounds.half, bounds.half),
  };
}

export function rotate(cam: RtsCamera, dYaw: number): RtsCamera {
  return { ...cam, yaw: cam.yaw + dYaw };
}

export function zoom(cam: RtsCamera, wheelDelta: number, bounds: RtsBounds): RtsCamera {
  return {
    ...cam,
    distance: clamp(cam.distance * Math.exp(wheelDelta * ZOOM_SPEED), bounds.minDistance, bounds.maxDistance),
  };
}

export function pose(cam: RtsCamera): {
  position: [number, number, number];
  lookAt: [number, number, number];
} {
  const r = cam.distance * Math.cos(PITCH);
  const h = cam.distance * Math.sin(PITCH);
  return {
    position: [cam.targetX + r * Math.sin(cam.yaw), h, cam.targetZ + r * Math.cos(cam.yaw)],
    lookAt: [cam.targetX, 0, cam.targetZ],
  };
}

/** Exponential approach — frame-rate independent smoothing. */
export function damp(from: RtsCamera, to: RtsCamera, rate: number, dt: number): RtsCamera {
  const k = 1 - Math.exp(-rate * dt);
  return {
    targetX: from.targetX + (to.targetX - from.targetX) * k,
    targetZ: from.targetZ + (to.targetZ - from.targetZ) * k,
    yaw: from.yaw + (to.yaw - from.yaw) * k,
    distance: from.distance + (to.distance - from.distance) * k,
  };
}
