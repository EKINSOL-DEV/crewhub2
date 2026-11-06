/**
 * Design choice S1 (`waits`): cl-lead's lane line at 15:36 in the small team. cl-lead posted "Notes ready for 0.9.0."
 * on the release at 15:25, so its line eleven minutes later says what the release now waits for, not that the notes
 * are still being written.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_SEED, SMALL_TEAM_STORY, buildStory } from "../src/script.ts";
import { at } from "../src/time.ts";

test("S1: cl-lead's lane line at 15:36 says 0.9.0 waits for Nicky", () => {
  const entries = buildStory(SMALL_TEAM_STORY, DEMO_SEED);
  const lanes = entries.filter((e) => e.action.type === "lane" && e.action.name === "cl-lead" && Math.abs(e.at - at("15:36")) < 2000);
  assert.equal(lanes.length, 1, "one lane line for cl-lead at 15:36");
  const lane = lanes[0]!.action;
  assert.equal(lane.type, "lane");
  if (lane.type !== "lane") return;
  assert.equal(lane.status, "working");
  assert.equal(lane.contextLine, "CL-88: 0.9.0 waits for Nicky");
});
