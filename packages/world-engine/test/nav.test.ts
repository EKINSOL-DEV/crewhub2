import test from "node:test";
import assert from "node:assert/strict";
import {
  NavGraph,
  NavSimulation,
  SPEED_CELLS_PER_SECOND,
  WAIT_STEP_ASIDE_SECONDS,
  type Location,
  type WorldLayout,
  type WorldProp,
} from "../src/index.ts";
import {
  TOWN,
  buildCorridor,
  buildStressTown,
  stressDefinitions,
  type StressWorld,
} from "./fixtures/stressTown.ts";

const block = (x: number, z: number): WorldProp => ({
  id: `block-${x}-${z}`,
  definitionId: "block",
  cell: { x, z },
  rotation: 0,
});
const room = (
  width: number,
  depth: number,
  props: WorldProp[] = [],
): WorldLayout => ({
  version: 1,
  grid: { width, depth, cellSize: 0.6 },
  entrance: { x: 0, z: 0 },
  props,
});
const at = (room: string, x: number, z: number): Location => ({
  room,
  cell: { x, z },
});

/** Three 5 x 5 rooms: A-B and B-C doors cost 1, a direct A-C "staircase" costs 10. */
function threeRooms() {
  const graph = new NavGraph(stressDefinitions);
  for (const id of ["A", "B", "C"]) graph.addRoom({ id, layout: room(5, 5) });
  graph.addDoor({ id: "ab", a: at("A", 4, 2), b: at("B", 0, 2) });
  graph.addDoor({ id: "bc", a: at("B", 4, 2), b: at("C", 0, 2) });
  graph.addDoor({ id: "ac", a: at("A", 2, 4), b: at("C", 2, 4), cost: 10 });
  return graph;
}

/** Runs until every actor arrives, checking the safety invariants on every tick. */
function runChecked(world: StressWorld, sim: NavSimulation, maxSeconds: number) {
  const doorsAt = new Map<string, string[]>();
  for (const d of world.graph.doors())
    for (const s of [d.a, d.b]) {
      const key = `${s.room}|${s.cell.x},${s.cell.z}`;
      doorsAt.set(key, [...(doorsAt.get(key) ?? []), d.id]);
    }
  let seconds = 0;
  for (let i = 0; i < maxSeconds * 30; i++) {
    sim.tick(1 / 30);
    seconds += 1 / 30;
    const snapshot = sim.snapshot();
    const cells = new Set<string>();
    const doorUsers = new Map<string, Set<string>>();
    for (const a of snapshot.actors)
      for (const l of a.next ? [a.location, a.next] : [a.location]) {
        const key = `${l.room}|${l.cell.x},${l.cell.z}`;
        assert.ok(!cells.has(key), `two actors share ${key} at ${seconds}s`);
        cells.add(key);
        for (const door of doorsAt.get(key) ?? []) {
          const users = doorUsers.get(door) ?? new Set();
          users.add(a.id);
          doorUsers.set(door, users);
          assert.ok(users.size <= 1, `door ${door} has ${[...users]}`);
        }
      }
    if (snapshot.actors.every((a) => a.status === "arrived")) return seconds;
  }
  const late = sim
    .snapshot()
    .actors.filter((a) => a.status !== "arrived")
    .map((a) => `${a.id}:${a.status}`);
  assert.fail(`not everyone arrived within ${maxSeconds}s: ${late}`);
}

function start(world: StressWorld) {
  const sim = new NavSimulation(world.graph, world.actors);
  for (const [id, destination] of world.destinations)
    assert.equal(sim.setDestination(id, destination).ok, true);
  return sim;
}

test("routes cross rooms through the cheapest doors and plan only the first leg locally", () => {
  const graph = threeRooms();
  const before = graph.stats.localSearches;
  const plan = graph.planRoute(at("A", 1, 1), at("C", 3, 3))!;
  assert.deepEqual(
    plan.legs.map((l) => [l.room, l.viaDoor]),
    [
      ["A", "ab"],
      ["B", "bc"],
      ["C", null],
    ],
  );
  // 4 steps to the A door, 1 crossing, 4 across B, 1 crossing, 4 to the goal.
  assert.equal(plan.cost, 14);
  assert.equal(graph.stats.localSearches - before, 1);
  assert.deepEqual(plan.path[0], { x: 1, z: 1 });
  assert.deepEqual(plan.path.at(-1), { x: 4, z: 2 });
  assert.equal(plan.path.length, 5);
  graph.removeDoor("ab");
  const stairs = graph.planRoute(at("A", 1, 1), at("C", 3, 3))!;
  assert.deepEqual(
    stairs.legs.map((l) => l.room),
    ["A", "C"],
  );
  assert.equal(stairs.cost, 4 + 10 + 2);
  graph.removeDoor("ac");
  assert.equal(graph.planRoute(at("A", 1, 1), at("C", 3, 3)), null);
});

test("door-to-door distances are cached per room revision", () => {
  const graph = threeRooms();
  graph.planRoute(at("A", 1, 1), at("C", 3, 3));
  const misses = graph.stats.cacheMisses,
    hits = graph.stats.cacheHits;
  graph.planRoute(at("A", 0, 0), at("C", 4, 4));
  assert.equal(graph.stats.cacheMisses, misses);
  assert.ok(graph.stats.cacheHits > hits);
  graph.updateRoom("B", room(5, 5, [block(2, 2)]));
  assert.equal(graph.room("B")!.revision, 1);
  const detour = graph.planRoute(at("A", 1, 1), at("C", 3, 3))!;
  // Only the fields of B's door sides were recomputed.
  assert.ok(graph.stats.cacheMisses - misses <= 2);
  assert.equal(detour.cost, 16);
  assert.throws(() => graph.updateRoom("B", room(5, 5, [block(0, 2)])));
  assert.throws(() =>
    graph.addDoor({ id: "bad", a: at("A", 9, 9), b: at("B", 0, 0) }),
  );
});

test("crossing a door takes its cost in cells at walking speed", () => {
  const graph = threeRooms();
  graph.removeDoor("ab");
  const sim = new NavSimulation(graph, [{ id: "a", location: at("A", 2, 3) }]);
  sim.setDestination("a", at("C", 2, 3));
  let seconds = 0;
  while (sim.actor("a")!.status !== "arrived" && seconds < 20) {
    sim.tick(0.05);
    seconds += 0.05;
  }
  // One step onto the door, the 10-cell staircase, one step off.
  const expected = 12 / SPEED_CELLS_PER_SECOND;
  assert.ok(Math.abs(seconds - expected) < 0.06, `${seconds} vs ${expected}`);
  assert.equal(
    sim.setDestination("a", at("C", 2, 4)).ok,
    false,
    "door cells are not destinations",
  );
});

test("an idle actor in a one-cell passage steps aside after the wait budget", () => {
  // Row 0 is the only lane; (3, 1) is a niche next to it.
  const lane = room(
    7,
    2,
    [0, 1, 2, 4, 5, 6].map((x) => block(x, 1)),
  );
  const graph = new NavGraph(stressDefinitions);
  graph.addRoom({ id: "hall", layout: lane });
  const sim = new NavSimulation(graph, [
    { id: "walker", location: at("hall", 0, 0) },
    { id: "idle", location: at("hall", 3, 0), priority: 5 },
  ]);
  sim.setDestination("walker", at("hall", 6, 0));
  let seconds = 0;
  while (sim.actor("walker")!.status !== "arrived" && seconds < 20) {
    sim.tick(1 / 30);
    seconds += 1 / 30;
    assert.ok(sim.actor("walker")!.waiting <= WAIT_STEP_ASIDE_SECONDS);
  }
  assert.equal(sim.actor("walker")!.status, "arrived");
  assert.deepEqual(sim.actor("idle")!.location.cell, { x: 3, z: 1 });
  assert.equal(sim.stats.stepAsides, 1);
  assert.equal(sim.stats.waitReplans, 1);
  // Walk to the blocker, wait the budget, then pass.
  assert.ok(seconds > WAIT_STEP_ASIDE_SECONDS && seconds < 9);
});

test("a moved prop replans only the actors whose path crosses it, once per tick", () => {
  const graph = new NavGraph(stressDefinitions);
  graph.addRoom({ id: "hall", layout: room(10, 6) });
  const sim = new NavSimulation(graph, [
    { id: "crossing", location: at("hall", 0, 2) },
    { id: "elsewhere", location: at("hall", 0, 5) },
  ]);
  sim.setDestination("crossing", at("hall", 9, 2));
  sim.setDestination("elsewhere", at("hall", 9, 5));
  sim.tick(0.05);
  const replans = sim.stats.triggerReplans;
  assert.equal(
    sim.updateRoom("hall", room(10, 6, [block(0, 5)])).ok,
    false,
    "a prop cannot land on an actor",
  );
  assert.equal(sim.updateRoom("hall", room(10, 6, [block(5, 2)])).ok, true);
  assert.equal(
    sim.updateRoom("hall", room(10, 6, [block(5, 2), block(6, 2)])).ok,
    true,
  );
  sim.tick(0.05);
  assert.equal(sim.stats.triggerReplans - replans, 1);
  for (let i = 0; i < 200; i++) sim.tick(0.05);
  assert.equal(sim.actor("crossing")!.status, "arrived");
  assert.equal(sim.actor("elsewhere")!.status, "arrived");
});

test("actors in offscreen rooms move straight to their destination without planning", () => {
  const world = buildStressTown(3);
  const sim = new NavSimulation(world.graph, world.actors);
  const focused = new Set(world.buildings[0]);
  sim.setDetail(
    world.graph.roomIds().filter((id) => !focused.has(id)),
    "offscreen",
  );
  sim.tick(1 / 30);
  const searches = world.graph.stats.localSearches;
  const offscreen = world.actors.filter((a) => !focused.has(a.location.room));
  for (const a of offscreen)
    sim.setDestination(a.id, world.destinations.get(a.id)!);
  sim.tick(1 / 30);
  assert.equal(world.graph.stats.localSearches, searches);
  assert.equal(world.graph.stats.routePlans, 0);
  assert.equal(sim.stats.teleports, offscreen.length);
  for (const a of offscreen)
    assert.deepEqual(
      sim.actor(a.id)!.location,
      world.destinations.get(a.id),
      a.id,
    );
});

test("stress town: 100 agents in 12 buildings all arrive without sharing cells or doors", () => {
  const world = buildStressTown(1);
  assert.equal(world.buildings.length, 12);
  assert.equal(world.actors.length, 100);
  assert.ok(world.buildings.every((b) => b.length >= 6 && b.length <= 8));
  const crossBuilding = [...world.destinations].filter(([id, d]) => {
    const from = world.actors.find((a) => a.id === id)!.location.room;
    return from.split("-")[0] !== d.room.split("-")[0];
  });
  assert.ok(crossBuilding.length >= 20);
  const sim = start(world);
  const seconds = runChecked(world, sim, 150);
  assert.ok(seconds < 150);
  assert.ok(sim.stats.maxWait <= WAIT_STEP_ASIDE_SECONDS);
  assert.equal(sim.snapshot().actors.find((a) => a.id === "postman")!.location.room, "b11-r0");
});

test("stress town with one detailed building still delivers everyone", () => {
  const world = buildStressTown(2);
  const sim = start(world);
  const focused = new Set(world.buildings[4]);
  sim.setDetail(
    world.graph.roomIds().filter((id) => !focused.has(id)),
    "offscreen",
  );
  runChecked(world, sim, 150);
  assert.ok(sim.stats.teleports > 50);
});

test("narrow corridor: 10 agents each way pass with doors held one at a time", () => {
  for (const seed of [1, 5]) {
    const world = buildCorridor(seed);
    const sim = start(world);
    runChecked(world, sim, 120);
    assert.ok(
      sim.stats.maxWait <= WAIT_STEP_ASIDE_SECONDS,
      `seed ${seed} waited ${sim.stats.maxWait}s`,
    );
  }
});

test("the same inputs and ticks give the same snapshots", () => {
  const run = () => {
    const world = buildStressTown(4, 40);
    const sim = start(world);
    sim.setDetail([TOWN], "offscreen");
    const frames: string[] = [];
    for (let i = 0; i < 900; i++) {
      sim.tick(i % 3 ? 1 / 30 : 1 / 20);
      if (i % 150 === 0) frames.push(JSON.stringify(sim.snapshot()));
    }
    return frames;
  };
  assert.deepEqual(run(), run());
});
