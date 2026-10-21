# Browser world

This workspace renders CrewHub World: the crewhub-loops projects as a small town.
Start it from the repository root with `npm run dev`.

The renderer reads only the `WorldModel` contract from `packages/world-model`.
`src/state/world.ts` (`useWorld`) is the one seam between data and presentation; it
runs the scripted demo source (`@crewhub/demo`) or, in live mode, the host source
(`createHostSource` from `@crewhub/loops-client`, which reads the world's own host at
`/world-api`) through the projection, `reduceWorld` and `describeWorld`. In demo mode
nothing reaches the network and everything is labelled as demo; in live mode the
Connect screens (`src/state/connect.ts`, `components/ConnectPage.tsx`) stand in for the
town until the host has found crewhub-loops, this browser is paired and the key is accepted.
`src/world/TownScene.ts` owns the Three.js town, camera, picking and on-demand frame
loop, built from the Greenhouse models, materials and lighting (`models.ts`,
`shaders.ts`, and the scene palette in `data.ts`). `src/world/townLayout.ts` holds the
pure plot grid and label wording. `src/App.tsx` owns the minimal UI: navigation, the
Demo chip, the playback bar, settings and the hidden text view.

Keys: arrow keys move between buildings, Enter goes inside, Escape or Backspace returns
to the town, `+`/`-` zoom, `[`/`]` rotate, H returns home, T opens the text view. Drag
pans, right-drag rotates, two fingers zoom and rotate on touch.

There are no model calls and no telemetry; the only network calls are the live source's
reads of the world's own host on loopback. The render loop is capped at 30 fps, draws
only after a change, and stops while the tab is hidden.

Walks: `src/world/navigation.ts` builds the town's portal graph (the town grid and
every building's rooms and doors), `movement.ts` turns model changes into walks
(pure, tested) and `walks.ts` runs them on the engine's `NavSimulation`; each robot
follows its walker. Settings has **Ambient** (on, reduced, off) for idle variety;
reduced motion turns every walk into a jump.

The Demo chip is a picker of demo scenarios (Fresh install, One project, Small team,
Studio); `?scenario=fresh|one|small-team|studio` chooses one by URL, and each keeps
its own town document. See `packages/demo/CONTENT.md`.

The host behind the page: in dev (`npm run dev`) Vite proxies `/world-api` and `/pair` to the world's host on
`CREWHUB_WORLD_PORT`, default 5180 (the host's own default, so `npm run host` beside it needs no setting). `npm run
preview` (the built world on 4173) proxies **only** to a port named in `CREWHUB_WORLD_PORT`: without it the preview
says so once, answers `/world-api` as "no host" and the page runs the demo, so a preview never reaches a host that
happens to listen on 5180 (`hostPort.ts`, the one decision, tested). A value that is not a port stops either server.

Dev flags: `?perf` logs frame work every two seconds; `?stress=1` (dev builds only)
swaps in a synthetic town of 12 buildings and 100 agents and shows a frame-time
overlay; `?stress=20` is the region of 20 buildings and 200 agents in four groups. The scene is on `window.__town` in dev builds for headless checks.

See [grid semantics](../../docs/GRID_ENGINE.md) and the
[integration plan](../../docs/LOOPS_INTEGRATION_PLAN.md).
