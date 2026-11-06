import assert from "node:assert/strict";
import test from "node:test";
import { JUMP_TRACK_MS, jumpBox, landingStep, type Landing } from "../src/world/landing.ts";

test("w4-11: a plain jump's box reaches further away from the camera than towards it; a centred one is square on the anchor", () => {
  assert.deepEqual(jumpBox({ x: 10, z: 20 }, 5, false), { minX: 5, maxX: 15, minZ: 13, maxZ: 23 });
  assert.deepEqual(jumpBox({ x: 10, z: 20 }, 5, true), { minX: 5, maxX: 15, minZ: 15, maxZ: 25 });
  assert.deepEqual(jumpBox({ x: -3, z: 0 }, 13, false), { minX: -16, maxX: 10, minZ: -18.2, maxZ: 7.8 });
});

test("w4-11: a landing's step is how far the figure moved on the ground since the frame before, and it moves `last` along", () => {
  const landing: Landing = { id: "a:postman", last: { x: 1, z: 2 }, until: 1000 };
  assert.deepEqual(landingStep(landing, { x: 4, z: 6 }, 500, false), { x: 3, z: 4 });
  assert.deepEqual(landing.last, { x: 4, z: 6 });
  assert.deepEqual(landingStep(landing, { x: 4, z: 6 }, 600, false), { x: 0, z: 0 });
  assert.deepEqual(landingStep(landing, { x: 2, z: 6 }, 1000, false), { x: -2, z: 0 }, "its last moment still steps");
});

test("w4-11: a landing ends when its anchor is gone, when something blocks it, or when its time is over; a figure that stood still does not end it", () => {
  const fresh = (): Landing => ({ id: "a:postman", last: { x: 1, z: 2 }, until: 1000 });
  assert.equal(landingStep(fresh(), undefined, 500, false), null);
  assert.equal(landingStep(fresh(), { x: 1, z: 2 }, 500, true), null);
  assert.equal(landingStep(fresh(), { x: 1, z: 2 }, 1001, false), null);
  const still = fresh();
  assert.deepEqual(landingStep(still, { x: 1, z: 2 }, 999, false), { x: 0, z: 0 });
  assert.deepEqual(still.last, { x: 1, z: 2 });
  assert.equal(JUMP_TRACK_MS, 6000);
});
