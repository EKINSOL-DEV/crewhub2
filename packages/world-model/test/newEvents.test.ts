/**
 * The new loops events in the model (spec addendum "the new loops events in the town"): `ticket.quiet` is a fact on
 * the object (dust and a clock tag) until the ticket's next change or a snapshot; `automation.ran` pins a card on the
 * building's board by the front door, queued, and leaves a line in the text view; `owner-request.updated` is known
 * and skipped. The projection stays the only reader of facts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD_CARD_MS, boardOf, outcomeWords, pinnedCard, quietWords } from "../src/board.ts";
import { describeWorld } from "../src/describe.ts";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, iso, project, snapshot } from "./helpers.ts";

const ticketRef = { id: "tk_85", key: "CL-85", title: "Docs" };
const system = { id: "system", kind: "system" as const };
const automation = { id: "au_1", name: "Label stale bugs" };

function setup() {
  const source = new FakeSource();
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  const snap = () =>
    projection.apply({
      type: "snapshot",
      snapshot: snapshot({ cursor: 100, projects: [project("crewhub-loops", "CL", "cl-lead")], boards: { "crewhub-loops": board([card("tk_85", "CL-85", "review")]) } }),
    });
  snap();
  const building = (now: number) => reduceWorld(projection.facts, emptyMemory(), { now, mode: "demo", roleOverrides: {} }).model.buildings[0]!;
  const lines = (now: number) => describeWorld(reduceWorld(projection.facts, emptyMemory(), { now, mode: "demo", roleOverrides: {} }).model, undefined, { rooms: "three-rooms" }).map((l) => l.text);
  return { projection, snap, building, lines };
}

const quietAt = (seq: number, minutes = 120) =>
  envelope("ticket.quiet", { status: "review", minutes, since: iso(T0 - minutes * 60_000), ticket: "CL-85" }, { seq, ticket: ticketRef, actor: system });

test("ticket.quiet: dust and the words on the object, until the ticket's next change", () => {
  const { projection, building, lines } = setup();
  projection.apply({ type: "event", envelope: quietAt(101) });
  assert.deepEqual(projection.facts.quiet["CL-85"]?.minutes, 120);
  const object = building(T0).objects[0]!;
  assert.deepEqual(object.quiet, { status: "review", minutes: 120, since: iso(T0 - 120 * 60_000) });
  assert.ok(lines(T0).some((l) => /^CL-85 has been quiet in Review for 2 h \(since \d\d:\d\d\): dust on it, a clock tag "quiet 2 h"\.$/.test(l)), lines(T0).join("\n"));
  // The stall lamp keeps its own meaning: no stall from a quiet fact.
  assert.equal(object.stall, null);
  // An automation's answer to the quiet (a label, by `system`, as on 8291 six ms after the fact) is no activity: the dust stays.
  projection.apply({ type: "event", envelope: envelope("ticket.updated", { changed: ["labels"], automation }, { seq: 102, ticket: ticketRef, actor: system }) });
  assert.ok(projection.facts.quiet["CL-85"], "a system change leaves the stretch");
  assert.deepEqual(building(T0).objects[0]!.quiet?.minutes, 120);
  // A comment by an agent is activity: the dust goes.
  projection.apply({ type: "event", envelope: envelope("comment.created", { commentId: "c1", parentId: null }, { seq: 103, ticket: ticketRef }) });
  assert.equal(projection.facts.quiet["CL-85"], undefined);
  assert.equal(building(T0).objects[0]!.quiet, null);
});

test("ticket.quiet: a move makes the stretch stale at once, another ticket's event does not, a snapshot starts afresh", () => {
  const { projection, snap, building } = setup();
  projection.apply({ type: "event", envelope: quietAt(101) });
  projection.apply({ type: "event", envelope: envelope("ticket.progress", { ticket: "CL-9", agent: "cl-lead", kind: "update", text: "x" }, { seq: 102, ticket: { id: "tk_9", key: "CL-9", title: "Other" } }) });
  assert.ok(projection.facts.quiet["CL-85"], "another ticket's event leaves it");
  projection.apply({ type: "event", envelope: envelope("ticket.moved", { from: "review", to: "done", position: 1 }, { seq: 103, ticket: ticketRef }) });
  assert.equal(projection.facts.quiet["CL-85"], undefined, "a ticket.* event on it clears the fact");
  projection.apply({ type: "event", envelope: quietAt(104, 45) });
  assert.equal(building(T0).objects[0]!.quiet, null, "the card is in Done now, the fact said Review: stale, not drawn");
  snap();
  assert.deepEqual(projection.facts.quiet, {}, "a snapshot says otherwise: the facts start afresh");
  assert.equal(quietWords(45), "45 min");
  assert.equal(quietWords(90), "1 h 30 min");
});

test("automation.ran: a card on the board for a few seconds, queued behind the one before, with the change it made; the text view keeps the lines", () => {
  const { projection, building, lines } = setup();
  const at = T0 + 60_000;
  projection.apply({ type: "event", envelope: envelope("ticket.updated", { changed: ["labels"], automation }, { seq: 101, ticket: ticketRef, actor: system, ts: iso(at) }) });
  projection.apply({ type: "event", envelope: envelope("automation.ran", { runId: "run_1", automationId: "au_1", outcome: "ok", automation }, { seq: 102, ticket: ticketRef, actor: system, ts: iso(at) }) });
  projection.apply({ type: "event", envelope: envelope("automation.ran", { runId: "run_2", automationId: "au_2", outcome: "failed", automation: { id: "au_2", name: "Nudge the reviewer" } }, { seq: 103, ticket: ticketRef, actor: system, ts: iso(at + 1000) }) });
  assert.deepEqual(projection.facts.automationRuns.map((r) => [r.runId, r.changed]), [["run_1", ["labels"]], ["run_2", null]]);
  assert.deepEqual(projection.facts.automationChanges, [], "the change was matched to its run");
  const b = building(at + 1000);
  assert.deepEqual(b.board.map((c) => [c.runId, c.from, c.until]), [["run_1", at, at + BOARD_CARD_MS], ["run_2", at + BOARD_CARD_MS, at + 2 * BOARD_CARD_MS]]);
  assert.equal(pinnedCard(b.board, at + 1000)?.runId, "run_1");
  assert.equal(pinnedCard(b.board, at + BOARD_CARD_MS + 1)?.runId, "run_2");
  const first = lines(at + 1000);
  assert.ok(first.includes('A card on the board by the front door: Automation "Label stale bugs" ran on CL-85: done; labels changed by the automation.'), first.join("\n"));
  assert.ok(first.includes('Automation "Nudge the reviewer" ran on CL-85: failed.'), "the failure in words");
  // Long after: no card, the lines stay.
  const later = building(at + 60_000);
  assert.deepEqual(later.board, []);
  assert.equal(later.automationRuns.length, 2);
  assert.ok(lines(at + 60_000).includes('Automation "Label stale bugs" ran on CL-85: done; labels changed by the automation.'));
  assert.equal(boardOf([], at).length, 0);
  assert.deepEqual(["ok", "partial", "failed", "odd"].map(outcomeWords), ["done", "partly done", "failed", "odd"]);
});

test("owner-request.updated is known and skipped: no warning, nothing drawn, nothing said", () => {
  const { projection, lines } = setup();
  const warned: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warned.push(args.map(String).join(" "));
  try {
    projection.apply({ type: "event", envelope: envelope("owner-request.updated", { userId: "nicky", requestId: "or_1", state: "pending" }, { seq: 101, project: null, actor: { id: "nicky", kind: "user" } }) });
  } finally {
    console.warn = original;
  }
  assert.deepEqual(warned, []);
  assert.equal(projection.facts.skippedEvents, 1);
  assert.equal(projection.facts.cursor, 101);
  assert.ok(!lines(T0).some((l) => /owner|request/i.test(l)));
});
