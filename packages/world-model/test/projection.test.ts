import assert from "node:assert/strict";
import { test } from "node:test";
import { Projection } from "../src/projection.ts";
import {
  FakeSource,
  ManualScheduler,
  board,
  card,
  envelope,
  project,
  snapshot,
  ticketFrom,
} from "./helpers.ts";

const ticketRef = { id: "tk_85", key: "CL-85", title: "Docs" };

function setup() {
  const source = new FakeSource();
  const scheduler = new ManualScheduler();
  const projection = new Projection(source, { scheduler });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({
      cursor: 100,
      projects: [project("crewhub-loops", "CL", "cl-lead")],
      boards: { "crewhub-loops": board([card("tk_85", "CL-85", "planned")]) },
    }),
  });
  return { source, scheduler, projection };
}

const moved = (seq: number, to: string, position = 1) =>
  envelope("ticket.moved", { from: "planned", to, position }, { seq, ticket: ticketRef });

test("duplicate and out-of-order envelopes are dropped", () => {
  const { projection } = setup();
  assert.equal(projection.apply({ type: "event", envelope: moved(101, "in_progress") }), true);
  assert.equal(projection.apply({ type: "event", envelope: moved(101, "review") }), false);
  assert.equal(projection.apply({ type: "event", envelope: moved(100, "review") }), false);
  assert.equal(projection.facts.cards.tk_85?.card.status, "in_progress");
  assert.equal(projection.facts.cursor, 101);
});

test("applying the same event twice gives the same facts", () => {
  const { projection } = setup();
  projection.apply({ type: "event", envelope: moved(101, "in_progress", 2) });
  const once = structuredClone(projection.facts);
  projection.apply({ type: "event", envelope: moved(101, "in_progress", 2) });
  assert.deepEqual(projection.facts, once);
  assert.deepEqual(projection.facts.projects["crewhub-loops"]?.counts, {
    backlog: 0,
    planned: 0,
    in_progress: 1,
    review: 0,
    done: 0,
  });
});

test("a ticket.updated burst makes exactly one getTicket after 250 ms and updates the card", async () => {
  const { projection, scheduler, source } = setup();
  const refreshed = ticketFrom(card("tk_85", "CL-85", "planned", { priority: "urgent", title: "Docs v2" }), "crewhub-loops", "CL");
  source.tickets.set("tk_85", refreshed);
  let changes = 0;
  projection.onChange(() => (changes += 1));
  for (let seq = 101; seq <= 105; seq += 1) {
    projection.apply({ type: "event", envelope: envelope("ticket.updated", { changed: ["priority"] }, { seq, ticket: ticketRef }) });
  }
  await scheduler.advance(249);
  assert.deepEqual(source.calls, []);
  await scheduler.advance(1);
  assert.deepEqual(source.calls, ["ticket:tk_85"]);
  assert.equal(projection.facts.cards.tk_85?.card.priority, "urgent");
  assert.equal(projection.facts.cards.tk_85?.card.title, "Docs v2");
  assert.equal(changes, 6);
});

test("a refetched ticket that is gone or archived is removed", async () => {
  const { projection, scheduler, source } = setup();
  source.tickets.set("tk_85", ticketFrom(card("tk_85", "CL-85", "done"), "crewhub-loops", "CL", { archivedAt: "x" }));
  projection.apply({ type: "event", envelope: envelope("ticket.updated", { changed: ["title"] }, { seq: 101, ticket: ticketRef }) });
  await scheduler.advance(250);
  assert.equal(projection.facts.cards.tk_85, undefined);
  assert.equal(projection.facts.projects["crewhub-loops"]?.counts.planned, 0);
});

test("a snapshot message resets everything and cancels queued refetches", async () => {
  const { projection, scheduler, source } = setup();
  projection.apply({ type: "event", envelope: moved(150, "review") });
  projection.apply({ type: "event", envelope: envelope("ticket.updated", { changed: ["title"] }, { seq: 151, ticket: ticketRef }) });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({ cursor: 40, projects: [project("crewhub-loops", "CL", "cl-lead")], boards: {} }),
  });
  await scheduler.advance(1000);
  assert.deepEqual(source.calls, []);
  assert.equal(projection.facts.cursor, 40);
  assert.deepEqual(projection.facts.cards, {});
  assert.deepEqual(projection.facts.lastMoves, {});
  // After a seek back, earlier seqs apply again.
  assert.equal(projection.apply({ type: "event", envelope: moved(41, "review") }), true);
});

test("an unknown type advances the cursor and is skipped", () => {
  const { projection } = setup();
  assert.equal(projection.apply({ type: "event", envelope: envelope("label.created", { labelId: "lb" }, { seq: 120 }) }), true);
  assert.equal(projection.facts.cursor, 120);
  assert.equal(projection.facts.skippedEvents, 1);
  assert.equal(projection.facts.invalidEvents, 0);
});

test("an invalid envelope is counted and skipped", () => {
  const { projection } = setup();
  const broken = { ...moved(121, "review"), v: 2 } as unknown as ReturnType<typeof moved>;
  projection.apply({ type: "event", envelope: broken });
  assert.equal(projection.facts.invalidEvents, 1);
  assert.equal(projection.facts.cards.tk_85?.card.status, "planned");
});

test("a heartbeat only moves the cursor forward", () => {
  const { projection } = setup();
  assert.equal(projection.apply({ type: "heartbeat", seq: 90, ts: "x" }), false);
  assert.equal(projection.apply({ type: "heartbeat", seq: 130, ts: "x" }), true);
  assert.equal(projection.facts.cursor, 130);
});

test("delivery.updated keeps the recipient and reason from delivery.created", () => {
  const { projection } = setup();
  projection.apply({
    type: "event",
    envelope: envelope("delivery.created", { deliveryId: "dl_1", recipientId: "cl-lead", reason: "assigned" }, { seq: 101 }),
  });
  projection.apply({ type: "event", envelope: envelope("delivery.updated", { deliveryId: "dl_1", state: "claimed" }, { seq: 102 }) });
  projection.apply({ type: "event", envelope: envelope("delivery.updated", { deliveryId: "dl_1", state: "uncertain" }, { seq: 103 }) });
  const delivery = projection.facts.deliveries.dl_1;
  assert.equal(delivery?.recipientId, "cl-lead");
  assert.equal(delivery?.reason, "assigned");
  assert.equal(delivery?.state, "uncertain");
});

test("ticket.archived removes the card and counts it for the lobby", () => {
  const { projection } = setup();
  projection.apply({
    type: "event",
    envelope: envelope("ticket.archived", { batchId: null, batchSize: null, releaseId: null, reason: "single" }, { seq: 101, ticket: ticketRef }),
  });
  assert.equal(projection.facts.cards.tk_85, undefined);
  assert.equal(projection.facts.archivedTickets["crewhub-loops"], 1);
});

test("stalled then resumed opens and clears the stall on the card", () => {
  const { projection } = setup();
  projection.apply({
    type: "event",
    envelope: envelope(
      "ticket.stalled",
      {
        ticket: "CL-85",
        agent: "cl-lead",
        episode: 1,
        reason: "attention",
        quietSince: "2026-10-01T19:48:00Z",
        quietMinutes: 12,
        members: [{ name: "cl-lead", status: "idle" }, { name: "cl-dev-3", status: "blocked" }],
        nudge: null,
      },
      { seq: 101, actor: { id: "system", kind: "system" } },
    ),
  });
  assert.equal(projection.facts.stalls["CL-85"]?.blockedMember, "cl-dev-3");
  assert.equal(projection.facts.cards.tk_85?.card.stall?.state, "attention");
  projection.apply({
    type: "event",
    envelope: envelope("ticket.resumed", { ticket: "CL-85", agent: "cl-lead", episode: 1, resolution: "attending", minutes: 3 }, { seq: 102 }),
  });
  assert.equal(projection.facts.stalls["CL-85"], undefined);
  assert.equal(projection.facts.cards.tk_85?.card.stall, null);
});

test("project archive, restore and reorder follow the payloads", async () => {
  const { projection, scheduler, source } = setup();
  projection.apply({
    type: "event",
    envelope: envelope("project.archived", { changed: ["archivedAt"], old: {}, new: { archivedAt: "2026-10-01T20:00:00Z" } }, { seq: 101 }),
  });
  assert.deepEqual(projection.facts.order, []);
  assert.deepEqual(projection.facts.archivedOrder, ["crewhub-loops"]);
  source.boards.set("crewhub-loops", board([card("tk_85", "CL-85", "review")]));
  projection.apply({
    type: "event",
    envelope: envelope("project.restored", { changed: ["archivedAt"], old: {}, new: { archivedAt: null } }, { seq: 102 }),
  });
  await scheduler.advance(250);
  assert.deepEqual(projection.facts.order, ["crewhub-loops"]);
  assert.equal(projection.facts.projects["crewhub-loops"]?.archivedAt, null);
  assert.equal(projection.facts.cards.tk_85?.card.status, "review");
});
