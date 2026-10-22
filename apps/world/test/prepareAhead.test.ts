/* Round 24: which buildings are built ahead of the enter (world/prepareAhead.ts): the signals in their order of
   weight (the jump list's active row, the pointer's building, the keyboard's), each once, at most LIKELY_AHEAD. */
import assert from "node:assert/strict";
import test from "node:test";
import { LIKELY_AHEAD, likelyOrder } from "../src/world/prepareAhead.ts";

const known = (slug: string) => slug !== "gone";

test("likelyOrder: the signals in order, each once, the empty and the unknown left out, at most LIKELY_AHEAD", () => {
  assert.equal(LIKELY_AHEAD, 2, "two: the town keeps three interiors, the entered one and two more");
  assert.deepEqual(likelyOrder(["jump", "hover", "focus"], known), ["jump", "hover"]);
  assert.deepEqual(likelyOrder([null, "hover", "focus"], known), ["hover", "focus"]);
  assert.deepEqual(likelyOrder([undefined, null, "focus"], known), ["focus"]);
  assert.deepEqual(likelyOrder(["same", "same", "other"], known), ["same", "other"], "the pointer on the focused building is one signal");
  assert.deepEqual(likelyOrder(["gone", "hover", "focus"], known), ["hover", "focus"], "a building the town does not hold (or an archived one) is skipped");
  assert.deepEqual(likelyOrder([null, null, null], known), []);
  assert.deepEqual(likelyOrder(["a", "b", "c"], known, 3), ["a", "b", "c"]);
});
