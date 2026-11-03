/* Two facts the projection writes from events, pinned (round 54, r54-tests: a mutation run found no test that fails
   when either is broken): a milestone event sets its own state and no other (a completed milestone is done, a
   cancelled one cancelled), and a ticket's statusChangedAt moves with a move between columns, not with a reorder. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MilestoneSummary } from "@crewhub/loops-client";
import { Projection } from "../src/projection.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, iso, project, snapshot } from "./helpers.ts";

const CR = { slug: "crewhub", key: "CR" };
const milestone = (id: string, key: string, number: number): MilestoneSummary => ({
  id, key, number, title: key, state: "active", project: CR, position: number, createdAt: iso(T0), updatedAt: iso(T0), revision: 1,
});

function start() {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({
      projects: [project("crewhub", "CR", "cr-lead")],
      boards: { crewhub: board([card("t_1", "CR-1", "in_progress")]) },
      milestones: { crewhub: [milestone("ms_1", "CR-M1", 1), milestone("ms_2", "CR-M2", 2)] },
    }),
  });
  const event = (type: string, payload: Record<string, unknown>, extra: Parameters<typeof envelope>[2] = {}) =>
    projection.apply({ type: "event", envelope: envelope(type, payload, { project: CR, actor: { id: "nicky", kind: "user" }, ...extra }) });
  return { projection, event };
}

test("a milestone event sets its own state only: completed is done, cancelled is cancelled", () => {
  const { projection, event } = start();
  event("milestone.completed", { milestoneId: "ms_1", key: "CR-M1", title: "CR-M1" });
  event("milestone.cancelled", { milestoneId: "ms_2", key: "CR-M2", title: "CR-M2" });
  assert.deepEqual(projection.facts.milestones["crewhub"]?.map((m) => `${m.key} ${m.state}`), ["CR-M1 done", "CR-M2 cancelled"]);
});

test("a ticket's statusChangedAt moves with a move to another column, not with a reorder in its own", () => {
  const { projection, event } = start();
  const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
  const moved = (from: string, to: string, ts: string) => event("ticket.moved", { from, to, position: 1 }, { ticket: { id: "t_1", key: "CR-1", title: "CR-1" }, ts });
  moved("in_progress", "review", at(5));
  assert.equal(projection.facts.cards["t_1"]?.card.statusChangedAt, at(5), "a move to review");
  moved("review", "review", at(9));
  assert.equal(projection.facts.cards["t_1"]?.card.statusChangedAt, at(5), "a reorder within review keeps it");
});
