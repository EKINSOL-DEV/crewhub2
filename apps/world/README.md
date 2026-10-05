# Browser world

This workspace renders CrewHub World: the crewhub-loops projects as a small town.
Start it from the repository root with `npm run dev`.

The renderer reads only the `WorldModel` contract from `packages/world-model`.
`src/state/world.ts` (`useWorld`) is the one seam between data and presentation; it
runs the scripted demo source (`@crewhub/demo`) through the projection, `reduceWorld` and
`describeWorld`. Nothing reaches the network, and everything is labelled as demo.
`src/world/TownScene.ts` owns the Three.js town, camera, picking and on-demand frame
loop, built from the Greenhouse models, materials and lighting (`models.ts`,
`shaders.ts`, and the scene palette in `data.ts`). `src/world/townLayout.ts` holds the
pure plot grid and label wording. `src/App.tsx` owns the minimal UI: navigation, the
Demo chip, the playback bar, settings and the hidden text view.

Keys: arrow keys move between buildings, Enter goes inside, Escape or Backspace returns
to the town, `+`/`-` zoom, `[`/`]` rotate, H returns home, T opens the text view. Drag
pans, right-drag rotates, two fingers zoom and rotate on touch.

There are no network connections, model calls or telemetry. The render loop is capped
at 30 fps, draws only after a change, and stops while the tab is hidden.

Walks: `src/world/navigation.ts` builds the town's portal graph (the town grid and
every building's rooms and doors), `movement.ts` turns model changes into walks
(pure, tested) and `walks.ts` runs them on the engine's `NavSimulation`; each robot
follows its walker. Settings has **Ambient** (on, reduced, off) for idle variety;
reduced motion turns every walk into a jump.

The Demo chip is a picker of demo scenarios (Fresh install, One project, Small team,
Studio); `?scenario=fresh|one|small-team|studio` chooses one by URL, and each keeps
its own town document. See `packages/demo/CONTENT.md`.

Dev flags: `?perf` logs frame work every two seconds; `?stress=1` (dev builds only)
swaps in a synthetic town of 12 buildings and 100 agents and shows a frame-time
overlay; `?stress=20` is the region of 20 buildings and 200 agents in four groups. The scene is on `window.__town` in dev builds for headless checks.

See [grid semantics](../../docs/GRID_ENGINE.md) and the
[integration plan](../../docs/LOOPS_INTEGRATION_PLAN.md).
