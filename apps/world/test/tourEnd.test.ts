/* Design choice T2 (round 72, `stage`; round 73, wa-1): a tour ended by a pointer (a click or a tap on Skip or Done)
   puts the focus back without a visible ring, since the card re-focused Next by script after each click and the
   browser would ring the stage, the whole screen; ended by the keyboard (Enter or Space on the button), the ring stays,
   as a keyboard user needs it. The two computations are state/tour.ts; components/Tour.tsx keeps the ref and the
   calls. The browser rows are tools/regress/tour.mjs's wa-1 pair (Done by the mouse: no ring; by the keyboard: ring). */
import assert from "node:assert/strict";
import test from "node:test";
import { endedByPointer, returnFocusOptions } from "../src/state/tour.ts";

test("T2, wa-1: a click's detail tells a pointer's press from the keyboard's click", () => {
  assert.equal(endedByPointer(1), true, "a click");
  assert.equal(endedByPointer(2), true, "the second press of a double click");
  assert.equal(endedByPointer(0), false, "Enter or Space on the button: the keyboard's click has no press");
  assert.equal(endedByPointer(undefined), false, "no event: not a pointer");
});

test("T2, wa-1: the focus returns without a visible ring after a pointer, with the browser's own after the keyboard", () => {
  assert.deepEqual(returnFocusOptions(true), { focusVisible: false });
  assert.equal(returnFocusOptions(false), undefined, "the browser decides, as before wa-1");
});
