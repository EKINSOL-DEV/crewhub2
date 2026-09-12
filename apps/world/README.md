# Browser world

This workspace contains The Greenhouse, a procedural botanical room. Start it
from the repository root with `npm run dev`.

`src/world/data.ts` defines the room, prop registry, characters, and deterministic
session scenarios. `src/App.tsx` owns the accessible UI. `src/world/Scene.ts` owns
the Three.js renderer, camera, picking, and presentation loop. Procedural model
factories and shader materials are separate from the headless world engine.

Select a character by clicking or pressing 1 / 2 / 3. F focuses, H returns to the
isometric home, and G toggles the grid. Free orbit enables drag rotation; right-drag
and two-finger gestures pan. The arrangement tool places or moves props, R rotates,
and Escape exits. Focus the canvas, use arrow keys, and press Enter to place or route
without a pointer. On narrow screens, the crew button opens the oversight panel.

There are no live connections, model calls, telemetry, external assets, or agent
commands. A 500 ms local timer refreshes cell labels only when they change. The
render loop is capped at 30 fps, stops while hidden, and sleeps after static views
settle. Layouts remain in memory; export JSON to retain them. Import UI is deferred.

See [grid semantics](../../docs/GRID_ENGINE.md) and [review status](../../docs/ROOM_REVIEW.md).
