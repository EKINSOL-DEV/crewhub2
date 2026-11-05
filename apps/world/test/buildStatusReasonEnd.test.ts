/* The build sheet's status yields to a message that ENDS with the check's reason, the refusal's shape (round 65, w6-2);
   a message that only mentions the reason somewhere is about something else, and the status still says it (round 68,
   mutation run mx1: `includes` for `endsWith` passed every test). */
import assert from "node:assert/strict";
import test from "node:test";
import { buildStatusLine } from "../src/world/buildStatus.ts";

const reason = "It overlaps something or sticks out of the room.";

test("w6-2: a message that mentions the reason but does not end with it is no refusal of this spot: the status says the reason", () => {
  const facts = { inside: true, selected: null, chosen: "Workstation", check: { ok: false, reason } };
  assert.equal(buildStatusLine({ ...facts, message: `${reason} Undo brings it back.` }), `Workstation can't stand here: ${reason}`);
  assert.equal(buildStatusLine({ ...facts, message: `Can't place Workstation here: ${reason}` }), "", "the refusal itself, ending with the reason: once");
});
