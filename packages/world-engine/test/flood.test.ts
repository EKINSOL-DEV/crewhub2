/* Round 61 (S5): the engine's one breadth-first fill. Its callers lean on four things: the order a cell is met in, the
   cell it was reached from (a step count), that a visitor can stop it, and that it never walks onto a blocked cell. */
import assert from "node:assert/strict";
import test from "node:test";
import { flood } from "../src/flood.ts";

const OPEN = -1;
const grid = { width: 3, depth: 3 };
const openGrid = () => new Int32Array(9).fill(OPEN);
/** The cell index of (x, z) on the 3 x 3 grid. */
const at = (x: number, z: number) => z * grid.width + x;

function met(blocked: Int32Array, origin: { x: number; z: number }): [number, number][] {
  const cells: [number, number][] = [];
  flood(grid, blocked, origin, (id, from) => {
    cells.push([id, from]);
  });
  return cells;
}

test("from the middle: the origin first, then north, east, south, west, each with the cell it was reached from", () => {
  const middle = at(1, 1);
  assert.deepEqual(met(openGrid(), { x: 1, z: 1 }).slice(0, 5), [
    [middle, -1],
    [at(1, 0), middle],
    [at(2, 1), middle],
    [at(1, 2), middle],
    [at(0, 1), middle],
  ]);
});

test("every open cell once, breadth first: no cell further out is met before a nearer one", () => {
  const cells = met(openGrid(), { x: 0, z: 0 });
  assert.equal(new Set(cells.map(([id]) => id)).size, 9);
  const steps = new Map<number, number>();
  for (const [id, from] of cells) steps.set(id, from === -1 ? 0 : steps.get(from)! + 1);
  assert.deepEqual(cells.map(([id]) => steps.get(id)), [0, 1, 1, 2, 2, 2, 3, 3, 4]);
});

test("blocked cells are not walked onto, and what lies behind them is not reached; the answer is the cells met", () => {
  const blocked = openGrid();
  // A wall across the middle row: the top row alone is reachable from its corner.
  for (const x of [0, 1, 2]) blocked[at(x, 1)] = 7;
  const seen = flood(grid, blocked, { x: 0, z: 0 });
  assert.deepEqual([...seen], [1, 1, 1, 0, 0, 0, 0, 0, 0]);
});

test("the grid's edges do not wrap: from a row's end the next cell is not its east neighbour", () => {
  const blocked = openGrid();
  blocked[at(1, 0)] = 7;
  blocked[at(2, 1)] = 7;
  // (2, 0) is shut in by (1, 0) and (2, 1); (0, 1), the next index along, must stay out of reach.
  assert.deepEqual(met(blocked, { x: 2, z: 0 }), [[at(2, 0), -1]]);
});

test("a blocked origin is still where it starts: the fill walks out of it, and never back on", () => {
  const blocked = openGrid();
  blocked[at(1, 1)] = 7;
  const cells = met(blocked, { x: 1, z: 1 }).map(([id]) => id);
  assert.equal(cells[0], at(1, 1));
  assert.equal(cells.filter((id) => id === at(1, 1)).length, 1);
  assert.equal(cells.length, 9);
});

test("a visitor that answers true stops the fill there", () => {
  const cells: number[] = [];
  flood(grid, openGrid(), { x: 1, z: 1 }, (id) => {
    cells.push(id);
    return cells.length === 3;
  });
  assert.deepEqual(cells, [at(1, 1), at(1, 0), at(2, 1)]);
});
