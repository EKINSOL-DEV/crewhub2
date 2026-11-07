import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope } from "@crewhub/loops-client";
import { describeWorld } from "../src/describe.ts";
import { flightMs } from "../src/flights.ts";
import { emptyMemory } from "../src/memory.ts";
import type { PresentationMemory } from "../src/memory.ts";
import type { WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, lane, project, registered, snapshot, team } from "./helpers.ts";

const CL = project("crewhub-loops", "CL", "cl-lead");
const input = () => ({
  projects: [CL],
  agents: [registered("cl-lead")],
  boards: {
    "crewhub-loops": board([
      card("t1", "CL-1", "planned", { position: 1 }),
      card("t2", "CL-2", "planned", { position: 2 }),
      card("t3", "CL-3", "done", { position: 1 }),
    ]),
  },
  team: team(T0, [lane("cl-lead", "working")]),
});

function world() {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot(input()) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now: number): WorldModel => {
    const result = reduceWorld(projection.facts, memory, { now, mode: "demo", roleOverrides: {} });
    memory = result.memory;
    return result.model;
  };
  const event = (e: Envelope) => projection.apply({ type: "event", envelope: e });
  const load = () => projection.apply({ type: "snapshot", snapshot: snapshot(input()) });
  return { reduce, event, load };
}
const at = (ms: number) => new Date(T0 + ms).toISOString();
const moved = (id: string, key: string, from: string, to: string, ms: number, position = 1) =>
  envelope("ticket.moved", { from, to, position }, { ticket: { id, key, title: key }, actor: { id: "nicky", kind: "user" }, ts: at(ms) });
const object = (model: WorldModel, key: string) => model.buildings[0]!.objects.find((o) => o.key === key);

test("a status change flies: the old room during the flight, the new room at the drop", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(moved("t1", "CL-1", "planned", "review", 1_000));
  const during = object(reduce(T0 + 1_500), "CL-1");
  assert.equal(during?.room, "planning");
  assert.deepEqual(during?.transit, { fromRoom: "planning", toRoom: "review", toDeskOf: null, startedAt: T0 + 1_000, until: T0 + 1_000 + flightMs("t1") });
  const text = describeWorld(reduce(T0 + 1_600)).map((l) => l.text);
  assert.ok(text.includes("CL-1 is in transit from the planning room to the review room: the ticket drone carries it."));
  const after = object(reduce(T0 + 1_000 + flightMs("t1")), "CL-1");
  assert.equal(after?.room, "review");
  assert.equal(after?.transit, null);
  assert.ok(flightMs("t1") >= 2_000 && flightMs("t1") <= 4_000);
});

test("a reorder inside a column is not a flight", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(moved("t2", "CL-2", "planned", "planned", 1_000, 1));
  assert.equal(object(reduce(T0 + 1_200), "CL-2")?.transit, null);
});

test("a second move in the air retargets the drone without dropping the package", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(moved("t1", "CL-1", "planned", "review", 1_000));
  const first = object(reduce(T0 + 1_500), "CL-1")!.transit!;
  event(moved("t1", "CL-1", "review", "in_progress", 1_800));
  const second = object(reduce(T0 + 1_900), "CL-1")!;
  assert.equal(second.room, "planning");
  assert.equal(second.transit?.fromRoom, "planning");
  assert.equal(second.transit?.toRoom, "lead-office");
  assert.equal(second.transit?.startedAt, first.startedAt);
  assert.ok(second.transit!.until > first.until);
  const landed = object(reduce(second.transit!.until), "CL-1")!;
  assert.equal(landed.room, "lead-office");
  assert.equal(landed.transit, null);
});

test("an archived ticket flies to the truck and then leaves the building", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(envelope("ticket.archived", { batchId: "b1", batchSize: 1, releaseId: null, reason: "single" }, { ticket: { id: "t3", key: "CL-3", title: "CL-3" }, ts: at(2_000) }));
  const flying = object(reduce(T0 + 2_500), "CL-3");
  assert.equal(flying?.room, "dispatch");
  assert.equal(flying?.transit?.toRoom, "truck");
  assert.equal(object(reduce(T0 + 2_000 + flightMs("t3")), "CL-3"), undefined);
});

test("a snapshot grounds every drone", () => {
  const { reduce, event, load } = world();
  reduce(T0);
  event(moved("t1", "CL-1", "planned", "review", 1_000));
  assert.ok(object(reduce(T0 + 1_200), "CL-1")?.transit);
  load();
  const after = object(reduce(T0 + 1_300), "CL-1");
  assert.equal(after?.transit, null);
  assert.equal(after?.room, "planning");
});
