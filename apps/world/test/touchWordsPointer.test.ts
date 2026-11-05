/* The build sheet's words with a pointer and a keyboard, word for word (round 68, mutation run mx1 over sugg/w4-2):
   touchWords.test.ts pins the touch words and the pointer's idle and on lines; the pointer's chosen, placed and
   selected sentences could have become the touch ones (no key named) with every test green. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildWords } from "../src/state/inputWords.ts";
import { tourSteps } from "../src/state/tour.ts";

test("with a pointer the build sheet names the keys: the chosen prop's, the placed prop's and the selected prop's sentences (round 65, w4-2)", () => {
  const pointer = buildWords(false);
  assert.equal(pointer.chosen, "Move the pointer over a floor or use the arrow keys, R turns it, Enter or a click places it.");
  assert.equal(pointer.placed, "It is selected: arrow keys move it, R turns it.");
  assert.equal(pointer.selected, "Arrow keys or a drag move it, R turns it, Delete removes it.");
  assert.equal(pointer.point, "point at a floor or use the arrow keys.");
});

test("the tour's text-view step names its target by input kind, word for word (round 65, w4-2)", () => {
  for (const mode of ["demo", "live"] as const) {
    assert.equal(tourSteps(mode, "touch")[4]?.targetName, "the text view, in the ? menu");
    assert.equal(tourSteps(mode, "pointer")[4]?.targetName, "the text view, opened with T");
    assert.equal(tourSteps(mode, "touch")[4]?.id, "text");
  }
});
