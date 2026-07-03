// Camera director (M8 T1) — pure shortest-arc math plus a small mode store
// that sits above rts-camera.ts. The director never touches three.js or the
// rig's goal/damping loop: it just tracks *what* the camera should be looking
// at (free roam / a focused building / a followed bot) and, for focus, works
// out the goal yaw/distance itself. The rig (Task 2) drives its own
// RtsCamera goal toward that using shortestArcLerp/damp.
import { create } from "zustand";
import type { Building } from "@/game/world/campus/buildings";
import type { Rect } from "@/game/world/campus/layout";

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Signed angular difference `to - from`, wrapped to the shortest arc: always
 * in (-π, π]. Positive means "increase yaw to get there" (rts-camera.ts's
 * rotate() convention), negative means "decrease yaw". The seam at ±π always
 * resolves to +π so a caller comparing magnitudes never sees the same angle
 * report two different signs.
 */
export function shortestArcDelta(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  else if (delta <= -Math.PI) delta += TAU;
  return delta;
}

/**
 * Step `from` a fraction `k` of the way toward `to`, always via the shortest
 * arc — never the long way around the ±π seam. Same shape as rts-camera.ts's
 * damp(), but for a single angle: k=0 stays put, k=1 lands on an angle
 * coterminal with `to` (not necessarily numerically equal to `to` — e.g.
 * lerping from 3.0 to -3.0 at k=1 yields ~3.28, not -3.0 — but its sin/cos
 * match `to`'s).
 */
export function shortestArcLerp(from: number, to: number, k: number): number {
  return from + shortestArcDelta(from, to) * k;
}

const MIN_FOCUS_DISTANCE = 14;
const MAX_FOCUS_DISTANCE = 30;
const FOCUS_DISTANCE_FACTOR = 1.4;

/**
 * The door-facing yaw for a single door. A door always sits on the rect's
 * boundary (buildings.ts), so the vector from the rect's center to the door
 * IS the wall's outward normal. rts-camera.ts's pose() puts the camera at
 * target + distance*(sin(yaw), cos(yaw)) — so parking the camera on that same
 * side of the target and looking back at it (the room's center) is exactly
 * yaw = atan2(dx, dz).
 */
function doorYaw(rect: Rect, door: { x: number; z: number }): number {
  return Math.atan2(door.x - rect.x, door.z - rect.z);
}

export interface FocusTarget {
  rect: Rect;
  door: { x: number; z: number };
  /** Extra walk-ins (HQ has one per wall) — falls back to `[door]`. */
  doors?: { x: number; z: number }[];
}

/**
 * The camera goal for focusing on a building: centered on the rect, pulled
 * back enough to fit it (clamped to a sane range), yawed to look in through
 * whichever door reads as angularly closest to the camera's current yaw —
 * so focusing a multi-door building (HQ) never spins the camera all the way
 * around just to favor the "primary" door.
 */
export function focusForBuilding(
  b: FocusTarget,
  currentYaw: number,
): { target: { x: number; z: number }; yaw: number; distance: number } {
  const { rect } = b;
  const doors = b.doors && b.doors.length > 0 ? b.doors : [b.door];
  let yaw = doorYaw(rect, doors[0]!);
  let bestArc = Math.abs(shortestArcDelta(currentYaw, yaw));
  for (const door of doors.slice(1)) {
    const candidate = doorYaw(rect, door);
    const arc = Math.abs(shortestArcDelta(currentYaw, candidate));
    if (arc < bestArc) {
      yaw = candidate;
      bestArc = arc;
    }
  }
  const distance = clamp(
    Math.max(rect.w, rect.d) * FOCUS_DISTANCE_FACTOR,
    MIN_FOCUS_DISTANCE,
    MAX_FOCUS_DISTANCE,
  );
  return { target: { x: rect.x, z: rect.z }, yaw, distance };
}

export type CameraMode =
  | { kind: "free" }
  | { kind: "focus"; target: { x: number; z: number }; yaw: number; distance: number }
  | { kind: "follow"; botKey: string };

interface CameraDirectorState {
  mode: CameraMode;
  /**
   * Opaque snapshot of the rig's pre-cinematic goal (rts-camera.ts's
   * RtsCamera — the director doesn't need to know the shape). Written by the
   * rig via setSavedGoal(), meaningfully only once per cinematic session:
   * right after it observes a free -> (focus|follow) transition. Neither
   * focusBuilding() nor followBot() touch savedGoal themselves, so switching
   * between the two cinematic modes mid-session (focus <-> follow) keeps the
   * ORIGINAL saved goal intact — exit() is what finally restores-and-clears
   * it, once there's nothing left worth saving.
   */
  savedGoal: unknown | null;
  /** Enter (or retarget while already in) focus mode on a building. Replaces follow. */
  focusBuilding: (b: Building, currentYaw: number) => void;
  /** Enter (or retarget) follow mode on a bot. Replaces focus. */
  followBot: (key: string) => void;
  /** Back to free roam. Doesn't restore the camera itself — the rig reads
   *  savedGoal (if present) and applies it before this call clears it. */
  exit: () => void;
  /** Rig-owned: stash a goal snapshot. Only meaningful right after a
   *  free -> cinematic transition — see savedGoal's doc comment above. */
  setSavedGoal: (g: unknown) => void;
}

export const useCameraDirector = create<CameraDirectorState>((set) => ({
  mode: { kind: "free" },
  savedGoal: null,
  focusBuilding: (b, currentYaw) => set({ mode: { kind: "focus", ...focusForBuilding(b, currentYaw) } }),
  followBot: (key) => set({ mode: { kind: "follow", botKey: key } }),
  exit: () => set({ mode: { kind: "free" }, savedGoal: null }),
  setSavedGoal: (g) => set({ savedGoal: g }),
}));
