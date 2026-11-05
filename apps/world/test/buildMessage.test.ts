import assert from "node:assert/strict";
import test from "node:test";
import { messageShown } from "../src/state/buildMessage.ts";

const placed = "Placed Oak bench on the floor. It is selected: arrow keys move it, R turns it.";

test("a message about no selection stays whatever is selected", () => {
  assert.equal(messageShown({ message: "Removed Oak bench. Undo brings it back.", about: null }, null), "Removed Oak bench. Undo brings it back.");
  assert.equal(messageShown({ message: "Can't place Workstation here: It overlaps something.", about: null }, "p1"), "Can't place Workstation here: It overlaps something.");
  assert.equal(messageShown({ message: "", about: null }, null), "");
});

test("a message about the selected prop shows while that prop is selected", () => {
  assert.equal(messageShown({ message: placed, about: "p1" }, "p1"), placed);
  assert.equal(messageShown({ message: "Moved Oak bench to cell 3, 4.", about: "p1" }, "p1"), "Moved Oak bench to cell 3, 4.");
});

test("w6-3: the message clears when the selection it describes ends: a click elsewhere or Escape (nothing selected), Undo or Delete (the prop is gone), another prop selected", () => {
  assert.equal(messageShown({ message: placed, about: "p1" }, null), "");
  assert.equal(messageShown({ message: placed, about: "p1" }, "p2"), "");
});
