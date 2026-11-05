/* The chat marks from the unread answers (world/saidText.ts `answerMarks`, round 65 w3-4): an answer belongs to its agent
   by the loops id (`AgentPlacement.name`, what the chat store's `agentId` is), not by the key the pick uses, and the marks
   come in building order (round 68, mx2: two mutants survived answerMarks.test.ts, whose fixture agents have key and id
   alike and one building). */
import assert from "node:assert/strict";
import test from "node:test";
import { answerMarks } from "../src/world/saidText.ts";
import type { Answer } from "../src/state/said.ts";
import { agent, building, world } from "./fixtures.ts";

const answer = (agentId: string, text: string, shownAt: number): Answer => ({ agentId, agentName: agentId, text, messageId: `${agentId}-${shownAt}`, threadId: `t-${agentId}`, shownAt, until: shownAt + 12_000, at: "2026-11-05T10:00:00.000Z" });

test("w3-4 (round 68, mx2: saidText.ts:46): an answer finds its agent by the loops id, not by the key the pick uses", () => {
  const dev = agent("cr-dev-1", "workers", { key: "CR-7", displayName: "Dev One" });
  const m = world([building("crewhub", [dev])]);
  const marks = answerMarks(m, [answer("cr-dev-1", "Done.", 1_000)]);
  assert.deepEqual(marks.map((x) => [x.agent, x.key, x.name, x.text]), [["cr-dev-1", "CR-7", "Dev One", "Done."]]);
  assert.deepEqual(answerMarks(m, [answer("CR-7", "by the key", 1_000)]), [], "a key is no loops id: no mark");
});

test("w3-4 (round 68, mx2: saidText.ts:48): the marks come in building order, as the town draws them", () => {
  const m = world([building("alpha", [agent("alpha-dev", "workers")]), building("beta", [agent("beta-dev", "workers")])]);
  const marks = answerMarks(m, [answer("beta-dev", "b", 2_000), answer("alpha-dev", "a", 1_000)]);
  assert.deepEqual(marks.map((x) => [x.slug, x.text]), [["alpha", "a"], ["beta", "b"]], "building order, whatever the answers' order");
});
