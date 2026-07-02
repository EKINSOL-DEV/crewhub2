// Sim nav grid + A* pathfinding (M1 T5) — pure TS, seeded off the M0 campus
// layout, feeds the character mover in later tasks.
import { describe, expect, it } from "vitest";
import { campusBuildings } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import { buildNavGrid, findPath } from "./grid";

const layout = campusLayout();
const buildings = campusBuildings(layout.plots);
const grid = buildNavGrid(layout, buildings);

describe("findPath", () => {
  it("routes around the fountain", () => {
    const path = findPath(grid, { x: -10, z: 0 }, { x: 10, z: 0 });
    expect(path.length).toBeGreaterThan(0);
    for (const p of path) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(5);
    }
  });

  it("returns [] for a target outside the grid bounds", () => {
    expect(findPath(grid, { x: 0, z: 0 }, { x: 500, z: 500 })).toEqual([]);
  });

  it("snaps a blocked target (a desk cell) to its nearest walkable neighbor", () => {
    const desk = buildings[0]!.desks[0]!;
    const path = findPath(grid, { x: 0, z: 0 }, { x: desk.x, z: desk.z });
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(Math.hypot(last.x - desk.x, last.z - desk.z)).toBeLessThanOrEqual(2);
  });

  it("smooths an open-field path down to a handful of waypoints", () => {
    // (-20,-20) -> (20,20): clear of scatter for the fixed layout seed.
    const path = findPath(grid, { x: -20, z: -20 }, { x: 20, z: 20 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.length).toBeLessThanOrEqual(6);
  });

  it("is deterministic", () => {
    const a = findPath(grid, { x: -10, z: 0 }, { x: 10, z: 0 });
    const b = findPath(grid, { x: -10, z: 0 }, { x: 10, z: 0 });
    expect(a).toEqual(b);
  });

  it("never clips the fountain along CONTINUOUS path segments (supercover regression)", () => {
    // A plain Bresenham line-of-sight skipped corner cells on diagonal
    // steps, so smoothing could keep a segment whose true line crossed the
    // fountain disc (review repro below hit min distance 4.85 < 5).
    const sampleSegments = (path: { x: number; z: number }[], from: { x: number; z: number }) => {
      let prev = from;
      for (const p of path) {
        const len = Math.hypot(p.x - prev.x, p.z - prev.z);
        const steps = Math.max(1, Math.ceil(len / 0.1));
        for (let i = 0; i <= steps; i++) {
          const x = prev.x + ((p.x - prev.x) * i) / steps;
          const z = prev.z + ((p.z - prev.z) * i) / steps;
          // Half-a-cell tolerance: blocking is cell-quantized, and a sample
          // may graze a walkable cell whose center sits just outside r=5.
          expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(5 - 0.75);
        }
        prev = p;
      }
    };

    // Reviewer's exact reproduction pair.
    const from = { x: 12.18, z: 5.08 };
    const path = findPath(grid, from, { x: -18.32, z: -1.98 });
    expect(path.length).toBeGreaterThan(0);
    sampleSegments(path, from);

    // Seeded fuzz around the fountain — mulberry32, no Math.random().
    let s = 0xc0ffee ^ 0;
    const rand = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
      const a1 = rand() * Math.PI * 2;
      const a2 = rand() * Math.PI * 2;
      const r1 = 8 + rand() * 14;
      const r2 = 8 + rand() * 14;
      const start = { x: Math.sin(a1) * r1, z: Math.cos(a1) * r1 };
      const p = findPath(grid, start, { x: Math.sin(a2) * r2, z: Math.cos(a2) * r2 });
      if (p.length > 0) sampleSegments(p, start);
    }
  });
});
