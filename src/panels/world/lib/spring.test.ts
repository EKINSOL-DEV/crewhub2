// Critically-damped spring (Epic 20 motion polish): closed-form step — exact
// for any dt, so frame-rate hiccups can't explode it. TDD'd pure.
import { describe, expect, it } from "vitest";
import { springStep, type Spring1D } from "./spring";

const OMEGA = 7;

function settle(s: Spring1D, target: number, steps: number, dt: number): Spring1D {
  let cur = s;
  for (let i = 0; i < steps; i++) cur = springStep(cur, target, OMEGA, dt);
  return cur;
}

describe("springStep", () => {
  it("is the identity for dt = 0", () => {
    const s = { x: 2, v: -3 };
    expect(springStep(s, 10, OMEGA, 0)).toEqual(s);
  });

  it("stays put when already resting on the target", () => {
    const s = springStep({ x: 5, v: 0 }, 5, OMEGA, 0.016);
    expect(s.x).toBeCloseTo(5, 10);
    expect(s.v).toBeCloseTo(0, 10);
  });

  it("converges to the target from rest", () => {
    const s = settle({ x: 0, v: 0 }, 1, 240, 1 / 60);
    expect(s.x).toBeCloseTo(1, 4);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });

  it("never overshoots when starting from rest (critical damping)", () => {
    let s: Spring1D = { x: 0, v: 0 };
    let prev = 0;
    for (let i = 0; i < 300; i++) {
      s = springStep(s, 1, OMEGA, 1 / 60);
      expect(s.x).toBeLessThanOrEqual(1 + 1e-9);
      expect(s.x).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic approach
      prev = s.x;
    }
  });

  it("lands on the target for one huge dt instead of exploding", () => {
    const s = springStep({ x: 0, v: 0 }, 1, OMEGA, 10);
    expect(s.x).toBeCloseTo(1, 6);
    expect(s.v).toBeCloseTo(0, 6);
  });

  it("is consistent: two half-steps equal one full step (closed form)", () => {
    const start: Spring1D = { x: 0, v: 2.5 };
    const full = springStep(start, 1, OMEGA, 0.1);
    const halves = springStep(springStep(start, 1, OMEGA, 0.05), 1, OMEGA, 0.05);
    expect(halves.x).toBeCloseTo(full.x, 10);
    expect(halves.v).toBeCloseTo(full.v, 10);
  });
});
