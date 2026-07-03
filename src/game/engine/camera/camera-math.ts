// Camera chase math (M8 T2) — pure helpers for GameCameraRig's per-frame
// goal-chasing in focus/follow/restore modes. Split out from GameCameraRig
// itself (which owns three.js/r3f + DOM input) so this stays testable
// without a rig test harness — no r3f useFrame test exists in this repo
// (see GameCameraRig.tsx's doc comment on that gap), but this module needs
// none of that machinery to exercise.
import { shortestArcDelta, shortestArcLerp } from "./director";
import { zoom, type RtsBounds, type RtsCamera } from "./rts-camera";

/** Exponential-damp fraction for a frame of length `dt` at the given rate —
 *  same shape as rts-camera.ts's damp(), pulled out so focus/follow/restore
 *  can each derive one fraction per frame and apply it to several fields. */
export function dampK(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * User rotate/zoom input accumulated on top of a focus mode's framed yaw/
 * distance (GameCameraRig's "wheel/rotate in focus" rule — see its doc
 * comment): the mode itself never changes once entered (focusBuilding()
 * only fires again on a fresh click), so a still-live wheel/Q/E input has to
 * live somewhere else, or it'd get damped straight back to the framed shot
 * every frame. `yaw` adds directly; `distanceFactor` multiplies.
 */
export interface FocusAdjust {
  yaw: number;
  distanceFactor: number;
}

export const FOCUS_ADJUST_IDENTITY: FocusAdjust = { yaw: 0, distanceFactor: 1 };

/** Q/E or right-drag rotate while focused: layer onto the adjust, don't touch goal.current directly. */
export function rotateFocusAdjust(adjust: FocusAdjust, dYaw: number): FocusAdjust {
  return { ...adjust, yaw: adjust.yaw + dYaw };
}

/**
 * Wheel-zoom while focused: reuses rts-camera.ts's real `zoom()` (same
 * speed/bounds-clamp math, single source of truth) against a throwaway
 * camera whose distance is the mode's framed distance times the adjust so
 * far, then reads the factor back out — avoids re-deriving ZOOM_SPEED here.
 */
export function zoomFocusAdjust(
  adjust: FocusAdjust,
  wheelDelta: number,
  baseDistance: number,
  bounds: RtsBounds,
): FocusAdjust {
  const scratch: RtsCamera = {
    targetX: 0,
    targetZ: 0,
    yaw: 0,
    distance: baseDistance * adjust.distanceFactor,
  };
  const zoomed = zoom(scratch, wheelDelta, bounds);
  return { ...adjust, distanceFactor: zoomed.distance / baseDistance };
}

/**
 * Focus mode's per-frame goal chase: target always recenters on the
 * building; yaw/distance chase the mode's framed values plus whatever the
 * player has dialed in since entering (see `FocusAdjust`).
 */
export function chaseFocus(
  current: RtsCamera,
  mode: { target: { x: number; z: number }; yaw: number; distance: number },
  adjust: FocusAdjust,
  k: number,
): RtsCamera {
  return {
    targetX: current.targetX + (mode.target.x - current.targetX) * k,
    targetZ: current.targetZ + (mode.target.z - current.targetZ) * k,
    yaw: shortestArcLerp(current.yaw, mode.yaw + adjust.yaw, k),
    distance: current.distance + (mode.distance * adjust.distanceFactor - current.distance) * k,
  };
}

/**
 * Follow mode's per-frame goal chase: target recenters on the bot's live
 * position; yaw/distance are left completely untouched — they're the
 * player's to adjust (wheel/rotate already write straight to goal.current
 * in follow, same as free roam), and follow itself never reframes them.
 */
export function chaseFollow(current: RtsCamera, botX: number, botZ: number, k: number): RtsCamera {
  return {
    ...current,
    targetX: current.targetX + (botX - current.targetX) * k,
    targetZ: current.targetZ + (botZ - current.targetZ) * k,
  };
}

/** Flight-home restore: chase every field back toward the pre-cinematic snapshot taken on entry. */
export function chaseRestore(current: RtsCamera, saved: RtsCamera, k: number): RtsCamera {
  return {
    targetX: current.targetX + (saved.targetX - current.targetX) * k,
    targetZ: current.targetZ + (saved.targetZ - current.targetZ) * k,
    yaw: shortestArcLerp(current.yaw, saved.yaw, k),
    distance: current.distance + (saved.distance - current.distance) * k,
  };
}

const RESTORE_EPSILON_POS = 0.05; // world units
const RESTORE_EPSILON_YAW = 0.01; // rad
const RESTORE_EPSILON_DISTANCE = 0.05; // world units

/**
 * Close enough to `saved` that the restore lerp can stop and the rig can
 * drop its snapshot — exponential damping is asymptotic and never reaches
 * exactly 0, so without a cutoff the "flight home" would run forever.
 */
export function isRestored(current: RtsCamera, saved: RtsCamera): boolean {
  return (
    Math.abs(current.targetX - saved.targetX) < RESTORE_EPSILON_POS &&
    Math.abs(current.targetZ - saved.targetZ) < RESTORE_EPSILON_POS &&
    Math.abs(shortestArcDelta(current.yaw, saved.yaw)) < RESTORE_EPSILON_YAW &&
    Math.abs(current.distance - saved.distance) < RESTORE_EPSILON_DISTANCE
  );
}
