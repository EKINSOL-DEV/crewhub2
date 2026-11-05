/* The build sheet's status line with both w6-2 and w4-2 (sugg/all-r65): w6-2 moved the sentence into world/buildStatus.ts,
   w4-2 gives it words by input kind. A touch device reads tap, and a refused spot still yields to the message. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildWords } from "../src/state/inputWords.ts";
import { buildStatusLine } from "../src/world/buildStatus.ts";

const facts = { inside: true, selected: null, check: null, message: "" };

test("the idle line and the chosen prop's tail follow the input kind; the pointer's when none is given", () => {
  assert.equal(buildStatusLine({ ...facts, chosen: null, words: buildWords(true) }), "Choose a prop, or tap a placed prop to select it.");
  assert.equal(buildStatusLine({ ...facts, chosen: "Workstation", words: buildWords(true) }), "Workstation: tap a floor.");
  assert.equal(buildStatusLine({ ...facts, chosen: null, words: buildWords(false) }), "Choose a prop, or click a placed prop to select it.");
  assert.equal(buildStatusLine({ ...facts, chosen: "Workstation" }), "Workstation: point at a floor or use the arrow keys.");
});

test("on a touch device too, a refused spot yields to the message that says the same reason (w6-2)", () => {
  const reason = "It overlaps something or sticks out of the room.";
  assert.equal(buildStatusLine({ ...facts, chosen: "Workstation", check: { ok: false, reason }, message: `Can't place Workstation here: ${reason}`, words: buildWords(true) }), "");
});
