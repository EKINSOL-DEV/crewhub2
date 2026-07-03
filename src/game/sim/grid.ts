// Sim nav grid + A* pathfinding (M1 T5) — pure TS, no three.js, no clock,
// no RNG. Blocks a coarse 1-unit cell per obstacle placement (fountain,
// trees, rocks, pavilion pillars, desks) and finds smoothed walking routes
// for the campus sim's characters.
import type { Building } from "@/game/world/campus/buildings";
import { CAMPUS, type CampusLayout, type ScatterKind } from "@/game/world/campus/layout";

export interface NavGrid {
  /** Cells per side. */
  size: number;
  /** World units per cell. */
  cell: number;
  /** Row-major, `blocked[z * size + x]`; 1 = obstacle, 0 = walkable. */
  blocked: Uint8Array;
}

/** Scatter kinds that stand tall enough to block a robot's path. */
const BLOCKING_SCATTER: ScatterKind[] = [
  "treeDefault",
  "treeOak",
  "treeDetailed",
  "treeFat",
  "treePine",
  "rockLarge",
];

const FOUNTAIN_RADIUS = 5;

function worldToCell(v: number, grid: NavGrid): number {
  return Math.floor(v / grid.cell + grid.size / 2);
}

function cellToWorld(c: number, grid: NavGrid): number {
  return (c + 0.5 - grid.size / 2) * grid.cell;
}

function clampCell(c: number, grid: NavGrid): number {
  return Math.min(grid.size - 1, Math.max(0, c));
}

function cellX(idx: number, grid: NavGrid): number {
  return idx % grid.size;
}

function cellZ(idx: number, grid: NavGrid): number {
  return Math.floor(idx / grid.size);
}

function idxOf(cx: number, cz: number, grid: NavGrid): number {
  return cz * grid.size + cx;
}

export function buildNavGrid(
  layout: CampusLayout,
  buildings: Building[],
  extras?: { items?: { x: number; z: number }[]; skipKinds?: ScatterKind[] },
): NavGrid {
  const size = CAMPUS.half * 2;
  const grid: NavGrid = { size, cell: 1, blocked: new Uint8Array(size * size) };

  const block = (x: number, z: number): void => {
    const cx = clampCell(worldToCell(x, grid), grid);
    const cz = clampCell(worldToCell(z, grid), grid);
    grid.blocked[idxOf(cx, cz, grid)] = 1;
  };

  // Fountain disc at the plaza center.
  for (let cz = 0; cz < size; cz++) {
    for (let cx = 0; cx < size; cx++) {
      const x = cellToWorld(cx, grid);
      const z = cellToWorld(cz, grid);
      if (Math.hypot(x, z) < FOUNTAIN_RADIUS) grid.blocked[idxOf(cx, cz, grid)] = 1;
    }
  }

  // Trees and large rocks — one blocked cell per placement, coarse is fine.
  // `skipKinds` (M4 debt sweep) opts a kind out entirely: some biomes don't
  // render every blocking kind (sky drops rockLarge/treePine/treeDetailed —
  // see biome.ts's `skip`), and blocking a cell campus renders as a tree
  // but sky renders as nothing was an invisible wall.
  const skipKinds = new Set(extras?.skipKinds ?? []);
  for (const kind of BLOCKING_SCATTER) {
    if (skipKinds.has(kind)) continue;
    for (const p of layout.scatter[kind]) block(p.x, p.z);
  }

  // Pavilion corner pillars and every desk.
  for (const b of buildings) {
    const { x, z, w, d } = b.rect;
    block(x - w / 2, z - d / 2);
    block(x + w / 2, z - d / 2);
    block(x - w / 2, z + d / 2);
    block(x + w / 2, z + d / 2);
    for (const desk of b.desks) block(desk.x, desk.z);
  }

  // Player-placed decor (M3 T5) blocks one cell each, same coarse treatment
  // as the seeded scatter above — a bench or lantern is just as solid to a
  // robot's pathing as a tree.
  for (const item of extras?.items ?? []) block(item.x, item.z);

  return grid;
}

/** BFS outward from a blocked cell to the nearest walkable one; `null` if none exists. */
function nearestWalkable(grid: NavGrid, startIdx: number): number | null {
  if (grid.blocked[startIdx] === 0) return startIdx;

  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const visited = new Set<number>([startIdx]);
  let frontier = [startIdx];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const idx of frontier) {
      const cx = cellX(idx, grid);
      const cz = cellZ(idx, grid);
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= grid.size || nz < 0 || nz >= grid.size) continue;
        const nIdx = idxOf(nx, nz, grid);
        if (visited.has(nIdx)) continue;
        visited.add(nIdx);
        if (grid.blocked[nIdx] === 0) return nIdx;
        next.push(nIdx);
      }
    }
    frontier = next;
  }
  return null;
}

/** 4-directional A* over walkable cells; `null` when the goal is unreachable. */
function aStar(grid: NavGrid, startIdx: number, goalIdx: number): number[] | null {
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const goalX = cellX(goalIdx, grid);
  const goalZ = cellZ(goalIdx, grid);
  const heuristic = (idx: number): number =>
    Math.abs(cellX(idx, grid) - goalX) + Math.abs(cellZ(idx, grid) - goalZ);

  const gScore = new Map<number, number>([[startIdx, 0]]);
  const fScore = new Map<number, number>([[startIdx, heuristic(startIdx)]]);
  const cameFrom = new Map<number, number>();
  const open = new Set<number>([startIdx]);

  while (open.size > 0) {
    let current = -1;
    let bestF = Infinity;
    for (const idx of open) {
      const f = fScore.get(idx) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = idx;
      }
    }
    if (current === goalIdx) {
      const path = [current];
      let node = current;
      while (cameFrom.has(node)) {
        node = cameFrom.get(node)!;
        path.unshift(node);
      }
      return path;
    }
    open.delete(current);

    const cx = cellX(current, grid);
    const cz = cellZ(current, grid);
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= grid.size || nz < 0 || nz >= grid.size) continue;
      const nIdx = idxOf(nx, nz, grid);
      if (grid.blocked[nIdx] !== 0) continue;
      const tentativeG = (gScore.get(current) ?? Infinity) + 1;
      if (tentativeG < (gScore.get(nIdx) ?? Infinity)) {
        cameFrom.set(nIdx, current);
        gScore.set(nIdx, tentativeG);
        fScore.set(nIdx, tentativeG + heuristic(nIdx));
        open.add(nIdx);
      }
    }
  }
  return null;
}

/**
 * Supercover line walk — true when no cell touched by the *continuous*
 * segment between a and b is blocked. Built on the integer Bresenham walk,
 * but a plain Bresenham jumps corner-to-corner on a diagonal step and
 * skips the two orthogonally-adjacent cells the real geometric line still
 * grazes; a "clear" diagonal could then cut through a blocked corner (e.g.
 * clip the fountain disc). So on every diagonal step we also check those
 * two intermediate cells before taking it.
 */
function hasLineOfSight(grid: NavGrid, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  let x0 = clampCell(worldToCell(a.x, grid), grid);
  let z0 = clampCell(worldToCell(a.z, grid), grid);
  const x1 = clampCell(worldToCell(b.x, grid), grid);
  const z1 = clampCell(worldToCell(b.z, grid), grid);

  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;

  for (;;) {
    if (grid.blocked[idxOf(x0, z0, grid)] !== 0) return false;
    if (x0 === x1 && z0 === z1) return true;
    const e2 = err * 2;
    const stepX = e2 > -dz;
    const stepZ = e2 < dx;
    if (stepX && stepZ) {
      // Diagonal step: (x0,z0) -> (x0+sx,z0+sz) skips (x0+sx,z0) and
      // (x0,z0+sz). Both stay in bounds — x0 and z0 move monotonically
      // toward the in-bounds x1/z1, so a single step can't overshoot them.
      if (grid.blocked[idxOf(x0 + sx, z0, grid)] !== 0) return false;
      if (grid.blocked[idxOf(x0, z0 + sz, grid)] !== 0) return false;
    }
    if (stepX) {
      err -= dz;
      x0 += sx;
    }
    if (stepZ) {
      err += dx;
      z0 += sz;
    }
  }
}

/** Greedy string-pulling: drop a waypoint whenever its neighbors already see each other. */
function smoothPath(grid: NavGrid, points: { x: number; z: number }[]): { x: number; z: number }[] {
  if (points.length <= 2) return points;
  const result = [points[0]!];
  let anchor = 0;
  for (let i = 1; i < points.length - 1; i++) {
    if (!hasLineOfSight(grid, points[anchor]!, points[i + 1]!)) {
      result.push(points[i]!);
      anchor = i;
    }
  }
  result.push(points[points.length - 1]!);
  return result;
}

export function findPath(
  grid: NavGrid,
  from: { x: number; z: number },
  to: { x: number; z: number },
): { x: number; z: number }[] {
  const half = grid.size / 2;
  const inBounds = (v: number): boolean => Math.abs(v) <= half;
  if (!inBounds(from.x) || !inBounds(from.z) || !inBounds(to.x) || !inBounds(to.z)) return [];

  let startIdx = idxOf(
    clampCell(worldToCell(from.x, grid), grid),
    clampCell(worldToCell(from.z, grid), grid),
    grid,
  );
  let goalIdx = idxOf(
    clampCell(worldToCell(to.x, grid), grid),
    clampCell(worldToCell(to.z, grid), grid),
    grid,
  );

  const snappedStart = nearestWalkable(grid, startIdx);
  const snappedGoal = nearestWalkable(grid, goalIdx);
  if (snappedStart === null || snappedGoal === null) return [];
  startIdx = snappedStart;
  goalIdx = snappedGoal;

  if (startIdx === goalIdx) {
    return [{ x: cellToWorld(cellX(goalIdx, grid), grid), z: cellToWorld(cellZ(goalIdx, grid), grid) }];
  }

  const cellPath = aStar(grid, startIdx, goalIdx);
  if (cellPath === null) return [];

  const points = cellPath.map((idx) => ({
    x: cellToWorld(cellX(idx, grid), grid),
    z: cellToWorld(cellZ(idx, grid), grid),
  }));
  const smoothed = smoothPath(grid, points);
  return smoothed.slice(1); // drop the start — the character is already there.
}
