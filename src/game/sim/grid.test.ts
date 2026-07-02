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
});
