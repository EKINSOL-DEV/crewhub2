import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentLane, ComputerOut, Envelope } from "@crewhub/loops-client";
import { agentCardFacts } from "../src/agentCard.ts";
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

/** The card's cap on recent facts (`RECENT`, private to agentCard.ts since round 61): the test pins the number the card shows. */
const RECENT = 5;
/** A lane or a computer as the wire may send it: the types know the shape, the card reads it without trusting it. */
const wire = <T>(value: unknown) => value as T;

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
  for (let i = 0; i < RECENT + 3; i++) w.event(envelope("ticket.progress", { ticket: "CL-9", agent: "cl-lead", kind: "update", text: `cl-dev-1: step ${i}` }, { ts: iso(T0 - (RECENT + 3 - i) * 1000) }));
  const facts = agentCardFacts(w.reduce(), w.projection.facts, "ekinsol/cl-dev-1");
  assert.ok(facts);
  assert.equal(facts.registered, false);
  assert.equal(facts.loops, null);
  assert.equal(facts.lane, null);
  assert.equal(facts.team?.lead, "cl-lead");
  assert.equal(facts.work, null);
  assert.equal(facts.progress?.text, `step ${RECENT + 2}`);
  assert.equal(facts.recent.length, RECENT);
  assert.equal(facts.recent[0]?.text, `update on CL-9: step ${RECENT + 2}`);
  // The lead's own card does not carry the worker's lines.
  const lead = agentCardFacts(w.reduce(), w.projection.facts, "cl-lead");
  assert.equal(lead?.progress, null);
  assert.equal(lead?.recent.length, 0);
  assert.equal(agentCardFacts(w.reduce(), w.projection.facts, "nobody"), null);
});

test("lane facts are read defensively from the wire: snake or camel case, missing parts, junk; so is the computer", () => {
  // Registered agents of no project stand in the town hall, so each has a card; their lanes and computers come from loops' entry alone.
  const w = world({
    projects: [CL],
    agents: [
      registered("cl-lead", "lead", { lane: null, computer: null }),
      registered("string-lane", "lead", { lane: wire<AgentLane>("claude"), computer: wire<ComputerOut>({ kind: "this" }) }),
      registered("empty-lane", "lead", { lane: wire<AgentLane>({}), computer: wire<ComputerOut>({ name: "box" }) }),
      registered("snake-lane", "lead", { lane: wire<AgentLane>({ kind: "codex", desired: { permission_mode: "plan", account: "2" }, observed_at: "2026-10-07T10:00:00Z", drift: ["kind", 7], restarting: "yes" }) }),
      registered("full-lane", "lead", { lane: LANE, computer: { name: "buildbox", kind: "remote" } }),
    ],
  });
  const model = w.reduce();
  const cardOf = (key: string) => agentCardFacts(model, w.projection.facts, key)!;
  assert.equal(cardOf("cl-lead").lane, null);
  assert.equal(cardOf("string-lane").lane, null);
  assert.deepEqual(cardOf("empty-lane").lane, { kind: null, session: null, pane: null, lifecycle: null, restarting: null, model: null, effort: null, account: null, permissionMode: null, observed: null, observedAt: null, drift: [] });
  const snake = cardOf("snake-lane").lane;
  assert.deepEqual(snake && [snake.kind, snake.permissionMode, snake.account, snake.observedAt, snake.drift, snake.restarting], ["codex", "plan", null, "2026-10-07T10:00:00Z", ["kind"], null]);
  const full = cardOf("full-lane").lane;
  assert.deepEqual(full && [full.session, full.pane, full.observed?.source, full.observed?.account], ["ekinsol", "w1:p1", "probe", null]);
  // A computer needs a name; its kind is whatever string loops sent, "unknown" when none.
  assert.deepEqual(cardOf("full-lane").loops?.computer, { name: "buildbox", kind: "remote" });
  assert.deepEqual(cardOf("empty-lane").loops?.computer, { name: "box", kind: "unknown" });
  assert.equal(cardOf("string-lane").loops?.computer, null);
  assert.equal(cardOf("cl-lead").loops?.computer, null);
});

test("the 4cdcd383 facts: an external bot, a disabled flag, needs-login, the computer of the agent and of its team session", () => {
  const w = world({
    projects: [CL],
    team: {
      v: 1,
      ts: iso(T0),
      sessions: [
        { name: "buildbox", computer: { name: "buildbox", kind: "remote" }, agents: [lane("cl-lead", "blocked", { contextLine: "login expired" })] },
        { name: "nameless", computer: wire<ComputerOut>({ kind: "this" }), agents: [lane("second-lead", "idle")] },
      ],
    },
    agents: [
      registered("cl-lead", "lead", { computer: { name: "buildbox", kind: "remote" }, needsLoginSince: iso(T0 - 600_000), notPickedUp: 2, lastSeenAt: iso(T0 - 60_000), lane: LANE }),
      registered("crewhub-world", "lead", { herdrSession: "external:none", external: true, reader: false, lastSeenAt: iso(T0 - 5_000), lane: null }),
      registered("second-lead", "lead", { herdrSession: "nameless" }),
    ],
  });
  const model = w.reduce();
  const lead = agentCardFacts(model, w.projection.facts, "cl-lead");
  assert.ok(lead?.loops);
  assert.deepEqual([lead.loops.external, lead.loops.reader, lead.loops.disabled, lead.loops.notPickedUp, lead.loops.needsLoginSince, lead.loops.lastSeenAt], [false, false, false, 2, iso(T0 - 600_000), iso(T0 - 60_000)]);
  assert.deepEqual(lead.loops.computer, { name: "buildbox", kind: "remote" });
  assert.deepEqual(lead.teamSession, { name: "buildbox", computer: { name: "buildbox", kind: "remote" } });
  assert.equal(lead.team?.status, "blocked");
  // A session's computer without a name is no computer; the session itself is still named.
  assert.deepEqual(agentCardFacts(model, w.projection.facts, "second-lead")?.teamSession, { name: "nameless", computer: null });
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

test("chat facts: loops' dock lists enabled agents of loops role lead only, so the card offers that agent's chat, else its lead's, else nobody's and says why", () => {
  const w = world({
    projects: [CL],
    team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-1", "working", { lead: "cl-lead" })]),
    agents: [registered("cl-lead", "lead", { displayName: "CL Lead" }), registered("postman", "router")],
  });
  const model = w.reduce();
  const facts = w.projection.facts;
  // A lead: its own head in the dock.
  assert.deepEqual(agentCardFacts(model, facts, "cl-lead")?.chat, { self: true, why: null, lead: null });
  // A worker: no entry of its own; its lead from the team snapshot, which loops lists.
  assert.deepEqual(agentCardFacts(model, facts, "ekinsol/cl-dev-1")?.chat, { self: false, why: "a worker, not an agent registered in crewhub-loops", lead: { key: "cl-lead", displayName: "CL Lead" } });
  // The postman (loops role router) at the post office: no head, no building, no lead to offer.
  assert.deepEqual(agentCardFacts(model, facts, "postman")?.chat, { self: false, why: "the postman (loops role router)", lead: null });
  // The rule on a second world, through the card: loops' role decides, never the world's (an agent of another loops role
  // offers its building's lead); a disabled agent that leads a project keeps a figure as that project's lead (ProjectOut.lead),
  // is said disabled and offers nobody, and its worker is offered nobody either (a disabled lead is skipped); a lead loops
  // does not list is said so and offers nobody. A probe has no figure, so no card. The reducer places a worker only in its
  // lead's building, so a worker's lead and its building's lead are one and the same here.
  const w2 = world({
    projects: [project("alpha", "AL", "a-lead"), project("gone", "GO", "gone-lead"), project("exes", "EX", "x-lead")],
    team: team(T0, [lane("gone-dev-1", "working", { lead: "gone-lead" })]),
    agents: [registered("a-lead", "lead", { displayName: "A" }), registered("gone-lead", "lead", { disabled: true }), registered("bot-1", "bot", { projects: { lead: [], member: [{ slug: "alpha", key: "AL" }] } }), registered("probe-1", "probe")],
  });
  const m2 = w2.reduce();
  const f2 = w2.projection.facts;
  assert.deepEqual(agentCardFacts(m2, f2, "bot-1")?.chat, { self: false, why: "of loops role bot, not a lead", lead: { key: "a-lead", displayName: "A" } });
  assert.deepEqual(agentCardFacts(m2, f2, "gone-lead")?.chat, { self: false, why: "disabled in crewhub-loops", lead: null }, "the building's lead is never the agent itself");
  assert.deepEqual(agentCardFacts(m2, f2, "ekinsol/gone-dev-1")?.chat, { self: false, why: "a worker, not an agent registered in crewhub-loops", lead: null }, "a disabled lead is skipped");
  assert.deepEqual(agentCardFacts(m2, f2, "x-lead")?.chat, { self: false, why: "a registered agent crewhub-loops does not list", lead: null });
  assert.equal(agentCardFacts(m2, f2, "probe-1"), null, "a probe has no figure, so no card");
});

test("tickets (round 22): the open tickets loops assigns to the agent, in progress first, with whom each waits on; the open tickets of others that wait on it; a worker holds none; done tickets are left out", () => {
  const w = world({
    projects: [CL, CR, project("exes", "EX", "x-lead")],
    boards: {
      "crewhub-loops": board([
        card("t1", "CL-7", "review", { title: "Agent card", assignee: agentRef("cl-lead"), waitingOn: userRef("nicky", "Nicky"), waitingOnHuman: true, updatedAt: iso(T0 - 60_000) }),
        card("t2", "CL-8", "in_progress", { title: "Tickets held", assignee: agentRef("cl-lead"), updatedAt: iso(T0 - 120_000) }),
        card("t3", "CL-9", "in_progress", { title: "Newer", assignee: agentRef("cl-lead"), updatedAt: iso(T0 - 30_000) }),
        card("t4", "CL-5", "done", { title: "Done already", assignee: agentRef("cl-lead") }),
        card("t5", "CL-10", "planned", { title: "Analyst's, waits on the lead", assignee: agentRef("analyst"), waitingOn: agentRef("cl-lead") }),
        card("t6", "CL-11", "backlog", { title: "Nobody's" }),
      ]),
      crewhub: board([card("t7", "CR-3", "planned", { title: "Across the road", assignee: agentRef("cl-lead") })]),
    },
    team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-1", "working", { lead: "cl-lead" }), lane("x-dev-1", "working", { lead: "x-lead" })]),
    agents: [registered("cl-lead", "lead", { displayName: "CL Lead" }), registered("analyst", "lead", { projects: { lead: [], member: [{ slug: "crewhub-loops", key: "CL" }] } })],
  });
  const facts = w.projection.facts;
  const model = w.reduce();
  const ticketsOf = (key: string) => agentCardFacts(model, facts, key)!.tickets;
  const lead = ticketsOf("cl-lead");
  assert.deepEqual(lead.held.map((t) => `${t.key} ${t.status}`), ["CL-9 in_progress", "CL-8 in_progress", "CL-7 review", "CR-3 planned"], "in progress first, the newest change first within a status; done left out");
  assert.deepEqual(lead.held[2]?.waitsOn, { id: "nicky", displayName: "Nicky", kind: "user" });
  assert.equal(lead.held[2]?.waitingOnHuman, true);
  assert.equal(lead.held[0]?.waitsOn, null);
  assert.deepEqual(lead.held[3]?.project, { slug: "crewhub", key: "CR", name: "CR project" });
  assert.deepEqual(lead.waitedOnBy.map((t) => [t.key, t.holder?.id]), [["CL-10", "analyst"]], "the analyst's ticket waits on the lead");
  assert.deepEqual(ticketsOf("ekinsol/cl-dev-1"), { held: [], waitedOnBy: [] }, "loops assigns tickets to registered agents only");
  assert.deepEqual(ticketsOf("analyst").held.map((t) => t.key), ["CL-10"]);
  // The lead: a worker's from the team snapshot (by loops' display name), a registered non-lead's the building's; the lead itself has none.
  assert.deepEqual(agentCardFacts(model, facts, "ekinsol/cl-dev-1")?.lead, { key: "cl-lead", displayName: "CL Lead", how: "team" });
  assert.deepEqual(agentCardFacts(model, facts, "analyst")?.lead, { key: "cl-lead", displayName: "cl-lead", how: "building" });
  assert.equal(agentCardFacts(model, facts, "cl-lead")?.lead, null);
  assert.deepEqual(agentCardFacts(model, facts, "ekinsol/x-dev-1")?.lead, { key: "x-lead", displayName: "x-lead", how: "team" }, "a lead loops does not list keeps its id as the name");
});
