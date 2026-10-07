import assert from "node:assert/strict";
import test from "node:test";
import type { AgentCardFacts, AgentPlacement, Building, WorkObject } from "@crewhub/world-model";
import { AGENT_CARD_SECTIONS, renderAgentCard } from "../src/world/agentCard/registry.ts";
import type { AgentCardSection, CardContext, CardRow } from "../src/world/agentCard/types.ts";
import { agoWords, ticketHref } from "../src/world/agentCard/words.ts";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const ctx = (over: Partial<CardContext> = {}): CardContext => ({ now: NOW, freshness: { teamTs: null, ageSeconds: 10, stale: false }, loopsUrl: "http://127.0.0.1:8091", ...over });

const agent = (over: Partial<AgentPlacement> = {}): AgentPlacement => ({
  key: "cl-lead",
  name: "cl-lead",
  displayName: "CL Lead",
  registered: true,
  role: "lead",
  roleSource: "fact",
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
  homes: [],
  work: null,
  workProject: null,
  stateWords: "working, posture focused",
  progress: null,
  team: null,
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
  const work = { ticketId: "t1", key: "CL-7", title: "Agent card", kind: "task", look: "folder", status: "in_progress", room: "lead-office", deskOf: "cl-lead", deskInferred: false, position: 1, priorityTag: "high", blocked: false, sealed: false, stall: { state: "stalled", quietSince: "", quietMinutes: 12, nudges: 1 }, nameTag: "Nicky", waitingOnHuman: true, milestone: null, labels: [], speechMarkUntil: null, celebrateUntil: null, rejected: null, turnedDownUntil: null, transit: null } satisfies WorkObject;
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

test("Lane: only the facts loops gave; drift is flagged; a worker says whose it is", () => {
  const full = bare({
    lane: { kind: "claude", lifecycle: "fixed", restarting: false, model: "opus", effort: "high", permissionMode: "auto", observed: { kind: "claude", model: "sonnet", effort: null, permissionMode: null }, observedAt: null, drift: ["model"] },
    loops: { role: "lead", isCrewhubLead: true, isCoordinator: false, isOperator: false, lastSeenAt: null, herdrSession: "ekinsol", projects: { lead: [], member: [] } },
  });
  const lane = renderAgentCard(full, ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(lane!.rows), ["Runs on|claude, opus, effort high", "Permission mode|auto", "Lifecycle|fixed", "Observed|claude, sonnet", "drift: model", "In loops|lead, CrewHub lead", "Session|ekinsol"]);
  const some = renderAgentCard(bare({ lane: { kind: "codex", lifecycle: null, restarting: null, model: null, effort: null, permissionMode: null, observed: null, observedAt: null, drift: [] } }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(some!.rows), ["Runs on|codex", "|Never observed by the probe."]);
  const worker = renderAgentCard(bare({ registered: false, team: { name: "cl-dev-1", status: "working", lead: "cl-lead" } }), ctx()).find((s) => s.id === "lane");
  assert.deepEqual(texts(worker!.rows), ["In loops|a worker of cl-lead, not registered"]);
  assert.equal(renderAgentCard(bare(), ctx()).some((s) => s.id === "lane"), false);
});

test("Projects and Recent: the buildings with the agent's part in each, and the last facts with their age", () => {
  const facts = bare({
    homes: [
      { slug: "crewhub-loops", name: "crewhub-loops", key: "CL" },
      { slug: "crewhub", name: "CrewHub product", key: "CR" },
    ],
    loops: { role: "lead", isCrewhubLead: false, isCoordinator: false, isOperator: false, lastSeenAt: null, herdrSession: null, projects: { lead: [{ slug: "crewhub-loops", key: "CL" }], member: [{ slug: "crewhub", key: "CR" }, { slug: "gone", key: "GO" }] } },
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
  const stale = renderAgentCard(bare({ agent: agent({ locationInferred: true, alerts: ["CL-3 waits on Nicky"] }), team: { name: "cl-lead", status: "working", contextLine: "CL-7 wiring" } }), ctx({ freshness: { teamTs: null, ageSeconds: null, stale: true } }))[0]!;
  assert.deepEqual(texts(stale.rows), ["Where|crewhub-loops, Lead's office (inferred from recent events)", "lane working", "posture focused", "|The team snapshot is older than 5 minutes: the lane status is unknown.", '"CL-7 wiring"', "CL-3 waits on Nicky"]);
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
  assert.equal(ticketHref("http://127.0.0.1:8091/", "CL-7"), "http://127.0.0.1:8091/t/CL-7");
  assert.equal(ticketHref(null, "CL-7"), null);
});
