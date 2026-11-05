import assert from "node:assert/strict";
import test from "node:test";
import { refusedWords } from "../src/world/placements.ts";

const reason = "It overlaps something or sticks out of the room.";

test("w6-4: a refused move or turn of a placed prop names the prop and the verb, as the refused placement does", () => {
  assert.equal(refusedWords("move", "Soft landing", reason), `Can't move Soft landing there: ${reason}`);
  assert.equal(refusedWords("turn", "Soft landing", reason), `Can't turn Soft landing here: ${reason}`);
});
