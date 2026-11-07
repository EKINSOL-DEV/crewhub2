import assert from "node:assert/strict";
import test from "node:test";
import { linesOf, type AgentEntity } from "../src/agents.ts";
import { emptyFacts, type ProgressFact } from "../src/facts.ts";

const line = (seq: number, agent: string, text: string): ProgressFact => ({ seq, ts: seq * 1000, slug: "cr", ticketKey: "CR-1", agent, kind: "update", text });
const entity = (extra: Partial<AgentEntity>): AgentEntity => ({ key: "cr-lead", name: "cr-lead", displayName: "Lead", registered: true, loopsRole: null, lead: null, lane: null, homes: [], ...extra }) as AgentEntity;

test("progress lines are found per agent, and the answer follows facts that change in place", () => {
  const facts = emptyFacts();
  const lead = entity({}),
    worker = entity({ key: "cr/cr-dev-1", name: "cr-dev-1", registered: false, lead: "cr-lead" });
  facts.progress.push(line(1, "cr-lead", "planning the week"), line(2, "cr-lead", "cr-dev-1: wiring the door"), line(3, "ops-lead", "cr-dev-1: not ours"));
  assert.deepEqual(linesOf(lead, facts).map((l) => l.text), ["planning the week"]);
  assert.deepEqual(linesOf(worker, facts).map((l) => l.text), ["wiring the door"]);
  // A new line lands in the same array (the projection pushes, capped): the next ask sees it.
  facts.progress.push(line(4, "cr-lead", "cr-dev-1: door done"));
  assert.deepEqual(linesOf(worker, facts).map((l) => l.text), ["wiring the door", "door done"]);
  // The cap drops the oldest and adds one: the same length, another answer.
  facts.progress.shift();
  facts.progress.push(line(5, "cr-lead", "review at four"));
  assert.deepEqual(linesOf(lead, facts).map((l) => l.text), ["review at four"]);
  // A worker a lead names is known from the team snapshot too: a new snapshot is a new answer.
  facts.progress.push(line(6, "cr-lead", "helper: on it"));
  const helper = entity({ key: "cr/helper", name: "helper", registered: false, lead: "cr-lead" });
  assert.deepEqual(linesOf(helper, facts), []);
  facts.team = { sessions: [{ name: "cr", agents: [{ name: "helper", lead: "cr-lead" }] }] } as unknown as typeof facts.team;
  facts.teamRevision += 1;
  assert.deepEqual(linesOf(helper, facts).map((l) => l.text), ["on it"]);
});
