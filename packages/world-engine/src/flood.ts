/**
 * The engine's breadth-first fill over a grid's cells, through the four neighbours in north, east, south, west order
 * (north is -z). Cells are their index on the grid (`z * width + x`); open is -1 in `blocked`, as the occupancy reads it.
 */
import type { Cell, GridSpec } from "./index.ts";

/**
 * Fills from `origin`, and answers 1 for each cell it met. The origin is always met, blocked or not; no other blocked
 * cell is. `visit` is told each cell as it is met, nearest first, with the cell it was reached from (-1 for the origin),
 * and stops the fill by answering true.
 */
export function flood(grid: Pick<GridSpec, "width" | "depth">, blocked: Int32Array, origin: Cell, visit?: (id: number, from: number) => boolean | void): Uint8Array {
  const { width, depth } = grid;
  const seen = new Uint8Array(width * depth);
  const queue = new Int32Array(width * depth);
  const first = origin.z * width + origin.x;
  seen[first] = 1;
  queue[0] = first;
  if (visit?.(first, -1)) return seen;
  let write = 1;
  /** Meets `next` if it is open and new; true if the visitor stops the fill there. */
  const meet = (next: number, from: number): boolean => {
    if (seen[next] || blocked[next] !== -1) return false;
    seen[next] = 1;
    queue[write++] = next;
    return visit?.(next, from) === true;
  };
  for (let read = 0; read < write; read++) {
    const id = queue[read]!;
    const x = id % width;
    if (id >= width && meet(id - width, id)) break;
    if (x < width - 1 && meet(id + 1, id)) break;
    if (id + width < width * depth && meet(id + width, id)) break;
    if (x > 0 && meet(id - 1, id)) break;
  }
  return seen;
}
