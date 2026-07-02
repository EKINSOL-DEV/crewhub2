import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA, damp, pan, pose, rotate, zoom, type RtsBounds } from "./rts-camera";

const B: RtsBounds = { half: 40, minDistance: 8, maxDistance: 60 };

describe("pan", () => {
  it("moves the target opposite the drag, scaled by distance", () => {
    const near = pan({ ...DEFAULT_CAMERA, distance: 10 }, 100, 0, B);
    const far = pan({ ...DEFAULT_CAMERA, distance: 40 }, 100, 0, B);
    expect(Math.abs(far.targetX - DEFAULT_CAMERA.targetX)).toBeGreaterThan(
      Math.abs(near.targetX - DEFAULT_CAMERA.targetX),
    );
  });

  it("is camera-relative: after a 180° turn the same drag goes the other way", () => {
    const a = pan(DEFAULT_CAMERA, 100, 0, B);
    const turned = rotate(DEFAULT_CAMERA, Math.PI);
    const b = pan(turned, 100, 0, B);
    expect(Math.sign(b.targetX - turned.targetX)).toBe(-Math.sign(a.targetX - DEFAULT_CAMERA.targetX));
  });

  it("clamps the target to bounds", () => {
    let cam = DEFAULT_CAMERA;
    for (let i = 0; i < 100; i++) cam = pan(cam, -10000, 0, B);
    expect(Math.abs(cam.targetX)).toBeLessThanOrEqual(B.half);
    expect(Math.abs(cam.targetZ)).toBeLessThanOrEqual(B.half);
  });
});

describe("zoom", () => {
  it("is exponential and clamped", () => {
    const inn = zoom(DEFAULT_CAMERA, -300, B);
    expect(inn.distance).toBeLessThan(DEFAULT_CAMERA.distance);
    let cam = DEFAULT_CAMERA;
    for (let i = 0; i < 50; i++) cam = zoom(cam, 500, B);
    expect(cam.distance).toBe(B.maxDistance);
    for (let i = 0; i < 100; i++) cam = zoom(cam, -500, B);
    expect(cam.distance).toBe(B.minDistance);
  });
});

describe("pose", () => {
  it("keeps the camera above the target looking at it", () => {
    const p = pose({ targetX: 5, targetZ: -3, yaw: 0.7, distance: 20 });
    expect(p.lookAt).toEqual([5, 0, -3]);
    expect(p.position[1]).toBeGreaterThan(5); // fixed pitch keeps real height
    const dx = p.position[0] - 5;
    const dz = p.position[2] + 3;
    expect(Math.hypot(dx, p.position[1], dz)).toBeCloseTo(20, 5);
  });
});

describe("damp", () => {
  it("converges toward the goal without overshooting", () => {
    const goal = { targetX: 10, targetZ: 0, yaw: 1, distance: 30 };
    let cur = DEFAULT_CAMERA;
    for (let i = 0; i < 240; i++) cur = damp(cur, goal, 8, 1 / 60);
    expect(cur.targetX).toBeCloseTo(10, 1);
    expect(cur.yaw).toBeCloseTo(1, 1);
    expect(cur.distance).toBeCloseTo(30, 1);
  });
});
