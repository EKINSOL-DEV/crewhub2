/* A `town` message's `op` (round 65, w6-12): the move that changed the host's town, read when it is one of the four,
   left out when an older host sends none or a newer one a word this page does not know. */
import assert from "node:assert/strict";
import test from "node:test";
import { readHostMessage } from "../src/hostWire.ts";

const read = (value: unknown) => {
  const r = readHostMessage(value);
  return r.ok ? r.value : `${r.path}: ${r.message}`;
};

test("w6-12: a town message carries the move that changed the town; none or an unknown word is left out", () => {
  assert.deepEqual(read({ type: "town", rev: 7, op: "undo" }), { type: "town", rev: 7, op: "undo" });
  assert.deepEqual(read({ type: "town", rev: 8, op: "redo" }), { type: "town", rev: 8, op: "redo" });
  assert.deepEqual(read({ type: "town", rev: 9, op: "commit" }), { type: "town", rev: 9, op: "commit" });
  assert.deepEqual(read({ type: "town", rev: 9, op: "amend" }), { type: "town", rev: 9, op: "amend" });
  assert.deepEqual(read({ type: "town", rev: 3 }), { type: "town", rev: 3 }, "an older host");
  assert.deepEqual(read({ type: "town", rev: 3, op: "rebase" }), { type: "town", rev: 3 }, "a word this page does not know");
  assert.equal(read({ type: "town", rev: -1, op: "undo" }), "$.rev: expected a whole number from 0 up");
});
