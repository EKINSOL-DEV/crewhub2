/* Design choice K2 (`story`, round 72): the figures walk at story speed at every playback speed. The engine takes at
   most 0.1 s of simulation per tick (MAX_TICK_SECONDS), and the scene ticks the walks once per frame with the frame's
   time times the speed, so at 60 fps a frame at 16x (0.27 s) was cut to 0.1 s: about 37 % of story speed, slower on a
   slow device. Now Walks.tick sub-steps the frame's seconds in pieces of at most 0.1 s (at most 8 a frame: a 0.05 s
   frame at 16x), so N frames at 16x walk as far as 16N frames at 1x. */
import assert from "node:assert/strict";
import test from "node:test";
import { roomId } from "../src/world/navigation.ts";
import { Walks } from "../src/world/walks.ts";
import { agent, building, object, world } from "./fixtures.ts";

const T = 5_000_000;
const FRAME = 1 / 30;
const onDesk = object("t1", "workers", { key: "CR-1", deskOf: "cr/dev-1" });
const model = (o = onDesk) => world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-2", "workers")], [o]), building("ops")]);
const options = { entered: "cr", reducedMotion: false, ambient: "off" as const, buildingPlan: "classic" as const };

/** Frames until dev-1 reaches the review room on the hand-over walk, ticking FRAME * speed simulation seconds a frame. */
function framesToReview(speed: number): number {
  const walks = new Walks();
  walks.update(model(), options);
  for (let i = 0; i < 30; i++) walks.tick(FRAME, T + i * 33);
  walks.update(model({ ...onDesk, transit: { fromRoom: "workers", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } }), options);
  for (let i = 0; i < 2000; i++) {
    walks.tick(FRAME * speed, T + 1000 + i * 33 * speed);
    if (walks.nav.sim.actor("cr/dev-1")?.location.room === roomId("cr", "review")) return i + 1;
  }
  return Number.POSITIVE_INFINITY;
}

test("K2: N frames at 16x walk as far as 16N frames at 1x (the hand-over reaches the review room in a sixteenth of the frames)", () => {
  const at1x = framesToReview(1);
  const at16x = framesToReview(16);
  assert.ok(Number.isFinite(at1x) && at1x > 32, `reaches the review room at 1x in ${at1x} frames`);
  const expected = Math.ceil(at1x / 16);
  assert.ok(at16x <= expected + 1, `16x took ${at16x} frames, 1x took ${at1x}: expected about ${expected}`);
  assert.ok(at16x >= Math.max(1, expected - 1), `16x took ${at16x} frames, not fewer than a sixteenth of ${at1x}`);
});

test("K2: 8x walks at story speed too, and a frame of a second at 16x is held to eight sub-steps", () => {
  const at1x = framesToReview(1);
  const at8x = framesToReview(8);
  assert.ok(Math.abs(at8x - at1x / 8) <= 1.5, `8x took ${at8x} frames, 1x ${at1x}`);
  // A frame of 1 s at 16x (a tab that was hidden): 16 s asked, 8 sub-steps of 0.1 s = 0.8 s walked, no runaway.
  const walks = new Walks();
  walks.update(model(), options);
  for (let i = 0; i < 30; i++) walks.tick(FRAME, T + i * 33);
  walks.update(model({ ...onDesk, transit: { fromRoom: "workers", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } }), options);
  const before = walks.nav.sim.actor("cr/dev-1")!;
  walks.tick(16, T + 1000);
  const after = walks.nav.sim.actor("cr/dev-1")!;
  assert.ok(after.location.room !== roomId("cr", "review") || before.location.room === roomId("cr", "review"), "one long frame does not finish the whole walk");
});
