/* Design choice W4 (`once`, round 72) rewrote the district sentence; its "building"/"buildings" and "agent"/"agents"
   choice for one of each was left unpinned (round 73's mutation run: `=== 1` as `=== 2` survived with every test green). */
import assert from "node:assert/strict";
import test from "node:test";
import { summarise, summaryWords } from "../src/world/wayfinding.ts";
import { building } from "./fixtures.ts";

test("W4: one building with its one agent reads in the singular", () => {
  const summary = summarise([building("one")]);
  assert.equal(summary.buildings, 1);
  assert.equal(summary.agents, 1, "the fixture's lead alone, working");
  const words = summaryWords(summary);
  assert.match(words, /^1 building, 1 agent \(1 working\)\. /, words);
  assert.doesNotMatch(words, /buildings|agents/);
});
