// Header-drag mechanics for a floating game window — chat windows only now
// (the bot dossier card used this too until the side-panel conversion
// docked it into GamePanel's uniform, non-draggable chrome). Store-agnostic:
// callers own where the resulting position lives (useGameChats' per-chat
// `pos`) and how it's rendered, this hook only turns pointer events into a
// clamped {x,y}. Pattern ported from the deleted v1 WorldChatWindow's drag
// handlers (git show <sha>^:src/panels/world/WorldChatWindow.tsx), minus
// resize — v1 always had a numeric pos; here pos starts `null` (default
// stack layout) until the first drag, so the drag start reads the window's
// actual on-screen box instead.
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useRef } from "react";
import { clampPos } from "./window-clamp";

export interface DragPoint {
  x: number;
  y: number;
}

export interface UseDragPositionOptions {
  /** The draggable window's own root element — measured on pointerdown (for
   *  the starting box, including when `pos` is still null) and on every move
   *  (for clamping against its own width/height). */
  containerRef: RefObject<HTMLElement | null>;
  /** Current committed position, or null before the first drag (the caller's
   *  own default layout applies then). */
  pos: DragPoint | null;
  /** Called with the next (already-clamped) position on every pointer move
   *  while dragging, and also (see the mount/resize effect below) whenever an
   *  already-committed `pos` needs re-clamping to a viewport that shrank
   *  since it was set. */
  onChange: (pos: DragPoint) => void;
  /** Px of the window's own box that must stay inside the viewport on the
   *  left/right/bottom edges — keeps a dragged-away window always reachable
   *  again. Default 40. The top edge is stricter (see `clampToViewport`): it
   *  clamps to 0, not this sliver, since the header — the only drag handle
   *  and the Minimize/Close buttons' home — lives at the very top of the
   *  window and must never go off-screen. */
  minVisible?: number;
}

export interface UseDragPositionResult {
  /** Wire to the header/handle element's onPointerDown. */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Wire to the same element's onPointerMove. */
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Wire to the same element's onPointerUp AND onPointerCancel — an OS-level
   *  gesture interrupt (e.g. a swipe-to-switch-app) fires cancel, not up, and
   *  without this a stale `drag.current` would make the NEXT unrelated
   *  pointermove (over the same element, pointer capture released or not)
   *  resume the old drag. */
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
}

/** The one clamp rule, shared by every place a position needs to respect the
 *  viewport: an active drag (onPointerMove) and a re-clamp of an
 *  already-committed `pos` (the mount/resize effect below, for a window
 *  whose viewport shrank while it wasn't being dragged). Delegates to
 *  window-clamp.ts's clampPos (EKI resize follow-up) — that module is now
 *  the single shared source of truth for pos/size clamp math, also used by
 *  use-resize.ts (size) and store.ts (a persisted layout, on load). Top edge
 *  floors at 0 (see UseDragPositionOptions.minVisible); the other three
 *  edges keep a `minVisible`-px sliver. */
function clampToViewport(p: DragPoint, rect: { width: number } | undefined, minVisible: number): DragPoint {
  return clampPos(p, rect?.width ?? 0, minVisible);
}

/** Turns pointer events on a handle element into a clamped drag position for
 *  the window that owns it. See the file header for the reuse intent. */
export function useDragPosition({
  containerRef,
  pos,
  onChange,
  minVisible = 40,
}: UseDragPositionOptions): UseDragPositionResult {
  // Offset between the pointer and the window's top-left at drag start —
  // ref, not state: it drives no render, only the math inside onPointerMove.
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // The header hosts Minimize/Close (and will host more buttons once the
    // bot-info panel reuses this hook) — a pointerdown that started on one of
    // those must never begin a drag, or clicking Close nudges the window a
    // few px before it closes (and, worse, retargets pointer capture onto the
    // header instead of the button).
    if (e.target instanceof HTMLElement && e.target.closest("button")) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = pos ?? { x: rect.left, y: rect.top };
    drag.current = { dx: e.clientX - start.x, dy: e.clientY - start.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const nextX = e.clientX - drag.current.dx;
    const nextY = e.clientY - drag.current.dy;
    onChange(clampToViewport({ x: nextX, y: nextY }, rect, minVisible));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  // Re-clamp an already-committed `pos` to the viewport on mount (it may
  // have been set on a larger screen in an earlier session — irrelevant
  // in-memory-only today, but this also covers a window whose viewport
  // shrinks while it's closed/unmounted) and on every subsequent browser
  // resize. A still-stack-positioned window (`pos === null`) has nothing to
  // re-clamp — its `right`-offset stack slot isn't this hook's concern.
  useEffect(() => {
    if (!pos) return;
    const reclamp = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const clamped = clampToViewport(pos, rect, minVisible);
      if (clamped.x !== pos.x || clamped.y !== pos.y) onChange(clamped);
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [pos, onChange, containerRef, minVisible]);

  return { onPointerDown, onPointerMove, onPointerUp };
}
