import { describe, expect, it } from "vitest";
import {
  chaseFocus,
  chaseFollow,
  chaseRestore,
  dampK,
  dragArmed,
  edgeScrollActive,
  FOCUS_ADJUST_IDENTITY,
  isRestored,
  rotateFocusAdjust,
  zoomFocusAdjust,
} from "./camera-math";
import type { RtsCamera } from "./rts-camera";

const BOUNDS = { half: 100, minDistance: 8, maxDistance: 60 };

function cam(overrides: Partial<RtsCamera> = {}): RtsCamera {
  return { targetX: 0, targetZ: 0, yaw: 0, distance: 20, ...overrides };
}

describe("dampK", () => {
  it("is 0 at dt=0 (no motion this frame) and approaches 1 as dt grows", () => {
    expect(dampK(3, 0)).toBe(0);
    expect(dampK(3, 10)).toBeGreaterThan(0.99);
  });

  it("is monotonically increasing in dt for a fixed rate", () => {
    expect(dampK(3, 0.1)).toBeLessThan(dampK(3, 0.5));
  });
});

describe("chaseFocus", () => {
  const mode = { target: { x: 10, z: -5 }, yaw: Math.PI / 2, distance: 30 };

  it("k=0 leaves current untouched", () => {
    const current = cam({ targetX: 1, targetZ: 2, yaw: 0.3, distance: 15 });
    expect(chaseFocus(current, mode, FOCUS_ADJUST_IDENTITY, 0)).toEqual(current);
  });

  it("k=1 lands exactly on the mode's target/distance and a yaw coterminal with it", () => {
    const current = cam();
    const next = chaseFocus(current, mode, FOCUS_ADJUST_IDENTITY, 1);
    expect(next.targetX).toBeCloseTo(mode.target.x, 10);
    expect(next.targetZ).toBeCloseTo(mode.target.z, 10);
    expect(next.distance).toBeCloseTo(mode.distance, 10);
    expect(Math.sin(next.yaw)).toBeCloseTo(Math.sin(mode.yaw), 10);
    expect(Math.cos(next.yaw)).toBeCloseTo(Math.cos(mode.yaw), 10);
  });

  it("takes the short way around the ±π seam for yaw (same case as director.test.ts)", () => {
    const current = cam({ yaw: 3.0 });
    const wrappingMode = { ...mode, yaw: -3.0 };
    const next = chaseFocus(current, wrappingMode, FOCUS_ADJUST_IDENTITY, 0.5);
    // Halfway along the short (~0.283 rad) arc, forward through π — not
    // halfway along the long (~6 rad) way, which would decrease.
    expect(next.yaw).toBeGreaterThan(current.yaw);
    expect(next.yaw - current.yaw).toBeLessThan(0.2);
  });

  it("layers a live FocusAdjust onto the mode's framed yaw/distance", () => {
    const current = cam();
    const adjust = { yaw: 0.4, distanceFactor: 1.5 };
    const next = chaseFocus(current, mode, adjust, 1);
    expect(Math.sin(next.yaw)).toBeCloseTo(Math.sin(mode.yaw + 0.4), 10);
    expect(next.distance).toBeCloseTo(mode.distance * 1.5, 10);
  });
});

describe("chaseFollow", () => {
  it("chases target x/z but leaves yaw/distance untouched, even at k=1", () => {
    const current = cam({ targetX: 0, targetZ: 0, yaw: 1.23, distance: 45 });
    const next = chaseFollow(current, 7, -3, 1);
    expect(next.targetX).toBeCloseTo(7, 10);
    expect(next.targetZ).toBeCloseTo(-3, 10);
    expect(next.yaw).toBe(1.23);
    expect(next.distance).toBe(45);
  });

  it("k=0 is a no-op", () => {
    const current = cam({ targetX: 1, targetZ: 2 });
    expect(chaseFollow(current, 99, 99, 0)).toEqual(current);
  });
});

describe("chaseRestore + isRestored", () => {
  const saved = cam({ targetX: 5, targetZ: 5, yaw: 1.0, distance: 25 });

  it("chases every field back toward the saved snapshot", () => {
    const current = cam();
    const next = chaseRestore(current, saved, 1);
    expect(next.targetX).toBeCloseTo(saved.targetX, 10);
    expect(next.targetZ).toBeCloseTo(saved.targetZ, 10);
    expect(next.distance).toBeCloseTo(saved.distance, 10);
    expect(Math.sin(next.yaw)).toBeCloseTo(Math.sin(saved.yaw), 10);
  });

  it("is not restored while far away, and is once within epsilon of every field", () => {
    const current = cam();
    expect(isRestored(current, saved)).toBe(false);
    const arrived = { ...saved };
    expect(isRestored(arrived, saved)).toBe(true);
  });

  it("a repeated chase converges monotonically to isRestored", () => {
    let current = cam();
    let steps = 0;
    while (!isRestored(current, saved) && steps < 1000) {
      current = chaseRestore(current, saved, dampK(3, 1 / 60));
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThan(1000);
  });
});

describe("rotateFocusAdjust", () => {
  it("accumulates yaw deltas", () => {
    let adjust = FOCUS_ADJUST_IDENTITY;
    adjust = rotateFocusAdjust(adjust, 0.2);
    adjust = rotateFocusAdjust(adjust, -0.05);
    expect(adjust.yaw).toBeCloseTo(0.15, 10);
    expect(adjust.distanceFactor).toBe(1); // untouched
  });
});

describe("zoomFocusAdjust", () => {
  it("zooming in shrinks the distance factor, zooming out grows it", () => {
    const closer = zoomFocusAdjust(FOCUS_ADJUST_IDENTITY, -100, 20, BOUNDS);
    const farther = zoomFocusAdjust(FOCUS_ADJUST_IDENTITY, 100, 20, BOUNDS);
    expect(closer.distanceFactor).toBeLessThan(1);
    expect(farther.distanceFactor).toBeGreaterThan(1);
  });

  it("clamps so mode.distance * factor never leaves the rig bounds", () => {
    const zoomedInHard = zoomFocusAdjust(FOCUS_ADJUST_IDENTITY, -100000, 20, BOUNDS);
    expect(20 * zoomedInHard.distanceFactor).toBeCloseTo(BOUNDS.minDistance, 5);

    const zoomedOutHard = zoomFocusAdjust(FOCUS_ADJUST_IDENTITY, 100000, 20, BOUNDS);
    expect(20 * zoomedOutHard.distanceFactor).toBeCloseTo(BOUNDS.maxDistance, 5);
  });

  it("repeated small zooms compound the factor rather than resetting it", () => {
    let adjust = FOCUS_ADJUST_IDENTITY;
    adjust = zoomFocusAdjust(adjust, -50, 20, BOUNDS);
    const once = adjust.distanceFactor;
    adjust = zoomFocusAdjust(adjust, -50, 20, BOUNDS);
    expect(adjust.distanceFactor).toBeLessThan(once);
  });
});

describe("edgeScrollActive", () => {
  it("is active in free-roam steady state (not restoring)", () => {
    expect(edgeScrollActive("free", false)).toBe(true);
  });

  it("is inactive while free but mid flight-home restore", () => {
    expect(edgeScrollActive("free", true)).toBe(false);
  });

  it("is inactive while focused on a building, restoring or not", () => {
    expect(edgeScrollActive("focus", false)).toBe(false);
    expect(edgeScrollActive("focus", true)).toBe(false);
  });

  it("is inactive while following a bot, restoring or not", () => {
    expect(edgeScrollActive("follow", false)).toBe(false);
    expect(edgeScrollActive("follow", true)).toBe(false);
  });
});

describe("dragArmed", () => {
  it("is not armed for zero movement (the pointerdown instant itself)", () => {
    expect(dragArmed(0, 0)).toBe(false);
  });

  it("is not armed for a sub-pixel-scale wobble below the dead zone", () => {
    expect(dragArmed(1, 0)).toBe(false);
    expect(dragArmed(0, -2)).toBe(false);
    expect(dragArmed(2, 2)).toBe(false); // hypot ~2.83, still under 4
  });

  it("is armed once cumulative movement reaches the dead zone, on either axis or combined", () => {
    expect(dragArmed(4, 0)).toBe(true);
    expect(dragArmed(0, -4)).toBe(true);
    expect(dragArmed(3, 3)).toBe(true); // hypot ~4.24
  });

  it("is armed for any movement well past the dead zone, in any direction", () => {
    expect(dragArmed(100, 0)).toBe(true);
    expect(dragArmed(-50, -50)).toBe(true);
  });
});
