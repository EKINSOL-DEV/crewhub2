import assert from "node:assert/strict";
import test from "node:test";
import type { WorldModel } from "@crewhub/world-model";
import { roomId, TOWN_ROOM } from "../src/world/navigation.ts";
import { Walks } from "../src/world/walks.ts";
import { agent, building, object, world } from "./fixtures.ts";

const T = 5_000_000;
const run = (walks: Walks, seconds: number, until?: () => boolean) => {
  for (let i = 0; i < seconds * 30; i++) {
    walks.tick(1 / 30, T + i * 33);
    if (until?.()) return i / 30;
  }
  return seconds;
};
const roomOf = (walks: Walks, key: string) => walks.nav.sim.actor(key)?.location.room;
const postman = agent("postman", "lobby", { role: "worker", registered: true, room: null, building: null });

const onDesk = object("t1", "workers", { key: "CR-1", deskOf: "cr/dev-1" });
const model = (o = onDesk, extra: Partial<WorldModel> = {}) =>
  world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-2", "workers")], [o]), building("ops")], { postOffice: [postman], ...extra });

test("the hand-over walk crosses the building's doors to the review pile and comes back to the desk", () => {
  const walks = new Walks();
  const options = { entered: "cr", reducedMotion: false, ambient: "off" as const, buildingPlan: "classic" as const };
  walks.update(model(), options);
  run(walks, 1);
  const seat = walks.nav.sim.actor("cr/dev-1")!.location;
  assert.equal(seat.room, roomId("cr", "workers"));
  walks.update(model({ ...onDesk, transit: { fromRoom: "workers", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } }), options);
  const reached = run(walks, 30, () => roomOf(walks, "cr/dev-1") === roomId("cr", "review"));
  assert.ok(reached < 30, "reaches the review room");
  assert.ok(walks.walker("cr/dev-1")!.walking || walks.moving);
  run(walks, 40, () => !walks.moving);
  assert.deepEqual(walks.nav.sim.actor("cr/dev-1")!.location, seat, "back at the desk");
  assert.equal(walks.walker("cr/dev-1")!.seated, true);
});

test("the postman walks a letter along the town path to the building's door and back, in the town view", () => {
  const walks = new Walks();
  const options = { entered: null, reducedMotion: false, ambient: "on" as const, buildingPlan: "classic" as const };
  walks.update(model(), options);
  run(walks, 1);
  const home = walks.nav.sim.actor("postman")!.location;
  const letter = { deliveryId: "d1", recipientId: "cr-lead", reason: "dm", state: "pending" as const, toBuilding: "cr", startedAt: T };
  walks.update(model(onDesk, { deliveries: [letter], cursor: 2 }), options);
  run(walks, 0.2);
  assert.equal(walks.postman()!.carrying, 1);
  const front = walks.nav.front("cr")!;
  run(walks, 60, () => {
    const at = walks.nav.sim.actor("postman")!.location;
    return at.cell.x === front.cell.x && at.cell.z === front.cell.z;
  });
  assert.equal(roomOf(walks, "postman"), TOWN_ROOM, "the town view keeps the postman on the street");
  run(walks, 90, () => !walks.moving);
  assert.deepEqual(walks.nav.sim.actor("postman")!.location, home);
  assert.equal(walks.postman()!.carrying, 0);
});

test("under reduced motion a new worker appears at its desk at once", () => {
  const walks = new Walks();
  walks.update(model(), { entered: "cr", reducedMotion: true, ambient: "on", buildingPlan: "classic" as const });
  run(walks, 0.5);
  const joined = world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-2", "workers"), agent("cr/dev-3", "workers")], [onDesk]), building("ops")], {
    postOffice: [postman],
  });
  walks.update(joined, { entered: "cr", reducedMotion: true, ambient: "on", buildingPlan: "classic" as const });
  run(walks, 1 / 30);
  assert.equal(roomOf(walks, "cr/dev-3"), roomId("cr", "workers"));
  assert.equal(walks.walker("cr/dev-3")!.walking, false);
});

/* Director intents (plan 7.3) walk through the same runtime. */
const idleModel = (extra: { meeting?: boolean; desk?: boolean } = {}) =>
  world(
    [
      building(
        "cr",
        [agent("cr/dev-1", "workers", { posture: "relaxed", laneStatus: "idle" }), agent("cr/dev-2", "workers", { posture: "relaxed", laneStatus: "idle" })],
        extra.desk ? [onDesk] : [],
        extra.meeting ? ["meeting"] : [],
      ),
      building("ops"),
    ],
    { postOffice: [postman] },
  );
const inside = { entered: "cr", reducedMotion: false, ambient: "off" as const, buildingPlan: "classic" as const };
const at = (walks: Walks, key: string, spot: { room: string; cell: { x: number; z: number } }) => {
  const l = walks.nav.sim.actor(key)!.location;
  return l.room === spot.room && l.cell.x === spot.cell.x && l.cell.z === spot.cell.z;
};

test("a director goToProp walks to the prop's approach cell, dwells for its capped time and walks back to the seat", () => {
  const walks = new Walks();
  walks.update(idleModel(), inside);
  run(walks, 1);
  const seat = walks.nav.sim.actor("cr/dev-1")!.location;
  const coffee = walks.nav.spots("cr", "coffee", "lobby");
  assert.equal(coffee.length, 1);
  assert.equal(walks.direct({ kind: "goToProp", agent: "cr/dev-1", room: "lobby", tag: "coffee", ttlMs: 90_000 }), 1);
  assert.ok(run(walks, 30, () => at(walks, "cr/dev-1", coffee[0]!)) < 30, "reaches the coffee machine");
  // The 90 s ttl is capped at 20 s of source time: still there after 15 s, home well before 90 s.
  run(walks, 15);
  assert.ok(at(walks, "cr/dev-1", coffee[0]!), "dwells at the coffee machine");
  run(walks, 40, () => !walks.moving);
  assert.deepEqual(walks.nav.sim.actor("cr/dev-1")!.location, seat, "back at the desk");
  assert.equal(walks.errand("cr/dev-1"), null);
});

test("a director visit stands beside the target's seat; a gather fills places around the meeting table", () => {
  const walks = new Walks();
  walks.update(idleModel({ meeting: true }), inside);
  run(walks, 1);
  walks.direct({ kind: "visitAgent", agent: "cr/dev-1", target: "cr/dev-2", ttlMs: 60_000 });
  const beside = walks.nav.beside("cr", "cr/dev-2", "workers");
  assert.ok(beside.length > 0);
  assert.ok(run(walks, 30, () => beside.some((b) => at(walks, "cr/dev-1", b))) < 30, "stands beside cr/dev-2");
  walks.endDirected();
  run(walks, 30, () => !walks.moving);
  assert.equal(walks.walker("cr/dev-1")!.seated, true, "the kill switch sends it home");

  assert.equal(walks.direct({ kind: "gather", agents: ["cr/dev-1", "cr/dev-2"], room: "meeting", ttlMs: 60_000 }), 2);
  const meeting = roomId("cr", "meeting");
  assert.ok(run(walks, 40, () => roomOf(walks, "cr/dev-1") === meeting && roomOf(walks, "cr/dev-2") === meeting) < 40, "both reach the meeting room");
  // Standing at the table, a walker says which furniture it works at (the renderer turns it there, on its cast's perch).
  assert.equal(walks.walker("cr/dev-1")!.work, null, "nothing while it walks");
  assert.ok(run(walks, 20, () => walks.walker("cr/dev-1")!.work !== null && walks.walker("cr/dev-2")!.work !== null) < 20, "both stand at the table");
  const work = walks.walker("cr/dev-1")!.work!;
  assert.equal(work.definitionId, "meeting-table");
  assert.deepEqual(work, walks.walker("cr/dev-2")!.work, "the same table: its centre in building cells");
  walks.endDirected();
  run(walks, 0.2);
  assert.equal(walks.walker("cr/dev-1")!.work, null, "and nothing once it sets off again");
});

test("a walker at the coffee machine or at its own desk stands at no work furniture of an errand", () => {
  const walks = new Walks();
  walks.update(idleModel(), inside);
  run(walks, 1);
  assert.equal(walks.walker("cr/dev-1")!.seated, true);
  assert.equal(walks.walker("cr/dev-1")!.work, null, "its desk is its seat, not an errand");
  walks.direct({ kind: "goToProp", agent: "cr/dev-1", room: "planning", tag: "planning", ttlMs: 60_000 });
  assert.ok(run(walks, 40, () => walks.walker("cr/dev-1")!.work !== null) < 40, "stands at the planning table");
  assert.equal(walks.walker("cr/dev-1")!.work!.definitionId, "planning-table");
});

test("director intents only walk in the entered building and never under reduced motion; a desk fact cancels them", () => {
  const go = { kind: "goToProp" as const, agent: "cr/dev-1", room: "lobby" as const, tag: "coffee", ttlMs: 60_000 };
  const town = new Walks();
  town.update(idleModel(), { ...inside, entered: null });
  assert.equal(town.direct(go), 0, "the town view does no cosmetic routing");
  const elsewhere = new Walks();
  elsewhere.update(idleModel(), { ...inside, entered: "ops" });
  assert.equal(elsewhere.direct(go), 0, "an offscreen building does no cosmetic routing");
  const reduced = new Walks();
  reduced.update(idleModel(), { ...inside, reducedMotion: true });
  assert.equal(reduced.direct(go), 0, "reduced motion records only");
  assert.equal(reduced.direct({ kind: "stay", agent: "cr/dev-1", ttlMs: 60_000 }), 0);

  const walks = new Walks();
  walks.update(idleModel(), inside);
  run(walks, 1);
  walks.direct(go);
  run(walks, 1);
  assert.equal(walks.errand("cr/dev-1")?.reason, "director");
  // A ticket lands on its desk: the fact wins and the agent heads back.
  walks.update(idleModel({ desk: true }), inside);
  assert.equal(walks.errand("cr/dev-1"), null);
  run(walks, 30, () => !walks.moving);
  assert.equal(walks.walker("cr/dev-1")!.seated, true);
});
