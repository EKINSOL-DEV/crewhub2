// Shared clamp math for a chat window's position + size against the
// viewport (EKI resize follow-up). Two call sites need this and must never
// drift apart: the live, DOM-rect-driven hooks (use-drag-position.ts during
// an active drag/on mount/on browser resize; use-resize.ts, same three
// triggers, for size) and store.ts's load-time pass over a persisted layout
// blob, which runs before anything has mounted — there's no live rect to
// measure yet, so it clamps off the numbers the blob itself carried (or the
// defaults, for a half-empty entry). This file is that one shared source of
// truth for both.
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** A window's persisted (or in-flight) layout — either half may be absent: a
 *  size-only or pos-only persisted entry is legal (see store.ts), and a pos
 *  clamp alone (use-drag-position.ts, which has no reason to know the
 *  window's size beyond its own live rect) never needs to touch size. */
export interface Layout {
  pos: Point | null;
  size: Size | null;
}

export const MIN_W = 300;
export const MAX_W = 640;
export const MIN_H = 320;
/** The box a freshly-opened, never-resized/dragged chat window renders at —
 *  matches ChatWindow.tsx's pre-resize fixed Tailwind box (h-[440px]
 *  w-[350px]), now expressed as data so use-resize.ts/store.ts can fall back
 *  to it wherever a persisted/live size is still unknown. */
export const DEFAULT_SIZE: Size = { w: 350, h: 440 };

const DEFAULT_MIN_VISIBLE = 40;

/** Width clamps to [MIN_W, MAX_W]; height clamps to [MIN_H, viewport height -
 *  minVisible] — floor wins on a viewport so small the two bounds conflict
 *  (a window can never shrink below MIN_H just because the screen is
 *  tinier still). */
export function clampSize(size: Size, minVisible: number = DEFAULT_MIN_VISIBLE): Size {
  const maxH = Math.max(MIN_H, window.innerHeight - minVisible);
  return {
    w: Math.min(MAX_W, Math.max(MIN_W, size.w)),
    h: Math.min(maxH, Math.max(MIN_H, size.h)),
  };
}

/** Position clamp given the window's own (already-clamped) width — the same
 *  rule use-drag-position.ts has always applied: the top edge floors at 0
 *  (the header — the only drag handle, and Minimize/Close's home — must
 *  never leave the viewport); the other three edges keep a `minVisible`-px
 *  sliver so a window dragged clear off-screen is always reachable again. */
export function clampPos(pos: Point, width: number, minVisible: number = DEFAULT_MIN_VISIBLE): Point {
  const minX = minVisible - width;
  const maxX = window.innerWidth - minVisible;
  const maxY = window.innerHeight - minVisible;
  return {
    x: Math.min(maxX, Math.max(minX, pos.x)),
    y: Math.min(maxY, Math.max(0, pos.y)),
  };
}

/** Clamps a full (pos + size) layout together — size first, since the pos
 *  clamp's x-bound depends on the (possibly just-shrunk) width. Used where
 *  there's no live DOM rect to measure yet (store.ts applying a persisted
 *  layout on load); the live hooks measure the real rendered box instead and
 *  so only ever need the single-axis helpers above. Either half of `layout`
 *  may be null — it passes through untouched (a size-only entry's absent pos
 *  stays the default null stack slot; ditto a pos-only entry's size). */
export function clampLayout(layout: Layout, minVisible: number = DEFAULT_MIN_VISIBLE): Layout {
  const size = layout.size ? clampSize(layout.size, minVisible) : null;
  const pos = layout.pos ? clampPos(layout.pos, size?.w ?? DEFAULT_SIZE.w, minVisible) : null;
  return { pos, size };
}
