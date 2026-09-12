/** Headless grid model. No renderer, timers, sockets, or AI. */
export interface Cell {
  x: number;
  z: number;
}
export interface GridSpec {
  width: number;
  depth: number;
  cellSize: number;
}
export type Rotation = 0 | 1 | 2 | 3;
export interface PropDefinition {
  id: string;
  label: string;
  footprint: { width: number; depth: number };
  blocksMovement: boolean;
  tags: readonly string[];
  approaches: readonly Cell[];
}
export interface WorldProp {
  id: string;
  definitionId: string;
  cell: Cell;
  rotation: Rotation;
}
export interface WorldLayout {
  version: 1;
  grid: GridSpec;
  props: readonly WorldProp[];
  entrance: Cell;
}
export interface Actor {
  id: string;
  cell: Cell;
  next: Cell | null;
  progress: number;
  path: Cell[];
  destination: Cell | null;
}
export type Placement = { ok: true } | { ok: false; reason: string };
export type Definitions = Readonly<Record<string, PropDefinition>>;
export const cellKey = (c: Cell): string => `${c.x},${c.z}`;
export const sameCell = (a: Cell, b: Cell): boolean =>
  a.x === b.x && a.z === b.z;
export const inBounds = (g: GridSpec, c: Cell): boolean =>
  Number.isInteger(c.x) &&
  Number.isInteger(c.z) &&
  c.x >= 0 &&
  c.z >= 0 &&
  c.x < g.width &&
  c.z < g.depth;

export function rotateOffset(c: Cell, def: PropDefinition, r: Rotation): Cell {
  const { width: w, depth: d } = def.footprint;
  switch (r) {
    case 0:
      return { ...c };
    case 1:
      return { x: d - 1 - c.z, z: c.x };
    case 2:
      return { x: w - 1 - c.x, z: d - 1 - c.z };
    case 3:
      return { x: c.z, z: w - 1 - c.x };
  }
}
export function propCells(p: WorldProp, defs: Definitions): Cell[] {
  const def = defs[p.definitionId];
  if (!def) throw new Error(`Unknown prop definition: ${p.definitionId}`);
  const cells: Cell[] = [];
  for (let z = 0; z < def.footprint.depth; z++)
    for (let x = 0; x < def.footprint.width; x++) {
      const c = rotateOffset({ x, z }, def, p.rotation);
      cells.push({ x: p.cell.x + c.x, z: p.cell.z + c.z });
    }
  return cells;
}
export function approachCells(p: WorldProp, defs: Definitions): Cell[] {
  const def = defs[p.definitionId];
  if (!def) return [];
  return def.approaches.map((c) => {
    const v = rotateOffset(c, def, p.rotation);
    return { x: p.cell.x + v.x, z: p.cell.z + v.z };
  });
}
/** Dense occupancy, O(1) lookup. -1 is empty; values index props. */
export function occupancy(l: WorldLayout, defs: Definitions): Int32Array {
  const cells = new Int32Array(l.grid.width * l.grid.depth).fill(-1);
  l.props.forEach((p, i) => {
    if (defs[p.definitionId]?.blocksMovement)
      for (const c of propCells(p, defs))
        if (inBounds(l.grid, c)) cells[c.z * l.grid.width + c.x] = i;
  });
  return cells;
}
/** Deterministic 4-neighbor A*, with no diagonal corner cutting. Includes both ends. */
export function findPath(
  g: GridSpec,
  blocked: Int32Array,
  start: Cell,
  goal: Cell,
  reserved = new Set<string>(),
): Cell[] | null {
  if (
    !inBounds(g, start) ||
    !inBounds(g, goal) ||
    blocked.length !== g.width * g.depth
  )
    return null;
  const index = (c: Cell) => c.z * g.width + c.x;
  const s = index(start),
    end = index(goal);
  if (blocked[s] !== -1 || blocked[end] !== -1 || reserved.has(cellKey(goal)))
    return null;
  if (s === end) return [{ ...start }];
  const cost = new Float64Array(blocked.length).fill(Infinity),
    previous = new Int32Array(blocked.length).fill(-1);
  const closed = new Uint8Array(blocked.length),
    inOpen = new Uint8Array(blocked.length),
    open = [s];
  cost[s] = 0;
  inOpen[s] = 1;
  const h = (id: number) =>
    Math.abs((id % g.width) - goal.x) +
    Math.abs(Math.floor(id / g.width) - goal.z);
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++)
      if (cost[open[i]!]! + h(open[i]!) < cost[open[best]!]! + h(open[best]!))
        best = i;
    const current = open.splice(best, 1)[0]!;
    inOpen[current] = 0;
    if (current === end) {
      const result: Cell[] = [];
      for (let id = end; id !== -1; id = previous[id]!)
        result.push({ x: id % g.width, z: Math.floor(id / g.width) });
      return result.reverse();
    }
    closed[current] = 1;
    const x = current % g.width,
      z = Math.floor(current / g.width);
    for (const c of [
      { x, z: z - 1 },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x - 1, z },
    ]) {
      if (!inBounds(g, c) || reserved.has(cellKey(c))) continue;
      const n = index(c);
      if (blocked[n] !== -1 || closed[n] || cost[current]! + 1 >= cost[n]!)
        continue;
      cost[n] = cost[current]! + 1;
      previous[n] = current;
      if (!inOpen[n]) {
        open.push(n);
        inOpen[n] = 1;
      }
    }
  }
  return null;
}
/** One flood fill validates every interaction cell, instead of repeated path searches. */
function reachableCells(
  g: GridSpec,
  blocked: Int32Array,
  start: Cell,
): Uint8Array {
  const visited = new Uint8Array(blocked.length),
    queue = new Int32Array(blocked.length);
  const first = start.z * g.width + start.x;
  if (blocked[first] !== -1) return visited;
  let read = 0,
    write = 1;
  queue[0] = first;
  visited[first] = 1;
  while (read < write) {
    const id = queue[read++]!,
      x = id % g.width,
      z = Math.floor(id / g.width);
    for (const c of [
      { x: x - 1, z },
      { x: x + 1, z },
      { x, z: z - 1 },
      { x, z: z + 1 },
    ]) {
      if (!inBounds(g, c)) continue;
      const next = c.z * g.width + c.x;
      if (!visited[next] && blocked[next] === -1) {
        visited[next] = 1;
        queue[write++] = next;
      }
    }
  }
  return visited;
}
export function validateLayout(value: unknown, defs: Definitions): WorldLayout {
  if (!value || typeof value !== "object")
    throw new Error("A layout must be an object.");
  const l = value as WorldLayout;
  if (
    l.version !== 1 ||
    !l.grid ||
    !Number.isInteger(l.grid.width) ||
    !Number.isInteger(l.grid.depth) ||
    l.grid.width < 1 ||
    l.grid.depth < 1 ||
    l.grid.width > 128 ||
    l.grid.depth > 128 ||
    !Number.isFinite(l.grid.cellSize) ||
    l.grid.cellSize < 0.1 ||
    l.grid.cellSize > 10 ||
    !Array.isArray(l.props) ||
    !l.entrance ||
    !inBounds(l.grid, l.entrance)
  )
    throw new Error("Invalid grid or layout version.");
  const ids = new Set<string>(),
    occupied = new Set<string>();
  for (const p of l.props) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      ids.has(p.id) ||
      !Object.hasOwn(defs, p.definitionId) ||
      ![0, 1, 2, 3].includes(p.rotation) ||
      !p.cell ||
      !inBounds(l.grid, p.cell)
    )
      throw new Error("Invalid prop identity or definition.");
    ids.add(p.id);
    for (const c of propCells(p, defs)) {
      if (!inBounds(l.grid, c) || occupied.has(cellKey(c)))
        throw new Error("Props overlap or extend beyond the grid.");
      occupied.add(cellKey(c));
    }
  }
  if (occupancy(l, defs)[l.entrance.z * l.grid.width + l.entrance.x] !== -1)
    throw new Error("Keep the entrance open.");
  return structuredClone(l);
}
/** Compact semantics for future tool consumers; never exposes meshes or screen pixels. */
export function describeWorld(l: WorldLayout, defs: Definitions) {
  return {
    version: l.version,
    grid: { ...l.grid },
    entrance: { ...l.entrance },
    props: l.props.map((p) => ({
      ...structuredClone(p),
      label: defs[p.definitionId]!.label,
      blocksMovement: defs[p.definitionId]!.blocksMovement,
      occupiedCells: propCells(p, defs),
      tags: [...defs[p.definitionId]!.tags],
      approaches: approachCells(p, defs).filter((c) => inBounds(l.grid, c)),
    })),
  };
}
/** Movement reserves both segment ends. Validated layout edits are atomic. */
export class WorldSimulation {
  layout: WorldLayout;
  readonly actors: Actor[];
  readonly definitions: Definitions;
  revision = 0;
  #occupied: Int32Array;
  constructor(
    layout: WorldLayout,
    defs: Definitions,
    actors: { id: string; cell: Cell }[],
  ) {
    this.definitions = defs;
    this.layout = validateLayout(layout, defs);
    this.#occupied = occupancy(this.layout, defs);
    const used = new Set<string>(),
      ids = new Set<string>();
    this.actors = actors.map((a) => {
      if (
        !a.id ||
        ids.has(a.id) ||
        !inBounds(layout.grid, a.cell) ||
        this.#occupied[a.cell.z * layout.grid.width + a.cell.x] !== -1 ||
        used.has(cellKey(a.cell))
      )
        throw new Error("Actors need unique IDs and open cells.");
      used.add(cellKey(a.cell));
      ids.add(a.id);
      return {
        id: a.id,
        cell: { ...a.cell },
        next: null,
        progress: 0,
        path: [],
        destination: null,
      };
    });
  }
  reservations(except?: string): Set<string> {
    const cells = new Set<string>();
    for (const a of this.actors)
      if (a.id !== except) {
        cells.add(cellKey(a.cell));
        if (a.next) cells.add(cellKey(a.next));
      }
    return cells;
  }
  route(id: string, target: Cell): Placement {
    const a = this.actors.find((v) => v.id === id);
    if (!a) return { ok: false, reason: "Choose a crew member first." };
    const path = findPath(
      this.layout.grid,
      this.#occupied,
      a.next ?? a.cell,
      target,
      this.reservations(id),
    );
    if (!path)
      return {
        ok: false,
        reason: "That cell cannot be reached. Try an open walkway.",
      };
    a.path = path.slice(1);
    a.destination = { ...target };
    this.revision++;
    return { ok: true };
  }
  tick(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, 0.1);
    for (const a of this.actors) {
      let distance = dt * 2.8;
      while (distance > 1e-9) {
        if (
          !a.next &&
          a.path.length &&
          !this.reservations(a.id).has(cellKey(a.path[0]!))
        ) {
          a.next = a.path.shift()!;
          a.progress = 0;
        }
        if (!a.next) break;
        const step = Math.min(1 - a.progress, distance);
        a.progress += step;
        distance -= step;
        if (a.progress >= 1 - 1e-9) {
          a.cell = a.next;
          a.next = null;
          a.progress = 0;
        }
      }
    }
  }
  placement(prop: WorldProp): Placement {
    let next: WorldLayout;
    try {
      next = validateLayout(
        {
          ...this.layout,
          props: [...this.layout.props.filter((p) => p.id !== prop.id), prop],
        },
        this.definitions,
      );
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : "Invalid placement.",
      };
    }
    const reserved = this.reservations();
    if (propCells(prop, this.definitions).some((c) => reserved.has(cellKey(c))))
      return { ok: false, reason: "A crew member is using that cell." };
    const blocked = occupancy(next, this.definitions);
    const reachable = reachableCells(next.grid, blocked, next.entrance);
    const canReach = (c: Cell) =>
      inBounds(next.grid, c) && reachable[c.z * next.grid.width + c.x] === 1;
    for (const a of this.actors)
      if (!canReach(a.next ?? a.cell))
        return {
          ok: false,
          reason: "Keep a path from every crew member to the entrance.",
        };
    for (const p of next.props) {
      const approaches = approachCells(p, this.definitions);
      if (approaches.length && !approaches.some(canReach))
        return {
          ok: false,
          reason: "Keep workstation interaction cells reachable.",
        };
    }
    return { ok: true };
  }
  place(prop: WorldProp): Placement {
    const result = this.placement(prop);
    if (!result.ok) return result;
    this.layout = {
      ...this.layout,
      props: [
        ...this.layout.props.filter((p) => p.id !== prop.id),
        structuredClone(prop),
      ],
    };
    this.#occupied = occupancy(this.layout, this.definitions);
    for (const a of this.actors)
      if (a.destination) {
        const path = findPath(
          this.layout.grid,
          this.#occupied,
          a.next ?? a.cell,
          a.destination,
          this.reservations(a.id),
        );
        a.path = path?.slice(1) ?? [];
        if (!path) a.destination = null;
      }
    this.revision++;
    return { ok: true };
  }
  position(a: Actor): Cell {
    return {
      x: a.cell.x + ((a.next?.x ?? a.cell.x) - a.cell.x) * a.progress,
      z: a.cell.z + ((a.next?.z ?? a.cell.z) - a.cell.z) * a.progress,
    };
  }
  snapshot() {
    return {
      ...describeWorld(this.layout, this.definitions),
      actors: this.actors.map((a) => ({
        id: a.id,
        cell: { ...a.cell },
        next: a.next && { ...a.next },
        destination: a.destination && { ...a.destination },
      })),
    };
  }
}
