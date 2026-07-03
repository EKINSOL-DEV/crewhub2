// Header-drag mechanics for a floating game window (chat windows today —
// the upcoming bot-info panel is expected to grow its own draggable header
// and reuse this same hook, which is why it's store-agnostic: callers own
// where the resulting position lives (useGameChats' per-chat `pos` for chat
// windows) and how it's rendered, this hook only turns pointer events into a
// clamped {x,y}. Pattern ported from the deleted v1 WorldChatWindow's drag
// handlers (git show <sha>^:src/panels/world/WorldChatWindow.tsx), minus
// resize — v1 always had a numeric pos; here pos starts `null` (default
// stack layout) until the first drag, so the drag start reads the window's
// actual on-screen box instead.
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useRef } from "react";

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
   *  while dragging. */
  onChange: (pos: DragPoint) => void;
  /** Px of the window's own box that must stay inside the viewport on every
   *  edge — keeps a dragged-away window always reachable again. Default 40. */
  minVisible?: number;
}

export interface UseDragPositionResult {
  /** Wire to the header/handle element's onPointerDown. */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Wire to the same element's onPointerMove. */
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Wire to the same element's onPointerUp (and ideally onPointerCancel). */
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
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
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = pos ?? { x: rect.left, y: rect.top };
    drag.current = { dx: e.clientX - start.x, dy: e.clientY - start.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 0;
    const h = rect?.height ?? 0;
    const nextX = e.clientX - drag.current.dx;
    const nextY = e.clientY - drag.current.dy;
    const minX = minVisible - w;
    const maxX = window.innerWidth - minVisible;
    const minY = minVisible - h;
    const maxY = window.innerHeight - minVisible;
    onChange({
      x: Math.min(maxX, Math.max(minX, nextX)),
      y: Math.min(maxY, Math.max(minY, nextY)),
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
