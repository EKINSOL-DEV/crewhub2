# Grid engine and world semantics

This document describes the implemented single-room engine. Planned town plots,
stable room growth, and portal adjacency are specified in [TOWN_PLAN.md](TOWN_PLAN.md).

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
request or layout edit, never per animation frame. At this room size the simple
open-list implementation is sufficient; benchmark and replace it with a heap
before large worlds. Worst-case open-list scanning is quadratic in cell count.
Placement reachability is O(cells + prop footprint area).

Actors reserve both ends of a moving segment. An agent cannot swap cells, overlap
another reservation, or enter an occupied destination. Intersections are resolved
in stable actor order. Agents wait if a planned next cell becomes reserved.
Mid-step retargeting routes from the active segment's end without teleporting.
Movement consumes elapsed distance at 2.8 cells/second and caps a tick at 100 ms;
the renderer pauses hidden tabs instead of catching up after a long absence.

This is collision-safe local routing, not a crowd simulator. Narrow-corridor
deadlocks can wait indefinitely; there is no automatic replanning, fairness,
multi-floor routing, navmesh, or physics. A new explicit route can resolve a wait.
Do not equate walking with a live agent's task execution.

`describeWorld` and `simulation.snapshot()` expose ordinary JSON: grid, entrance,
prop identity and labels, tags, occupied cells, interaction cells, and actors'
current/next cells and destinations. A future agent can request “reachable work
surface” from these semantics without vision or a model interpreting pixels.
No MCP tool or live adapter is exposed in this milestone.

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
frame-duration-independent movement. They run in CI through `npm run check`.
