/**
 * Engine benchmark on the stress town (12 buildings, 100 agents). Not part of
 * `npm test`. Run from the repository root:
 *
 *   node packages/world-engine/bench/stress.ts
 *
 * Every agent always has somewhere to go: one second after arriving it gets a new
 * seeded destination, so all 100 keep moving for the whole simulated minute.
 */
import { performance } from "node:perf_hooks";
import {
  NavSimulation,
  type Cell,
  type Location,
} from "../src/index.ts";
import { buildStressTown } from "../test/fixtures/stressTown.ts";
import { random } from "../test/fixtures/random.ts";

const TICKS = 1800;
const DT = 1 / 30;

function run(label: string, focusBuilding: number | null) {
  const t0 = performance.now();
  const world = buildStressTown(1);
  const sim = new NavSimulation(world.graph, world.actors);
  const buildMs = performance.now() - t0;

  const rng = random(99);
  const rooms = world.graph.roomIds();
  const openCells = new Map<string, Cell[]>();
  for (const id of rooms) {
    const room = world.graph.room(id)!;
    const cells: Cell[] = [];
    const { width, depth } = room.layout.grid;
    for (let z = 0; z < depth; z++)
      for (let x = 0; x < width; x++)
        if (
          room.blocked[z * width + x] === -1 &&
          !world.graph.isDoorCell({ room: id, cell: { x, z } })
        )
          cells.push({ x, z });
    openCells.set(id, cells);
  }
  const randomDestination = (): Location => {
    const room = rooms[Math.floor(rng() * rooms.length)]!;
    const cells = openCells.get(room)!;
    return { room, cell: cells[Math.floor(rng() * cells.length)]! };
  };

  if (focusBuilding !== null) {
    const focused = new Set(world.buildings[focusBuilding]);
    sim.setDetail(
      rooms.filter((id) => !focused.has(id)),
      "offscreen",
    );
  }
  for (const [id, destination] of world.destinations)
    sim.setDestination(id, destination);

  const before = { ...sim.stats };
  const dwell = new Map<string, number>();
  const times: number[] = [];
  for (let i = 0; i < TICKS; i++) {
    const start = performance.now();
    sim.tick(DT);
    times.push(performance.now() - start);
    // Retargeting is the caller's work (events), outside the measured tick.
    for (const a of sim.snapshot().actors) {
      if (a.status !== "arrived" && a.status !== "unreachable") continue;
      const waited = (dwell.get(a.id) ?? 0) + DT;
      dwell.set(a.id, waited);
      if (waited >= 1) {
        dwell.set(a.id, 0);
        sim.setDestination(a.id, randomDestination());
      }
    }
  }
  const first = times[0]!;
  const steadyMax = Math.max(...times.slice(1));
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)]!;
  const p99 = times[Math.floor(times.length * 0.99)]!;
  const max = times.at(-1)!;
  const delta = (key: keyof typeof before) => sim.stats[key] - before[key];
  console.log(`\n${label}`);
  console.log(
    `  build town + simulation: ${buildMs.toFixed(1)} ms (${rooms.length} rooms, ${world.graph.doors().length} doors, ${world.actors.length} agents)`,
  );
  console.log(
    `  tick(1/30) over ${TICKS} ticks: mean ${mean.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, max ${max.toFixed(3)} ms`,
  );
  console.log(
    `  first tick (plans all 100 routes) ${first.toFixed(3)} ms; max of the other ticks ${steadyMax.toFixed(3)} ms`,
  );
  console.log(
    `  A* calls ${delta("localSearches")}, route plans ${delta("routePlans")}, cache hits ${delta("cacheHits")}, cache misses ${delta("cacheMisses")}`,
  );
  console.log(
    `  teleports ${delta("teleports")}, wait replans ${delta("waitReplans")}, step-asides ${delta("stepAsides")}, max wait ${sim.stats.maxWait.toFixed(2)} s`,
  );
}

console.log(`Node ${process.version}, ${process.platform} ${process.arch}`);
run("One building full (b0), everything else offscreen", 0);
run("All rooms full", null);
