/**
 * The placement rules as one module (round 60, pk-P5): whether a prop may stand in a layout, and where one may. The
 * simulation asked this of itself before, with its actors; the page and the town document asked it through a
 * simulation with no actors, built for the one question. The rules stand on a layout alone now, and a simulation adds
 * its crew (the cells its actors hold and stand on) when it asks.
 *
 * The checks, in this order, with the reasons the page shows (`placementWords`): the layout with the prop in it is
 * valid whole (`validateLayout`'s own errors: an overlap, off the grid, the entrance blocked); no crew cell is taken;
 * every crew member and every prop's approach cells are still reachable from the entrance (one flood fill).
 */
import {
  approachCells,
  cellKey,
  inBounds,
  occupancy,
  propCells,
  validateLayout,
  type Cell,
  type Definitions,
  type GridSpec,
  type Placement,
  type Rotation,
  type WorldLayout,
  type WorldProp,
} from "./index.ts";

/** What a simulation with actors adds to a check: the cells they hold (current and next) and the ones they stand on. */
export interface Crew {
  reserved: ReadonlySet<string>;
  standing: readonly Cell[];
}

export interface PlacementRules {
  /** The layout the rules stand on, as validated (a detached copy). */
  readonly layout: WorldLayout;
  /** Whether `prop` may stand here, in place of any prop with its id. `crew`: a simulation's actors; none for a layout alone. */
  check(prop: WorldProp, crew?: Crew): Placement;
  /**
   * The cells where `propId`, turned by `rotation`, may stand, one at a time: row by row from the grid's origin, or
   * from its far corner back (`from: "end"`). A caller that wants the first stops after it: nothing is checked past
   * what it takes. An unknown prop fits nowhere.
   */
  freeCells(propId: string, rotation?: Rotation, from?: "origin" | "end"): Iterable<Cell>;
}

const NO_CREW: Crew = { reserved: new Set(), standing: [] };

/** The rules over `layout`; throws as `validateLayout` does when the layout itself is invalid. */
export function placementRules(layout: WorldLayout, defs: Definitions): PlacementRules {
  const valid = validateLayout(layout, defs);
  const check = (prop: WorldProp, crew: Crew = NO_CREW): Placement => {
    let next: WorldLayout;
    try {
      next = validateLayout({ ...valid, props: [...valid.props.filter((p) => p.id !== prop.id), prop] }, defs);
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "Invalid placement." };
    }
    if (propCells(prop, defs).some((c) => crew.reserved.has(cellKey(c)))) return { ok: false, reason: "A crew member is using that cell." };
    const reachable = reachableCells(next.grid, occupancy(next, defs), next.entrance);
    const canReach = (c: Cell) => inBounds(next.grid, c) && reachable[c.z * next.grid.width + c.x] === 1;
    for (const c of crew.standing) if (!canReach(c)) return { ok: false, reason: "Keep a path from every crew member to the entrance." };
    for (const p of next.props) {
      const approaches = approachCells(p, defs);
      if (approaches.length && !approaches.some(canReach)) return { ok: false, reason: "Keep workstation interaction cells reachable." };
    }
    return { ok: true };
  };
  return {
    layout: valid,
    check,
    *freeCells(propId, rotation = 0, from = "origin") {
      const { width, depth } = valid.grid;
      const cells = width * depth;
      for (let i = 0; i < cells; i++) {
        const at = from === "origin" ? i : cells - 1 - i;
        const cell = { x: at % width, z: Math.floor(at / width) };
        if (check({ id: "free-cell-probe", definitionId: propId, cell, rotation }).ok) yield cell;
      }
    },
  };
}

/** One flood fill from the entrance says which cells are reachable, instead of a path search per interaction cell. */
function reachableCells(g: GridSpec, blocked: Int32Array, start: Cell): Uint8Array {
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
