import { beforeEach, describe, expect, it } from "vitest";
import type { Building } from "@/game/world/campus/buildings";
import { hqBuilding } from "@/game/world/campus/buildings";
import {
  focusForBuilding,
  shortestArcDelta,
  shortestArcLerp,
  useCameraDirector,
  type FocusTarget,
} from "./director";

const HALF_PI = Math.PI / 2;

function room(overrides: Partial<Building> = {}): Building {
  return {
    plotIndex: 0,
    rect: { x: 22, z: 22, w: 14, d: 12 },
    desks: [],
    door: { x: 22, z: 28 }, // south wall midpoint (z + d/2)
    ...overrides,
  };
}

describe("shortestArcDelta", () => {
  it("is 0 for equal angles", () => {
    expect(shortestArcDelta(1.2345, 1.2345)).toBe(0);
  });

  it("is the plain difference well within the range", () => {
    expect(shortestArcDelta(0, HALF_PI)).toBeCloseTo(HALF_PI, 10);
    expect(shortestArcDelta(HALF_PI, 0)).toBeCloseTo(-HALF_PI, 10);
  });

  it("goes the short way through the ±π seam", () => {
    // 3.0 -> -3.0 the "long way" (decreasing) is ~6.0 rad; the short way
    // wraps forward through π and is only ~0.283 rad: -3.0 - 3.0 + 2π.
    const delta = shortestArcDelta(3.0, -3.0);
    expect(delta).toBeCloseTo(-3.0 - 3.0 + Math.PI * 2, 10);
    expect(Math.abs(delta)).toBeLessThan(0.3);
    expect(delta).toBeGreaterThan(0); // forward through the seam, not backward
  });

  it("resolves exact-opposite (π) boundary cases to +π, never -π", () => {
    expect(shortestArcDelta(0, Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(shortestArcDelta(0, -Math.PI)).toBeCloseTo(Math.PI, 10);
  });

  it("stays within (-π, π] for arbitrary large inputs", () => {
    for (const [from, to] of [
      [10, -10],
      [-7, 7],
      [100.5, -0.2],
      [-3.14159, 3.14159],
    ] as const) {
      const d = shortestArcDelta(from, to);
      expect(d).toBeGreaterThan(-Math.PI);
      expect(d).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe("shortestArcLerp", () => {
  it("k=0 stays at from; k=1 lands on an angle coterminal with to", () => {
    expect(shortestArcLerp(0.5, 2.0, 0)).toBe(0.5);
    const landed = shortestArcLerp(0.5, 2.0, 1);
    expect(Math.sin(landed)).toBeCloseTo(Math.sin(2.0), 10);
    expect(Math.cos(landed)).toBeCloseTo(Math.cos(2.0), 10);
  });

  it("damps across the ±π seam correctly (from 3.0 to -3.0 goes the short way)", () => {
    let yaw = 3.0;
    const goal = -3.0;
    for (let i = 0; i < 200; i++) yaw = shortestArcLerp(yaw, goal, 0.1);
    expect(Math.sin(yaw)).toBeCloseTo(Math.sin(goal), 5);
    expect(Math.cos(yaw)).toBeCloseTo(Math.cos(goal), 5);
    // It should have crept *up* through π (short way), not swung down through 0.
    expect(yaw).toBeGreaterThan(3.0);
  });

  it("never overshoots per-step past the target angle (monotonic approach)", () => {
    let yaw = 0;
    const goal = 1.0;
    let prevArc = Math.abs(shortestArcDelta(yaw, goal));
    for (let i = 0; i < 20; i++) {
      yaw = shortestArcLerp(yaw, goal, 0.3);
      const arc = Math.abs(shortestArcDelta(yaw, goal));
      expect(arc).toBeLessThanOrEqual(prevArc);
      prevArc = arc;
    }
  });
});

describe("focusForBuilding", () => {
  it("targets the rect center regardless of which door is chosen", () => {
    const b = room();
    const { target } = focusForBuilding(b, 0);
    expect(target).toEqual({ x: 22, z: 22 });
  });

  it("clamps distance to the minimum for a small building", () => {
    const b = room({ rect: { x: 0, z: 0, w: 4, d: 4 } });
    expect(focusForBuilding(b, 0).distance).toBe(14);
  });

  it("clamps distance to the maximum for a large building", () => {
    const b = room({ rect: { x: 0, z: 0, w: 30, d: 10 } });
    expect(focusForBuilding(b, 0).distance).toBe(30);
  });

  it("uses max(w, d) * 1.4 unclamped for a mid-size building (HQ's footprint)", () => {
    const b = room({ rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 0, z: 6 } });
    expect(focusForBuilding(b, 0).distance).toBeCloseTo(14 * 1.4, 10);
  });

  it("yaws to face straight in through a south door (yaw 0)", () => {
    const b = room({ rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 0, z: 6 } });
    expect(focusForBuilding(b, 0).yaw).toBeCloseTo(0, 10);
  });

  it("yaws to face straight in through a north door (yaw π)", () => {
    const b = room({ rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 0, z: -6 } });
    expect(focusForBuilding(b, 0).yaw).toBeCloseTo(Math.PI, 10);
  });

  it("yaws to face straight in through an east door (yaw π/2)", () => {
    const b = room({ rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 7, z: 0 } });
    expect(focusForBuilding(b, 0).yaw).toBeCloseTo(HALF_PI, 10);
  });

  it("yaws to face straight in through a west door (yaw -π/2)", () => {
    const b = room({ rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: -7, z: 0 } });
    expect(focusForBuilding(b, 0).yaw).toBeCloseTo(-HALF_PI, 10);
  });

  it("falls back to the single door when doors is absent", () => {
    const b: FocusTarget = { rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 0, z: 6 } };
    expect(focusForBuilding(b, 5).yaw).toBeCloseTo(0, 10);
  });

  it("falls back to the single door when doors is an empty array", () => {
    const b: FocusTarget = { rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 0, z: 6 }, doors: [] };
    expect(focusForBuilding(b, 5).yaw).toBeCloseTo(0, 10);
  });

  it("HQ (4 doors): picks the door whose yaw is nearest currentYaw, not the primary door", () => {
    const hq = hqBuilding();
    // currentYaw close to the east door's yaw (π/2), far from the primary
    // (south, yaw 0) door — the east door should win.
    const { yaw } = focusForBuilding(hq, HALF_PI - 0.1);
    expect(yaw).toBeCloseTo(HALF_PI, 10);
  });

  it("HQ: an exact match on the north door beats every other door", () => {
    const hq = hqBuilding();
    const { yaw } = focusForBuilding(hq, Math.PI);
    expect(yaw).toBeCloseTo(Math.PI, 10);
  });

  it("HQ: currentYaw near the primary (south) door still picks it", () => {
    const hq = hqBuilding();
    const { yaw } = focusForBuilding(hq, 0.2);
    expect(yaw).toBeCloseTo(0, 10);
  });
});

describe("useCameraDirector", () => {
  beforeEach(() => useCameraDirector.setState({ mode: { kind: "free" }, savedGoal: null }));

  it("starts in free mode with no saved goal", () => {
    expect(useCameraDirector.getState().mode).toEqual({ kind: "free" });
    expect(useCameraDirector.getState().savedGoal).toBeNull();
  });

  it("focusBuilding enters focus mode with the computed goal", () => {
    useCameraDirector
      .getState()
      .focusBuilding(room({ rect: { x: 0, z: 0, w: 14, d: 12 }, door: { x: 0, z: 6 } }), 0);
    expect(useCameraDirector.getState().mode).toEqual({
      kind: "focus",
      target: { x: 0, z: 0 },
      yaw: 0,
      distance: 14 * 1.4,
    });
  });

  it("followBot enters follow mode with the bot's key", () => {
    useCameraDirector.getState().followBot("bot-42");
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "bot-42" });
  });

  it("focus replaces follow", () => {
    useCameraDirector.getState().followBot("bot-42");
    useCameraDirector.getState().focusBuilding(room(), 0);
    expect(useCameraDirector.getState().mode.kind).toBe("focus");
  });

  it("follow replaces focus", () => {
    useCameraDirector.getState().focusBuilding(room(), 0);
    useCameraDirector.getState().followBot("bot-42");
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "bot-42" });
  });

  it("exit returns to free mode", () => {
    useCameraDirector.getState().followBot("bot-42");
    useCameraDirector.getState().exit();
    expect(useCameraDirector.getState().mode).toEqual({ kind: "free" });
  });

  it("setSavedGoal stores an opaque snapshot verbatim", () => {
    const goal = { targetX: 1, targetZ: 2, yaw: 3, distance: 4 };
    useCameraDirector.getState().setSavedGoal(goal);
    expect(useCameraDirector.getState().savedGoal).toBe(goal);
  });

  it("exit clears the saved goal (it's been consumed by the rig)", () => {
    useCameraDirector.getState().setSavedGoal({ any: "goal" });
    useCameraDirector.getState().exit();
    expect(useCameraDirector.getState().savedGoal).toBeNull();
  });

  it("switching focus <-> follow mid-session keeps the ORIGINAL saved goal", () => {
    const original = { targetX: 0, targetZ: 0, yaw: 0.6, distance: 34 };
    // Rig's contract: setSavedGoal is called once, right after the first
    // free -> cinematic transition.
    useCameraDirector.getState().followBot("bot-1");
    useCameraDirector.getState().setSavedGoal(original);

    // Switching to focus (follow -> focus) must not touch savedGoal, even
    // though the rig does NOT call setSavedGoal again here.
    useCameraDirector.getState().focusBuilding(room(), 0);
    expect(useCameraDirector.getState().savedGoal).toBe(original);

    // And back to follow again — still untouched.
    useCameraDirector.getState().followBot("bot-2");
    expect(useCameraDirector.getState().savedGoal).toBe(original);

    // Only exit() consumes it, restoring the true pre-cinematic view.
    useCameraDirector.getState().exit();
    expect(useCameraDirector.getState().mode).toEqual({ kind: "free" });
    expect(useCameraDirector.getState().savedGoal).toBeNull();
  });
});
