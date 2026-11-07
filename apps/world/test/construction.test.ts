import assert from "node:assert/strict";
import test from "node:test";
import { goesUp } from "../src/world/construction.ts";

test("a project that joins a standing town by an event goes up in scaffolding", () => {
  assert.equal(goesUp({ layingOut: false, reset: false, entered: false }), true);
});

test("the first layout, a new snapshot and an entered building stand whole at once", () => {
  assert.equal(goesUp({ layingOut: true, reset: false, entered: false }), false, "the first layout");
  assert.equal(goesUp({ layingOut: false, reset: true, entered: false }), false, "a snapshot is a reset: a seek, a new loop, a key pasted after Forget");
  assert.equal(goesUp({ layingOut: false, reset: false, entered: true }), false, "entered at once");
  assert.equal(goesUp({ layingOut: true, reset: true, entered: false }), false, "the first snapshot is the first layout");
});
