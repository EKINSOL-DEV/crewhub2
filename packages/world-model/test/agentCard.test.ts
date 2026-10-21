import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentLane, Envelope } from "@crewhub/loops-client";
import { agentCardFacts, computerFacts, laneFacts, RECENT_LIMIT } from "../src/agentCard.ts";
import { emptyMemory } from "../src/memory.ts";
import type { WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, agentRef, board, card, envelope, iso, lane, project, registered, snapshot, team, userRef, type WorldInput } from "./helpers.ts";

function world(input: WorldInput) {
  const source = new FakeSource();
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot(input) });
  const reduce = (now = T0): WorldModel => reduceWorld(projection.facts, emptyMemory(), { now, mode: "demo", roleOverrides: {} }).model;
  const event = (e: Envelope) => projection.apply({ type: "event", envelope: e });
  return { projection, reduce, event };
}

const CL = project("crewhub-loops", "CL", "cl-lead");
const CR = project("crewhub", "CR", "cr-lead");
const LANE: AgentLane = { id: "lane-1", kind: "claude", session: "ekinsol", name: "cl-lead", pane: "w1:p1", desired: { model: "opus", effort: "high", account: null, permissionMode: "auto" }, observed: { kind: "claude", model: "sonnet", effort: "high", account: null, permissionMode: "auto", source: "probe" }, observedAt: iso(T0), drift: ["model"], lifecycle: "fixed", restarting: false };

test("the card gathers the agent's placement, work, lane, loops flags, projects and recent facts; nothing is invented", () => {
  const w = world({
    projects: [CL, CR],
    boards: { "crewhub-loops": board([card("t1", "CL-7", "in_progress", { title: "Agent card", assignee: agentRef("cl-lead"), waitingOn: userRef("nicky", "Nicky"), waitingOnHuman: true })]) },
    team: team(T0, [lane("cl-lead", "working", { contextLine: "CL-7 wiring the card" })]),
    agents: [registered("cl-lead", "lead", { isCrewhubLead: false, isCoordinator: true, projects: { lead: [{ slug: "crewhub-loops", key: "CL" }], member: [{ slug: "crewhub", key: "CR" }] }, lane: LANE })],
  });
  w.event(envelope("ticket.progress", { ticket: "CL-7", agent: "cl-lead", kind: "update", text: "sections from a registry" }, { ts: iso(T0 - 60_000) }));
  w.event(envelope("ticket.moved", { from: "planned", to: "in_progress", position: 1 }, { ts: iso(T0 - 120_000), ticket: { id: "t1", key: "CL-7", title: "Agent card" }, actor: { id: "cl-lead", kind: "agent" } }));
  const facts = agentCardFacts(w.reduce(), w.projection.facts, "cl-lead");
  assert.ok(facts);
  assert.equal(facts.displayName, "cl-lead");
  assert.equal(facts.registered, true);
  assert.equal(facts.building?.slug, "crewhub-loops");
  assert.equal(facts.agent.presence, "real");
  assert.equal(facts.stateWords, "working, posture focused");
  assert.equal(facts.work?.key, "CL-7");
  assert.equal(facts.work?.nameTag, "Nicky");
  assert.deepEqual(facts.workProject, { slug: "crewhub-loops", key: "CL", name: "CL project" });
  assert.equal(facts.progress?.text, "sections from a registry");
  assert.equal(facts.progress?.kind, "update");
  assert.equal(facts.team?.contextLine, "CL-7 wiring the card");
  assert.deepEqual(facts.loops && { role: facts.loops.role, coordinator: facts.loops.isCoordinator, lead: facts.loops.isCrewhubLead }, { role: "lead", coordinator: true, lead: false });
  assert.deepEqual(facts.lane && [facts.lane.kind, facts.lane.model, facts.lane.effort, facts.lane.permissionMode, facts.lane.lifecycle, facts.lane.observed?.model, facts.lane.drift], ["claude", "opus", "high", "auto", "fixed", "sonnet", ["model"]]);
  // Both buildings: the one it leads (where it stands) and the one it is a member of (a proxy there).
  assert.deepEqual(
    facts.homes.map((h) => h.slug),
    ["crewhub-loops", "crewhub"],
  );
  // Newest first: the progress line (1 min ago) before the move (2 min ago).
  assert.deepEqual(
    facts.recent.map((r) => r.kind),
    ["progress", "move"],
  );
  assert.equal(facts.recent[0]?.text, "update on CL-7: sections from a registry");
  assert.equal(facts.recent[1]?.text, "moved CL-7 from planned to in progress");
});

test("a worker has no loops entry and no lane; its lines are found under its lead; recent is capped", () => {
  const w = world({
    projects: [CL],
    team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-1", "working", { lead: "cl-lead", contextLine: "CL-9 tests" })]),
    agents: [registered("cl-lead")],
  });
  for (let i = 0; i < RECENT_LIMIT + 3; i++) w.event(envelope("ticket.progress", { ticket: "CL-9", agent: "cl-lead", kind: "update", text: `cl-dev-1: step ${i}` }, { ts: iso(T0 - (RECENT_LIMIT + 3 - i) * 1000) }));
  const facts = agentCardFacts(w.reduce(), w.projection.facts, "ekinsol/cl-dev-1");
  assert.ok(facts);
  assert.equal(facts.registered, false);
  assert.equal(facts.loops, null);
  assert.equal(facts.lane, null);
  assert.equal(facts.team?.lead, "cl-lead");
  assert.equal(facts.work, null);
  assert.equal(facts.progress?.text, `step ${RECENT_LIMIT + 2}`);
  assert.equal(facts.recent.length, RECENT_LIMIT);
  assert.equal(facts.recent[0]?.text, `update on CL-9: step ${RECENT_LIMIT + 2}`);
  // The lead's own card does not carry the worker's lines.
  const lead = agentCardFacts(w.reduce(), w.projection.facts, "cl-lead");
  assert.equal(lead?.progress, null);
  assert.equal(lead?.recent.length, 0);
  assert.equal(agentCardFacts(w.reduce(), w.projection.facts, "nobody"), null);
});

test("lane facts are read defensively from the wire: snake or camel case, missing parts, junk", () => {
  assert.equal(laneFacts(null), null);
  assert.equal(laneFacts("claude"), null);
  assert.deepEqual(laneFacts({}), { kind: null, session: null, pane: null, lifecycle: null, restarting: null, model: null, effort: null, account: null, permissionMode: null, observed: null, observedAt: null, drift: [] });
  const snake = laneFacts({ kind: "codex", desired: { permission_mode: "plan", account: "2" }, observed_at: "2026-10-07T10:00:00Z", drift: ["kind", 7], restarting: "yes" });
  assert.deepEqual(snake && [snake.kind, snake.permissionMode, snake.account, snake.observedAt, snake.drift, snake.restarting], ["codex", "plan", null, "2026-10-07T10:00:00Z", ["kind"], null]);
  const full = laneFacts(LANE);
  assert.deepEqual(full && [full.session, full.pane, full.observed?.source, full.observed?.account], ["ekinsol", "w1:p1", "probe", null]);
  assert.deepEqual(computerFacts({ name: "buildbox", kind: "remote" }), { name: "buildbox", kind: "remote" });
  assert.deepEqual(computerFacts({ name: "box" }), { name: "box", kind: "unknown" });
  assert.equal(computerFacts({ kind: "this" }), null);
  assert.equal(computerFacts(null), null);
});

test("the 4cdcd383 facts: an external bot, a disabled flag, needs-login, the computer of the agent and of its team session", () => {
  const w = world({
    projects: [CL],
    team: { v: 1, ts: iso(T0), sessions: [{ name: "buildbox", computer: { name: "buildbox", kind: "remote" }, agents: [lane("cl-lead", "blocked", { contextLine: "login expired" })] }] },
    agents: [
      registered("cl-lead", "lead", { computer: { name: "buildbox", kind: "remote" }, needsLoginSince: iso(T0 - 600_000), notPickedUp: 2, lastSeenAt: iso(T0 - 60_000), lane: LANE }),
      registered("crewhub-world", "lead", { herdrSession: "external:none", external: true, reader: false, lastSeenAt: iso(T0 - 5_000), lane: null }),
    ],
  });
  const model = w.reduce();
  const lead = agentCardFacts(model, w.projection.facts, "cl-lead");
  assert.ok(lead?.loops);
  assert.deepEqual([lead.loops.external, lead.loops.reader, lead.loops.disabled, lead.loops.notPickedUp, lead.loops.needsLoginSince, lead.loops.lastSeenAt], [false, false, false, 2, iso(T0 - 600_000), iso(T0 - 60_000)]);
  assert.deepEqual(lead.loops.computer, { name: "buildbox", kind: "remote" });
  assert.deepEqual(lead.teamSession, { name: "buildbox", computer: { name: "buildbox", kind: "remote" } });
  assert.equal(lead.team?.status, "blocked");
  const bot = agentCardFacts(model, w.projection.facts, "crewhub-world");
  assert.ok(bot?.loops);
  assert.equal(bot.loops.external, true);
  assert.equal(bot.lane, null);
  assert.equal(bot.team, null);
  assert.equal(bot.teamSession, null);
  assert.equal(bot.loops.herdrSession, "external:none");
});

test("the card knows where a figure outside the buildings stands: the town hall or the post office", () => {
  const w = world({
    projects: [CL],
    agents: [registered("cl-lead"), registered("postman", "router"), registered("crewhub-world-seed", "lead", { external: true, herdrSession: "external:none" })],
    team: team(T0, [lane("cl-lead", "working")]),
  });
  const model = w.reduce();
  const postman = agentCardFacts(model, w.projection.facts, "postman")!;
  assert.equal(postman.building, null);
  assert.equal(postman.civic, "post-office");
  const bot = agentCardFacts(model, w.projection.facts, "crewhub-world-seed")!;
  assert.equal(bot.civic, "town-hall");
  assert.equal(bot.loops?.external, true);
  assert.equal(agentCardFacts(model, w.projection.facts, "cl-lead")!.civic, null);
});
