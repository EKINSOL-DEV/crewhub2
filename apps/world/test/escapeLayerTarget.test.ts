/* Escape's layer for a target that is no element (state/sceneKeys.ts `escapeLayer`, round 65 w6-7): a key event whose
   target has no `closest` (the document, a text node) is in no layer, as `sceneOwnsKey` treats it; it must not throw
   (round 68, mx2: the two `?.` on the `closest` calls survived escapeFocus.test.ts, which only hands elements and null). */
import assert from "node:assert/strict";
import test from "node:test";
import { escapeLayer, sceneOwnsKey } from "../src/state/sceneKeys.ts";

test("w6-7 (round 68, mx2: sceneKeys.ts:21-22): a target without closest (not an element) is in no layer, as the scene's own keys treat it", () => {
  assert.equal(escapeLayer({}), null, "no closest at all");
  assert.equal(sceneOwnsKey({}), true, "the same target is the scene's");
});
