# Cost policy

## Default: zero model calls for presentation

World rendering, character animation, pathfinding, camera movement, attention
signals, session discovery, status mapping, and ordinary tool labels must use
deterministic application logic. Demo mode requires no account, key, network
service, or running harness.

Opening the app, entering a room, selecting a character, reconnecting a source,
or leaving a tab open must never start an agent or request inference.

Implemented: the world makes zero model calls. crewhub-loops is its only source
of facts, and in demo mode the scripted in-browser source stands in for it. The
scripted director (deterministic code, no model) stands in for the optional
director and plays its intents only inside an entered building. `npm test` fails
on an AI SDK import or a model endpoint.

Existing sessions still incur their normal provider usage when they perform work
in crewhub-loops. The world does not make that work free and must not duplicate
it. It never holds provider credentials and never claims an unavailable
subscription entitlement.

## Optional AI features, later

Planned, not built: an optional director on Haiku or another very cheap model
(see [LOOPS_INTEGRATION_PLAN.md](LOOPS_INTEGRATION_PLAN.md) section 7.3). It is
off by default and capped by a request and token budget, with a kill switch.

Summaries and conversational flavor are optional and disabled until configured.
Any such feature must define its trigger, model choice, cache key, maximum input,
output and call limits, cancellation behavior, and visible usage reporting.

- Prefer an explicit user request. Do not infer permission for recurring calls
  from permission to connect a session.
- Cache summaries against relevant content revisions and reuse them across views.
- Coalesce bursts of updates. Never call a model per event, character, or frame.
- Bound context and retries; do not silently escalate to a more expensive model.
- Provide feature and global off switches, and a hard request/token budget.
- Use currency estimates only when actual pricing and usage information are
  available. Otherwise say the cost is unknown.
- Keep metrics local by default. No external telemetry in the bootstrap.

## Graphics also have a budget

Reuse geometry and materials, cap rendering resolution, avoid needless state
updates, suspend hidden-tab work, and offer reduced motion and lower quality.
Local graphics can consume battery even when inference costs are zero.

The budget, as set in the performance rounds of 2026-10-02 (reference machine: an
M2 Max, both themes):

- The normal demo on Pretty keeps a frame p95 under 16.7 ms in the town and
  inside a building, with no frame over 33 ms except at a view change.
- The stress fixture (`?stress=1`, dev builds: 12 buildings, about 100 agents) at
  4x stays inside that budget.
- Fast holds a steady 60 on a phone budget (375 px, a 4x CPU throttle).
- Memory does not grow over a 10-minute run at 16x.

The rules that keep it there:

- **Draw on demand, at most 60 fps.** The loop draws only while something moves
  (a walk, a tween, an animation, the drift's light) and rests otherwise; it
  stops in a hidden tab. A 120 Hz display still draws at most 60. Animations of
  models ride on frames that are drawn anyway and never keep the loop running.
- **Shadows on change.** In the town the shadow map is drawn once and again only
  when something that casts or lights it changed. A fit, a lift, the dressing or
  the quality redraw it at once; small changes (a building's piles, the drift's
  sun after a step of about half a degree) redraw it at most every 400 ms, and a
  timer catches up the last one if the loop rests. The drift itself moves at most
  at a 4x pace.
  Inside a building it follows every frame, because the robots move. Fast has no
  shadow map; blob contact shadows stay in both settings.
- **Culling.** Buildings outside the camera's view are not drawn, their robots
  are neither copied nor moved until they are seen again, and the town dressing
  is culled by 12 m ground cells. An interior is drawn only for the entered
  building.
- **Batching.** Static geometry merges per material look, with colours read live
  from the style's materials; repeated pieces are instanced, small kinds merged;
  the robots seen from the town are one instanced crowd; instanced meshes draw a
  twin of their material so one material never switches programs between plain
  and instanced use. A style keeps this working by keeping its materials
  batchable ([WORLD_STYLES.md](WORLD_STYLES.md), "What batches").
- **Matrices only for what moved.** The scene recomposes an object's matrix
  only when its position, rotation or scale changed since the last frame, and
  multiplies world matrices only below a change (in the stress town at 4x it
  halved the matrix work, about 105 to 55 ms per second).
- **Frame what matters.** On a portrait phone a focused room fills the screen,
  so fewer objects are in view (Fast inside a room: about 170 to 120 draw calls).
- **Labels stay cheap.** Label layout is pure geometry over screen boxes and
  keeps its applied visibility, so it never reads the DOM back: about 0.05 ms a
  frame inside a stress building with every label on.
- **Lower detail where it does not show.** Small parts have fewer segments, the
  town's small balls and leaf blobs fewer triangles, and robots seen from the
  town drop their small parts and shadows.
- **Interiors ahead, three at a time.** The interior of the hovered or focused
  building is built in idle time, in steps that each start only with idle time
  left, so entering it shows no long task. The entered building and the two most
  recently used keep their interiors; others drop them.
- **Startup in slices.** Shaders compile in parallel before the first frame; the
  town's first layout yields between tasks of about 30 ms; build mode and the
  prop editor load when first opened.
- **State without waste.** Messages are coalesced into one reduction per frame,
  and under a heavy stream reductions are spaced by their own cost (20 times the
  last one's, at most 200 ms). The chrome around the scene renders only when its
  own props change; building templates are cached by their inputs.
- **Memory released.** Merged geometry lets its vertex data go once it is on the
  GPU; a left building drops its interior; nothing grows with time (a production
  build ran 10 minutes at 16x with a flat heap, geometries, textures and DOM).
- **Fast's choices.** Fast turns off the shadow maps, caps the pixel ratio at 1
  (Pretty at 2), drops the warm lamp pools, the grass tufts and wild flowers and
  the town life, and keeps the theme's fixed light instead of the day-night drift.

Measure, do not assume. The frame rate overlay (Settings, or the **F** key) shows
fps, the frame time mean and p95, the CPU work per frame, draw calls, triangles,
geometries and textures in memory, and the JS heap. It costs nothing while off.
The same numbers are `window.__worldPerf` for scripts, and
`window.__worldPerfWindow(ms)` gives them over a longer window. Measure on a
production build where it matters (startup, the phone): dev builds pay for dev
React and unbundled modules. Every optimisation is measured before and after on
the same scenario and kept only if it moves a number, with no visible change on
Pretty.

The final numbers of the night (filled in by the Dev Lead):

Measured on `c89f582` with `perf.mjs` (headless Chromium on Metal, 1440 x 900 unless noted, Pretty and the light
theme unless noted). Headless Chromium runs `requestAnimationFrame` at 120 Hz with about 1.5 ms of jitter, so a
steady 60 fps reads as a frame p95 of about 18 ms. On a real display it is 16.7 ms. The CPU work per frame decides
whether a display holds its rate.

| Scenario | Build | Frame p95 / max | Work mean / p95 | Draw calls | Frames over 33 ms |
| --- | --- | --- | --- | --- | --- |
| Demo, town | production | 18.2 / 20.0 ms (steady 60) | 1.4 / 2.2 ms | 279 | 0 |
| Demo, inside a building | production | 18.1 / 19.4 ms (steady 60) | 1.6 / 2.3 ms | 430 | 0 |
| Demo, town, dark | production | 18.0 / 19.3 ms | 1.4 / 2.2 ms | 320 | 0 |
| Stress town, 4x | dev | 9.8 / 10.9 ms (uncapped) | 2.3 / 3.0 ms | 498 | 0 |
| Stress inside, 4x | dev | 9.9 / 10.5 ms (uncapped) | 2.1 / 2.8 ms | 608 | 0 |
| Stress town, 16x | dev | 9.9 / 18.6 ms (uncapped) | 2.4 / 3.2 ms | 617 | 0 |
| Enter, zoom and leave a building | production | 17.9 / 18.5 ms | no long task | | 0 |
| Phone, Fast, town (375 px, 4x CPU throttle) | production | 18.1 / 19.3 ms | 3.6 / 5.6 ms | 240 | 0 |
| Phone, Fast, inside a building | production | 18.1 / 19.9 ms | 2.6 / 4.4 ms | 117 | 0 |
| Phone, Pretty, inside a building | production | 18.1 / 20.0 ms | 4.3 / 6.6 ms | 294 | 0 |
| Startup to a dressed town | production | first frame at 0.79 s | | | |

The same scenarios before the rounds (`35f0872`, dev build):

| Scenario | Work mean / p95 | Draw calls | Frames over 33 ms |
| --- | --- | --- | --- |
| Demo, town | 4.6 / 6.2 ms | 676 | 0 |
| Demo, inside a building | 5.3 / 7.2 ms | 916 | 0 |
| Stress town, 4x | 8.0 / 9.6 ms | 1893 | 4, with a 40.9 ms max |
| Stress inside, 4x | 7.8 / 10.2 ms | 1255 | 11, with a 50.8 ms max |
| Phone, Fast, town | 13.1 / 17.2 ms | 636 | 0 |
| Startup | first frame at 2.1 s | | |

Memory, read after a forced GC every 30 s:

- 10 minutes of the demo at 16x on a production build: the JS heap moves between 22 and 25 MB with no trend.
  Geometries, textures, DOM nodes and listeners stay the same.
- 5 minutes of the stress fixture at 16x: the heap grows 0.4 MB, and the rest stays the same.

## Acceptance

The world, in demo mode and when it later reads crewhub-loops through the host,
must operate with all model access disabled. Document any new network endpoint, background loop, model trigger, and
its cancellation path when adding functionality. A visual feature is not an
exception to this policy.
