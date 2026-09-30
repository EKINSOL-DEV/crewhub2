/**
 * Stress fixtures for the multi-room engine: a 60 x 60 town with 12 buildings of
 * 6 to 8 rooms and 100 agents, and a narrow-corridor scenario. Seeded, so every
 * run builds the same world.
 */
import {
  NavGraph,
  occupancy,
  type Cell,
  type Definitions,
  type Door,
  type Location,
  type NavActorInput,
  type WorldLayout,
  type WorldProp,
} from "../../src/index.ts";
import { random } from "./random.ts";

export const TOWN = "town";
const PLOT = { width: 10, depth: 10 };

export const stressDefinitions: Definitions = {
  block: {
    id: "block",
    label: "Furniture",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["obstacle"],
    approaches: [],
  },
  plot: {
    id: "plot",
    label: "Building plot",
    footprint: PLOT,
    blocksMovement: true,
    tags: ["plot"],
    approaches: [],
  },
};

export interface StressWorld {
  graph: NavGraph;
  actors: NavActorInput[];
  destinations: Map<string, Location>;
  /** Room IDs per building, lobby first. */
  buildings: string[][];
}

const layout = (
  width: number,
  depth: number,
  props: WorldProp[],
  entrance: Cell,
): WorldLayout => ({
  version: 1,
  grid: { width, depth, cellSize: 0.6 },
  entrance,
  props,
});

/** Cells reachable from `from`, as keys `x,z`. */
function reachable(l: WorldLayout, from: Cell): Set<string> {
  const blocked = occupancy(l, stressDefinitions);
  const { width, depth } = l.grid;
  const seen = new Set<string>([`${from.x},${from.z}`]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i]!;
    for (const c of [
      { x, z: z - 1 },
      { x: x + 1, z },
      { x, z: z + 1 },
      { x: x - 1, z },
    ]) {
      const key = `${c.x},${c.z}`;
      if (
        c.x < 0 ||
        c.z < 0 ||
        c.x >= width ||
        c.z >= depth ||
        seen.has(key) ||
        blocked[c.z * width + c.x] !== -1
      )
        continue;
      seen.add(key);
      queue.push(c);
    }
  }
  return seen;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export function buildStressTown(seed = 1, agentCount = 100): StressWorld {
  const rng = random(seed);
  const int = (min: number, max: number) =>
    min + Math.floor(rng() * (max - min + 1));
  const graph = new NavGraph(stressDefinitions);
  const plots: Cell[] = [];
  for (const z of [5, 23, 41]) for (const x of [3, 17, 31, 45]) plots.push({ x, z });
  graph.addRoom({
    id: TOWN,
    layout: layout(
      60,
      60,
      plots.map((cell, i) => ({
        id: `plot-${i}`,
        definitionId: "plot",
        cell,
        rotation: 0,
      })),
      { x: 0, z: 0 },
    ),
  });
  const entrances = plots.map((p) => ({ x: p.x + 5, z: p.z + PLOT.depth }));
  const pools = new Map<string, Cell[]>();
  const buildings: string[][] = [];
  const doorCells: Location[] = [];

  plots.forEach((_, b) => {
    const count = int(6, 8);
    const rooms: { id: string; width: number; depth: number }[] = [];
    for (let r = 0; r < count; r++) {
      const id = `b${b}-r${r}`;
      const width = int(12, 20),
        depth = int(12, 16);
      // Furniture stays off the border ring, which keeps doors and walkways open.
      const props: WorldProp[] = [];
      for (let z = 2; z < depth - 2; z++)
        for (let x = 2; x < width - 2; x++)
          if (rng() < 0.12)
            props.push({
              id: `f-${x}-${z}`,
              definitionId: "block",
              cell: { x, z },
              rotation: 0,
            });
      const l = layout(width, depth, props, { x: 0, z: 0 });
      graph.addRoom({ id, layout: l });
      const open = reachable(l, { x: 0, z: 0 });
      const cells: Cell[] = [];
      for (let z = 1; z < depth - 1; z++)
        for (let x = 1; x < width - 1; x++)
          if (open.has(`${x},${z}`)) cells.push({ x, z });
      pools.set(id, cells);
      rooms.push({ id, width, depth });
    }
    buildings.push(rooms.map((r) => r.id));
    const addDoor = (door: Door) => {
      graph.addDoor(door);
      doorCells.push(door.a, door.b);
    };
    for (let r = 1; r < count; r++) {
      const prev = rooms[r - 1]!,
        room = rooms[r]!;
      addDoor({
        id: `b${b}-d${r}`,
        a: { room: prev.id, cell: { x: prev.width - 1, z: Math.floor(prev.depth / 2) } },
        b: { room: room.id, cell: { x: 0, z: Math.floor(room.depth / 2) } },
        // Every building has one staircase-like door with a higher cost.
        ...(r === 3 ? { cost: 3 } : {}),
      });
    }
    const lobby = rooms[0]!,
      last = rooms[count - 1]!;
    addDoor({
      id: `b${b}-loop`,
      a: { room: lobby.id, cell: { x: Math.floor(lobby.width / 2), z: 0 } },
      b: { room: last.id, cell: { x: Math.floor(last.width / 2), z: last.depth - 1 } },
    });
    addDoor({
      id: `b${b}-entrance`,
      a: { room: TOWN, cell: entrances[b]! },
      b: { room: lobby.id, cell: { x: Math.floor(lobby.width / 2), z: lobby.depth - 1 } },
    });
  });

  // Town walkers use path cells away from the entrances.
  const townBlocked = occupancy(graph.room(TOWN)!.layout, stressDefinitions);
  const townCells: Cell[] = [];
  for (let z = 1; z < 59; z++)
    for (let x = 1; x < 59; x++)
      if (
        townBlocked[z * 60 + x] === -1 &&
        entrances.every((e) => Math.abs(e.x - x) + Math.abs(e.z - z) > 2)
      )
        townCells.push({ x, z });
  pools.set(TOWN, townCells);

  // Spawn cells and destinations never overlap, and nobody rests next to a door.
  const used = new Set<string>();
  for (const d of doorCells)
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      used.add(`${d.room}|${d.cell.x + dx},${d.cell.z + dz}`);
  for (const [room, cells] of pools) pools.set(room, shuffle(cells, rng));
  const take = (room: string): Location => {
    const cells = pools.get(room)!;
    for (;;) {
      const cell = cells.pop();
      if (!cell) throw new Error(`Pool exhausted in ${room}`);
      const key = `${room}|${cell.x},${cell.z}`;
      if (used.has(key)) continue;
      used.add(key);
      return { room, cell };
    }
  };
  const pickRoom = (b: number) => {
    const rooms = buildings[b]!;
    return rooms[int(0, rooms.length - 1)]!;
  };

  const actors: NavActorInput[] = [];
  const destinations = new Map<string, Location>();
  // The postman crosses the town from the first building to the last one.
  actors.push({ id: "postman", priority: 10, location: take(TOWN) });
  destinations.set("postman", take(buildings[11]![0]!));
  for (let i = 1; i < agentCount; i++) {
    const home = int(0, buildings.length - 1);
    const start = i % 20 === 0 ? take(TOWN) : take(pickRoom(home));
    const roll = rng();
    const goal =
      roll < 0.7
        ? take(pickRoom(home))
        : roll < 0.95
          ? take(pickRoom(int(0, buildings.length - 1)))
          : take(TOWN);
    const id = `agent-${i}`;
    actors.push({ id, priority: int(0, 3), location: start });
    destinations.set(id, goal);
  }
  return { graph, actors, destinations, buildings };
}

/**
 * Two 12 x 12 rooms joined by a one-cell corridor room, with 10 agents crossing
 * each way. The corridor is a room of one cell with a door on each side.
 */
export function buildCorridor(seed = 1): StressWorld {
  const rng = random(seed);
  const graph = new NavGraph(stressDefinitions);
  graph.addRoom({ id: "west", layout: layout(12, 12, [], { x: 0, z: 0 }) });
  graph.addRoom({ id: "corridor", layout: layout(1, 1, [], { x: 0, z: 0 }) });
  graph.addRoom({ id: "east", layout: layout(12, 12, [], { x: 0, z: 0 }) });
  graph.addDoor({
    id: "west-door",
    a: { room: "west", cell: { x: 11, z: 6 } },
    b: { room: "corridor", cell: { x: 0, z: 0 } },
  });
  graph.addDoor({
    id: "east-door",
    a: { room: "corridor", cell: { x: 0, z: 0 } },
    b: { room: "east", cell: { x: 0, z: 6 } },
  });
  // Starts sit near the corridor, destinations further back, so both crowds meet.
  const cells = (xs: number[]) =>
    shuffle(
      xs.flatMap((x) =>
        Array.from({ length: 10 }, (_, i) => ({ x, z: i + 1 })),
      ),
      rng,
    );
  const westStarts = cells([7, 8, 9]),
    westGoals = cells([1, 2, 3]);
  const eastStarts = cells([2, 3, 4]),
    eastGoals = cells([8, 9, 10]);
  const actors: NavActorInput[] = [];
  const destinations = new Map<string, Location>();
  for (let i = 0; i < 10; i++) {
    actors.push({
      id: `w${i}`,
      priority: i % 3,
      location: { room: "west", cell: westStarts[i]! },
    });
    destinations.set(`w${i}`, { room: "east", cell: eastGoals[i]! });
    actors.push({
      id: `e${i}`,
      priority: (i + 1) % 3,
      location: { room: "east", cell: eastStarts[i]! },
    });
    destinations.set(`e${i}`, { room: "west", cell: westGoals[i]! });
  }
  return { graph, actors, destinations, buildings: [["west", "corridor", "east"]] };
}
