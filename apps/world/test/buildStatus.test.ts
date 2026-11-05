import assert from "node:assert/strict";
import test from "node:test";
import { buildStatusLine } from "../src/world/buildStatus.ts";

const reason = "It overlaps something or sticks out of the room.";

test("outside a building, with a selection, with a chosen prop that fits, points nowhere, or with nothing chosen: the status as it was", () => {
  assert.equal(buildStatusLine({ inside: false, selected: null, chosen: null, check: null, message: "" }), "Enter a building to place props.");
  assert.equal(buildStatusLine({ inside: true, selected: { name: "Oak bench", rotation: 1 }, chosen: null, check: null, message: "" }), "Oak bench selected, turned a quarter.");
  assert.equal(buildStatusLine({ inside: true, selected: null, chosen: "Workstation", check: { ok: true }, message: "" }), "Workstation fits here.");
  assert.equal(buildStatusLine({ inside: true, selected: null, chosen: "Workstation", check: null, message: "" }), "Workstation: point at a floor or use the arrow keys.");
  assert.equal(buildStatusLine({ inside: true, selected: null, chosen: null, check: null, message: "" }), "Choose a prop, or click a placed prop to select it.");
});

test("a refused spot says its reason in the status, once: with no message, or a message about something else", () => {
  assert.equal(buildStatusLine({ inside: true, selected: null, chosen: "Workstation", check: { ok: false, reason }, message: "" }), `Workstation can't stand here: ${reason}`);
  assert.equal(buildStatusLine({ inside: true, selected: null, chosen: "Workstation", check: { ok: false, reason }, message: "Removed Oak bench. Undo brings it back." }), `Workstation can't stand here: ${reason}`);
});

test("w6-2: when the message already says the check's reason (the refused placement), the status yields to it, so the reason is read once", () => {
  assert.equal(buildStatusLine({ inside: true, selected: null, chosen: "Workstation", check: { ok: false, reason }, message: `Can't place Workstation here: ${reason}` }), "");
});
