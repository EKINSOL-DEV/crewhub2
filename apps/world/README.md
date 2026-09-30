# Browser world

This workspace renders CrewHub World: the crewhub-loops projects as a small town.
Start it from the repository root with `npm run dev`.

The renderer reads only the `WorldModel` contract from `packages/world-model`.
`src/state/world.ts` (`useWorld`) is the one seam between data and presentation; it
currently returns a static, clearly labelled demo fixture (`src/state/fixtureWorld.ts`).
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

See [grid semantics](../../docs/GRID_ENGINE.md) and the
[integration plan](../../docs/LOOPS_INTEGRATION_PLAN.md).
