/* The marks the page shows live (round 76, round 75's base finding on sugg/w3-4): none while the Chat panel is open, where
   an answer is read as it lands. Before, each answer from an agent in a pinned building made a mark for one commit, so
   the pin became a row with the mark and went back to a new pin: two rebuilds per answer, each restarting its breathing.
   world/saidText.ts `marksShown`; the browser's row is in the chat group (tools/regress/chat.mjs). */
import assert from "node:assert/strict";
import test from "node:test";
import { answerMarks, marksShown } from "../src/world/saidText.ts";
import type { Answer } from "../src/state/said.ts";
import { agent, building, world } from "./fixtures.ts";

const answer = (agentId: string, text: string, shownAt: number): Answer => ({ agentId, agentName: agentId, text, messageId: `${agentId}-${shownAt}`, threadId: `t-${agentId}`, shownAt, until: shownAt + 12_000, at: "2026-11-07T10:00:00.000Z" });
const model = () => world([building("crewhub", [agent("cr-lead", "lead-office", { displayName: "CR Lead" })])]);

test("while the Chat panel is open an unread answer makes no mark", () => {
  assert.deepEqual(marksShown(model(), [answer("cr-lead", "On it.", 1_000)], true), []);
});

test("with the Chat panel closed the marks are the answers' marks, unchanged", () => {
  const m = model();
  const unread = [answer("cr-lead", "newer", 2_000), answer("cr-lead", "older", 1_000)];
  const marks = marksShown(m, unread, false);
  assert.deepEqual(marks.map((x) => x.text), ["newer"], "a closed panel still shows the mark");
  assert.deepEqual(marks, answerMarks(m, unread));
  assert.deepEqual(marksShown(m, [], false), [], "nothing unread, no marks");
});
