/* A person carries a package into Done (personWalks.ts): in by the front door, to the package, to the Done rack, out;
   one person per building; nobody under reduced motion or in the town view; an abandoned visit leaves empty-handed. */
import assert from "node:assert/strict";
import test from "node:test";
import type { Location } from "@crewhub/world-engine";
import type { PersonVisit, WorldModel } from "@crewhub/world-model";
import { PersonWalks } from "../src/world/personWalks.ts";
import { Walks } from "../src/world/walks.ts";
import { agent, building, object, world } from "./fixtures.ts";

const T = 5_000_000;
const visit = (key: string, extra: Partial<PersonVisit> = {}): PersonVisit => ({
  id: `${key}:${T}`,
  personId: "nicky",
  displayName: "Nicky",
  ticketId: key,
  ticketKey: `CR-${key}`,
  movedAt: T,
  startedAt: T,
  until: T + 12_000,
  from: { room: "review", deskOf: null },
  rejected: false,
  phase: "carrying",
  ...extra,
});
const onRack = object("t1", "review", { transit: { fromRoom: "review", toRoom: "dispatch", toDeskOf: null, startedAt: T, until: T + 12_000, carrier: "person" } });
const model = (visits: PersonVisit[], extra: Partial<WorldModel> = {}) =>
  world([{ ...building("cr", [agent("cr/dev-1", "workers")], [onRack]), visits }, building("ops")], extra);

function setUp(plan: "three-rooms" | "classic", entered: string | null = "cr", reducedMotion = false) {
  const walks = new Walks();
  const persons = new PersonWalks(walks.nav);
  const options = { entered, reducedMotion, ambient: "off" as const, buildingPlan: plan };
  const update = (m: WorldModel) => {
    walks.update(m, options);
    persons.update(m, { entered, reducedMotion });
  };
  const run = (seconds: number, until?: () => boolean) => {
    for (let i = 0; i < seconds * 30; i++) {
      walks.tick(1 / 30, T + i * 33);
      persons.tick(1 / 30);
      if (until?.()) return i / 30;
    }
    return seconds;
  };
  const at = (where: Location | null) => {
    const p = persons.person("cr");
    const actor = p && walks.nav.sim.actor(p.id);
    return !!where && !!actor && actor.location.room === where.room && actor.location.cell.x === where.cell.x && actor.location.cell.z === where.cell.z && actor.next === null;
  };
  return { walks, persons, update, run, at };
}

for (const plan of ["three-rooms", "classic"] as const) {
  test(`${plan}: the person comes in by the front door, carries the package from the Review rack to the Done rack and leaves`, () => {
    const { walks, persons, update, run, at } = setUp(plan);
    update(model([visit("t1")]));
    const person = persons.person("cr");
    assert.ok(person, "a person walks the visit");
    assert.equal(person.phase, "to-package");
    assert.equal(person.holding, false);
    const front = walks.nav.front("cr")!;
    const start = walks.nav.sim.actor(person.id)!.location;
    assert.deepEqual(start, front, "starts on the street before the door");
    const review = walks.nav.spots("cr", "review", "review")[0]!;
    const reached = run(40, () => at(review));
    assert.ok(reached < 40, "reaches the package's rack");
    run(2, () => persons.person("cr")?.holding === true);
    assert.equal(persons.person("cr")?.holding, true, "picks the package up after a short stop");
    assert.equal(persons.person("cr")?.phase, "to-rack");
    const done = walks.nav.spots("cr", "dispatch", "dispatch")[0]!;
    assert.ok(run(40, () => at(done)) < 40, "reaches the Done rack");
    run(2, () => persons.person("cr")?.delivered === true);
    const p2 = persons.person("cr")!;
    assert.deepEqual([p2.holding, p2.delivered, p2.phase], [false, true, "leaving"]);
    assert.ok(run(60, () => persons.person("cr") === undefined) < 60, "leaves the building and is gone");
    assert.equal(walks.nav.sim.actor(person.id), undefined);
    assert.equal(persons.moving, false);
  });
}

test("a package on a desk is fetched beside that desk", () => {
  const { walks, persons, update, run, at } = setUp("three-rooms");
  const onDesk = object("t1", "workers", { deskOf: "cr/dev-1", transit: { fromRoom: "workers", toRoom: "dispatch", toDeskOf: null, startedAt: T, until: T + 12_000, carrier: "person" } });
  const m = world([{ ...building("cr", [agent("cr/dev-1", "workers")], [onDesk]), visits: [visit("t1", { from: { room: "workers", deskOf: "cr/dev-1" } })] }]);
  update(m);
  const beside = walks.nav.beside("cr", "cr/dev-1", "workers")[0]!;
  assert.ok(run(60, () => at(beside)) < 60, "stands beside the desk");
  run(2, () => persons.person("cr")?.holding === true);
  assert.equal(persons.person("cr")?.holding, true);
});

test("one person per building: the next visit starts when the one before has left; a visit walks once", () => {
  const { persons, update, run } = setUp("three-rooms");
  const second = visit("t2", { phase: "queued", startedAt: T + 12_000, until: T + 24_000 });
  update(model([visit("t1"), second]));
  assert.equal(persons.person("cr")?.id, `t1:${T}`);
  run(1);
  update(model([visit("t1"), second]));
  assert.equal(persons.person("cr")?.id, `t1:${T}`, "a model update does not start a second person");
  assert.ok(run(120, () => persons.person("cr")?.id === second.id) < 120, "the second person comes in after the first has left");
  assert.ok(run(120, () => persons.person("cr") === undefined) < 120);
  update(model([visit("t1"), second]));
  run(1);
  assert.equal(persons.person("cr"), undefined, "visits already walked are not walked again");
});

test("nobody walks in the town view or under reduced motion; a new snapshot clears the building", () => {
  const town = setUp("three-rooms", null);
  town.update(model([visit("t1")]));
  assert.equal(town.persons.person("cr"), undefined);
  const reduced = setUp("three-rooms", "cr", true);
  reduced.update(model([visit("t1")]));
  assert.equal(reduced.persons.person("cr"), undefined);
  const { persons, update, run } = setUp("three-rooms");
  update(model([visit("t1")]));
  run(2);
  assert.ok(persons.person("cr"));
  update(model([], { snapshots: 2 }));
  assert.equal(persons.person("cr"), undefined);
  update(model([visit("t1")], { snapshots: 2 }));
  assert.ok(persons.person("cr"), "after a snapshot the same visit may walk again");
});

test("a visit the model drops before the pickup sends the person out empty-handed; once holding they finish", () => {
  const { persons, update, run } = setUp("three-rooms");
  update(model([visit("t1")]));
  run(1);
  update(model([]));
  const p = persons.person("cr")!;
  assert.deepEqual([p.phase, p.holding], ["leaving", false]);
  assert.ok(run(60, () => persons.person("cr") === undefined) < 60);
  update(model([visit("t2", { id: `t2:${T}` })]));
  run(60, () => persons.person("cr")?.holding === true);
  assert.equal(persons.person("cr")?.holding, true);
  update(model([]));
  assert.equal(persons.person("cr")?.phase, "to-rack", "the carry goes on once the package is in hand");
});
