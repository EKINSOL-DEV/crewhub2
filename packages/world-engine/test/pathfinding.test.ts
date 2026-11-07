import test from "node:test";
import assert from "node:assert/strict";
import {
  cellKey,
  findPath,
  findPathWeighted,
  inBounds,
  type Cell,
  type GridSpec,
} from "../src/index.ts";
import { MinHeap } from "../src/heap.ts";
import { random } from "./fixtures/random.ts";

/** The original open-list A*, kept verbatim as the reference for the heap version. */
function legacyFindPath(
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

function randomGrid(seed: number) {
  const rng = random(seed);
  const g: GridSpec = {
    width: 8 + Math.floor(rng() * 40),
    depth: 8 + Math.floor(rng() * 40),
    cellSize: 1,
  };
  const density = 0.1 + rng() * 0.3;
  const blocked = new Int32Array(g.width * g.depth).fill(-1);
  for (let i = 0; i < blocked.length; i++) if (rng() < density) blocked[i] = 0;
  const cell = (): Cell => ({
    x: Math.floor(rng() * g.width),
    z: Math.floor(rng() * g.depth),
  });
  const reserved = new Set<string>();
  for (let i = 0; i < 6; i++) reserved.add(cellKey(cell()));
  return { g, blocked, cell, reserved };
}

test("heap A* returns exactly the legacy open-list paths on random seeded grids", () => {
  let found = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const { g, blocked, cell, reserved } = randomGrid(seed);
    for (let i = 0; i < 8; i++) {
      const start = cell(),
        goal = cell(),
        withReserved = i % 2 ? reserved : new Set<string>();
      const expected = legacyFindPath(g, blocked, start, goal, withReserved);
      const actual = findPath(g, blocked, start, goal, withReserved);
      assert.deepEqual(actual, expected, `seed ${seed} query ${i}`);
      assert.equal(actual?.length, expected?.length);
      if (actual) found++;
    }
  }
  assert.ok(found > 300, `only ${found} solvable queries`);
});

test("weighted A* with unit costs matches A*, forbids null cells, and detours around expensive ones", () => {
  for (let seed = 200; seed < 240; seed++) {
    const { g, blocked, cell } = randomGrid(seed);
    const start = cell(),
      goal = cell();
    assert.deepEqual(
      findPathWeighted(g, blocked, start, goal, () => 1),
      findPath(g, blocked, start, goal),
    );
  }
  const g: GridSpec = { width: 7, depth: 3, cellSize: 1 };
  const open = new Int32Array(21).fill(-1);
  const start = { x: 0, z: 1 },
    goal = { x: 6, z: 1 };
  const expensive = (c: Cell) => (c.x === 3 && c.z === 1 ? 10 : 1);
  const detour = findPathWeighted(g, open, start, goal, expensive)!;
  assert.equal(detour.length, 9);
  assert.ok(!detour.some((c) => c.x === 3 && c.z === 1));
  const cheap = (c: Cell) => (c.x === 3 && c.z === 1 ? 2 : 1);
  assert.equal(findPathWeighted(g, open, start, goal, cheap)!.length, 7);
  const wall = (c: Cell) => (c.x === 3 ? null : 1);
  assert.equal(findPathWeighted(g, open, start, goal, wall), null);
  assert.equal(
    findPathWeighted(g, open, start, goal, (c) => (c.x === 6 ? null : 1)),
    null,
  );
});

test("the heap pops by priority, then by tie, whatever the insertion order", () => {
  const rng = random(7);
  const heap = new MinHeap();
  const entries: [number, number][] = [];
  for (let i = 0; i < 500; i++) {
    const entry: [number, number] = [
      Math.floor(rng() * 20),
      Math.floor(rng() * 1000),
    ];
    entries.push(entry);
    heap.push(entry[0], entry[1], i);
  }
  const order = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e[0] - b.e[0] || a.e[1] - b.e[1] || a.i - b.i);
  const popped: number[][] = [];
  while (heap.size) popped.push(entries[heap.pop()]!);
  assert.deepEqual(
    popped,
    order.map((o) => o.e),
  );
  assert.equal(heap.pop(), -1);
});
