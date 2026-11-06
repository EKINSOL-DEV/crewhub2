/* Design choice T5 (round 72, `frame`): on a portrait phone the home view frames the town in the band between the
   chips and the playback bar with a `cover` fit (the free area's shorter axis filled, the other running off the
   screen); every other frame is a `contain` fit (the rects whole). The maths is world/frameFit.ts (TownScene.frameRects
   and #homeFrame keep the projection, the canvas and the calls; the scene loads under Vite only); the browser row is
   tools/regress/walk.mjs's T5 row (375 light: the lots fill at least 0.50 of the band). */
import assert from "node:assert/strict";
import test from "node:test";
import { framedSpan, homeFit } from "../src/world/frameFit.ts";

test("T5: contain takes the larger of the two spans, cover the smaller, each times the margin", () => {
  // An extent 40 wide and 10 tall, seen on a canvas twice as wide as tall with the whole canvas free: it is 20 by width, 10 by height.
  assert.equal(framedSpan(40, 10, 2, 1, 1, 1.04, "contain"), 20 * 1.04, "contain: the width's span, so the whole extent fits");
  assert.equal(framedSpan(40, 10, 2, 1, 1, 1.04, "cover"), 10 * 1.04, "cover: the height's span, the sides run off");
  // Taller than wide: 10 by 40 on the same canvas is 5 by width, 40 by height.
  assert.equal(framedSpan(10, 40, 2, 1, 1, 1, "contain"), 40);
  assert.equal(framedSpan(10, 40, 2, 1, 1, 1, "cover"), 5);
  assert.equal(framedSpan(40, 10, 2, 1, 1, 1, "contain"), 20, "a margin of 1 adds nothing");
});

test("T5: the free area's shares scale each axis: a half-free width doubles the span by width, a half-free height the span by height", () => {
  assert.equal(framedSpan(40, 10, 2, 0.5, 1, 1, "contain"), 40, "by width: 40 / (2 * 0.5)");
  assert.equal(framedSpan(40, 10, 2, 1, 0.5, 1, "cover"), 20, "by height: 10 / 0.5, the smaller of 20 and 20");
  assert.equal(framedSpan(40, 10, 2, 1, 0.25, 1, "contain"), 40, "by height 40 wins over by width 20");
  assert.equal(framedSpan(40, 10, 2, 1, 0.25, 1, "cover"), 20);
  // The operation order of the scene's old lines, for the same floats: v / fy and u / (aspect * fx).
  assert.equal(framedSpan(7, 3, 1.7, 0.9, 0.3, 1.04, "contain"), Math.max(3 / 0.3, 7 / (1.7 * 0.9)) * 1.04);
  assert.equal(framedSpan(7, 3, 1.7, 0.9, 0.3, 1.04, "cover"), Math.min(3 / 0.3, 7 / (1.7 * 0.9)) * 1.04);
});

test("T5: the home frame is a cover fit on a portrait canvas, a contain fit otherwise", () => {
  assert.equal(homeFit(true), "cover");
  assert.equal(homeFit(false), "contain");
});
