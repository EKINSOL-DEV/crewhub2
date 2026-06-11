// Idle-wander step function (EKI-62): pure state-in/state-out so the whole
// behavior is testable without three.js or a clock.
import { describe, expect, it } from "vitest";
import type { WorldBounds } from "./layout";
import { WANDER_SPEED, initialWander, wanderStep } from "./wander";

const bounds: WorldBounds = { minX: -4, maxX: 4, minZ: -4, maxZ: 4 };

/** Deterministic rng: cycles through the given values. */
function rngOf(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

describe("wanderStep", () => {
  it("waits in place until the wait timer runs out", () => {
    const s0 = { ...initialWander(0, 0), waitS: 1 };
    const s1 = wanderStep(s0, 0.4, bounds, rngOf(0.5));
    expect([s1.x, s1.z]).toEqual([0, 0]);
    expect(s1.waitS).toBeCloseTo(0.6);
  });

  it("picks a new in-bounds target when the wait expires", () => {
    const s0 = { ...initialWander(0, 0), waitS: 0.1 };
    const s1 = wanderStep(s0, 0.2, bounds, rngOf(0.9, 0.1, 0.5));
    expect(s1.targetX).toBeGreaterThanOrEqual(bounds.minX);
    expect(s1.targetX).toBeLessThanOrEqual(bounds.maxX);
    expect(s1.targetZ).toBeGreaterThanOrEqual(bounds.minZ);
    expect(s1.targetZ).toBeLessThanOrEqual(bounds.maxZ);
    expect(s1.targetX !== 0 || s1.targetZ !== 0).toBe(true);
  });

  it("moves toward the target at WANDER_SPEED and faces the way it walks", () => {
    const s0 = { ...initialWander(0, 0), waitS: 0, targetX: 3, targetZ: 0 };
    const s1 = wanderStep(s0, 1, bounds, rngOf(0.5));
    expect(s1.x).toBeCloseTo(Math.min(WANDER_SPEED, 3));
    expect(s1.z).toBeCloseTo(0);
    expect(s1.heading).toBeCloseTo(Math.atan2(3, 0));
    expect(s1.moving).toBe(true);
  });

  it("arrives without overshooting, then starts a new wait", () => {
    const s0 = { ...initialWander(0, 0), waitS: 0, targetX: 0.2, targetZ: 0 };
    const s1 = wanderStep(s0, 1, bounds, rngOf(0.5));
    expect(s1.x).toBeCloseTo(0.2);
    expect(s1.moving).toBe(false);
    expect(s1.waitS).toBeGreaterThan(0);
  });

  it("never leaves the bounds over many steps", () => {
    let s = initialWander(0, 0);
    const rng = rngOf(0.99, 0.01, 0.5, 0.7, 0.3);
    for (let i = 0; i < 500; i++) {
      s = wanderStep(s, 0.05, bounds, rng);
      expect(s.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(s.x).toBeLessThanOrEqual(bounds.maxX);
      expect(s.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(s.z).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it("is pure — does not mutate the input state", () => {
    const s0 = { ...initialWander(1, 1), waitS: 0, targetX: 3, targetZ: 3 };
    const frozen = { ...s0 };
    wanderStep(s0, 0.5, bounds, rngOf(0.5));
    expect(s0).toEqual(frozen);
  });
});
