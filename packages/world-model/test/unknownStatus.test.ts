/**
 * A ticket status newer than this build (round 48, r48-model M7). The validators let it through with a warning, as
 * they do a new kind; the world draws such a ticket in the storage room and counts it with the backlog, and says the
 * status as loops sent it: never `undefined` and never `NaN`, in the model, the counts, the text view or the card.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TICKET_STATUSES, type TicketStatus } from "@crewhub/loops-client";
import { ticketFacts } from "../src/agentCard.ts";
import { describeWorld } from "../src/describe.ts";
import { emptyMemory, type PresentationMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, agentRef, board, card, envelope, iso, project, registered, snapshot } from "./helpers.ts";

/** A status loops may send one day; the cast is the point: the types know five. */
const NEW = (word: string) => word as unknown as TicketStatus;
const CL = project("crewhub-loops", "CL", "cl-lead");
const ROOMS = ["lobby", "lead-office", "workers", "analyst", "design", "storage", "planning", "review", "dispatch", "meeting"];

function world() {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  const cards = [
    card("tk_1", "CL-1", NEW("triage")),
    card("tk_2", "CL-2", "planned"),
    card("tk_3", "CL-3", NEW("blocked"), { assignee: agentRef("cl-lead") }),
    card("tk_4", "CL-4", "in_progress", { assignee: agentRef("cl-lead") }),
  ];
  // Loops sends a column per status it has, the new ones too (the column's status is as lenient as the card's).
  const columns = [...board(cards).columns, ...["triage", "blocked"].map((status) => ({ status: NEW(status), tickets: cards.filter((c) => c.status === status) }))];
  projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [CL], agents: [registered("cl-lead")], boards: { "crewhub-loops": { columns } } }) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now: number) => {
    const result = reduceWorld(projection.facts, memory, { now, mode: "live", roleOverrides: {} });
    memory = result.memory;
    return result.model;
  };
  return { projection, reduce };
}

const lines = (model: ReturnType<ReturnType<typeof world>["reduce"]>) => [
  ...describeWorld(model).map((l) => l.text),
  ...describeWorld(model, undefined, { rooms: "three-rooms" }).map((l) => l.text),
];

test("round 48: a ticket status newer than this build stands in the storage room, with the backlog, and is said as loops sent it", () => {
  const { reduce } = world();
  const model = reduce(T0);
  const building = model.buildings[0]!;
  const triage = building.objects.find((o) => o.key === "CL-1")!;
  assert.equal(triage.room, "storage");
  assert.equal(triage.status, "backlog");
  assert.equal(triage.newStatus, "triage");
  assert.equal(building.objects.find((o) => o.key === "CL-2")!.newStatus, null, "a known status has no new word");
  for (const o of building.objects) {
    assert.ok(ROOMS.includes(o.room), `${o.key} stands in ${o.room}`);
    assert.ok((TICKET_STATUSES as readonly string[]).includes(o.status), `${o.key} is ${o.status}`);
  }
  const text = lines(model);
  assert.ok(text.some((l) => l.startsWith('CL-1 "Ticket CL-1": task as a folder, status "triage" (new to this world, kept with the backlog)')), text.filter((l) => l.startsWith("CL-1")).join("\n"));
  for (const l of text) assert.doesNotMatch(l, /undefined|NaN/);
});

test("round 48: a move into and out of a new status flies between known rooms, and the counts take it as backlog", () => {
  const { projection, reduce } = world();
  reduce(T0);
  const ticket = { id: "tk_2", key: "CL-2", title: "Ticket CL-2" };
  projection.apply({ type: "event", envelope: envelope("ticket.moved", { from: "planned", to: "triage", position: 2 }, { seq: 101, ts: iso(T0), ticket, project: { slug: "crewhub-loops", key: "CL" } }) });
  projection.apply({ type: "event", envelope: envelope("ticket.moved", { from: "blocked", to: "review", position: 1 }, { seq: 102, ts: iso(T0), ticket: { id: "tk_3", key: "CL-3", title: "Ticket CL-3" }, project: { slug: "crewhub-loops", key: "CL" } }) });
  const counts = projection.facts.projects["crewhub-loops"]!.counts;
  assert.deepEqual(Object.keys(counts).sort(), [...TICKET_STATUSES].sort());
  assert.deepEqual(counts, { backlog: 2, planned: 0, in_progress: 1, review: 1, done: 0 });
  const flying = reduce(T0 + 500).buildings[0]!;
  for (const o of flying.objects) {
    if (o.transit) assert.ok(ROOMS.includes(o.transit.fromRoom) || o.transit.fromRoom === "truck", `${o.key} flies from ${o.transit.fromRoom}`);
  }
  for (const l of lines(reduce(T0 + 500))) assert.doesNotMatch(l, /undefined|NaN/);
  const landed = reduce(T0 + 60_000).buildings[0]!;
  assert.equal(landed.objects.find((o) => o.key === "CL-2")!.room, "storage");
  for (const l of lines(reduce(T0 + 60_000))) assert.doesNotMatch(l, /undefined|NaN/);
});

test("round 48: a quiet stretch in a new status names the backlog's place, and the agent card lists the ticket with its word", () => {
  const { projection, reduce } = world();
  const system = { id: "system", kind: "system" as const };
  projection.apply({
    type: "event",
    envelope: envelope("ticket.quiet", { status: "triage", minutes: 90, since: iso(T0 - 90 * 60_000), ticket: "CL-1" }, { seq: 101, ts: iso(T0), ticket: { id: "tk_1", key: "CL-1", title: "Ticket CL-1" }, actor: system, project: { slug: "crewhub-loops", key: "CL" } }),
  });
  const model = reduce(T0);
  assert.equal(model.buildings[0]!.objects.find((o) => o.key === "CL-1")!.quiet?.status, "backlog");
  for (const l of lines(model)) assert.doesNotMatch(l, /undefined|NaN/);
  const held = ticketFacts(projection.facts, "cl-lead").held;
  assert.deepEqual(held.map((t) => [t.key, t.status, t.newStatus]), [["CL-4", "in_progress", null], ["CL-3", "backlog", "blocked"]]);
});
