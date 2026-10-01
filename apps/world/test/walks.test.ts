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
  const options = { entered: "cr", reducedMotion: false, ambient: "off" as const };
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
  const options = { entered: null, reducedMotion: false, ambient: "on" as const };
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
  walks.update(model(), { entered: "cr", reducedMotion: true, ambient: "on" });
  run(walks, 0.5);
  const joined = world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-2", "workers"), agent("cr/dev-3", "workers")], [onDesk]), building("ops")], {
    postOffice: [postman],
  });
  walks.update(joined, { entered: "cr", reducedMotion: true, ambient: "on" });
  run(walks, 1 / 30);
  assert.equal(roomOf(walks, "cr/dev-3"), roomId("cr", "workers"));
  assert.equal(walks.walker("cr/dev-3")!.walking, false);
});
