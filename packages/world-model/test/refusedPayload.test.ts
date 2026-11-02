/**
 * An allowlisted event whose payload the validators refuse (round 50, r48-model M3). The cursor moves on and the count
 * grows, as before; now a warning says so, once per type, and the ticket the envelope names is read again, so the
 * fact the event carried comes back through the read path's own validator.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Projection } from "../src/projection.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, iso, project, snapshot, ticketFrom } from "./helpers.ts";

const CR = project("creator", "CR", "cr-lead");
const NICKY = { id: "nicky", kind: "user" as const };

test("round 50 (M3): a ticket event with a payload this build cannot read warns once per type and reads the ticket again", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const source = new FakeSource();
  const scheduler = new ManualScheduler();
  const projection = new Projection(source, { scheduler });
  const cards = [card("t_1", "CR-1", "in_progress"), card("t_2", "CR-2", "review")];
  projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [CR], boards: { creator: board(cards) } }) });
  let seq = 100;
  const refused = (id: string, key: string) => {
    seq += 1;
    // The old `labelsCleared: true` shape: the envelope is fine, `ticket.moved`'s payload is not.
    return projection.apply({
      type: "event",
      envelope: envelope("ticket.moved", { from: "in_progress", to: "review", position: 1, labelsCleared: true }, { seq, ts: iso(T0), project: { slug: "creator", key: "CR" }, ticket: { id, key, title: `Ticket ${key}` }, actor: NICKY }),
    });
  };
  // Loops moved CR-1 to review; the event saying so cannot be read, the ticket can.
  source.tickets.set("t_1", ticketFrom(card("t_1", "CR-1", "review"), "creator", "CR"));
  assert.equal(refused("t_1", "CR-1"), true);
  assert.equal(projection.facts.cursor, 101);
  assert.equal(projection.facts.invalidEvents, 1);
  await scheduler.advance(250);
  assert.deepEqual(source.calls, ["ticket:t_1"]);
  assert.equal(projection.facts.cards.t_1?.card.status, "review", "the read put the move in");
  // One warning for the type, naming it and what failed.
  assert.equal(warn.mock.callCount(), 1);
  const message = String(warn.mock.calls[0]!.arguments[0]);
  assert.match(message, /ticket\.moved/);
  assert.match(message, /labelsCleared/);
  // The same type again: read again, not warned again.
  assert.equal(refused("t_2", "CR-2"), true);
  await scheduler.advance(250);
  assert.deepEqual(source.calls, ["ticket:t_1", "ticket:t_2"]);
  assert.equal(projection.facts.invalidEvents, 2);
  assert.equal(warn.mock.callCount(), 1);
});

test("round 50 (M3): a refused payload on an event that names no ticket warns and reads nothing", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const source = new FakeSource();
  const scheduler = new ManualScheduler();
  const projection = new Projection(source, { scheduler });
  projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [CR] }) });
  // `project.created` without its slug: allowlisted, refused, and about no ticket.
  projection.apply({ type: "event", envelope: envelope("project.created", { key: "CR" }, { seq: 101, ts: iso(T0), project: { slug: "creator", key: "CR" }, actor: NICKY }) });
  await scheduler.advance(250);
  assert.equal(projection.facts.invalidEvents, 1);
  assert.deepEqual(source.calls, []);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(String(warn.mock.calls[0]!.arguments[0]), /project\.created/);
});
