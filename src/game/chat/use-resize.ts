// Corner-grip resize mechanics for a floating game window (EKI resize
// follow-up) — sibling to use-drag-position.ts's header-drag: same
// pointer-capture/pointercancel hygiene, same store-agnostic contract (the
// caller owns where the resulting size lives and how it's rendered), this
// hook only turns pointer events on the grip into a clamped {w,h}. `size`
// mirrors `pos`'s null-until-touched contract — null keeps the window at
// its default box (ChatWindow.tsx's DEFAULT_SIZE) until the first resize,
// so the drag start reads the window's actual rendered box instead of a
// hardcoded constant (matters once a persisted size has already been
// applied by a parent that skipped this hook entirely). Clamp math itself
// lives in window-clamp.ts, shared with use-drag-position.ts and store.ts's
// load-time pass over a persisted layout.
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useRef } from "react";
import { clampSize, type Size } from "./window-clamp";

export interface UseResizeOptions {
  /** The resizable window's own root element — measured on pointerdown (for
   *  the starting box, including when `size` is still null) and implicitly
   *  via the caller's re-render on every change. */
  containerRef: RefObject<HTMLElement | null>;
  /** Current committed size, or null before the first resize (the caller's
   *  own default box applies then). */
  size: Size | null;
  /** Called with the next (already-clamped) size on every pointer move while
   *  resizing, and also (see the mount/resize effect below) whenever an
   *  already-committed `size` needs re-clamping to a viewport that shrank
   *  since it was set. */
  onChange: (size: Size) => void;
  /** Passed straight through to clampSize's height ceiling (viewport height -
   *  minVisible) — default 40, same as use-drag-position.ts's sliver. */
  minVisible?: number;
}

export interface UseResizeResult {
  /** Wire to the corner grip's onPointerDown. */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Wire to the same element's onPointerMove. */
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Wire to the same element's onPointerUp AND onPointerCancel — an OS-level
   *  gesture interrupt fires cancel, not up (see use-drag-position.ts's same
   *  note); without this a stale `resize.current` would make the NEXT
   *  unrelated pointermove resume the old resize. */
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
}

/** Turns pointer events on a corner grip into a clamped resize size for the
 *  window that owns it. See the file header for the reuse intent. */
export function useResize({
  containerRef,
  size,
  onChange,
  minVisible = 40,
}: UseResizeOptions): UseResizeResult {
  // Starting pointer position + box at resize start — ref, not state: it
  // drives no render, only the math inside onPointerMove.
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // The grip lives outside the header (never a drag target) but still
    // sits inside the window's own root — stop the event there so it can
    // never be mistaken for a header-drag start or double-fire whatever the
    // container wires to its own onPointerDown (e.g. focus-on-click).
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = size ?? { w: rect.width, h: rect.height };
    resize.current = { x: e.clientX, y: e.clientY, w: start.w, h: start.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!resize.current) return;
    const nextW = resize.current.w + (e.clientX - resize.current.x);
    const nextH = resize.current.h + (e.clientY - resize.current.y);
    onChange(clampSize({ w: nextW, h: nextH }, minVisible));
  };

  const onPointerUp = () => {
    resize.current = null;
  };

  // Re-clamp an already-committed `size` to the viewport on mount (it may
  // have been persisted from a larger screen in an earlier session) and on
  // every subsequent browser resize — mirrors use-drag-position.ts's pos
  // reclamp exactly. A still-default-box window (`size === null`) has
  // nothing to re-clamp — its default CSS box isn't this hook's concern.
  useEffect(() => {
    if (!size) return;
    const reclamp = () => {
      const clamped = clampSize(size, minVisible);
      if (clamped.w !== size.w || clamped.h !== size.h) onChange(clamped);
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [size, onChange, minVisible]);

  return { onPointerDown, onPointerMove, onPointerUp };
}
