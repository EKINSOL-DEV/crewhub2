/* Round 44: the projection and the reducer over a long live stream. projection.ts caps its history lists at
   HISTORY_CAP (300: comments, progress, archives, unarchives, automation runs and changes; `pushCapped`) and the
   deliveries at DELIVERY_CAP (500; `capDeliveries`); neither is exported, and no other test feeds more than that. Here
   about 20,000 seeded envelopes over a fixed set of tickets and projects go through `Projection` and `reduceWorld`:
   every list stays at or under its cap, and what is keyed by ticket (`facts.lastMoves`, the reducer's `memory.places`,
   `memory.movesSeen`, `memory.flights`) grows with the ticket ids, never with the events. Deterministic: a seeded
   generator, the scheduler advanced by hand. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope } from "@crewhub/loops-client";
import { emptyMemory, type PresentationMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, lane, project, registered, snapshot, team } from "./helpers.ts";

const EVENTS = 20_000;
const HISTORY_CAP = 300;
const DELIVERY_CAP = 500;
const PROJECTS = [
  { slug: "crewhub-loops", key: "CL", lead: "cl-lead" },
  { slug: "crewhub-world", key: "CW", lead: "cw-lead" },
  { slug: "ops", key: "OP", lead: "op-lead" },
];
const TICKETS_PER_PROJECT = 40;
const STATUSES = ["planned", "in_progress", "review", "done"] as const;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test(`${EVENTS} seeded envelopes over ${PROJECTS.length * TICKETS_PER_PROJECT} tickets: the history lists stay at their caps, the deliveries at theirs, and the ticket-keyed facts and memory grow with the tickets, not the events`, () => {
  const random = seeded(44);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const tickets = PROJECTS.flatMap((p) => Array.from({ length: TICKETS_PER_PROJECT }, (_, i) => ({ id: `${p.key.toLowerCase()}_${i}`, key: `${p.key}-${i + 1}`, title: `${p.key} ticket ${i + 1}`, slug: p.slug, project: { slug: p.slug, key: p.key } })));
  const ticketIds = new Set(tickets.map((t) => t.id));
  const agents = PROJECTS.map((p) => p.lead).concat(["dev-a", "dev-b", "dev-c"]);
  const source = new FakeSource();
  const scheduler = new ManualScheduler();
  const projection = new Projection(source, { scheduler });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({
      projects: PROJECTS.map((p) => project(p.slug, p.key, p.lead)),
      agents: agents.map((a) => registered(a)),
      boards: Object.fromEntries(PROJECTS.map((p) => [p.slug, board(tickets.filter((t) => t.slug === p.slug).map((t, i) => card(t.id, t.key, STATUSES[i % 4]!, { position: i + 1 })))])),
      team: team(T0, agents.map((a) => lane(a, "working"))),
    }),
  });
  let memory: PresentationMemory = emptyMemory();
  let clock = T0;
  const at = () => new Date(clock).toISOString();
  // Every envelope's seq follows the snapshot's cursor (the helper's own counter may sit below it).
  let seq = projection.facts.cursor;
  const event = (e: Envelope) => projection.apply({ type: "event", envelope: { ...e, seq: ++seq } });
  const ticketEvent = (type: string, payload: Record<string, unknown>, t: (typeof tickets)[number], actor = pick(agents)) =>
    envelope(type, payload, { ts: at(), project: t.project, ticket: { id: t.id, key: t.key, title: t.title }, actor: { id: actor, kind: "agent" } });
  let deliveries = 0, runs = 0;
  const peak = { comments: 0, progress: 0, archives: 0, unarchives: 0, automationRuns: 0, automationChanges: 0, deliveries: 0, lastMoves: 0, places: 0, movesSeen: 0, flights: 0 };
  const sample = () => {
    const f = projection.facts;
    for (const list of ["comments", "progress", "archives", "unarchives", "automationRuns", "automationChanges"] as const) {
      assert.ok(f[list].length <= HISTORY_CAP, `${list} ${f[list].length} > ${HISTORY_CAP}`);
      peak[list] = Math.max(peak[list], f[list].length);
    }
    const d = Object.keys(f.deliveries).length;
    assert.ok(d <= DELIVERY_CAP, `deliveries ${d} > ${DELIVERY_CAP}`);
    peak.deliveries = Math.max(peak.deliveries, d);
    const moves = Object.keys(f.lastMoves);
    assert.ok(moves.length <= ticketIds.size && moves.every((id) => ticketIds.has(id)), `lastMoves ${moves.length} keys, not the tickets'`);
    peak.lastMoves = Math.max(peak.lastMoves, moves.length);
    for (const field of ["places", "movesSeen", "flights"] as const) {
      const keys = Object.keys(memory[field]);
      assert.ok(keys.length <= ticketIds.size && keys.every((id) => ticketIds.has(id)), `memory.${field} ${keys.length} keys, not the tickets'`);
      peak[field] = Math.max(peak[field], keys.length);
    }
  };

  for (let i = 1; i <= EVENTS; i++) {
    clock += 1000 + Math.floor(random() * 4000);
    const t = pick(tickets);
    const roll = random();
    if (roll < 0.3) event(ticketEvent("ticket.moved", { from: pick(STATUSES), to: pick(STATUSES), position: 1 + Math.floor(random() * 10) }, t));
    else if (roll < 0.45) event(ticketEvent("comment.created", { commentId: `c_${i}`, parentId: null }, t));
    else if (roll < 0.6) event(envelope("ticket.progress", { ticket: t.key, agent: pick(agents), kind: "update", text: `progress ${i} `.repeat(20) }, { ts: at(), project: t.project }));
    else if (roll < 0.66) event(ticketEvent("ticket.archived", { batchId: null, batchSize: null, releaseId: null, reason: "single" }, t));
    else if (roll < 0.72) event(ticketEvent("ticket.unarchived", { batchId: null, releaseId: null }, t));
    else if (roll < 0.8) {
      event(ticketEvent("ticket.updated", { automation: { id: `auto_${i % 7}`, name: "auto" }, changed: ["status", "assignee"] }, t));
      if (random() < 0.8) event(ticketEvent("automation.ran", { runId: `run_${runs++}`, automationId: `auto_${i % 7}`, outcome: pick(["ok", "skipped", "failed"]), automation: { id: `auto_${i % 7}`, name: "auto" } }, t));
    } else if (roll < 0.9) {
      const id = `dlv_${deliveries++}`;
      event(ticketEvent("delivery.created", { deliveryId: id, recipientId: pick(agents), reason: "handoff" }, t));
      if (random() < 0.5) event(ticketEvent("delivery.updated", { deliveryId: id, state: pick(["claimed", "forwarded", "unroutable"]) }, t));
    } else if (roll < 0.95) event(ticketEvent("delivery.updated", { deliveryId: `dlv_${Math.floor(random() * Math.max(1, deliveries))}`, state: "forwarded" }, t));
    else projection.apply({ type: "heartbeat", seq: projection.facts.cursor, ts: at() });
    if (i % 50 === 0) {
      scheduler.advance(1000);
      const result = reduceWorld(projection.facts, memory, { now: clock, mode: "demo", roleOverrides: {} });
      memory = result.memory;
    }
    if (i % 500 === 0) sample();
  }
  sample();
  // The caps were reached (so the test exercised them), and the ticket-keyed facts cover the tickets, not the events.
  assert.equal(peak.comments, HISTORY_CAP, "the comments reached the cap");
  assert.equal(peak.progress, HISTORY_CAP, "the progress list reached the cap");
  assert.equal(peak.archives, HISTORY_CAP);
  assert.equal(peak.unarchives, HISTORY_CAP);
  assert.equal(peak.automationRuns, HISTORY_CAP);
  assert.equal(peak.deliveries, DELIVERY_CAP, "the deliveries reached the cap");
  assert.ok(peak.lastMoves <= ticketIds.size && peak.lastMoves > ticketIds.size * 0.9, `lastMoves covers the tickets (${peak.lastMoves} of ${ticketIds.size})`);
  console.log(`  longStream: ${EVENTS} events, ${deliveries} deliveries, ${runs} runs; peaks ${JSON.stringify(peak)}`);
});

/* Round 47: the long stream above runs 80 % of its automation changes, and a run takes its change out again, so
   `automationChanges` peaks just under the cap (299) and its `pushCapped` was never exercised. Here 400 changes whose
   run never comes, each by another automation: the list stops at 300 and keeps the newest. */
test("automation changes whose run never comes stay at the cap of 300, the newest kept", () => {
  const p = PROJECTS[0]!;
  const t = { id: "cl_0", key: "CL-1", title: "CL ticket 1" };
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({ projects: [project(p.slug, p.key, p.lead)], agents: [registered(p.lead)], boards: { [p.slug]: board([card(t.id, t.key, "in_progress", { position: 1 })]) }, team: team(T0, [lane(p.lead, "working")]) }),
  });
  let seq = projection.facts.cursor;
  let peak = 0;
  for (let i = 0; i < 400; i++) {
    const e = envelope("ticket.updated", { automation: { id: `auto_${i}`, name: "auto" }, changed: ["status"] }, { ts: new Date(T0 + i * 1000).toISOString(), project: { slug: p.slug, key: p.key }, ticket: t, actor: { id: p.lead, kind: "agent" } });
    projection.apply({ type: "event", envelope: { ...e, seq: ++seq } });
    const n = projection.facts.automationChanges.length;
    assert.ok(n <= HISTORY_CAP, `automationChanges ${n} > ${HISTORY_CAP}`);
    peak = Math.max(peak, n);
  }
  assert.equal(peak, HISTORY_CAP, "the automation changes reached the cap");
  const kept = projection.facts.automationChanges.map((c) => c.automationId);
  assert.deepEqual([kept[0], kept.at(-1)], ["auto_100", "auto_399"], "the oldest hundred dropped, the newest kept");
});
