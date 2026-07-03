// Sim nav grid + A* pathfinding (M1 T5) — pure TS, seeded off the M0 campus
// layout, feeds the character mover in later tasks.
import { describe, expect, it } from "vitest";
import { buildingDesks } from "@/game/build/edits";
import { campusBuildings, HQ_RECT, nearestEdgeDoor } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import { buildNavGrid, DOOR_GAP_RADIUS, findPath } from "./grid";

const layout = campusLayout();
// M6: campusBuildings() now prepends the permanent HQ building, so
// buildings[0] is HQ and the four plot pavilions shift to indices 1-4.
const buildings = campusBuildings(layout.plots);
const grid = buildNavGrid(layout, buildings);
const hq = buildings[0]!;

function cellIndexFor(g: ReturnType<typeof buildNavGrid>, x: number, z: number): number {
  const cx = Math.floor(x + g.size / 2);
  const cz = Math.floor(z + g.size / 2);
  return cz * g.size + cx;
}

/** Sample points at ~0.1u resolution along the *continuous* route (`from`
 *  plus every segment of `path`) — checking only the smoothed waypoints can
 *  miss a required pass-through point (a nearly-straight route that already
 *  threads a doorway needs no corner there at all, so no waypoint sits near
 *  it even though the route clearly passed through). */
function sampleAlongPath(
  path: { x: number; z: number }[],
  from: { x: number; z: number },
): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [from];
  let prev = from;
  for (const p of path) {
    const len = Math.hypot(p.x - prev.x, p.z - prev.z);
    const steps = Math.max(1, Math.ceil(len / 0.1));
    for (let i = 1; i <= steps; i++) {
      points.push({ x: prev.x + ((p.x - prev.x) * i) / steps, z: prev.z + ((p.z - prev.z) * i) / steps });
    }
    prev = p;
  }
  return points;
}

/**
 * True when (x, z) sits unambiguously inside HQ's blocked wall band (not the
 * walkable floor, not a doorway) — the M6 replacement for the old "is this
 * inside the fountain disc" check. MARGIN mirrors the half-cell slack the
 * pre-M6 fountain check tolerated: `buildNavGrid` blocks by *cell center*,
 * so a continuous point can sit up to half a cell inside a nominally-blocked
 * band's boundary (or half a cell short of a door's true edge) while the
 * cell it falls in is still walkable.
 */
function clearlyInsideHqWallBand(x: number, z: number): boolean {
  const hw = HQ_RECT.w / 2;
  const hd = HQ_RECT.d / 2;
  const MARGIN = 0.5;
  const distToEdge = Math.min(hw - Math.abs(x), hd - Math.abs(z));
  if (distToEdge < MARGIN || distToEdge >= 1 - MARGIN) return false;
  const nearestDoor = Math.min(...hq.doors!.map((d) => Math.hypot(x - d.x, z - d.z)));
  return nearestDoor > DOOR_GAP_RADIUS + MARGIN;
}

describe("findPath", () => {
  it("takes the HQ shortcut: a path from the north arm to the south arm cuts straight through, not around", () => {
    // Both the north and south doors sit on x=0 (see hqBuilding), so a
    // straight line at x=0 threads both without any detour around the
    // wall ring — HQ is a shortcut, not an obstacle, on this axis.
    const from = { x: 0, z: -20 };
    const to = { x: 0, z: 20 };
    const path = findPath(grid, from, to);
    expect(path.length).toBeGreaterThan(0);
    let total = 0;
    let prev = from;
    for (const p of path) {
      total += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    const straight = Math.hypot(to.x - from.x, to.z - from.z);
    expect(total).toBeLessThan(straight + 2); // detouring around HQ's wall ring would add far more than 2u
  });

  it("returns [] for a target outside the grid bounds", () => {
    expect(findPath(grid, { x: 0, z: 0 }, { x: 500, z: 500 })).toEqual([]);
  });

  it("snaps a blocked target (a desk cell) to its nearest walkable neighbor", () => {
    const plot0 = buildings.find((b) => b.plotIndex === 0)!;
    const desk = plot0.desks[0]!;
    const path = findPath(grid, { x: 0, z: 0 }, { x: desk.x, z: desk.z });
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(Math.hypot(last.x - desk.x, last.z - desk.z)).toBeLessThanOrEqual(2);
  });

  it("smooths an open-field path down to a handful of waypoints", () => {
    // (-20,-13) -> (20,13): clear of scatter for the fixed layout seed and
    // clear of HQ (the straight line's z stays outside HQ's ±6 z-span).
    const path = findPath(grid, { x: -20, z: -13 }, { x: 20, z: 13 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.length).toBeLessThanOrEqual(6);
  });

  it("is deterministic", () => {
    const a = findPath(grid, { x: -10, z: 0 }, { x: 10, z: 0 });
    const b = findPath(grid, { x: -10, z: 0 }, { x: 10, z: 0 });
    expect(a).toEqual(b);
  });

  it("never clips HQ's wall band along CONTINUOUS path segments (supercover regression)", () => {
    // A plain Bresenham line-of-sight skipped corner cells on diagonal
    // steps, so smoothing could keep a segment whose true line crossed a
    // blocked obstacle (originally the fountain disc; M6 replaces the
    // fixed disc with HQ's wall ring, so the regression check moves with
    // it — same algorithm, same risk, new obstacle shape).
    const sampleSegments = (path: { x: number; z: number }[], from: { x: number; z: number }) => {
      let prev = from;
      for (const p of path) {
        const len = Math.hypot(p.x - prev.x, p.z - prev.z);
        const steps = Math.max(1, Math.ceil(len / 0.1));
        for (let i = 0; i <= steps; i++) {
          const x = prev.x + ((p.x - prev.x) * i) / steps;
          const z = prev.z + ((p.z - prev.z) * i) / steps;
          expect(clearlyInsideHqWallBand(x, z)).toBe(false);
        }
        prev = p;
      }
    };

    // Reviewer's exact reproduction pair (originally clipped the fountain).
    const from = { x: 12.18, z: 5.08 };
    const path = findPath(grid, from, { x: -18.32, z: -1.98 });
    expect(path.length).toBeGreaterThan(0);
    sampleSegments(path, from);

    // Seeded fuzz around HQ — mulberry32, no Math.random().
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

describe("HQ (M6 — permanent headquarters replaces the fixed fountain disc)", () => {
  it("HQ's interior is walkable — no fountain disc block remains", () => {
    expect(grid.blocked[cellIndexFor(grid, 0, 0)]).toBe(0);
    expect(grid.blocked[cellIndexFor(grid, 3, 3)]).toBe(0); // inside the old r=5 fountain disc, inside HQ's floor
  });

  it("blocks HQ's wall ring away from any door", () => {
    // A cell just inside HQ_RECT's corner (half-extent minus 0.5) — far from
    // every door (all sit on the x=0 or z=0 axis), squarely in the ~1-unit
    // wall band buildNavGrid blocks around a building's footprint.
    const cornerX = HQ_RECT.w / 2 - 0.5;
    const cornerZ = HQ_RECT.d / 2 - 0.5;
    expect(grid.blocked[cellIndexFor(grid, cornerX, cornerZ)]).toBe(1);
  });

  it("opens a walkable gap at each of HQ's four doors", () => {
    for (const door of hq.doors!) {
      expect(grid.blocked[cellIndexFor(grid, door.x, door.z)]).toBe(0);
    }
  });
});

describe("buildNavGrid walls (M5 T3 — rooms have walls, bots use the door)", () => {
  // M6: buildings[0] is now HQ, so the plot-0 pavilion (rect
  // {x:22,z:22,w:14,d:12}; door on the west edge, facing the plaza) is found
  // by plotIndex instead of assumed at a fixed array slot.
  const b0 = buildings.find((b) => b.plotIndex === 0)!;
  const desk = b0.desks[0]!;

  it("a path from the plaza side to a desk sweeps through the door gap", () => {
    const outside = { x: 0, z: 22 };
    const path = findPath(grid, outside, { x: desk.x, z: desk.z });
    expect(path.length).toBeGreaterThan(0);
    const swept = sampleAlongPath(path, outside);
    const minDistToDoor = Math.min(...swept.map((p) => Math.hypot(p.x - b0.door.x, p.z - b0.door.z)));
    expect(minDistToDoor).toBeLessThanOrEqual(1.2);
  });

  it("a path from the building's far side still detours all the way around to the door", () => {
    const farSide = { x: 35, z: 22 }; // east of the building — opposite its west-side door.
    const path = findPath(grid, farSide, { x: desk.x, z: desk.z });
    expect(path.length).toBeGreaterThan(0);
    const swept = sampleAlongPath(path, farSide);
    const minDistToDoor = Math.min(...swept.map((p) => Math.hypot(p.x - b0.door.x, p.z - b0.door.z)));
    expect(minDistToDoor).toBeLessThanOrEqual(1.2);

    // Confirm it's a real detour, not a lucky short route: walking all the
    // way around outside to the door dwarfs the straight-line distance a
    // wall-free path would have taken.
    let total = 0;
    let prev = farSide;
    for (const p of path) {
      total += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    const straight = Math.hypot(desk.x - farSide.x, desk.z - farSide.z);
    expect(total).toBeGreaterThan(straight * 1.5);
  });

  it("a path flanking the building from outside routes around it, never cutting through the room", () => {
    const north = { x: 22, z: 5 };
    const south = { x: 22, z: 39 };
    const path = findPath(grid, north, south);
    expect(path.length).toBeGreaterThan(0);
    const swept = sampleAlongPath(path, north);
    // Shrunk by 1 unit on every side — comfortably inside the wall ring, so
    // any sample landing here means the route actually cut through the
    // room's interior instead of detouring around the building.
    const shrunk = { x: b0.rect.x, z: b0.rect.z, w: b0.rect.w - 2, d: b0.rect.d - 2 };
    for (const p of swept) {
      const inside = Math.abs(p.x - shrunk.x) < shrunk.w / 2 && Math.abs(p.z - shrunk.z) < shrunk.d / 2;
      expect(inside).toBe(false);
    }
  });

  it("a small (6x5, minimum placeable) building's single desk stays reachable through its door", () => {
    const rect = { x: 0, z: 32, w: 6, d: 5 }; // clear of the seeded plots and scatter for this seed.
    const desks = buildingDesks({ id: "small", x: rect.x, z: rect.z, w: rect.w, d: rect.d, roomId: null });
    expect(desks).toHaveLength(1); // floor((6-2)/3.5)=1 col * floor((5-2)/3)=1 row
    const small = { plotIndex: 99, rect, desks, door: nearestEdgeDoor(rect) };
    const smallGrid = buildNavGrid(layout, [...buildings, small]);

    const path = findPath(smallGrid, { x: 0, z: 15 }, { x: desks[0]!.x, z: desks[0]!.z });
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1]!;
    expect(Math.hypot(last.x - desks[0]!.x, last.z - desks[0]!.z)).toBeLessThanOrEqual(2);
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
    // pine[0] sits inside plot 0's footprint for this seed (M5 T3: buildings
    // now have walls) — its ±4 probe points would route through the door
    // instead of taking a small pine-only detour, which isn't what this test
    // is about. pine[1] is confirmed clear of every plot (and its immediate
    // straight-line path is otherwise obstacle-free for this seed).
    const openFieldPine = layout.scatter.treePine[1]!;
    const from = { x: openFieldPine.x - 4, z: openFieldPine.z };
    const to = { x: openFieldPine.x + 4, z: openFieldPine.z };
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
