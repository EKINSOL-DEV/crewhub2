// Camera rig (M0 T6, M8 T2): input → goal state → damped actual state →
// camera. Left-drag pans, right-drag rotates, wheel zooms, WASD/arrows pan,
// Q/E rotate, pointer at viewport edges scrolls (the RTS staple).
//
// M8 T2 layers the camera director (director.ts) on top: `useCameraDirector`
// is read imperatively via `.getState()` every frame (never subscribed —
// this rig must not re-render on mode changes, only useFrame reacts), and
// drives three modes:
//   - free: exactly the M0 behavior below, unchanged.
//   - focus: goal.targetX/Z/yaw/distance damp toward the mode's framed shot
//     (yaw via shortestArcLerp — the shortest-arc seam-safe lerp from
//     director.ts). A live wheel/Q/E input during focus doesn't fight that
//     damp: it accumulates into `focusAdjust` (camera-math.ts) instead of
//     mutating goal.current directly, and the damp target becomes
//     `mode.yaw + adjust.yaw` / `mode.distance * adjust.distanceFactor` — so
//     the shot re-centers under player control rather than snapping back to
//     the raw framed values every frame.
//   - follow: goal.targetX/Z damp toward the bot's *live* position, read
//     off live-bots.ts's registry (see that file for why: Sim lives inside
//     Characters, a sibling of this rig, with no prop path between them).
//     yaw/distance are left alone — wheel/Q/E write straight to
//     goal.current in follow, same as free roam. A despawned bot
//     (`getLiveBot` returns undefined) calls `exit()` — the restore path,
//     same as a deliberate HUD/Escape exit.
//
// Entry/exit bookkeeping: on a free -> focus|follow edge, the rig snapshots
// goal.current into its own `restoreGoalRef` — the single source of truth
// for "what to fly back to" (M8 T3 dropped director.ts's parallel
// `savedGoal` mirror: nothing outside this rig ever read it back).
//
// PAN intent (drag-pan, WASD/arrows) while focus/follow is a takeover: it
// calls `exit()` itself and sets `takeoverRef`, so the restore lerp is
// skipped entirely and the camera just keeps whatever view the player
// grabbed. Wheel-zoom and rotate (Q/E, right-drag) never exit, in any mode —
// see the per-mode branches above/below for where they land. Edge-scroll is
// NOT pan intent (M8 T3 controller ruling, camera-math.ts's
// `edgeScrollActive`): an ambient pointer resting near the viewport edge
// isn't a deliberate "give me back control" the way a drag or a held key
// is, so it's excluded entirely while focus/follow is framing a shot and
// while flight-home is restoring — only a drag or WASD/arrows takes the
// camera back in those modes. A left/right-drag only counts as that once it
// clears camera-math.ts's `dragArmed` dead zone (M8 T3 fix): without it, the
// pointer's natural sub-pixel wobble between a building click and its
// pointerup registered as drag pan and immediately took over the
// focus/follow the SAME click had just entered.
//
// Every frame also mirrors the damped `current.current.yaw` into
// live-camera.ts's module-level `setLiveYaw` — CampusWorld/PlacedBuildings'
// building-click handlers (M8 T3) read it back via `getLiveYaw()` to seed
// focusBuilding()'s currentYaw, since this rig's own goal/current state is
// otherwise private to this file (see the top of this comment).
//
// M8 T3 also removed the M4-era `focus` prop (a one-shot goal snap fired
// from GameShell's onSelect on every robot click): followBot() now owns
// that job — it both frames the bot immediately AND keeps tracking it every
// frame after, which the old prop never did. Keeping both around raced: the
// prop's effect ran synchronously during React's event flush, BEFORE this
// component's next useFrame — so it snapped goal.current to the bot's
// position before the free -> follow entry edge below had a chance to
// snapshot the PLAYER's pre-cinematic view, corrupting restoreGoalRef with
// the bot's position instead.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  chaseFocus,
  chaseFollow,
  chaseRestore,
  dampK,
  dragArmed,
  edgeScrollActive,
  FOCUS_ADJUST_IDENTITY,
  isRestored,
  rotateFocusAdjust,
  zoomFocusAdjust,
  type FocusAdjust,
} from "./camera-math";
import { useCameraDirector, type CameraMode } from "./director";
import { setLiveYaw } from "./live-camera";
import { DEFAULT_CAMERA, damp, pan, pose, rotate, zoom, type RtsBounds, type RtsCamera } from "./rts-camera";
import { getLiveBot } from "@/game/sim/live-bots";

const KEY_PAN_PX = 640; // px-equivalent per second held
const KEY_ROT = 1.9; // rad per second
const EDGE_PX = 14;
const EDGE_PAN_PX = 480;
const DAMP_RATE = 9; // current -> goal (existing M0 smoothing, unchanged)
const DRAG_ROT = 0.005;
/** goal -> cinematic target (focus/follow/restore) — slower than DAMP_RATE
 *  so a focus/follow shot reads as a deliberate camera move, not a snap. */
const CINEMATIC_RATE = 3;

export function GameCameraRig({
  bounds,
  enabled = true,
}: {
  bounds: RtsBounds;
  /**
   * Gates drag-to-pan/rotate only (M3 T4: build mode owns the pointer while
   * placing) — wheel zoom and WASD/edge-scroll keep working either way, so
   * the player is never stuck unable to see the campus.
   */
  enabled?: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const goal = useRef<RtsCamera>({ ...DEFAULT_CAMERA });
  const current = useRef<RtsCamera>({ ...DEFAULT_CAMERA });
  const keys = useRef(new Set<string>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  // `originX/Y` is the pointerdown position (never updated) — dragArmed
  // measures cumulative movement against it, M8 T3's dead-zone fix.
  // `armed` latches true once that's cleared once, so later per-frame
  // deltas (`x`/`y`, updated every move) resume as ordinary drag/rotate
  // input rather than being re-measured against the origin every time.
  const drag = useRef<{
    button: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    armed: boolean;
  } | null>(null);

  // M8 T2 cinematic bookkeeping — see the file doc comment above.
  const prevModeKind = useRef<CameraMode["kind"]>("free");
  const restoreGoalRef = useRef<RtsCamera | null>(null);
  const restoring = useRef(false);
  const takeoverRef = useRef(false);
  const focusAdjust = useRef<FocusAdjust>(FOCUS_ADJUST_IDENTITY);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2) {
        drag.current = {
          button: e.button,
          x: e.clientX,
          y: e.clientY,
          originX: e.clientX,
          originY: e.clientY,
          armed: false,
        };
        el.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      if (!drag.current.armed) {
        if (!dragArmed(e.clientX - drag.current.originX, e.clientY - drag.current.originY)) {
          // Still inside the dead zone — a click's natural pointer wobble,
          // not drag intent yet (M8 T3 fix). Track the latest position so
          // that once armed, the first real delta is measured from here,
          // not a jump all the way back to the pointerdown origin.
          drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
          return;
        }
        drag.current = { ...drag.current, armed: true };
      }
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
      if (drag.current.button === 0) {
        // Left-drag pan is PAN intent — takeover rule applies.
        const director = useCameraDirector.getState();
        if (director.mode.kind !== "free") {
          takeoverRef.current = true;
          director.exit();
        } else if (restoring.current) {
          // Mid flight-home: grabbing the camera cancels the restore too.
          restoring.current = false;
          restoreGoalRef.current = null;
          goal.current = pan(goal.current, dx, dy, bounds);
        } else {
          goal.current = pan(goal.current, dx, dy, bounds);
        }
      } else {
        // Right-drag rotate never exits — same focus-adjust rule as Q/E.
        const mode = useCameraDirector.getState().mode;
        if (mode.kind === "focus") {
          focusAdjust.current = rotateFocusAdjust(focusAdjust.current, dx * DRAG_ROT);
        } else {
          goal.current = rotate(goal.current, dx * DRAG_ROT);
        }
      }
    };
    const hover = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag.current = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // Wheel-zoom never exits, in any mode.
      const mode = useCameraDirector.getState().mode;
      if (mode.kind === "focus") {
        focusAdjust.current = zoomFocusAdjust(focusAdjust.current, dy, mode.distance, bounds);
      } else {
        goal.current = zoom(goal.current, dy, bounds);
      }
    };
    const ctx = (e: Event) => e.preventDefault();
    // Typing in a chat composer (or any field) must not scroll the camera —
    // keyup still clears unconditionally so a key held across a focus change
    // can't stick.
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const keydown = (e: KeyboardEvent) => {
      if (!typing(e)) keys.current.add(e.code);
    };
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const leave = () => (pointer.current = null);

    if (enabled) {
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
    }
    el.addEventListener("pointermove", hover);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", ctx);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    el.addEventListener("pointerleave", leave);
    return () => {
      if (enabled) {
        el.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
      }
      el.removeEventListener("pointermove", hover);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", ctx);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      el.removeEventListener("pointerleave", leave);
    };
  }, [gl, bounds, enabled]);

  useFrame((_, dt) => {
    const director = useCameraDirector.getState();
    const mode = director.mode;
    const prevKind = prevModeKind.current;

    if (prevKind === "free" && mode.kind !== "free") {
      // Entry edge: snapshot once — restoreGoalRef is the only copy (see
      // the file doc comment for why director.ts no longer mirrors this).
      // Also clear a stale takeoverRef (M8 T3 fix): left over true from an
      // earlier session it wasn't cleared for, it would falsely treat THIS
      // session's later, legitimate exit as a takeover too and skip the
      // restore it deserves — a brand new cinematic session always starts
      // with a clean slate. Untested at the rig level (no r3f useFrame
      // harness exists in this repo for GameCameraRig itself — see
      // camera-math.ts's file doc comment on that gap).
      restoreGoalRef.current = { ...goal.current };
      restoring.current = false;
      takeoverRef.current = false;
    }
    if (prevKind !== "focus" && mode.kind === "focus") {
      // Freshly framing a building (from free OR straight from follow) always
      // starts from a clean shot — a switch between the two cinematic modes
      // must not carry over a rotate/zoom the player dialed into the *other*
      // one: only a free-entry re-snapshots restoreGoalRef above, but a
      // focus<->follow switch still deserves its own fresh framing here.
      focusAdjust.current = FOCUS_ADJUST_IDENTITY;
    }
    if (prevKind !== "free" && mode.kind === "free") {
      // Exit edge.
      if (takeoverRef.current) {
        takeoverRef.current = false;
        restoreGoalRef.current = null;
        restoring.current = false;
      } else {
        restoring.current = restoreGoalRef.current !== null;
      }
    }
    prevModeKind.current = mode.kind;

    // WASD/arrows pan intent, computed once regardless of mode — every mode
    // branch below either applies it (free/restoring) or treats its mere
    // presence as a takeover (focus/follow).
    const k = keys.current;
    const px = KEY_PAN_PX * dt;
    let dx = 0;
    let dy = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) dy += px;
    if (k.has("KeyS") || k.has("ArrowDown")) dy -= px;
    if (k.has("KeyA") || k.has("ArrowLeft")) dx += px;
    if (k.has("KeyD") || k.has("ArrowRight")) dx -= px;
    // Edge scroll only while the pointer is over the canvas, not dragging,
    // and (M8 T3) only in free-roam steady state — see camera-math.ts's
    // edgeScrollActive for why focus/follow/restoring exclude it entirely.
    const p = pointer.current;
    if (edgeScrollActive(mode.kind, restoring.current) && p && !drag.current && document.hasFocus()) {
      const r = gl.domElement.getBoundingClientRect();
      const e = EDGE_PAN_PX * dt;
      if (p.x - r.left < EDGE_PX) dx += e;
      if (r.right - p.x < EDGE_PX) dx -= e;
      if (p.y - r.top < EDGE_PX) dy += e;
      if (r.bottom - p.y < EDGE_PX) dy -= e;
    }
    const panIntent = dx !== 0 || dy !== 0;

    // Q/E rotate never exits, in any mode — lands on focusAdjust while
    // focused (same rule as wheel/right-drag above), goal.current otherwise.
    const rotDelta = (k.has("KeyQ") ? -KEY_ROT : 0) + (k.has("KeyE") ? KEY_ROT : 0);
    if (rotDelta !== 0) {
      const rotDt = rotDelta * dt;
      if (mode.kind === "focus") {
        focusAdjust.current = rotateFocusAdjust(focusAdjust.current, rotDt);
      } else {
        goal.current = rotate(goal.current, rotDt);
      }
    }

    if (mode.kind === "focus") {
      if (panIntent) {
        takeoverRef.current = true;
        director.exit();
      } else {
        goal.current = chaseFocus(goal.current, mode, focusAdjust.current, dampK(CINEMATIC_RATE, dt));
      }
    } else if (mode.kind === "follow") {
      if (panIntent) {
        takeoverRef.current = true;
        director.exit();
      } else {
        const bot = getLiveBot(mode.botKey);
        if (!bot) {
          director.exit(); // despawned mid-follow — restore path, not a takeover
        } else {
          goal.current = chaseFollow(goal.current, bot.x, bot.z, dampK(CINEMATIC_RATE, dt));
        }
      }
    } else if (restoring.current && restoreGoalRef.current) {
      if (panIntent) {
        // Grabbing the wheel mid flight-home cancels the restore, same as
        // during focus/follow — keep the player's view, drop the snapshot.
        restoring.current = false;
        restoreGoalRef.current = null;
        goal.current = pan(goal.current, dx, dy, bounds);
      } else {
        goal.current = chaseRestore(goal.current, restoreGoalRef.current, dampK(CINEMATIC_RATE, dt));
        if (isRestored(goal.current, restoreGoalRef.current)) {
          restoring.current = false;
          restoreGoalRef.current = null;
        }
      }
    } else if (panIntent) {
      // Free roam, steady state — the original M0 WASD/edge-scroll pan.
      goal.current = pan(goal.current, dx, dy, bounds);
    }

    current.current = damp(current.current, goal.current, DAMP_RATE, dt);
    setLiveYaw(current.current.yaw);
    const { position, lookAt } = pose(current.current);
    camera.position.set(...position);
    camera.lookAt(...lookAt);
  });

  return null;
}
