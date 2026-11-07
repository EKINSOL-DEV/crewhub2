import assert from "node:assert/strict";
import test from "node:test";
import { namesLine } from "../src/world/namesLine.ts";

test("a label that lists people shows the first few names and how many more", () => {
  assert.equal(namesLine([]), "");
  assert.equal(namesLine(["G-Man"]), "G-Man");
  assert.equal(namesLine(["A", "B", "C", "D"]), "A, B, C, D", "a fourth name is no longer than '+1 more'");
  assert.equal(namesLine(["A", "B", "C", "D", "E"]), "A, B, C +2 more");
  const bots = Array.from({ length: 13 }, (_, i) => (i ? `CrewHub World (r2-${i})` : "CrewHub World"));
  assert.equal(namesLine(bots), "CrewHub World, CrewHub World (r2-1), CrewHub World (r2-2) +10 more");
  assert.equal(namesLine(bots, 1), "CrewHub World +12 more");
});
