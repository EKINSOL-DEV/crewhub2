/* A person carries work into Done (spec addendum "a person in the world"): the visit as a fact in the model, the
   queue, the landing, reduced motion, the text view and `where`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope } from "@crewhub/loops-client";
import { describeWorld } from "../src/describe.ts";
import { PERSON_CARRY_MS, PERSON_LANDED_MS, PERSON_QUEUE_MAX } from "../src/flights.ts";
import { emptyMemory } from "../src/memory.ts";
import type { PresentationMemory } from "../src/memory.ts";
import type { ReduceOptions } from "../src/reducer.ts";
import type { WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { where } from "../src/where.ts";
import { FakeSource, ManualScheduler, T0, agentRef, board, card, envelope, lane, project, registered, snapshot, team } from "./helpers.ts";

const CL = project("crewhub-loops", "CL", "cl-lead");
const input = () => ({
  projects: [CL],
  agents: [registered("cl-lead")],
  principals: [{ id: "nicky", kind: "user" as const, displayName: "Nicky" }],
  boards: {
    "crewhub-loops": board([
      card("t1", "CL-1", "review", { position: 1 }),
      card("t2", "CL-2", "review", { position: 2 }),
      card("t3", "CL-3", "review", { position: 3 }),
      card("t4", "CL-4", "review", { position: 4 }),
      card("t5", "CL-5", "review", { position: 5 }),
      card("t6", "CL-6", "planned", { position: 1 }),
      card("t7", "CL-7", "in_progress", { position: 1, assignee: agentRef("cl-lead") }),
    ]),
  },
  team: team(T0, [lane("cl-lead", "working")]),
});

function world(options: Partial<ReduceOptions> = {}) {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot(input()) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now: number): WorldModel => {
    const result = reduceWorld(projection.facts, memory, { now, mode: "demo", roleOverrides: {}, ...options });
    memory = result.memory;
    return result.model;
  };
  const event = (e: Envelope) => projection.apply({ type: "event", envelope: e });
  const load = () => projection.apply({ type: "snapshot", snapshot: snapshot(input()) });
  return { reduce, event, load };
}
const at = (ms: number) => new Date(T0 + ms).toISOString();
const byPerson = (id: string, key: string, from: string, ms: number, payload: Record<string, unknown> = {}) =>
  envelope("ticket.moved", { from, to: "done", position: 1, ...payload }, { ticket: { id, key, title: key }, actor: { id: "nicky", kind: "user" }, ts: at(ms) });
const byAgent = (id: string, key: string, from: string, to: string, ms: number) =>
  envelope("ticket.moved", { from, to, position: 1 }, { ticket: { id, key, title: key }, actor: { id: "cl-lead", kind: "agent" }, ts: at(ms) });
const building = (model: WorldModel) => model.buildings[0]!;
const object = (model: WorldModel, key: string) => building(model).objects.find((o) => o.key === key);
const text = (model: WorldModel, rooms: "classic" | "three-rooms" = "three-rooms") => describeWorld(model, undefined, { rooms }).map((l) => l.text);

test("a person's move to Done is a visit: the package waits on its rack, is carried, lands, and the visit is told", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000));
  const during = reduce(T0 + 1_500);
  const carried = object(during, "CL-1")!;
  assert.equal(carried.room, "review", "the package stays on the Review rack while it is carried");
  assert.equal(carried.transit?.carrier, "person");
  assert.equal(carried.transit?.toRoom, "dispatch");
  assert.equal(carried.celebrateUntil, null, "nothing celebrates until the person puts it down");
  const [visit] = building(during).visits;
  assert.deepEqual(
    { ...visit },
    {
      id: `t1:${T0 + 1_000}`,
      personId: "nicky",
      displayName: "Nicky",
      ticketId: "t1",
      ticketKey: "CL-1",
      movedAt: T0 + 1_000,
      startedAt: T0 + 1_000,
      until: T0 + 1_000 + PERSON_CARRY_MS,
      from: { room: "review", deskOf: null },
      rejected: false,
      phase: "carrying",
    },
  );
  const lines = text(during);
  assert.ok(lines.includes("Nicky, a person, is carrying CL-1 to Done."), lines.join("\n"));
  assert.ok(lines.includes("CL-1 is in transit from the Review rack to the Done rack: Nicky carries it."));
  assert.ok(text(during, "classic").includes("Nicky, a person, is carrying CL-1 to Dispatch."));
  assert.ok(!text(during, "classic").includes("CL-1 was just moved to done by a person."));

  const landedAt = T0 + 1_000 + PERSON_CARRY_MS;
  const after = reduce(landedAt);
  const landed = object(after, "CL-1")!;
  assert.equal(landed.room, "dispatch");
  assert.equal(landed.transit, null);
  assert.equal(landed.celebrateUntil, landedAt + PERSON_LANDED_MS, "the celebration follows the landing");
  assert.equal(building(after).visits[0]?.phase, "landed");
  assert.ok(text(after).includes("Nicky, a person, moved CL-1 to Done."));
  assert.ok(text(after).includes("CL-1 was just moved to done by a person."));

  const gone = reduce(landedAt + PERSON_LANDED_MS);
  assert.deepEqual(building(gone).visits, []);
  assert.equal(object(gone, "CL-1")?.celebrateUntil, null);
});

test("a rejection is carried the same way, gets the turned-down mark on landing and no celebration", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000, { resolution: "rejected", resolutionReason: "Not this quarter" }));
  const during = reduce(T0 + 2_000);
  assert.equal(object(during, "CL-1")?.transit?.carrier, "person");
  assert.equal(building(during).visits[0]?.rejected, true);
  assert.equal(object(during, "CL-1")?.turnedDownUntil, null);
  const landedAt = T0 + 1_000 + PERSON_CARRY_MS;
  const after = reduce(landedAt + 10);
  assert.equal(object(after, "CL-1")?.turnedDownUntil, landedAt + PERSON_LANDED_MS);
  assert.equal(object(after, "CL-1")?.celebrateUntil, null);
  assert.deepEqual(object(after, "CL-1")?.rejected, { reason: "Not this quarter" });
  assert.ok(text(after).includes("Nicky, a person, moved CL-1 to Done as won't do."));
});

test("one person per building: later moves queue behind the carry, and past three queued the rest land at once", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000));
  reduce(T0 + 1_100);
  for (const [i, id] of (["t2", "t3", "t4", "t5"] as const).entries()) event(byPerson(id, `CL-${i + 2}`, "review", 2_000 + i));
  const model = reduce(T0 + 2_500);
  const visits = building(model).visits;
  assert.deepEqual(
    visits.map((v) => [v.ticketKey, v.phase]),
    [
      ["CL-1", "carrying"],
      ["CL-5", "landed"],
      ["CL-2", "queued"],
      ["CL-3", "queued"],
      ["CL-4", "queued"],
    ],
  );
  const first = visits.find((v) => v.ticketKey === "CL-1")!;
  const second = visits.find((v) => v.ticketKey === "CL-2")!;
  const fourth = visits.find((v) => v.ticketKey === "CL-4")!;
  assert.equal(second.startedAt, first.until, "the next carry begins when the one before ends");
  assert.equal(fourth.startedAt, first.until + 2 * PERSON_CARRY_MS);
  assert.equal(visits.filter((v) => v.phase === "queued").length, PERSON_QUEUE_MAX);
  assert.equal(object(model, "CL-5")?.room, "dispatch", "the fifth lands at once");
  assert.equal(object(model, "CL-5")?.transit, null);
  assert.equal(object(model, "CL-2")?.room, "review", "a queued package waits on its rack");
  assert.equal(object(model, "CL-2")?.transit?.carrier, "person");
  assert.ok(text(model).includes("Nicky, a person, is on the way in to carry CL-2 to Done."));
  // In time the queue drains one carry at a time.
  const later = reduce(first.until + PERSON_CARRY_MS / 2);
  assert.equal(building(later).visits.find((v) => v.ticketKey === "CL-2")?.phase, "carrying");
  assert.equal(object(later, "CL-1")?.room, "dispatch");
});

test("under reduced motion the package lands at once and the text says the person moved it", () => {
  const { reduce, event } = world({ reducedMotion: true });
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000));
  const model = reduce(T0 + 1_100);
  assert.equal(object(model, "CL-1")?.room, "dispatch");
  assert.equal(object(model, "CL-1")?.transit, null);
  assert.equal(object(model, "CL-1")?.celebrateUntil, T0 + 1_000 + PERSON_LANDED_MS);
  assert.equal(building(model).visits[0]?.phase, "landed");
  assert.ok(text(model).includes("Nicky, a person, moved CL-1 to Done."));
  assert.deepEqual(building(reduce(T0 + 1_000 + PERSON_LANDED_MS)).visits, []);
});

test("a package from a desk remembers the desk; an agent's move stays a drone flight", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(byPerson("t7", "CL-7", "in_progress", 1_000));
  event(byAgent("t6", "CL-6", "planned", "review", 1_000));
  const model = reduce(T0 + 1_200);
  assert.deepEqual(building(model).visits[0]?.from, { room: "lead-office", deskOf: "cl-lead" });
  assert.equal(object(model, "CL-7")?.deskOf, "cl-lead", "still on the desk until the person picks it up");
  assert.equal(object(model, "CL-6")?.transit?.carrier, undefined);
  assert.ok(text(model).includes("CL-6 is in transit from the Planning rack to the Review rack: the ticket drone carries it."));
});

test("a move while the person carries ends the visit; the drone takes it from where it stood", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000));
  reduce(T0 + 2_000);
  event(byAgent("t1", "CL-1", "done", "in_progress", 3_000));
  const model = reduce(T0 + 3_100);
  assert.deepEqual(building(model).visits, []);
  const object1 = object(model, "CL-1")!;
  assert.equal(object1.transit?.carrier, undefined);
  assert.equal(object1.transit?.fromRoom, "review");
  assert.equal(object1.transit?.toRoom, "lead-office");
});

test("a snapshot grounds every person", () => {
  const { reduce, event, load } = world();
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000));
  assert.equal(building(reduce(T0 + 1_200)).visits.length, 1);
  load();
  assert.deepEqual(building(reduce(T0 + 1_300)).visits, []);
});

test("where answers for a person by name, in both wordings", () => {
  const { reduce, event } = world();
  reduce(T0);
  event(byPerson("t1", "CL-1", "review", 1_000));
  const during = reduce(T0 + 1_500);
  assert.equal(where(during, "Nicky", undefined, "three-rooms"), "Nicky is a person in CL project, carrying CL-1 to the Done rack.");
  assert.equal(where(during, "nicky"), "Nicky is a person in CL project, carrying CL-1 to Dispatch.");
  const after = reduce(T0 + 1_000 + PERSON_CARRY_MS);
  assert.equal(where(after, "Nicky", undefined, "three-rooms"), "Nicky is a person in CL project; they just moved CL-1 to the Done rack.");
  assert.equal(where(reduce(T0 + 60_000), "Nicky"), 'No agent called "Nicky" is in CrewHub World.');
});
