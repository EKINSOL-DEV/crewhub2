# World engine

A headless TypeScript grid for CrewHub. No renderer, dependencies, timers, network,
physics engine, or model calls. Node 24 runs the tests directly.

The engine owns rectangular prop footprints, quarter-turn rotation, static
occupancy, four-way A\*, movement reservations, atomic placement, and semantic
snapshots. Browser geometry remains in `apps/world`.

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

See [the grid contract](../../docs/GRID_ENGINE.md) for coordinates, extension rules,
complexity, and limitations. Run `npm test` from the repository root.
