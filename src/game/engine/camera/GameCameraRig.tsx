// Camera rig (M0 T6): input → goal state → damped actual state → camera.
// Left-drag pans, right-drag rotates, wheel zooms, WASD/arrows pan, Q/E
// rotate, pointer at viewport edges scrolls (the RTS staple).
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  DEFAULT_CAMERA,
  damp,
  focusOn,
  pan,
  pose,
  rotate,
  zoom,
  type RtsBounds,
  type RtsCamera,
} from "./rts-camera";

const KEY_PAN_PX = 640; // px-equivalent per second held
const KEY_ROT = 1.9; // rad per second
const EDGE_PX = 14;
const EDGE_PAN_PX = 480;
const DAMP_RATE = 9;
const DRAG_ROT = 0.005;

export function GameCameraRig({
  bounds,
  focus,
  enabled = true,
}: {
  bounds: RtsBounds;
  /** A robot to center on — `seq` bumps to refocus the same spot again. Not a lock: the next pan/rotate/zoom just overwrites the goal as usual. */
  focus?: { x: number; z: number; seq: number } | null;
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
  const drag = useRef<{ button: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!focus) return;
    goal.current = focusOn(goal.current, focus.x, focus.z);
    // Refiring on `seq` alone (not x/z) is deliberate — clicking the same
    // robot again should refocus even though its position hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.seq]);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2) {
        drag.current = { button: e.button, x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
      goal.current =
        drag.current.button === 0 ? pan(goal.current, dx, dy, bounds) : rotate(goal.current, dx * DRAG_ROT);
    };
    const hover = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag.current = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      goal.current = zoom(goal.current, dy, bounds);
    };
    const ctx = (e: Event) => e.preventDefault();
    const keydown = (e: KeyboardEvent) => keys.current.add(e.code);
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
    const k = keys.current;
    const px = KEY_PAN_PX * dt;
    let dx = 0;
    let dy = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) dy += px;
    if (k.has("KeyS") || k.has("ArrowDown")) dy -= px;
    if (k.has("KeyA") || k.has("ArrowLeft")) dx += px;
    if (k.has("KeyD") || k.has("ArrowRight")) dx -= px;
    if (k.has("KeyQ")) goal.current = rotate(goal.current, -KEY_ROT * dt);
    if (k.has("KeyE")) goal.current = rotate(goal.current, KEY_ROT * dt);

    // Edge scroll only while the pointer is over the canvas and not dragging.
    const p = pointer.current;
    if (p && !drag.current && document.hasFocus()) {
      const r = gl.domElement.getBoundingClientRect();
      const e = EDGE_PAN_PX * dt;
      if (p.x - r.left < EDGE_PX) dx += e;
      if (r.right - p.x < EDGE_PX) dx -= e;
      if (p.y - r.top < EDGE_PX) dy += e;
      if (r.bottom - p.y < EDGE_PX) dy -= e;
    }
    if (dx !== 0 || dy !== 0) goal.current = pan(goal.current, dx, dy, bounds);

    current.current = damp(current.current, goal.current, DAMP_RATE, dt);
    const { position, lookAt } = pose(current.current);
    camera.position.set(...position);
    camera.lookAt(...lookAt);
  });

  return null;
}
