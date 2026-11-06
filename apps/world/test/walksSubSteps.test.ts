/* Design choice K2 (`story`, round 72): Walks.tick sub-steps a frame's seconds into engine ticks of at most 0.1 s, at
   most eight a frame, and hands each sub-step's seconds (not the frame's) to the agents' and the postman's dwell.
   Round 73's mutation run found these unpinned: the cap of eight, the cap of 0.1 s a sub-step, a zero frame (no engine
   tick, nothing moves), and the dwell counted per sub-step. The engine's own tick is wrapped here to see what it got. */
import assert from "node:assert/strict";
import test from "node:test";
import type { WorldModel } from "@crewhub/world-model";
import { roomId } from "../src/world/navigation.ts";
import { Walks } from "../src/world/walks.ts";
import { agent, building, object, world } from "./fixtures.ts";

const T = 5_000_000;
const FRAME = 1 / 30;
const onDesk = object("t1", "workers", { key: "CR-1", deskOf: "cr/dev-1" });
const postman = agent("postman", "lobby", { role: "worker", registered: true, room: null, building: null });
const model = (o = onDesk, extra: Partial<WorldModel> = {}) => world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-2", "workers")], [o]), building("ops")], { postOffice: [postman], ...extra });
const inside = { entered: "cr", reducedMotion: false, ambient: "off" as const, buildingPlan: "classic" as const };
const town = { entered: null, reducedMotion: false, ambient: "on" as const, buildingPlan: "classic" as const };

/** Wraps the engine's tick: every sub-step's seconds, in order. */
function spy(walks: Walks): number[] {
  const seen: number[] = [];
  const sim = walks.nav.sim as unknown as { tick(seconds: number): void };
  const original = sim.tick.bind(sim);
  sim.tick = (seconds: number) => {
    seen.push(seconds);
    original(seconds);
  };
  return seen;
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("K2: a long frame is eight sub-steps of 0.1 s and no more; a short one splits evenly under 0.1 s", () => {
  const walks = new Walks();
  walks.update(model(), inside);
  const seen = spy(walks);
  walks.tick(16, T);
  assert.equal(seen.length, 8, `eight engine ticks for a 16 s frame: ${seen.join(",")}`);
  assert.ok(seen.every((s) => close(s, 0.1)), `each of 0.1 s: ${seen.join(",")}`);
  seen.length = 0;
  walks.tick(0.25, T + 33);
  assert.equal(seen.length, 3, `three sub-steps for 0.25 s: ${seen.join(",")}`);
  assert.ok(seen.every((s) => close(s, 0.25 / 3)), `each a third of the frame: ${seen.join(",")}`);
  seen.length = 0;
  walks.tick(FRAME, T + 66);
  assert.deepEqual(seen, [FRAME], "a frame under 0.1 s is one tick of its own length");
});

test("K2: a zero frame ticks the engine not at all and moves nobody", () => {
  const walks = new Walks();
  walks.update(model(), inside);
  for (let i = 0; i < 30; i++) walks.tick(FRAME, T + i * 33);
  walks.update(model({ ...onDesk, transit: { fromRoom: "workers", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } }), inside);
  for (let i = 0; i < 6; i++) walks.tick(FRAME, T + 1000 + i * 33);
  const before = JSON.stringify(walks.nav.sim.actor("cr/dev-1")!.location);
  const seen = spy(walks);
  walks.tick(0, T + 1300);
  assert.deepEqual(seen, [], "no engine tick for a zero frame");
  assert.equal(JSON.stringify(walks.nav.sim.actor("cr/dev-1")!.location), before, "the walker stands where it stood");
});

/** Frames of `frame` s from the agent's arrival at the review spot until it sets off again (the 1.5 s dwell there). */
function framesAtReview(frame: number): number {
  const walks = new Walks();
  walks.update(model(), inside);
  for (let i = 0; i < 30; i++) walks.tick(FRAME, T + i * 33);
  walks.update(model({ ...onDesk, transit: { fromRoom: "workers", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } }), inside);
  const review = roomId("cr", "review");
  const arrived = () => {
    const a = walks.nav.sim.actor("cr/dev-1")!;
    return a.location.room === review && a.status === "arrived";
  };
  let i = 0;
  for (; i < 4000 && !arrived(); i++) walks.tick(FRAME, T + 1000 + i * 33);
  assert.ok(i < 4000, "arrives at the review spot");
  let frames = 0;
  for (; frames < 200 && arrived(); frames++) walks.tick(frame, T + 200_000 + frames * Math.round(frame * 1000));
  return frames;
}

test("K2: the dwell at the review spot counts each sub-step once: three frames of 0.5 s, as forty-five of a thirtieth", () => {
  const atThirtieths = framesAtReview(FRAME);
  assert.ok(atThirtieths >= 44 && atThirtieths <= 47, `1.5 s of dwell in thirtieths: ${atThirtieths} frames`);
  const atHalves = framesAtReview(0.5);
  assert.equal(atHalves, 3, `1.5 s of dwell in 0.5 s frames (five sub-steps each): ${atHalves} frames`);
});

test("K2: the postman's dwell at a door counts each sub-step once (1.2 s: three frames of 0.5 s)", () => {
  const walks = new Walks();
  walks.update(model(), town);
  for (let i = 0; i < 30; i++) walks.tick(FRAME, T + i * 33);
  const letter = { deliveryId: "d1", recipientId: "cr-lead", reason: "dm", state: "pending" as const, toBuilding: "cr", startedAt: T };
  walks.update(model(onDesk, { deliveries: [letter], cursor: 2 }), town);
  const front = walks.nav.front("cr")!;
  const atDoor = () => {
    const at = walks.nav.sim.actor("postman")!;
    return at.location.cell.x === front.cell.x && at.location.cell.z === front.cell.z && at.status === "arrived";
  };
  let i = 0;
  for (; i < 4000 && !atDoor(); i++) walks.tick(FRAME, T + 1000 + i * 33);
  assert.ok(i < 4000, "the postman reaches the door");
  let frames = 0;
  for (; frames < 200 && atDoor(); frames++) walks.tick(0.5, T + 200_000 + frames * 500);
  assert.equal(frames, 3, `1.2 s at the door in 0.5 s frames: ${frames}`);
});
