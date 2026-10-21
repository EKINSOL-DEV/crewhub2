import assert from "node:assert/strict";
import test from "node:test";
import type { AgentCardFacts, AgentLaneFacts, AgentLoopsFacts, AgentPlacement, Building, WorkObject } from "@crewhub/world-model";
import { AGENT_CARD_SECTIONS, renderAgentCard } from "../src/world/agentCard/registry.ts";
import type { AgentCardSection, CardContext, CardRow } from "../src/world/agentCard/types.ts";
import { agoWords, spanWords, ticketHref } from "../src/world/agentCard/words.ts";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const ctx = (over: Partial<CardContext> = {}): CardContext => ({ now: NOW, freshness: { teamTs: null, ageSeconds: 10, stale: false }, loopsUrl: "http://127.0.0.1:8091", ...over });

const agent = (over: Partial<AgentPlacement> = {}): AgentPlacement => ({
  key: "cl-lead",
  name: "cl-lead",
  displayName: "CL Lead",
  registered: true,
  role: "lead",
  roleSource: "project-lead",
  building: "crewhub-loops",
  room: "lead-office",
  presence: "real",
  workingIn: null,
  locationInferred: false,
  laneStatus: "working",
  posture: "focused",
  caption: null,
  deskTicketKey: null,
  alerts: [],
  ...over,
});
const building = {
  slug: "crewhub-loops",
  name: "crewhub-loops",
  key: "CL",
  rooms: [{ id: "crewhub-loops:lead-office", kind: "lead-office", label: "Lead's office", present: true, emptyLabel: null }],
  objects: [],
  agents: [],
} as unknown as Building;

/** The least the facts can say: a placed agent and nothing else known. */
const bare = (over: Partial<AgentCardFacts> = {}): AgentCardFacts => ({
  key: "cl-lead",
  name: "cl-lead",
  displayName: "CL Lead",
  registered: true,
  agent: agent(),
  building,
  civic: null,
  homes: [],
  work: null,
  workProject: null,
  stateWords: "working, posture focused",
  progress: null,
  team: null,
  teamSession: null,
  loops: null,
  lane: null,
  recent: [],
  ...over,
});

const texts = (rows: CardRow[]) => rows.flatMap((r) => (r.kind === "text" ? [`${r.label}|${r.text}`] : r.kind === "chips" ? r.chips.map((c) => ("text" in c ? c.text : c.kind === "lane" ? `lane ${c.status}` : c.label)) : r.kind === "quote" ? [`"${r.text}"`] : r.kind === "ticket" ? [r.ticketKey] : r.items.map((i) => i.text)));

test("with the least facts only Now shows: where it is and its state; nothing is invented for the rest", () => {
  const out = renderAgentCard(bare(), ctx());
  assert.deepEqual(
    out.map((s) => s.id),
    ["now"],
  );
  assert.deepEqual(texts(out[0]!.rows), ["Where|crewhub-loops, Lead's office", "lane working", "posture focused"]);
});

test("the registry is ordered and every section has a distinct id", () => {
  assert.deepEqual(
    AGENT_CARD_SECTIONS.map((s) => s.id),
    ["now", "work", "lane", "projects", "recent"],
  );
  assert.equal(new Set(AGENT_CARD_SECTIONS.map((s) => s.id)).size, AGENT_CARD_SECTIONS.length);
});

test("Work: the ticket with its link into loops, its chips, the project and the last line; no link in the demo", () => {
  const work = { ticketId: "t1", key: "CL-7", title: "Agent card", kind: "task", look: "folder", status: "in_progress", room: "lead-office", deskOf: "cl-lead", deskInferred: false, position: 1, priorityTag: "high", blocked: false, sealed: false, stall: { state: "stalled", quietSince: "", quietMinutes: 12, nudges: 1 }, quiet: null, nameTag: "Nicky", waitingOnHuman: true, milestone: null, labels: [], speechMarkUntil: null, celebrateUntil: null, rejected: null, turnedDownUntil: null, transit: null } satisfies WorkObject;
  const facts = bare({ work: { ...work }, workProject: { slug: "crewhub-loops", key: "CL", name: "crewhub-loops" }, progress: { ts: NOW - 3 * 60_000, kind: "update", ticketKey: "CL-7", text: "sections from a registry" } });
  const section = renderAgentCard(facts, ctx()).find((s) => s.id === "work");
  assert.ok(section);
  const ticket = section.rows[0];
  assert.equal(ticket?.kind, "ticket");
  assert.equal(ticket?.kind === "ticket" && ticket.href, "http://127.0.0.1:8091/t/CL-7");
  assert.deepEqual(texts(section.rows), ["CL-7", "in progress", "high priority", "waiting on Nicky", "stalled, quiet 12 min, nudged 1×", "Project|crewhub-loops (CL)", '"sections from a registry"']);
  const quote = section.rows.find((r) => r.kind === "quote");
  assert.equal(quote?.kind === "quote" && quote.by, "update on CL-7, 3 min ago");
  const demo = renderAgentCard(facts, ctx({ loopsUrl: null })).find((s) => s.id === "work")!.rows[0];
  assert.equal(demo?.kind === "ticket" && demo.href, null);
});

const loopsOf = (over: Partial<AgentLoopsFacts> = {}): AgentLoopsFacts => ({ role: "lead", isCrewhubLead: false, isCoordinator: false, isOperator: false, disabled: false, external: false, reader: false, notPickedUp: 0, needsLoginSince: null, lastSeenAt: null, herdrSession: "ekinsol", computer: null, projects: { lead: [], member: [] }, ...over });
const laneOf = (over: Partial<AgentLaneFacts> = {}): AgentLaneFacts => ({ kind: "claude", session: "ekinsol", pane: "w1:p2", lifecycle: "fixed", restarting: false, model: "opus", effort: "high", account: 2, permissionMode: "auto", observed: { kind: "claude", model: "sonnet", effort: "high", account: 2, permissionMode: "plan", source: "probe" }, observedAt: new Date(NOW - 3 * 60_000).toISOString(), drift: ["model", "permissionMode"], ...over });

test("Lane: set up as versus seen running, each drift in words, lifecycle, session and pane, the computer, the flags", () => {
  const full = bare({ lane: laneOf(), loops: loopsOf({ isCrewhubLead: true, computer: { name: "This computer", kind: "this" } }) });
  const lane = renderAgentCard(full, ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(lane!.rows), [
    "Set up as|claude, opus, effort high",
    "Permission mode|auto",
    "Seen running|claude, sonnet, effort high, mode plan (by the probe, 3 min ago)",
    "drift in model, permission mode",
    "model drift|set up as opus, seen sonnet",
    "permission mode drift|set up as auto, seen plan",
    "Lifecycle|fixed",
    "Session|ekinsol, pane w1:p2",
    "Computer|This computer, where loops runs",
    "In loops|lead, CrewHub lead",
  ]);
  // No drift says so; an observation from the start, a restart, and the alerts of needs-login and deliveries not picked up.
  const started = bare({
    lane: laneOf({ observed: { kind: "claude", model: "opus", effort: null, account: null, permissionMode: null, source: "started" }, observedAt: null, drift: [], restarting: true }),
    loops: loopsOf({ needsLoginSince: new Date(NOW - 2 * 3_600_000).toISOString(), notPickedUp: 1, computer: { name: "buildbox", kind: "remote" } }),
  });
  assert.deepEqual(texts(renderAgentCard(started, ctx()).find((s) => s.id === "lane")!.rows), [
    "Set up as|claude, opus, effort high",
    "Permission mode|auto",
    "Seen running|claude, opus (from its start)",
    "|No drift: it runs as set up.",
    "Lifecycle|fixed, restarting now",
    "Session|ekinsol, pane w1:p2",
    "Computer|buildbox, remote",
    "In loops|lead",
    "needs login, since 2 h ago",
    "1 delivery not picked up for over a day",
  ]);
  // A lane never seen running, with only its kind known.
  const some = renderAgentCard(bare({ lane: laneOf({ session: null, pane: null, lifecycle: null, restarting: null, model: null, effort: null, account: null, permissionMode: null, observed: null, observedAt: null, drift: [] }) }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(some!.rows), ["Set up as|claude", "|Never seen running: no probe has observed this lane."]);
  // The drift keys loops may add are passed through in its own words, with unknown values said so.
  const odd = renderAgentCard(bare({ lane: laneOf({ drift: ["account", "cwd"], observed: { kind: null, model: null, effort: null, account: null, permissionMode: null, source: null } }) }), ctx()).find((s) => s.id === "lane");
  assert.ok(texts(odd!.rows).includes("drift in account, cwd"));
  assert.ok(texts(odd!.rows).includes("account drift|set up as 2, seen unknown"));
  assert.ok(texts(odd!.rows).includes("cwd drift|set up as unset, seen unknown"));
});

test("Lane: an external bot has no lane and says so; a laneless agent says so; a worker says whose it is; nothing without facts", () => {
  const bot = renderAgentCard(bare({ loops: loopsOf({ external: true, herdrSession: "external:none", computer: { name: "This computer", kind: "this" } }) }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(bot!.rows), ["|External bot: no lane, it runs elsewhere.", "Computer|This computer, where loops runs", "In loops|lead, external bot"]);
  const reader = renderAgentCard(bare({ loops: loopsOf({ external: true, reader: true, herdrSession: "external:none" }) }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(reader!.rows), ["|External bot: no lane, it runs elsewhere; reads only.", "In loops|lead, external bot, reads only"]);
  const laneless = renderAgentCard(bare({ loops: loopsOf({ isOperator: true, disabled: true }) }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(laneless!.rows), ["|No lane: loops has not tied this agent to a pane.", "Session|ekinsol", "In loops|lead, operator, disabled"]);
  // The team session's computer counts when loops names none.
  const fromTeam = renderAgentCard(bare({ team: { name: "cl-lead", status: "idle" }, teamSession: { name: "ekinsol", computer: { name: "mini", kind: "this" } } }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(fromTeam!.rows), ["Computer|mini, where loops runs"]);
  const worker = renderAgentCard(bare({ registered: false, team: { name: "cl-dev-1", status: "working", lead: "cl-lead" } }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(worker!.rows), ["In loops|a worker of cl-lead, not registered"]);
  assert.equal(renderAgentCard(bare(), ctx()).some((s) => s.id === "lane"), false);
});

test("Now: the team's word and the last sighting, and old facts are never read as working", () => {
  const now = (facts: AgentCardFacts, over: Partial<CardContext> = {}) => texts(renderAgentCard(facts, ctx(over))[0]!.rows).slice(3);
  // Fresh: the team's word, its line, and a sighting 2 min old.
  assert.deepEqual(now(bare({ team: { name: "cl-lead", status: "working", contextLine: "CL-7 wiring", unsentInput: "typed" }, loops: loopsOf({ lastSeenAt: new Date(NOW - 2 * 60_000).toISOString() }) })), ["Team says|working; text typed in its input, not sent", '"CL-7 wiring"', "Seen by loops|2 min ago"]);
  // Stale snapshot: the word is history; a sighting 2 h old with nothing fresher is not working.
  const stale = { freshness: { teamTs: "2026-10-07T11:45:00Z", ageSeconds: 900, stale: true } };
  assert.deepEqual(now(bare({ team: { name: "cl-lead", status: "working" }, loops: loopsOf({ lastSeenAt: new Date(NOW - 2 * 3_600_000).toISOString() }) }), stale), ["|The team snapshot is older than 5 minutes: the lane status is unknown.", "Team said|working, in a snapshot that is old now", "Not seen by loops|for 2 h; not known to be working"]);
  // No snapshot at all (the development instance answers ts ""): said as missing, not as old.
  assert.deepEqual(now(bare({ loops: loopsOf() }), { freshness: { teamTs: null, ageSeconds: null, stale: true } }), ["|No team snapshot: no team probe has reported to this crewhub-loops, so the lane status is unknown.", "Team says|nothing: not in the team snapshot", "Seen by loops|never; not known to be working"]);
  // Not in the team snapshot at all, never seen: said plainly. An external bot: the team cannot watch it.
  assert.deepEqual(now(bare({ loops: loopsOf() })), ["Team says|nothing: not in the team snapshot", "Seen by loops|never; not known to be working"]);
  assert.deepEqual(now(bare({ loops: loopsOf({ external: true, lastSeenAt: new Date(NOW - 10_000).toISOString() }) })), ["Team says|nothing: an external bot has no pane for the team to watch", "Seen by loops|just now"]);
  // A fresh team word outranks an old sighting: no "not known to be working" then.
  assert.deepEqual(now(bare({ team: { name: "cl-lead", status: "idle" }, loops: loopsOf({ lastSeenAt: new Date(NOW - 3 * 3_600_000).toISOString() }) })), ["Team says|idle", "Not seen by loops|for 3 h"]);
  // Without loops facts (the demo's workers) nothing about sightings is said.
  assert.deepEqual(now(bare({ registered: false, team: { name: "cl-dev-1", status: "working", lead: "cl-lead" } })), ["Team says|working"]);
});

test("Projects and Recent: the buildings with the agent's part in each, and the last facts with their age", () => {
  const facts = bare({
    homes: [
      { slug: "crewhub-loops", name: "crewhub-loops", key: "CL" },
      { slug: "crewhub", name: "CrewHub product", key: "CR" },
    ],
    loops: loopsOf({ herdrSession: null, projects: { lead: [{ slug: "crewhub-loops", key: "CL" }], member: [{ slug: "crewhub", key: "CR" }, { slug: "gone", key: "GO" }] } }),
    recent: [
      { ts: NOW - 20_000, kind: "progress", ticketKey: "CL-7", text: "update on CL-7: done" },
      { ts: NOW - 2 * 3_600_000, kind: "comment", ticketKey: "CL-2", text: "commented on CL-2" },
    ],
  });
  const out = renderAgentCard(facts, ctx());
  assert.deepEqual(texts(out.find((s) => s.id === "projects")!.rows), ["crewhub-loops (CL)|leads it", "CrewHub product (CR)|member", "GO|member (no building here)"]);
  const recent = out.find((s) => s.id === "recent")!.rows[0];
  assert.equal(recent?.kind, "list");
  assert.deepEqual(recent?.kind === "list" && recent.items.map((i) => i.meta), ["just now", "2 h ago"]);
});

test("Now: a proxy, an inferred place, a stale snapshot, the status line and the alerts each add one row", () => {
  const proxy = renderAgentCard(bare({ agent: agent({ presence: "proxy", workingIn: "crewhub" }) }), ctx())[0]!;
  assert.deepEqual(texts(proxy.rows), ["Where|crewhub-loops, Lead's office", "|A translucent proxy here: the real figure works in another building."]);
  const stale = renderAgentCard(bare({ agent: agent({ locationInferred: true, alerts: ["CL-3 waits on Nicky"] }), team: { name: "cl-lead", status: "working", contextLine: "CL-7 wiring" } }), ctx({ freshness: { teamTs: "2026-10-07T11:45:00Z", ageSeconds: 900, stale: true } }))[0]!;
  assert.deepEqual(texts(stale.rows), ["Where|crewhub-loops, Lead's office (inferred from recent events)", "lane working", "posture focused", "|The team snapshot is older than 5 minutes: the lane status is unknown.", "Team said|working, in a snapshot that is old now", '"CL-7 wiring"', "CL-3 waits on Nicky"]);
});

test("a section of a third party plugs in through the registry's list, and an empty render is left out", () => {
  const extra: AgentCardSection = { id: "mood", title: "Mood", when: () => true, render: () => [] };
  const words: AgentCardSection = { id: "words", title: "Words", when: (f) => f.registered, render: (f) => [{ kind: "text", label: "", text: f.stateWords }] };
  const out = renderAgentCard(bare(), ctx(), [extra, words]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["words"],
  );
  assert.deepEqual(texts(out[0]!.rows), ["|working, posture focused"]);
});

test("words: ages read in source time, and the ticket link is the loops web app's /t/<KEY>", () => {
  assert.equal(agoWords(NOW - 10_000, NOW), "just now");
  assert.equal(agoWords(NOW - 90_000, NOW), "2 min ago");
  assert.equal(agoWords(NOW - 25 * 3_600_000, NOW), "yesterday");
  assert.equal(agoWords(NOW + 5000, NOW), "just now");
  assert.equal(agoWords(NOW - 3 * 86_400_000, NOW), "3 days ago");
  assert.deepEqual([spanWords(10_000), spanWords(90_000), spanWords(2 * 3_600_000), spanWords(25 * 3_600_000), spanWords(72 * 3_600_000)], ["<1 min", "2 min", "2 h", "1 day", "3 days"]);
  assert.equal(ticketHref("http://127.0.0.1:8091/", "CL-7"), "http://127.0.0.1:8091/t/CL-7");
  assert.equal(ticketHref(null, "CL-7"), null);
});
