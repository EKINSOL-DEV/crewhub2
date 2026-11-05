/* The chat marks over the buildings from the town (round 65, walk finding w3-4): one per real agent inside a building
   with an answer not opened yet, its newest; a mark outlives its bubble and goes when the chat opens (the unread list
   empties) or the agent's next answer replaces it. world/saidText.ts `answerMarks`; the bubbles and the text view's
   says-lines still follow the bubble's 12 s. */
import assert from "node:assert/strict";
import test from "node:test";
import { answerMarks, markLabel } from "../src/world/saidText.ts";
import type { Answer } from "../src/state/said.ts";
import { agent, building, world } from "./fixtures.ts";

const answer = (agentId: string, text: string, shownAt: number): Answer => ({ agentId, agentName: agentId, text, messageId: `${agentId}-${shownAt}`, threadId: `t-${agentId}`, shownAt, until: shownAt + 12_000, at: "2026-11-05T10:00:00.000Z" });

const lead = agent("cr-lead", "lead-office", { displayName: "CR Lead" });
const proxy = agent("cl-ghost", "lead-office", { presence: "proxy" });
const model = () => world([building("crewhub", [lead, proxy])]);

test("an unread answer from an agent inside a building is a mark over it, from the unread list alone (no clock, no bubble)", () => {
  const m = model();
  const b = m.buildings[0]!;
  const marks = answerMarks(m, [answer("cr-lead", "On it.", 1_000)]);
  assert.equal(marks.length, 1);
  assert.deepEqual(marks[0], { slug: b.slug, building: b.name, agent: "cr-lead", key: lead.key, name: "CR Lead", text: "On it.", fading: false });
  assert.equal(markLabel(marks[0]!), `CR Lead answered: open ${b.name}`);
});

test("the newest unread answer of an agent is its mark; nothing unread, no marks; a proxy figure or an agent of no building makes none", () => {
  const m = model();
  const marks = answerMarks(m, [answer("cr-lead", "newer", 2_000), answer("cr-lead", "older", 1_000), answer("cl-ghost", "a proxy", 2_500), answer("nobody-here", "lost", 3_000)]);
  assert.deepEqual(marks.map((x) => x.text), ["newer"]);
  assert.deepEqual(answerMarks(m, []), []);
});
