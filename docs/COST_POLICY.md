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
  when something that casts or lights it changed (a fit, a building's casters, a
  lift, the dressing, the civic robots, the drift's sun after a step of about
  half a degree; the drift itself moves at most at a 4x pace).
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
  multiplies world matrices only below a change; a still town costs almost
  nothing per frame.
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

| Scenario | Build | Frame p95 | Work mean / p95 | Draw calls | Frames over 33 ms |
| --- | --- | --- | --- | --- | --- |
| PERF_TABLE | | | | | |

## Acceptance

The world, in demo mode and when it later reads crewhub-loops through the host,
must operate with all model access disabled. Document any new network endpoint, background loop, model trigger, and
its cancellation path when adding functionality. A visual feature is not an
exception to this policy.
