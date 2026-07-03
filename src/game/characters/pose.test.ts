import { describe, expect, it } from "vitest";
import { pose } from "./pose";

describe("pose", () => {
  it("walk bobs the body and counter-swings the arms", () => {
    const a = pose("walk", 0.1);
    const b = pose("walk", 0.35);
    expect(a.bodyY).not.toBeCloseTo(b.bodyY, 5); // bobbing
    expect(Math.sign(a.armL)).toBe(-Math.sign(a.armR)); // counter-swing
  });

  it("sit-type lowers the body and puts both arms forward", () => {
    const p = pose("sit-type", 1);
    expect(p.bodyY).toBeLessThan(0);
    expect(p.armL).toBeLessThan(-0.5);
    expect(p.armR).toBeLessThan(-0.5);
  });

  it("raise-hand lifts exactly one arm high", () => {
    const p = pose("raise-hand", 2);
    expect(p.armR).toBeLessThan(-2); // straight up
    expect(p.armL).toBeGreaterThan(-0.5);
  });

  it("sad slumps forward with head down", () => {
    const p = pose("sad", 0);
    expect(p.bodyTiltX).toBeGreaterThan(0.1);
    expect(p.headNodX).toBeGreaterThan(0.15);
  });

  it("blinks periodically but rarely", () => {
    let blinks = 0;
    for (let t = 0; t < 10; t += 1 / 30) if (pose("stand", t).blink) blinks++;
    expect(blinks).toBeGreaterThan(0);
    expect(blinks).toBeLessThan(60); // brief blinks, most frames open
  });
});
