// Camera chase math (M8 T2) — pure helpers for GameCameraRig's per-frame
// goal-chasing in focus/follow/restore modes. Split out from GameCameraRig
// itself (which owns three.js/r3f + DOM input) so this stays testable
// without a rig test harness — no r3f useFrame test exists in this repo
// (see GameCameraRig.tsx's doc comment on that gap), but this module needs
// none of that machinery to exercise.
import { shortestArcDelta, shortestArcLerp, type CameraMode } from "./director";
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
 * position; yaw is left completely untouched — it's the player's to adjust
 * (rotate already writes straight to goal.current in follow, same as free
 * roam), and follow itself never reframes it. Distance is the same UNLESS
 * `distanceTarget` is given (round 2's follow-entry zoom-in, see
 * `followEntryDistance`), in which case it chases that instead of staying
 * put — still the player's afterward once GameCameraRig drops the target
 * (see that file's doc comment on why this is a one-time thing, not a
 * per-frame clamp).
 */
export function chaseFollow(
  current: RtsCamera,
  botX: number,
  botZ: number,
  k: number,
  distanceTarget?: number,
): RtsCamera {
  return {
    targetX: current.targetX + (botX - current.targetX) * k,
    targetZ: current.targetZ + (botZ - current.targetZ) * k,
    yaw: current.yaw,
    distance:
      distanceTarget === undefined
        ? current.distance
        : current.distance + (distanceTarget - current.distance) * k,
  };
}

/** Follow mode's entry-zoom cap (round 2): a followed bot deserves an
 *  over-the-shoulder framing, not whatever distance free roam (or a still-
 *  live prior focus/follow session) happened to leave the camera at. Only
 *  ever pulls IN — a player already zoomed in tighter than the cap keeps
 *  their own framing, this never pushes back out. GameCameraRig calls this
 *  ONCE, on the free|focus -> follow entry edge (same idiom as its own
 *  restoreGoalRef snapshot, taken on the same edge, earlier in the same
 *  frame — see that file's doc comment for why the ordering there matters:
 *  the restore snapshot must capture the PRE-zoom distance, not this cap). */
export const FOLLOW_DISTANCE = 16;

export function followEntryDistance(currentDistance: number): number {
  return Math.min(currentDistance, FOLLOW_DISTANCE);
}

/**
 * Whether edge-scroll pan should contribute this frame (M8 T3 controller
 * ruling): only in free-roam steady state. A pointer merely resting near
 * the viewport edge isn't deliberate "give me back control" — unlike a
 * drag or a held WASD/arrow key, it doesn't require the player to be doing
 * anything — so it's excluded from GameCameraRig's pan intent entirely
 * while focus/follow is framing a shot, AND while flight-home is
 * restoring: only a drag or WASD/arrows should cancel either of those.
 */
export function edgeScrollActive(modeKind: CameraMode["kind"], restoring: boolean): boolean {
  return modeKind === "free" && !restoring;
}

/** Below this cumulative pixel distance from a drag's pointerdown origin,
 *  movement reads as a click's natural wobble rather than deliberate drag
 *  intent — see `dragArmed`'s doc comment for why this matters. */
const DRAG_DEAD_ZONE_PX = 4;

/**
 * Whether cumulative pointer movement since a left/right-drag's pointerdown
 * origin is enough to count as deliberate drag intent (M8 T3 fix): without
 * this, GameCameraRig treated ANY left-drag movement, even a 1px wobble
 * between a building click and pointerup, as pan intent — which immediately
 * took over (and exited) the focus/follow session that same click had just
 * entered. Below the dead zone, the rig does nothing at all (no pan, no
 * rotate, no takeover); once armed, ordinary per-frame deltas resume as
 * before this fix.
 */
export function dragArmed(totalDx: number, totalDy: number): boolean {
  return Math.hypot(totalDx, totalDy) >= DRAG_DEAD_ZONE_PX;
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
