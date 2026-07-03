// Sim nav grid + A* pathfinding (M1 T5) — pure TS, seeded off the M0 campus
// layout, feeds the character mover in later tasks.
import { describe, expect, it } from "vitest";
import { campusBuildings } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import { buildNavGrid, findPath } from "./grid";

const layout = campusLayout();
const buildings = campusBuildings(layout.plots);
const grid = buildNavGrid(layout, buildings);

function cellIndexFor(g: ReturnType<typeof buildNavGrid>, x: number, z: number): number {
  const cx = Math.floor(x + g.size / 2);
  const cz = Math.floor(z + g.size / 2);
  return cz * g.size + cx;
}

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

describe("buildNavGrid extras (M3 T5 — placed decor blocks pathing)", () => {
  // (3, 22) sits in open field, clear of scatter/plots/buildings for this
  // seed — confirmed unblocked in the base grid before asserting the extra
  // blocks it.
  const spot = { x: 3, z: 22 };

  it("leaves the spot walkable without extras", () => {
    expect(grid.blocked[cellIndexFor(grid, spot.x, spot.z)]).toBe(0);
  });

  it("blocks exactly the placed item's cell", () => {
    const withItem = buildNavGrid(layout, buildings, { items: [spot] });
    expect(withItem.blocked[cellIndexFor(withItem, spot.x, spot.z)]).toBe(1);
  });

  it("routes a path around a placed item blocking the direct line", () => {
    const withItem = buildNavGrid(layout, buildings, { items: [spot] });
    const path = findPath(withItem, { x: spot.x - 4, z: spot.z }, { x: spot.x + 4, z: spot.z });
    expect(path.length).toBeGreaterThan(0);
    for (const p of path) {
      expect(Math.hypot(p.x - spot.x, p.z - spot.z)).toBeGreaterThan(0.4);
    }
  });

  it("is backward compatible — omitting extras behaves exactly as before", () => {
    const withoutExtras = buildNavGrid(layout, buildings);
    expect(withoutExtras.blocked).toEqual(grid.blocked);
  });
});

describe("buildNavGrid skipKinds (M4 debt sweep — sky-biome invisible walls)", () => {
  // Campus renders (and blocks) treePine; sky doesn't render it at all
  // (biome.ts's `skip`) but buildNavGrid blocked the cell regardless —
  // an invisible wall a robot could never see coming.
  const pine = layout.scatter.treePine[0]!;

  it("campus (no skipKinds) blocks a pine cell", () => {
    expect(grid.blocked[cellIndexFor(grid, pine.x, pine.z)]).toBe(1);
  });

  it("skipping treePine unblocks exactly that pine cell", () => {
    const sky = buildNavGrid(layout, buildings, { skipKinds: ["treePine"] });
    expect(sky.blocked[cellIndexFor(sky, pine.x, pine.z)]).toBe(0);
  });

  it("a path no longer detours around a pine cell once its kind is skipped", () => {
    const from = { x: pine.x - 4, z: pine.z };
    const to = { x: pine.x + 4, z: pine.z };
    const sky = buildNavGrid(layout, buildings, { skipKinds: ["treePine"] });

    const pathLength = (points: { x: number; z: number }[]) => {
      let total = 0;
      let prev = from;
      for (const p of points) {
        total += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
      }
      return total;
    };
    const straight = Math.hypot(to.x - from.x, to.z - from.z);
    const blockedLength = pathLength(findPath(grid, from, to));
    const skyLength = pathLength(findPath(sky, from, to));

    // Cell-quantized pathing isn't pixel-exact to the straight line, but the
    // skipped-kind path stays close to it — well short of the campus
    // (still-blocking) detour around the same cell.
    expect(skyLength).toBeLessThan(straight + 1);
    expect(blockedLength).toBeGreaterThan(skyLength);
  });

  it("leaves every other blocking kind blocked — skipKinds is per-kind, not all-or-nothing", () => {
    const rock = layout.scatter.rockLarge[0]!;
    const sky = buildNavGrid(layout, buildings, { skipKinds: ["treePine"] });
    expect(sky.blocked[cellIndexFor(sky, rock.x, rock.z)]).toBe(1);
  });

  it("is backward compatible — extras without skipKinds still blocks every kind", () => {
    const withItemsOnly = buildNavGrid(layout, buildings, { items: [] });
    expect(withItemsOnly.blocked).toEqual(grid.blocked);
  });
});
