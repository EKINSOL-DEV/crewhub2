/* The framing maths of TownScene.frameRects and its home frame (design choice T5, round 72, `frame`), Vite-free so
   apps/world/test/frameFit.test.ts holds it: the scene keeps the projection of the rects, the canvas and the calls. */

/** How a frame fits its rects: `contain` fits them whole (the default), `cover` fills the free area's shorter axis and lets the other run off the screen. */
export type FrameFit = "contain" | "cover";

/**
 * The frustum height at zoom 1 that frames an extent `u` wide and `v` tall (world units along the view's right and up)
 * in the free area of a canvas of `aspect` (width over height), whose free shares are `fx` of the width and `fy` of
 * the height, with `margin` around (1.04 is four per cent). The expressions are the scene's old lines verbatim, in
 * their operation order, for the same floats.
 */
export function framedSpan(u: number, v: number, aspect: number, fx: number, fy: number, margin: number, fit: FrameFit): number {
  const byHeight = v / fy,
    byWidth = u / (aspect * fx);
  return (fit === "cover" ? Math.min(byHeight, byWidth) : Math.max(byHeight, byWidth)) * margin;
}

/** The home frame's fit: a portrait phone frames the town `cover` in the band between the chips and the playback bar (T5), its sides running off the screen; every other canvas `contain`. */
export function homeFit(portrait: boolean): FrameFit {
  return portrait ? "cover" : "contain";
}
