/**
 * Rules of the demo's store, actions and script that a mutation run found unpinned (round 54, r54-mut-demo): each test
 * here was red under the mutant it names and green without it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "../src/actions.ts";
import { ScriptBuilder } from "../src/script.ts";
import { DemoReads, initialState, requireTicket } from "../src/store.ts";
import { DAY, iso } from "../src/time.ts";

const T0 = Date.parse("2026-10-01T08:00:00Z");

test("a ticket that leaves In progress leaves its stall episode behind (round 54, r54-mut-demo: actions.ts:375)", () => {
  const state = initialState(T0, 0);
  applyAction(state, { type: "stall", ticket: "CR-22", reason: "stalled", quietMinutes: 30, nudge: false }, 1);
  assert.notEqual(requireTicket(state, "CR-22").stall, null);
  applyAction(state, { type: "move", by: "cr-lead", ticket: "CR-22", to: "review" }, 2);
  assert.equal(requireTicket(state, "CR-22").stall, null);
});

test("a progress line of exactly 200 characters is taken; 201 is refused (round 54, r54-mut-demo: actions.ts:460)", () => {
  const state = initialState(T0, 0);
  applyAction(state, { type: "progress", ticket: "CR-21", agent: "cr-lead", kind: "update", text: "x".repeat(200) }, 1);
  assert.throws(() => applyAction(state, { type: "progress", ticket: "CR-21", agent: "cr-lead", kind: "update", text: "x".repeat(201) }, 2), /longer than 200/);
});

test("a delivery keeps the postman's detail as its last error only when it ends uncertain or unroutable (round 54, r54-mut-demo: actions.ts:642)", () => {
  const state = initialState(T0, 0);
  applyAction(state, { type: "dm", from: "nicky", agent: "cr-lead", text: "Is the nook done?", clientId: "c-1" }, 1);
  applyAction(state, { type: "dm", from: "nicky", agent: "cl-lead", text: "And the catalogue?", clientId: "c-2" }, 2);
  applyAction(state, { type: "postman", source: 1, state: "uncertain", detail: "the pane did not answer" }, 3);
  applyAction(state, { type: "postman", source: 2, state: "forwarded" }, 4);
  const delivery = (action: number) => state.deliveries.find((d) => state.deliveryAction[d.id] === action);
  assert.equal(delivery(1)?.lastError, "the pane did not answer");
  assert.equal(delivery(2)?.lastError, null);
});

test("a reply to a named message answers that one, not the thread's last (round 54, r54-mut-demo: actions.ts:692)", () => {
  const state = initialState(T0, 0);
  applyAction(state, { type: "dm", from: "nicky", agent: "cr-lead", text: "First question", clientId: "c-a" }, 1);
  applyAction(state, { type: "dm", from: "nicky", agent: "cr-lead", text: "Second question", clientId: "c-b" }, 2);
  applyAction(state, { type: "dmReply", agent: "cr-lead", text: "On the first: yes.", replyToClientId: "c-a" }, 3);
  const stateOf = (clientId: string) => state.dmMessages.find((m) => m.clientId === clientId)?.state;
  assert.equal(stateOf("c-a"), "answered");
  assert.notEqual(stateOf("c-b"), "answered");
});

test("an active milestone starts with a start date a week back, a planned one with none, and the read says so (round 54, r54-mut-demo: store.ts:253, :891)", () => {
  const reads = new DemoReads(initialState(T0, 0));
  const active = reads.milestones("crewhub");
  assert.ok(active.length > 0 && active.every((m) => m.state === "active"));
  for (const m of active) assert.equal(m.startedAt, iso(T0 - 7 * DAY));
  const planned = reads.milestones("marketing");
  assert.ok(planned.length > 0 && planned.every((m) => m.state === "planned"));
  for (const m of planned) assert.equal(m.startedAt, null);
});

test("the chat history starts with the person's messages answered and the agents' replies delivered (round 54, r54-mut-demo: store.ts:363)", () => {
  const state = initialState(T0, 0);
  const fromPeople = state.dmMessages.filter((m) => m.author.kind === "user");
  const fromAgents = state.dmMessages.filter((m) => m.author.kind === "agent");
  assert.ok(fromPeople.length > 0 && fromAgents.length > 0);
  for (const m of fromPeople) assert.deepEqual([m.state, m.deliveryState, typeof m.answeredAt], ["answered", "forwarded", "string"]);
  for (const m of fromAgents) assert.equal(m.state, "delivered");
});

test("a ticket's agent is working when its lead's working member names that ticket, or names none; not when it names another (round 54, r54-mut-demo: store.ts:608)", () => {
  const state = initialState(T0, 0);
  const members = state.team.sessions.flatMap((s) => s.agents);
  const set = (name: string, status: string, contextLine: string | null) => Object.assign(members.find((a) => a.name === name)!, { status, contextLine });
  const working = (key: string) => new DemoReads(state).board("crewhub")?.columns.flatMap((c) => c.tickets).find((t) => t.key === key)?.agentWorking;
  set("cr-lead", "idle", null);
  set("cr-dev-1", "working", "CR-21: neighbour expansion");
  set("cr-dev-2", "working", "CR-21: the heap again");
  assert.equal(working("CR-21"), true);
  assert.equal(working("CR-22"), false, "cr-lead's working members are both on CR-21");
  set("cr-dev-2", "working", "tidying the shared shaders");
  assert.equal(working("CR-22"), true, "a working member whose line names no ticket counts for each of its lead's");
});

test("labels: the globals alone without a project, the globals and the project's own with one, null for an unknown project (round 54, r54-mut-demo: store.ts:785)", () => {
  const reads = new DemoReads(initialState(T0, 0));
  assert.deepEqual(reads.labels(null)?.map((l) => l.name), ["awaiting-deploy", "release"]);
  assert.deepEqual(reads.labels("crewhub")?.map((l) => l.name), ["awaiting-deploy", "release", "prop", "renderer", "pathfinding", "stale"]);
  assert.equal(reads.labels("no-such-project"), null);
});

test("an agent's summary names the ticket each of its comments is on (round 54, r54-mut-demo: store.ts:952)", () => {
  const state = initialState(T0, 0);
  const summary = new DemoReads(state).agentSummary("cr-lead", "http://127.0.0.1:5385/");
  assert.ok(summary.comments.length > 0);
  for (const c of summary.comments) {
    const stored = state.comments.find((x) => x.id === c.id)!;
    const key = state.tickets.find((t) => t.id === stored.ticketId)?.key;
    assert.equal(c.ticketKey, key);
    assert.ok(c.url.endsWith(`/t/${key}#c-${c.id}`), c.url);
  }
});

test("a post's final postman step carries the detail it was given, and none without one (round 54, r54-mut-demo: script.ts:92)", () => {
  const s = new ScriptBuilder();
  s.post(0, { type: "poll" }, "uncertain", "no pane answered");
  s.post(0, { type: "poll" });
  const finals = s.drafts.map((d) => d.action).filter((a) => a.type === "postman" && a.state !== "claimed");
  assert.deepEqual(finals.map((a) => ("detail" in a ? a.detail : "no detail")), ["no pane answered", "no detail"]);
});
