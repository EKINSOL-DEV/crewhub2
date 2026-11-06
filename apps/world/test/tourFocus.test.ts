/* Design choice T2 (round 72, `stage`): when the tour opened with nothing focused (a first visit), its end puts the
   focus on the stage (the town's canvas), not on the "?" button: a mouse visitor sees no ring on a button they never
   touched, and the next Tab still reaches the header. The selector is the one the App's focusScene uses (App.tsx);
   tools/regress/tour.mjs checks the focus after Skip in a browser. A tour opened from Settings keeps its returnTo. */
import assert from "node:assert/strict";
import test from "node:test";
import { TOUR_FOCUS_FALLBACK } from "../src/state/tour.ts";

test("T2: the tour's focus fallback is the stage's canvas, not the ? button", () => {
  assert.equal(TOUR_FOCUS_FALLBACK, "main.world-stage canvas");
});
