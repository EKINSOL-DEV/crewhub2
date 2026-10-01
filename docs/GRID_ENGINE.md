# Grid engine and world semantics

This document describes the implemented engine: the single-room grid and
`WorldSimulation`, and the multi-room layer (`NavGraph`, `NavSimulation`) described
in [Rooms, doors and the town](#rooms-doors-and-the-town). Planned town plots and
stable room growth are specified in [TOWN_PLAN.md](TOWN_PLAN.md).

## Implemented contract

`packages/world-engine` is independent of presentation and session providers. The
same cells define where props fit, where agents walk, and what a future tool can
understand about the room. Meshes are never queried to infer navigation.

| Concept | Meaning |
| --- | --- |
| `GridSpec` | Integer width/depth and physical cell size |
| `Cell { x, z }` | Zero-based integer coordinate; x east, z south; y is visual height |
| `PropDefinition` | Stable type ID, label, rectangular footprint, blocking flag, semantic tags, interaction offsets |
| `WorldProp` | Instance ID, definition ID, top-left cell of its rotated bounds, quarter-turn rotation |
| `WorldLayout` | Version 1, grid, entrance, prop instances; serializable JSON |
| `Actor` | Current cell, reserved next cell, segment progress, remaining route, destination |

The Greenhouse is 18 × 14 cells, each 0.6 world units. The initial room has 13 props
and three actors. Grids are bounded to 128 × 128; cell sizes must be finite and
between 0.1 and 10. The current renderer is art-directed for this one room, while
the engine supports other valid dimensions.

Cell centers map to the renderer as:

```ts
worldX = (cell.x + 0.5 - grid.width / 2) * grid.cellSize;
worldZ = (cell.z + 0.5 - grid.depth / 2) * grid.cellSize;
```

`rotation` is 0, 1, 2, or 3, clockwise in a top-down grid. A 3 × 2 footprint becomes
2 × 3 at rotation 1. Interaction offsets rotate using the same transform, even
when the offset is outside the footprint. The Three.js group uses `-rotation *
Math.PI / 2` and is centered over the rotated footprint. Props may have decorative
overhang, but their blocking volume must fit their declared footprint.

## Placement

`validateLayout(unknown, definitions)` checks version, dimensions, IDs, definitions,
rotation, bounds, overlap, and an open entrance. It returns a detached copy.
Definitions are trusted application code, not an unvalidated import format.

`simulation.placement(prop)` previews an edit without mutating the world. It:

1. Validates the candidate layout, replacing the same instance ID when moving.
2. Rejects footprints over an actor's current or next reserved cell.
3. Flood-fills once from the entrance through static occupancy.
4. Requires every actor and at least one approach per interactive prop to be reachable.

`simulation.place(prop)` commits only a valid candidate and replans remaining
routes. A blocked destination clears the remaining route; an active safe segment
finishes. Failed edits preserve the original layout, paths, and revision. All
footprints are exclusive, including future nonblocking decoration; stacked props
are deliberately not implemented.

The browser offers plant, bench, and lamp creation, quarter-turn rotation, and
moving any existing prop through picking or a dropdown. It previews footprint
validity and exports layout JSON. Layouts remain in memory for the current visit;
import UI, undo, persistence, and deletion are future extensions.

## Navigation and lightweight understanding

Static occupancy is an `Int32Array`: -1 means open; other values index props.
Four-neighbor A* uses Manhattan distance, deterministic tie order, and no diagonal
corner cutting. It returns both endpoints or null. Search occurs on a routing
request or layout edit, never per animation frame. The open list is a binary heap
(`src/heap.ts`), so a search is O(cells log cells). Ties in f break by the order
in which cells were first discovered, which reproduces the paths of the earlier
open-list scan exactly; a test compares both on random seeded grids.
`findPathWeighted(grid, blocked, start, goal, costOf)` is the same search with a
per-cell entry cost (`null` forbids a cell; costs below 1 count as 1 so the
heuristic stays admissible). Placement reachability is O(cells + prop footprint area).

Actors reserve both ends of a moving segment. An agent cannot swap cells, overlap
another reservation, or enter an occupied destination. Intersections are resolved
in stable actor order. Agents wait if a planned next cell becomes reserved.
Mid-step retargeting routes from the active segment's end without teleporting.
Movement consumes elapsed distance at 2.8 cells/second and caps a tick at 100 ms;
the renderer pauses hidden tabs instead of catching up after a long absence.

In `WorldSimulation` this is collision-safe local routing, not a crowd simulator.
Narrow-corridor deadlocks can wait indefinitely there; a new explicit route can
resolve a wait. `NavSimulation` adds door queues, a wait budget and step-aside
(below). Neither has a navmesh or physics. Do not equate walking with a live
agent's task execution.

`describeWorld` and `simulation.snapshot()` expose ordinary JSON: grid, entrance,
prop identity and labels, tags, occupied cells, interaction cells, and actors'
current/next cells and destinations. A future agent can request “reachable work
surface” from these semantics without vision or a model interpreting pixels.
No MCP tool or live adapter is exposed in this milestone.

## Rooms, doors and the town

`src/nav.ts` and `src/navSim.ts` implement the two-layer routing of
[LOOPS_INTEGRATION_PLAN.md section 5](LOOPS_INTEGRATION_PLAN.md#5-pathfinding-and-the-grid-engine).
The single-room API above is unchanged.

| Concept | Meaning |
| --- | --- |
| `NavRoom { id, layout }` | An independent interior grid, validated with `validateLayout` |
| `Location { room, cell }` | A cell in a named room |
| `Door { id, a, b, cost? }` | A portal between one open cell in each of two rooms; crossing costs `cost` cells (default 1) |
| `NavGraph` | Rooms, doors, cached distances, `planRoute` |
| `RoutePlan { legs, cost, path }` | Legs `{ room, fromCell, toCell, viaDoor }`; `path` is the first leg's local A* path |
| `NavSimulation` | Actors moving across rooms: reservations, door locks, wait budget, detail levels |

The town is a room like any other: its grid holds the paths between plots and its
door cells are building entrances, so a postman or a cross-building walk uses the
same search. Stairs or lifts are doors with a higher cost. Door cells are normally
edge cells of an interior; the engine only requires them to be open. Doors that
share a cell (a one-cell corridor room between two doors) form one lock.

### Planning

`graph.planRoute(from, to)` runs Dijkstra over door sides (two nodes per door,
plus start and goal). Edge weights inside a room are breadth-first step counts
from each door side, cached per room revision: one fill per door side answers
every door-to-door, start-to-door and door-to-goal distance in that room. Only the
first leg gets a local A* path; the simulation plans each later leg when the actor
steps through its door, so rooms can change in the meantime. `updateRoom(id,
layout)` bumps the room's revision (door cells must stay open; growth is not
supported yet), which invalidates only that room's cached distances.
`graph.stats` counts A* searches, route plans, cache hits and misses.

### Movement

`new NavSimulation(graph, [{ id, priority?, location }])`, then
`setDestination(id, location | null)`, `tick(seconds)` and `snapshot()`. Movement
keeps the `WorldSimulation` rules: each actor reserves its current and next cell,
walks 2.8 cells per second, and a tick is capped at 100 ms. A door crossing is one
segment of `cost` cells from one door cell to the other, so `next` may be in
another room while crossing.

- **Doors** are single-occupancy. An actor enters a door cell only when no other
  actor stands on or is moving into any cell of that door (or of doors sharing a
  cell with it), and only in arrival order: waiting actors join a FIFO queue. An
  actor queued for a door that stands in the way of the actor using that door
  steps aside at once. Door cells cannot be spawn cells or destinations.
- **Wait budget.** An actor accumulates wait time only while it is stalled: it
  wants to move, did not move this tick, and whatever blocks it (an actor, or the
  holder of the door it queues for) is not moving either. Following a moving actor
  or queueing for a busy door is not a stall. Only reaching a new fewest-remaining-
  steps count resets the clock, so two actors dodging the same way cannot reset
  each other forever. After 1.5 s the actor replans its current leg once with
  weighted A* where reserved cells cost 8 instead of being forbidden. On the tick
  that would take it past 5 s, the pair resolves: an idle blocker steps aside
  first, otherwise the lower-priority actor (ties: the later-listed one) steps to
  a free neighbouring cell (checked north, east, south, west, preferring cells off
  the other actor's next steps), then replans and resumes.
- **Triggers only.** Plans are computed on the next tick after a destination
  change, a room revision change (only actors whose remaining path crosses a
  changed cell, or whose later legs enter that room), a failed leg, or the wait
  budget. Triggers are coalesced: any number of them for one actor in one tick
  produce one replan. Nothing is planned per frame.
- **Detail levels.** `setDetail(roomIds, "full" | "offscreen")`, default full. An
  actor in an offscreen room never walks cosmetically: it moves straight to its
  destination (the nearest free cell if that one is taken) without calling the
  planner, and `stats.teleports` counts it. An actor walking into an offscreen
  room does the same when it arrives there.
- The same inputs and ticks produce the same snapshots.

Actors can change at run time: `addActor({ id, priority?, location })` puts a new
actor on the free, non-door cell nearest to `location`; `removeActor(id)` frees its
cells, door lock and queue place; `place(id, location)` moves one there at once (a
reset, reduced motion, a swap between offscreen buildings) and replans a set
destination. A room re-added under the same ID with another size starts a fresh
revision diff.

`sim.updateRoom(id, layout)` is the safe way to move props at run time: it rejects
layouts that cover an actor's current or next cell or a door cell. Snapshots list
actors (location, next, progress, destination, status, wait, remaining rooms),
doors with holder and queue, and each room's detail level.

### Stress numbers

`packages/world-engine/test/fixtures/stressTown.ts` builds a 60 × 60 town with 12
buildings of 6 to 8 rooms (12 × 12 to 20 × 16 cells, 84 rooms and 95 doors in
total, one cost-3 staircase door per building) and 100 seeded agents including a
priority-10 postman; about a quarter of the walks cross buildings. Tests check on
every tick that no two actors share a cell and that each door has at most one
user, and that everyone arrives (the full town in about 60 to 90 simulated
seconds). The corridor scenario sends 10 agents each way through a one-cell
corridor room; nobody's wait budget passes 5 s.

`node packages/world-engine/bench/stress.ts` keeps all 100 agents moving for 1,800
ticks of 1/30 s (an arrived agent gets a new destination after one second).
Measured on an Apple M2 Max, Node 22.22, 2026-10-01:

| Scenario | Mean tick | p95 | p99 | Max (first tick) | Max, other ticks | A* calls | Cache hits / misses | Teleports |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| One building full, rest offscreen | 0.037 ms | 0.08 ms | 0.21 ms | 6.3 ms | 1.9 ms | 746 | 39,066 / 188 | 1,979 |
| All rooms full | 0.030 ms | 0.10 ms | 0.21 ms | 5.2 ms | 0.4 ms | 1,226 | 40,330 / 190 | 0 |

Building the town and the simulation takes 11 to 21 ms. The first tick plans all
100 routes at once; later ticks stay far below the 33 ms frame budget. These are
engine numbers only, not rendering, and not measured on the reference device.

### In the world

`apps/world/src/world/navigation.ts` builds one `NavGraph` for the town: the town
room is a 61 × 61 grid of 1.2 m cells (plots, streets, the post office and the
town hall; building footprints and parked trucks are blocked), and every active
building adds its rooms from `buildingTemplate` (0.6 m cells) with the template's
doors. The lobby's front door joins the town cell just outside the building with a
cost-2 door. A building whose shape changes (a role room grows, the meeting room
comes or goes) has its rooms and doors replaced, its actors taken out and put back
where they stood; a room whose furniture changes only is updated in place
(`sim.updateRoom`).

`movement.ts` maps changes of the world model to walks (never per frame), and
`walks.ts` runs them on the simulation: the hand-over walk to the review pile and
back when a ticket flies to review, back to the desk when a ticket lands on it,
joins and departures through the lobby, real-location switches (walked along the
town path in the town view, swapped otherwise), the postman's delivery rounds and
seeded idle variety (plan 7.1). Postures are the model's debounced ones. Only the
entered building's rooms are `full`; the town is `full` so the postman and
cross-building walks show; under reduced motion every room is `offscreen`, so every
move is a jump. The simulation ticks once per drawn frame at the playback speed
and pauses with the playback and in hidden tabs.

### Browser stress numbers

`?stress=1` (dev builds only) loads a synthetic loops-shaped town through the same
`WorldSource` seam (`createStressSource` in `packages/demo`): 12 buildings, 100
agents (12 leads, 4 registered agents that work in two buildings, 84 workers) plus
the postman, and a steady stream of ticket moves, progress lines, deliveries and
team re-reads that flip lanes. An overlay shows the time between drawn frames
(mean, p95 and max over the last 300 frames), the CPU work per frame and the walk
engine's tick. In this mode the 60 fps cap is off, so the interval shows what the
browser can do.

Measured 2026-10-01 on an Apple M2 Max (macOS), Chromium 151 headless, 1440 × 900
at device pixel ratio 1, playback at 4x. The window restarts when the view changes;
the Metal runs filled all 300 frames, SwiftShader drew only 74 (town) and 83
(inside) frames in 20 s.

| Browser, view | Frame mean | p95 | max | CPU work mean | Engine tick mean / max | Draw calls |
| --- | --- | --- | --- | --- | --- | --- |
| Metal GPU (new headless), town view | 8.3 ms | 9.8 ms | 10.2 ms | 3.9 ms | 0.11 / 0.30 ms | 2,528 |
| Metal GPU (new headless), inside one building | 9.1 ms | 16.5 ms | 17.5 ms | 2.9 ms | 0.11 / 1.0 ms | 1,357 |
| SwiftShader (CPU), town view | 413 ms | 932 ms | 1,825 ms | 205 ms | 0.29 / 3.2 ms | 2,474 |
| SwiftShader (CPU), inside one building | 272 ms | 316 ms | 1,433 ms | 13 ms | 0.21 / 0.6 ms | 1,384 |

Before the two reductions below, the same Metal run measured 8.9 / 16.3 / 18.1 ms
in the town view with 6.8 ms CPU work and 5,188 draw calls, and SwiftShader 1,128 /
2,217 / 3,300 ms. The reductions: robots seen from the town use the style's "far"
detail (no small parts, no shadows; `RobotHandle.setDetail`), and Greenhouse boxes
with a bevel of 3 cm or less use one bevel segment (a building shell went from
about 68,000 to about 25,000 triangles). The GPU run stays inside the 33 ms budget
with room to spare. SwiftShader rasterises on the CPU and stays far above it: an
empty scene renders in 5 ms there, the town's 620,000 triangles take about 300 ms,
so the number says little about real hardware. The reference machine of the plan
has not been measured; these are numbers from a development machine.

## Adding generated models later

Register a semantic definition first, with a stable type ID, footprint, tags, and
interaction offsets. Then add a separate renderer factory or asset reference for
that ID. Normalize its origin, scale, orientation, and ground contact against the
footprint. Generated meshes must not alter occupancy rules. Validate imported
assets and registry data at that future boundary; no model generation happens now.

## Verification

Headless tests cover rotated footprints and approaches, malformed layouts,
shortest paths, unreachable and reserved cells, crossings, retargeting, atomic
placement, escape routes, workstation access, replanning, snapshot isolation, and
frame-duration-independent movement. Multi-room tests cover heap A* against the
legacy scan, weighted A*, door costs and route choice, the distance cache, the wait
budget and step-aside, coalesced prop replans, offscreen teleports without planner
calls, determinism, and the stress and corridor fixtures. They run in CI through
`npm run check`.
