# World engine

A headless TypeScript grid for CrewHub. No renderer, dependencies, timers, network,
physics engine, or model calls. Node 24 runs the tests directly.

The engine owns rectangular prop footprints, quarter-turn rotation, static
occupancy, four-way heap A\* (plain and weighted), movement reservations, atomic
placement, semantic snapshots, and multi-room routing with doors. Browser geometry remains in `apps/world`.

```ts
import { WorldSimulation } from "@crewhub/world-engine";

const world = new WorldSimulation(layout, definitions, actors);
world.route("moss", { x: 10, z: 7 });
world.tick(1 / 30);
const result = world.place({
  id: "fern-1",
  definitionId: "plant",
  cell: { x: 4, z: 8 },
  rotation: 0,
});
const context = world.snapshot();
```

Check `result.ok` before reporting success. Use `position(actor)` for visual
interpolation and `actor.cell` for logical occupancy. Only change a simulation's
layout through `place`; direct mutation bypasses occupancy validation. Exported
snapshots are detached copies.

## Rooms, doors and the town

`NavGraph` joins independent room grids with doors; the town is a room whose door
cells are building entrances. `NavSimulation` moves actors across them.

```ts
import { NavGraph, NavSimulation } from "@crewhub/world-engine";

const graph = new NavGraph(definitions);
graph.addRoom({ id: "town", layout: townLayout });
graph.addRoom({ id: "lobby", layout: lobbyLayout });
graph.addDoor({
  id: "lobby-entrance",
  a: { room: "town", cell: { x: 8, z: 15 } },
  b: { room: "lobby", cell: { x: 6, z: 11 } },
  cost: 1, // optional; stairs are doors with a higher cost
});

const sim = new NavSimulation(graph, [
  { id: "postman", priority: 10, location: { room: "town", cell: { x: 2, z: 2 } } },
]);
sim.setDestination("postman", { room: "lobby", cell: { x: 4, z: 4 } });
sim.setDetail(["town"], "offscreen"); // no cosmetic walking there
sim.tick(1 / 30);
const { actors, doors } = sim.snapshot();
```

`actors[i].location` and `next` (possibly in the next room while crossing a door)
with `progress` are what a renderer interpolates. Move props at run time through
`sim.updateRoom(id, layout)`, which refuses to cover actors or doors; affected
actors replan on the next tick. `graph.planRoute(from, to)` previews a route
without a simulation. Benchmark: `node packages/world-engine/bench/stress.ts`.

See [the grid contract](../../docs/GRID_ENGINE.md) for coordinates, extension rules,
complexity, and limitations. Run `npm test` from the repository root.
