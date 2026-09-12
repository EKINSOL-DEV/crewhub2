import test from "node:test";
import assert from "node:assert/strict";
import {
  WorldSimulation,
  approachCells,
  cellKey,
  describeWorld,
  findPath,
  occupancy,
  propCells,
  validateLayout,
  type Definitions,
  type WorldLayout,
  type WorldProp,
} from "../src/index.ts";

const definitions: Definitions = {
  block: {
    id: "block",
    label: "Block",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["obstacle"],
    approaches: [],
  },
  desk: {
    id: "desk",
    label: "Desk",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["work"],
    approaches: [{ x: 1, z: 2 }],
  },
};
const block = (id: string, x: number, z: number): WorldProp => ({
  id,
  definitionId: "block",
  cell: { x, z },
  rotation: 0,
});
const room = (props: WorldProp[] = [], width = 8, depth = 8): WorldLayout => ({
  version: 1,
  grid: { width, depth, cellSize: 0.6 },
  entrance: { x: 0, z: depth - 1 },
  props,
});
const advance = (sim: WorldSimulation, ticks = 300) => {
  for (let i = 0; i < ticks; i++) sim.tick(0.05);
};

test("non-square footprints and interaction offsets rotate together around the grid anchor", () => {
  const p: WorldProp = {
    id: "desk",
    definitionId: "desk",
    cell: { x: 2, z: 2 },
    rotation: 0,
  };
  const expected = [
    { extent: [3, 2], approach: { x: 3, z: 4 } },
    { extent: [2, 3], approach: { x: 1, z: 3 } },
    { extent: [3, 2], approach: { x: 3, z: 1 } },
    { extent: [2, 3], approach: { x: 4, z: 3 } },
  ];
  for (const rotation of [0, 1, 2, 3] as const) {
    const prop = { ...p, rotation },
      cells = propCells(prop, definitions),
      e = expected[rotation]!;
    assert.equal(new Set(cells.map(cellKey)).size, 6);
    assert.deepEqual(
      [
        Math.max(...cells.map((c) => c.x)) - 1,
        Math.max(...cells.map((c) => c.z)) - 1,
      ],
      e.extent,
    );
    assert.deepEqual(approachCells(prop, definitions), [e.approach]);
  }
});
test("layout input rejects malformed, overlapping, off-grid, duplicate, and unknown props", () => {
  for (const value of [
    null,
    {},
    { ...room(), version: 2 },
    { ...room(), grid: { width: 129, depth: 8, cellSize: 1 } },
    { ...room(), grid: { width: 8, depth: 8, cellSize: NaN } },
    room([block("a", 2, 2), block("b", 2, 2)]),
    room([block("a", 2, 2), block("a", 3, 2)]),
    room([block("a", -1, 0)]),
    room([{ ...block("a", 0, 0), definitionId: "toString" }]),
    room([block("a", 0, 7)]),
  ])
    assert.throws(() => validateLayout(value, definitions));
  const original = room([block("a", 2, 2)]),
    copy = validateLayout(original, definitions);
  copy.props[0]!.cell.x = 4;
  assert.equal(original.props[0]!.cell.x, 2);
});
test("A* finds a shortest four-way route around a barrier without corner cutting", () => {
  const l = room([block("a", 2, 0), block("b", 2, 1), block("c", 2, 2)], 5, 5);
  const path = findPath(
    l.grid,
    occupancy(l, definitions),
    { x: 0, z: 1 },
    { x: 4, z: 1 },
  );
  assert.ok(path);
  assert.equal(path.length, 9);
  for (let i = 1; i < path.length; i++)
    assert.equal(
      Math.abs(path[i]!.x - path[i - 1]!.x) +
        Math.abs(path[i]!.z - path[i - 1]!.z),
      1,
    );
  assert.deepEqual(
    path,
    findPath(l.grid, occupancy(l, definitions), { x: 0, z: 1 }, { x: 4, z: 1 }),
  );
});
test("unreachable, occupied, reserved, and invalid destinations return no route", () => {
  const l = room([block("a", 1, 0), block("b", 0, 1)]),
    blocked = occupancy(l, definitions);
  assert.equal(findPath(l.grid, blocked, { x: 0, z: 0 }, { x: 1, z: 1 }), null);
  assert.equal(findPath(l.grid, blocked, { x: 2, z: 2 }, { x: 1, z: 0 }), null);
  assert.equal(
    findPath(l.grid, blocked, { x: 2, z: 2 }, { x: 3, z: 2 }, new Set(["3,2"])),
    null,
  );
  assert.equal(findPath(l.grid, blocked, { x: 2, z: 2 }, { x: 8, z: 2 }), null);
  assert.deepEqual(findPath(l.grid, blocked, { x: 2, z: 2 }, { x: 2, z: 2 }), [
    { x: 2, z: 2 },
  ]);
});
test("movement holds both segment cells and cannot swap into another actor", () => {
  const sim = new WorldSimulation(room(), definitions, [
    { id: "a", cell: { x: 2, z: 2 } },
    { id: "b", cell: { x: 3, z: 2 } },
  ]);
  assert.equal(sim.route("a", { x: 3, z: 2 }).ok, false);
  assert.equal(sim.route("b", { x: 2, z: 2 }).ok, false);
  assert.equal(sim.route("a", { x: 2, z: 4 }).ok, true);
  sim.tick(0.05);
  assert.ok(sim.reservations().has("2,2"));
  assert.ok(sim.reservations().has("2,3"));
  assert.equal(sim.route("b", { x: 2, z: 3 }).ok, false);
  const position = sim.position(sim.actors[0]!);
  assert.ok(position.z > 2 && position.z < 3);
  advance(sim);
  assert.deepEqual(sim.actors[0]!.cell, { x: 2, z: 4 });
});
test("independently planned crossing routes never reserve the same segment cell", () => {
  const sim = new WorldSimulation(room(), definitions, [
    { id: "a", cell: { x: 1, z: 3 } },
    { id: "b", cell: { x: 3, z: 1 } },
  ]);
  sim.route("a", { x: 5, z: 3 });
  sim.route("b", { x: 3, z: 5 });
  for (let i = 0; i < 200; i++) {
    sim.tick(0.05);
    const ends = sim.actors
      .flatMap((a) => [a.cell, ...(a.next ? [a.next] : [])])
      .map(cellKey);
    assert.equal(new Set(ends).size, ends.length);
  }
  assert.deepEqual(
    sim.actors.map((a) => a.cell),
    [
      { x: 5, z: 3 },
      { x: 3, z: 5 },
    ],
  );
});
test("retargeting mid-step preserves the active segment and routes from its end", () => {
  const sim = new WorldSimulation(room(), definitions, [
    { id: "a", cell: { x: 1, z: 1 } },
  ]);
  sim.route("a", { x: 5, z: 1 });
  sim.tick(0.05);
  const next = { ...sim.actors[0]!.next! },
    progress = sim.actors[0]!.progress;
  assert.equal(sim.route("a", { x: 1, z: 4 }).ok, true);
  assert.deepEqual(sim.actors[0]!.next, next);
  assert.equal(sim.actors[0]!.progress, progress);
  advance(sim);
  assert.deepEqual(sim.actors[0]!.cell, { x: 1, z: 4 });
});
test("placement rejects occupied segment ends and does not mutate failed edits", () => {
  const sim = new WorldSimulation(room(), definitions, [
    { id: "a", cell: { x: 2, z: 2 } },
  ]);
  sim.route("a", { x: 2, z: 4 });
  sim.tick(0.05);
  const before = JSON.stringify(sim.snapshot()),
    revision = sim.revision;
  assert.equal(sim.place(block("new", 2, 2)).ok, false);
  assert.equal(sim.place(block("new", 2, 3)).ok, false);
  assert.equal(sim.place(block("new", 0, 7)).ok, false);
  assert.equal(JSON.stringify(sim.snapshot()), before);
  assert.equal(sim.revision, revision);
});
test("placement preserves actor escape paths and workstation interaction access", () => {
  const sim = new WorldSimulation(
    room([block("top", 1, 0), block("bottom", 1, 2), block("left", 0, 1)]),
    definitions,
    [{ id: "a", cell: { x: 1, z: 1 } }],
  );
  assert.equal(sim.place(block("trap", 2, 1)).ok, false);
  const desk: WorldProp = {
    id: "desk",
    definitionId: "desk",
    cell: { x: 2, z: 1 },
    rotation: 0,
  };
  const work = new WorldSimulation(room([desk]), definitions, []);
  assert.equal(work.place(block("no-access", 3, 3)).ok, false);
  assert.equal(work.place(block("fine", 5, 5)).ok, true);
});
test("moving props releases old occupancy and replans an existing route", () => {
  const sim = new WorldSimulation(room([block("movable", 6, 6)]), definitions, [
    { id: "a", cell: { x: 1, z: 1 } },
  ]);
  sim.route("a", { x: 5, z: 1 });
  assert.equal(sim.place(block("movable", 3, 1)).ok, true);
  assert.equal(
    sim.actors[0]!.path.some((c) => cellKey(c) === "3,1"),
    false,
  );
  assert.equal(occupancy(sim.layout, definitions)[6 * 8 + 6], -1);
  advance(sim);
  assert.deepEqual(sim.actors[0]!.cell, { x: 5, z: 1 });
  assert.equal(sim.layout.props.length, 1);
});
test("semantic snapshots are detached, serializable, and useful without a renderer", () => {
  const sim = new WorldSimulation(room([block("plant", 4, 4)]), definitions, [
    { id: "a", cell: { x: 1, z: 1 } },
  ]);
  const snapshot = sim.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.deepEqual(snapshot.props[0]!.tags, ["obstacle"]);
  assert.deepEqual(snapshot.props[0]!.occupiedCells, [{ x: 4, z: 4 }]);
  snapshot.actors[0]!.cell.x = 99;
  snapshot.props[0]!.cell.x = 99;
  snapshot.props[0]!.tags.push("changed");
  assert.equal(sim.actors[0]!.cell.x, 1);
  assert.equal(sim.layout.props[0]!.cell.x, 4);
  assert.deepEqual(describeWorld(sim.layout, definitions).props[0]!.tags, [
    "obstacle",
  ]);
});
test("invalid timing cannot teleport actors and duplicate spawns are rejected", () => {
  assert.throws(
    () =>
      new WorldSimulation(room(), definitions, [
        { id: "a", cell: { x: 0, z: 0 } },
        { id: "b", cell: { x: 0, z: 0 } },
      ]),
  );
  const sim = new WorldSimulation(room(), definitions, [
    { id: "a", cell: { x: 1, z: 1 } },
  ]);
  sim.route("a", { x: 5, z: 1 });
  sim.tick(NaN);
  sim.tick(-1);
  assert.equal(sim.actors[0]!.next, null);
  sim.tick(10000);
  assert.deepEqual(sim.actors[0]!.cell, { x: 1, z: 1 });
  assert.ok(sim.actors[0]!.progress <= 0.28);
});
test("movement covers the same distance across normal frame durations", () => {
  const run = (dt: number) => {
    const sim = new WorldSimulation(room([], 16, 8), definitions, [
      { id: "a", cell: { x: 1, z: 1 } },
    ]);
    sim.route("a", { x: 14, z: 1 });
    for (let i = 0; i < Math.round(2 / dt); i++) sim.tick(dt);
    return sim.position(sim.actors[0]!).x;
  };
  for (const dt of [0.025, 0.05, 0.1])
    assert.ok(Math.abs(run(dt) - 6.6) < 1e-8);
});
