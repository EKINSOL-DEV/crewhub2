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
director and plays its intents only inside an entered building. Since round 11
(21 October) the same script can run in live mode: its own opt-in in Settings
("Scripted director in live mode, no model"), off by default and never implied
by the demo's switch; its plans are made from the live facts (who is idle in
which building), its intents validated exactly as in the demo, and it moves only
the world's own figures through the walk runtime, never reading or writing
crewhub-loops. Every intent, every line of the text view's director section and
the director log carry the word "scripted", so it cannot be read as real
behaviour. `npm test` fails on an AI SDK import or a model endpoint.

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
- **Interiors ahead, three at a time.** The interior and the inside layers (the
  signals, the personal things, the props, the objects' meshes) of the likely next
  buildings (the jump list's row, the pointer's, the keyboard's; two at most,
  `prepareAhead.ts`) are built in idle time, in steps that each start only with
  idle time left, and their programs warmed, so entering one shows no long task.
  The entered building and the two most recently used keep their interiors; others
  drop them.
- **Startup in slices.** Shaders compile in parallel before the first frame; the
  town's first layout yields between tasks of about 30 ms; build mode and the
  prop editor load when first opened. Nothing suspends on the road to the town,
  the snapshot is read ahead and the world's chunks are preloaded; the navigation
  graph and the walkers come in a task right after the first drawn frame; the
  Greenhouse models are validated and the director's graph built on first use; the
  merge writes every vertex once (rounds 4 to 6, the table below).
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

Live mode, frames (`perf.mjs --source live --preview`, the fake crewhub-loops playing a scenario at 16x behind the
host, a production build served by the host; the heap here is read without a GC, as the overlay shows it):

| Loops, projects | View | Frame p95 / max | Work mean / p95 | Draw calls | Triangles | Heap, no GC |
| --- | --- | --- | --- | --- | --- | --- |
| One project | town | 18.3 / 18.7 ms (steady 60) | 0.8 / 1.0 ms | 106 | 0.31M | 47 MB |
| One project | inside | 18.2 / 18.7 ms | 1.7 / 2.0 ms | 506 | 0.64M | 32 MB |
| Small team, 4 | town | 18.2 / 25.6 ms | 1.6 / 1.8 ms | 206 | 0.62M | 46 MB |
| Small team, 4 | inside | 18.2 / 100 ms, 2 slow (see below: the settlement dressing rebuilt at a restore) | 2.2 / 2.6 ms | 591 | 0.97M | 43 MB |
| Studio, 20 | town | 18.2 / 18.8 ms | 4.2 / 4.8 ms | 674 | 2.83M | 88 MB |
| Studio, 20 | inside | 18.1 / 18.7 ms | 2.9 / 3.7 ms | 520 | 1.50M | 127 MB |

The un-collected heap (88 to 127 MB for the studio) against 33 MB after a GC is the gap the 6 October note fell into.

**The slow frames of the small team inside (21 October).** They were not the Enter: the interior had been prepared in
idle time 2 s before it (`world:interior-built`, 1 ms for its last step). They were the settlement dressing rebuilt
whole, at once, twice: when the storyline restored a project (every lawn, hedge, tree and garden of the town made
again, instanced and merged, 55 ms in a 71 ms sync at 4 projects, about 240 ms at 20) and once more 3 s later when
the project order changed (the restored project back in its place; the plot index seeds a garden, so pumpkins moved
house and the town was rebuilt for nothing). Since then the dressing's lots are in slug order (a reorder rebuilds
nothing), a plot wears the look its building's shell shows (a closing keeps its baskets until the boards come, an
opening gets them back with its lights), and a rebuild after the first is built in steps over the frames (the pieces,
their models in chunks, the instancing and the merge in chunks too: `instanceStaticSteps`, `mergeStaticSteps`, at
most about 4 ms of steps a frame, one step at least) while the old dressing stays: no step is over 8 ms at 4
projects or 22 ms at 20. The same run after: inside, small team, frame max 26.6 ms, 0 slow. The idle interior build
now runs its step after at most 400 ms even without idle time (a busy stream leaves none), for 12 ms of work, so
four steps are through in under 2 s instead of 6. The world leaves measures for the tools: `world:sync`,
`world:shell-built`, `world:dressing-built`, `world:dressing-step` and `world:interior-built`
(`performance.getEntriesByName`, each with a `detail`).

**The first paint, rounds 4 to 6 (21 October).** Each cut was measured before and after, back to back under the same
load, on a production build served by the host against the fake's small team (the bench: 7 fresh contexts, the median
`world:town-dressed` mark since navigation), with the town picture the same to the pixel (at most 51 of 1.3 million
pixels differ, the walking figures' bands aside) and the regress pass at full marks; the profile is `tools/profile.mjs`.

**How a cut is proven (round 24).** Pixel-identical means `tools/pixcheck.mjs` says so: the build before and the
build after (two commits, which it builds itself, or two dist folders), each served by `vite preview` on a port of
its own, the same pictures of each (the demo under reduced motion, sought to 120 s and paused, light and dark, 1440
and 375: the town, the town hall, a building and its rooms with the HTML label layer out of the layout (the labels' text jitters between captures; `--labels` adds the labelled pictures), the three preview pages as tiles;
with `--casts` every cast in every state near and far, the casting room's note pills hidden), every pair diffed on
every channel at any delta, a diff image per pair, `pixcheck: <identical>/<pairs>` last and exit 0 only at full marks.
Two runs of one build give 0 on every pair, so a differing pixel is the change's. Rounds 15, 21, 22 and 23 were proven
with the scratch rig this tool grew from (98 pairs, and round 23's 320); since round 24 the tool is the proof, and a
report names its run.

| Cut | What moved | Bench, before → after |
| --- | --- | --- |
| Round 4, `r4-bundle`: no Suspense on the road to the town, the snapshot read ahead, `modulepreload`, three.js in its own chunk | the page's part of a warm start 0.93 → 0.70 s; the Live chip about 0.5 s sooner | measured with `timeworld.mjs`, before the bench existed |
| Round 5, cut 1: `mergeStatic` writes every vertex once, plain attributes inlined | the merge's share of a warm start 64 → 33 ms (the cost was the per-vertex method calls, not the copies) | 415 → 377 ms |
| Round 5, cut 2: the navigation graph and the walkers after the first drawn frame | `navigation.ts` 60 → 24 ms and `walks.ts` 48 → 10 ms before dressed; `world:walks` about 30 ms after the first frame | 396 → 367 ms |
| Round 5, cut 3: the Greenhouse models validated on first use | the 35 ms task at 53 ms after navigation is 26 ms, with `validatePropModel` out of it | 401 → 380 ms |
| Round 6: the director's graph built on first use | the App chunk's 15 ms evaluation task gone; `world:snapshot` 50 → 35 ms | 382 → 373 ms |
| Round 6: the scene's `NavWorld` starts with an empty graph | about 10 ms out of the scene's constructor | 394 → 383 and 399 → 374 ms |
| Round 15 (22 October), the Greenhouse models' Object3D cut (Nicky's decision 7): a data model is one node holding its parts as data (`StaticParts`, `docs/WORLD_STYLES.md`) | the three.js objects made until the demo's town is dressed 12,614 → 6,417 (the parts, 6,420, no longer made; 22,617 → 9,520 once the interiors are built); in the profile the Object3D constructor's own time 10.5 → 5.7 ms, `three.core.js` 109 → 93 ms, the style's `kit.ts` 44 → 35 and `parts.ts` 25 → 17 ms inclusive, the page's own CPU until dressed 305 → 293 ms (medians of five) | 389 → 377 ms (medians of 35 runs each, five alternating pairs of seven; quartiles 379 to 403 → 371 to 383); every picture the same to the pixel: 98 pairs, 0 differing pixels (town, town hall, a building and each of its rooms, the three previews, light and dark, 1440 and 375, walkers frozen) |
| Round 21 (22 October), the phone pass under a 4x CPU throttle (375 x 812, production build, the host against the fake; first paint, Live, the tour's first step, the Chat panel, walk mode, medians of five): the two worst own-code costs on the road to the first frame, cut without a change to the look. 1: the room dresser's placement search (`roomDressing.ts`, `Planner.place`) computed the room's occupancy once per candidate spot in `#fits` and again in `#keepsPaths`; now once per piece, the candidate laid over it, and the flood fill without an allocation per cell. 2: the landmarks' bake (`civic.ts`, `bake`) made a non-indexed copy of every source mesh, transformed it with a `Vector3` call per vertex, merged the copies with `mergeGeometries` and made a mesh of every part a prop holds as data; now one pass unrolls, transforms and writes each source into the batch and reads the parts as data | `roomDressing.ts` 82 → 60 ms inclusive, `civic.ts` 74 → 61 (first paint at 4x); the first long task (the town's dressing) 326 → 314 ms; the page's own CPU until dressed 1,124 → 1,076 ms | the demo's town dressed 1,353 → 1,292 ms, Live 1,335 → 1,290, the tour's town 1,421 → 1,302 (its card at 1.95 s either way: the 1.5 s beat before it, not work); the Chat panel 30 ms and walk mode 8 ms a frame at 4x, neither touched; every picture the same to the pixel: 98 pairs, 0 differing pixels (the same set as round 15); parity tests pin both cuts (72 dressed templates prop for prop, the seven landmarks hash for hash and the bake against the old road to the bit) |
| Round 22 (22 October), two of round 21's named costs, chosen for the best gain at the least risk: the theme-colour sync (`state/theme.tsx`: a computed style and a 2D canvas for the `theme-color` meta ran in a frame callback right after the first render, forcing a style pass on a dirty document; now in idle time, `state/idle.ts`, within 2 s) and `validateLayout` (`world-engine`: a Set of "x,z" strings per call and a second occupancy for the entrance; now one byte a cell and the entrance read on the way, the same checks, errors and clone). The `sortPlacements` collator was tried and reverted: one `Intl.Collator` instead of `localeCompare` left the comparator at 17.8 ms, the cost being the collation itself | at 4x on the phone: `syncThemeColor` 20.5 → 0 ms self in the first-paint window (4 to 9 ms in idle time after it), `validateLayout` 21.8 → 0 ms, `navigation.ts` 70 → 43 ms and `walks.ts` 80 → 55 ms inclusive in the tour's window; unthrottled on the desktop `validateLayout` 8 → 0 ms | the demo's town dressed 1,362 → 1,289 ms at 4x in the passes, and in three back-to-back pairs the page's own CPU 14, 5 and 31 ms lower (the Mac's noise by day is about ±100 ms); the desktop 404 → 399 ms; every picture the same to the pixel: 98 pairs, 0 differing pixels; parity tests for both cuts (the old `validateLayout` kept as the reference over 123 rooms and 31 broken layouts; the idle seam's two roads) |
| Round 23 (22 October), the shader programs looked at where no material changes: nothing kept in code, the findings here. Found: 31 programs at the first frame for 177 materials (133 on visible objects), no two with the same shader text (three's cache keys share every identical one; the 35, 35, 21 and 19 materials on the four largest programs are the palette batches and their instanced twins, one material per batch by design, each with its own palette uniform), `KHR_parallel_shader_compile` present on the Metal ANGLE context and used by `compileAsync` (the CPU writes the 31 programs while the GPU links them); every program but one (a hidden ShaderMaterial's) is drawn by the first frame, so nothing of the 86 ms (at 4x: `onFirstUse` 28 ms, the first frame reading every program's uniform and attribute locations; `replaceLightNums` 24; `getParameters` 15; `WebGLShader` 15; the `#include` regexp 9; 103 ms in all, 33 unthrottled) can leave the road to the first frame without a material change. The first entry into a building does not pay the interior's programs either: the interior built ahead (round 7) shares the town's programs; the enter compiles one program, the objects layer's instanced palette batches (ten materials made at the enter), and waits about 7 ms for its link (`onFirstUse` 7.9 ms self at 4x, 7.1 unthrottled: the GPU, not the CPU); the rest of the enter's hitch (a 100 ms worst frame at 4x, 17 to 33 ms unthrottled) is the inside layers built at the enter (the objects, props, agents, signals and personal things: `pieces.ts`, `instanceStatic`, `objectLayer`), their uploads, the framing and React, about 90 ms at 4x. Tried, not kept: (1) an idle-time warm of an interior built ahead (three's `compileAsync` over the building's group, hidden meshes included, then one `getUniforms()` per program): it touched 12 programs in 10 to 12 ms of idle time and moved nothing, the interior having no program of its own (the enter's worst frame in back-to-back pairs 124 → 117, 117 → 134, 125 → 124 ms at 4x and 33 → 33, 33 → 18, 33 → 25 unthrottled; a module and an idle task for no gain); (2) reading the locations of the programs already linked while the first `compileAsync` waits for the rest: at 4x the GPU has linked everything by the time the CPU has written the last program, so the reads only lengthened the wait; unthrottled the GPU is still linking and every location query stalls behind the links (`onFirstUse` 16 → 47 ms self, the first frame 397 → 418 ms). Both pixel-identical (98 pairs, 0 differing pixels) | the next lead: the objects layer's instanced meshes made ahead of the enter (the templates it needs are known from the model before the enter, a layer change, not a material one), which takes the one program's compile and its 7 ms link, and part of the 90 ms of inside layers, out of the enter's frame | the first paint and the enter as the base: 1,419 ms dressed and a 100 ms enter hitch at 4x on the phone, 397 ms and 17 ms unthrottled on the desktop (medians of five on a busy Mac; the pairs above are the read) |
| Round 24 (22 October), the building-enter hitch (round 23's lead): the inside layers of the likely next buildings built ahead of the enter, in idle time, bounded (`world/prepareAhead.ts`). The signals: the jump list's active row while the list is open (`JumpList` tells the app, the app the scene: `likely`), the building under the pointer, the keyboard's focused building; at most two of them hold a built interior and inside layers at a time (the town keeps three interiors, the entered one and two more, so two built ahead never push each other or the entered one out; a person has at most two signals at once), one build at a time, in the interior's own slices (an idle callback with a deadline, `IDLE_STEP_MS` of work per slice, `IDLE_TIMEOUT_MS` before a slice runs anyway), a candidate that stops being likely has its build given up with what stands kept. What is built ahead, hidden, each by its own signature so a pass after a model update costs the signatures: the figures' work places at their desks (`#prepareSeats`, kept while the desk is the same), the signals, the personal things, the town document's props (`propLayer` `prepare`: kept across the town view's syncs until the enter or the release, nothing materialises, build mode untouched) and the objects layer's templates and instanced meshes at the capacity the frame needs (`objectLayer` `prepare`: one visit shared with the frame's write, count 0 until the enter; the templates stay with the building as before, so the instanced palette program keeps a material and is never deleted by three while the town stands, round 23's note); then the programs of each inside group compiled and read in idle time, one group per idle callback (`warmPrograms.ts`, round 23's; a whole building's warm at once ran 30 ms at 4x). Not built ahead: the figures' near meshes (the cast materialises them when told near; a far figure drawn by meshes would be another look), the people, the UI's render | at 4x on the phone the enter's worst frame 90 → 57 ms (five runs: 101, 82, 92, 90, 84 → 57, 57, 47, 57, 67) and its tasks over 50 ms 1 → 0 (the two that remain: the first frame inside 32 to 34 ms, the framing and React 30 to 32 ms); unthrottled on the desktop 17 → 10 ms. The idle work: the inside layers 33 to 44 ms in 23 slices at 4x, the warm 13 programs in 6 idle calls of at most 18 ms; the town's frames meanwhile: in three back-to-back pairs at 4x the worst frame between dressed and the enter 75 → 76, 58 → 67, 59 → 66 ms and the frames over 50 ms 2, 3, 2 → 2, 2, 3 (the same frames as before: the walkers' task and the labels' first layout right after dressed); unthrottled 25 → 25 ms and none over 50 ms in either | in the same pairs the enter's worst frame 92 → 33, 91 → 50, 91 → 51 ms at 4x, its tasks over 50 ms 1 → 0 in every pair, and 25 → 10, 17 → 10, 25 → 10 ms unthrottled; the first paint untouched (1,386 → 1,272, 1,292 → 1,347, 1,274 → 1,336 ms at 4x on a Mac in use; 403 → 398, 379 → 390, 400 → 384 unthrottled); every picture the same to the pixel: 98 pairs, 0 differing pixels; tests for the order of the likely buildings, the objects layer's prepare (what it bakes is what the frame draws, no bake and no regrow at the enter), the props layer's prepare (kept, hidden, released, no ghost, not primed) and the warm's seam |
| Round 25 (22 October), what remains of the enter, named to the function with `tools/profile.mjs --enter` (new: the first entry into building 0 at 4x on the phone, its 500 ms, its tasks and their stacks, the page's own frames per task). Two tasks: React's commit of the inside UI (33 ms at 4x: the scene's `setView` inside the canvas's effect 14 to 17 ms, of which the building's `update` 4.7 (the figures told near 1.9, the objects' states 1.1), the camera framing and the first layout read 8; React's own render and commit about 8; the key handler's effect re-subscribed, the scheduler) and the first frame inside (32 to 34 ms: three's first draw of the inside scene about 20, the objects' first write 2.6, the instance culler 2.8, the labels' placement 1, the figures' update 0.9, the one program's hook 0.7). Kept: the inside labels' template, desks and placements memoised per model (`Interior`, `TownLabels`: 2 ms at 4x of every render while inside, not only the enter's) and one media query list for `useNarrow` (`matchMedia` on every render of the app: 1 ms at 4x). Tried and dropped: the framing, the shadow fit and the labels' placement reading the canvas's size from `resize`'s cache and the chrome measured on the next placement, so React's commit reads no layout: the layout of the inside UI then went into the labels' own measurement (`refreshLabels`, 6.8 ms) and the pairs moved nothing; the first layout of what was just mounted is paid in the frame wherever it is read. Not done: the figures' near meshes made ahead (the crowd's resting path keeps a figure's meshes where they are, so meshes made later would draw beside the crowd's copy until the figure wakes; and a far figure with meshes is picked where it was not), a deferred render of the inside labels (they are seen at once: a frame later is a look change in time) | the enter's worst frame in back-to-back pairs at 4x 49 → 49, 50 → 42, 50 → 43 ms (medians of three; in passes of five 49 → 51), unthrottled 10 → 10 in every pair: the two cuts are inside the noise of the frame, and the inside UI's layout and the first draw are what an enter is | pixel-identical by `tools/pixcheck.mjs`: 74 of 74 pairs identical (the demo set, light and dark, 1440 and 375), twice, on the build with the dropped layout moves and on the final head; no new unit test (the two cuts are React memoisation and a cached media query; the proof is the pixel check and the numbers) |
| Round 23 (22 October), the figures as data (crewy's item 2; the Object3D constructor round 22 left): a figure's joints hold their parts as data (world-style's `FigurePiece`, the kit's `piece`), the far crowd draws them from the data with the joint's world matrix times the part's, and the meshes are made only when the figure is first told near, draws on its own (a see-through proxy, a stale figure) or is asked (`materialise`); every cast and the persons, the joints, blob, halo and steps still objects (`docs/WORLD_STYLES.md`, "Parts as data") | the Object3Ds made until the demo's town is dressed 6,202 → 5,995, the scene's nodes 914 → 707 (the seven building agents' parts); in walk mode the page's own CPU over 5.5 s at a phone's 4x lower in three back-to-back pairs (2,771 → 2,742, 2,502 → 2,401, 2,755 → 2,557 ms: the matrix pass no longer walks a far figure's parts) | the first paint within the noise (three pairs at 4x: −111, +25, +131 ms; the demo's seven agents are about 210 meshes; a town of twenty projects seen far is hundreds of figures, 20 to 79 meshes each before, 13 objects now); every picture the same to the pixel: the 98 pairs, and 320 pairs of every cast in every state near and far (the far rooms' HTML note pills jitter between captures, two pairs the first time, four the second, none of them a figure; with the pills hidden 160 of 160 far pairs at 0); parity tests per cast against the old runtime kept verbatim (every role and state, far as data matrix for matrix, near as a tree node for node) and for the crowd instance for instance |
| Round 41 (26 October), the far crowd's batches under the day-night drift (the Lead's question after round 41's chat soak, whose late `MeshStandardMaterial`s turned out to be the faded figures' own see-through copies: ten per proxy or stale figure, disposed and remade at each of its state changes and released when it un-fades, bounded by figures × parts): a glowing far part (the potlings' and the sprouts' lit parts; the classic bots glow only near) batches by its material and draws through the material's instanced twin (`instancedMaterial.ts`), whose emissive strength reads through to the source. Before, the batch key carried the strength, which the drift moves in place a few times a second (the kit's `setLight`), so every value it passed made a new batch, an `InstancedMesh` with a cloned material, that `#batches` never dropped | `apps/world/test/robotCrowdDrift.test.ts`: 200 strengths of the drift, the potlings' crowd 51 → 850 batches and the sprouts' 45 → 642 before, +0 batches and 0 cloned materials after, the batches glowing with the source; a plain part's key leaves the black emissive out (it adds nothing to a frame) | pixel-identical on every cast in every state near and far and on the demo set (`tools/pixcheck.mjs --casts`, the pairs in the round's report); no first-paint change |
| Round 42 (26 October), faded figures share their see-through copies (crewy's direction after round 41's finding): a proxy or a stale figure drew its ten visible parts with its own clones of the kit's materials, disposed and re-cloned at every look change; now the copies are shared per kit material and mode (proxy, stale, or both at once: the opacity, the depth write and the lerp towards the kit's `stale` colour are all a copy differs by, nothing per figure), ref-counted by the figures holding them (`runtime.ts` `acquireFaded`/`releaseFaded`), the last figure leaving a copy disposing it and a kit material's dispose taking its copies with it | `packages/world-cast/test/fadedShare.test.ts`: 200 figures flipped between faded and not: the copies alive equal the distinct materials the faded figures draw (one per kit material in use), 0 when none is faded, one figure's 200 look changes clone nothing, every copy made is disposed by the end; before, ten clones per faded figure and ten more per look change | pixel-identical on every cast in every state near and far and on the demo set (`tools/pixcheck.mjs`, the pairs in the round's report); no first-paint change |
| Round 45 (26 October), the three small makers of round 44 closed, each with its guard: the director feed's plan stamps trimmed to the last day as each plan is stamped (`director.ts`; before, one entry per plan for as long as the page lived, about 12 a loop and 6,400 a real day at 16x); the objects layer's celebrations as a map of the last `celebrateUntil` per ticket, dropped with the object's state (`objectLayer.ts`; before, a set of every `ticket:until` pair ever played, one new pair a demo loop); the host's archive memory forgetting what the old loops taught when discovery's target changes (`host.ts` `judgeMemory`; before, loops A's slugs showed under loops B and B's file could be written before B taught its set) | `directorStamps.test.ts` (four feed-days of the demo's models: stamps held at most the day cap, the usage windows recounted exactly), `manyLoops.test.ts` now stepping the feed, `celebrated.test.ts` (200 loops of celebrations of four tickets in node: four entries, every celebration played, none once the objects are gone), `archiveSwitch.test.ts` sampling the health and the file through the switch; each fails with the fix taken out | pixel-identical on the demo set (`tools/pixcheck.mjs`, 74 pairs, the round's report); no first-paint change |

From the command (`tools/timeworld.mjs`, warm, against the development loops' 5 projects): the town drawn and dressed
about 750 ms after `npm run world` before round 5's cuts and about 700 ms after them on a quiet Mac, 1.6 s cold; the
sixth rehearsal on a busier Mac read 1.33 s warm and 1.78 s cold, the machine and not the code. What is left on the
road to the first frame is worth a few milliseconds per item (round 21's phone pass took the two largest own-code items, the room dresser's placement search and the landmarks' bake; round 22 the theme-colour sync and the layout validation; round 23 the figures' parts as data (the Object3D constructor); the rest of that profile is three's shader programs (round 23 looked at them where no material changes: 31 programs, none duplicated, all but one drawn by the first frame, the parallel compile extension in use; nothing leaves that road without a material change, and the first entry into a building pays one program, the objects layer's, not the interior's), the merge's vertex work, the collation of the agents' names and React's first render) (`computeBoundingSphere` over the merged batches, the cast
registry's validation at import); the Greenhouse models' Object3D count, the one cut that touched the style package,
was Nicky's call and is built (round 15, the last row of the table).

**The Pretty/Fast switch** costs one long frame of shader recompiles (about 150 ms at 4 projects, 450 ms at 20): a
setting, not a stream event, left as is (crewy, 21 October).

**Hidden copies (21 October).** A merged mesh that was never drawn keeps the JS copy of its vertices until its first
upload. A scene census of the studio town at its home view (dev build, `window.__town`) found 24.0 MB of geometry
arrays, of which the hidden ones were not the walls' inside variants but the furnished silhouettes (7.1 MB: every
building keeps its silhouette hidden at a region's overview, where it would be a pixel), the piles (1.4 MB, hidden
likewise), the low rims of the tall back walls (0.5 MB, shown only when the camera turns to look from the north or
the west) and the one interior prepared ahead for the enter (4.1 MB, meant). Since then the silhouette and the piles
are built on the first frame they are drawn (buildingView `showLazy`, for the buildings in view, at most about 4 ms
of them a frame so a zoom into a region builds a few a frame: zoom frame max 58 to 26 ms), the low rims and the wall
art on a partition's far face the first time the camera looks from that side (`#lowRim`, `#farFace`, built inside
the shell's draw callback with a frame asked for the settled picture). Arrays 24.0 to 15.4 MB at the studio's home
view; draw calls and triangles unchanged (729, 3.55M); pictures before and after the same at the home view, inside
and turned (the pixel difference along a lazily built rim is edge noise under half a percent). What remains hidden
is the prepared interior.

Live mode, the night of 2026-10-20 (`b0cb111`; `memory.mjs live`, a forced GC every 60 s, the fake crewhub-loops
playing a scenario at 16x behind the host, 30 minutes each, heap snapshots at 0, 10 and 30 minutes summed by
constructor):

| Loops, projects | Build | Heap after GC at 0 / 10 / 30 min | Growth after warm-up | Geometries, textures, DOM, listeners |
| --- | --- | --- | --- | --- |
| One project | production | 13.7 / 17.8 / 18.1 MB | +0.6 MB | flat |
| Small team, 4 projects | production | 17.0 / 22.4 / 23.0 MB | +1.3 MB | flat |
| Studio, 20 projects | production | 29.2 / 32.9 / 32.9 MB | +0.5 MB | flat |
| Studio, 20 projects | dev (Vite) | 53.0 / 55.6 / 54.9 MB | -0.3 MB | flat |
| The development crewhub-loops on 8291, 5 projects, 10 min | production | 19.4 / 21.9 MB | +0.1 MB | flat |

The first ten minutes are warm-up (shader programs, the interior the pointer prepares, JIT code). What grows from
minute 10 to 30 is the browser's own, not the world's: Chromium's inspector keeps a record per network request while
a CDP session is attached (one per refetch the host answers, about 1 700 in 20 minutes at 16x, 0.5 MB) and the JIT
re-tiers code (0.3 to 0.5 MB). Nothing the world holds grows with events: the projection's history lists are capped
(300 entries), deliveries at 500, the director's plan log at 40, the town document's undo history at 50, and the
frame ring is a ring.

Where the 20-project heap goes (production, after GC, the start of the studio town, 29 MB): vertex data in typed
arrays is the largest kind (about 23 MB of `ArrayBuffer` backing in all, of which about 11 MB are the JS copies of
merged meshes that are hidden at creation (a back wall's inside variant, art on a partition's far face) and so not yet
uploaded; a merged mesh lets its copy go once the GPU has it), then the bundle's code (8 MB) and the model's objects
and strings (5 MB). The dev build adds about 25 MB of module source and source-map strings and 10 MB more code: a
dev-server number is not a user's. The "about 300 MB" noted on 6 October was the un-collected heap of a dev build
(V8 lets garbage pile up to several times the live size between major collections; the overlay's heap number is read
without a GC): after a forced GC it is 55 MB, and 62 MB on the stress-20 fixture. The one cut made: a palette batch
(plain colours, no map) drops its uv after the merge, a quarter of every merged vertex on the GPU and in the hidden
copies (the studio town's geometry arrays 26.2 to 23.0 MB; the look is the same, nothing read them). The rest of the
hidden copies would need those variants built on first sight, which is a later round.

A light two-hour soak against the development crewhub-loops on 8291, the evening of 2026-10-22 (`299c2ce`;
`memory.mjs live --preview`, a production build behind a host of the tool's own, the page in `live`, a sample a minute
with a forced GC, heap snapshots at minutes 10 and 120; `loops-seed.mjs --speed 4` the one writer, about 20 writes a
minute, 2 550 applied over the two hours; the page's stores read through `window.__worldStores`):

| Minute | Heap after GC | Geometries, textures | DOM nodes, listeners | Frame mean / p95 | Upstream reconnects |
| --- | --- | --- | --- | --- | --- |
| 0 | 22.4 MB | 0, 0 | 285, 219 | (first frame) | 0 |
| 10 | 24.2 MB | 233, 9 | 285, 219 | 16.7 / 17.5 ms | 1 |
| 60 | 24.9 MB | 233, 9 | 310, 231 | 16.6 / 18.0 ms | 11 |
| 120 | 24.7 MB | 233, 9 | 285, 219 | 16.7 / 17.5 ms | 23 |

After the ten-minute warm-up the heap moved between 24.2 and 25.0 MB: 0.5 MB from minute 10 to minute 120 by the
endpoints, 0.24 MB an hour by a line through the 111 samples (the tool's growth line, whose base is the second
minute, says 1.2 MB and 0.61 MB an hour: most of it is the warm-up's). The snapshot diff names what grew (0.9 MB in all): the
inspector's record per network request again (0.4 MB, the CDP session's, not the page's), re-tiered JIT code (0.4 MB)
and the performance timing buffer; the world's own objects, arrays and strings grew by 60 KB together. Geometries
232 to 233 in the first five minutes (one lazily built piece), then flat; textures flat; the DOM 285 nodes and 219
listeners at the start and the end, with a bounded excursion of +25 nodes and +12 listeners in 22 of the 121 samples
between minutes 31 and 72 (two values only, never a third). The frame time sat on the 60 Hz vsync (16.6 to 16.7 ms
mean, p95 17.3 to 18.3 ms) with 1.7 to 2.3 ms of work a frame, the same at minute 120 as at minute 10. The host's
upstream stream reconnected 23 times, once every five minutes: loops ends every stream after 300 s by design and the
host resumes from its cursor after a 1.5 to 3 s pause, without a reset to the tab; the page's connection read `live`
on every sample and its bubbles, Recent answers and chat threads stores stayed at zero (bubbles are the fake's, round
12; nobody opened the chat), the town document at revision 0 (nothing edited it; the tool's host had no saved town, so
it never named a revision). Nothing grows without bound at this write rate over two hours; the next soak can be
longer or at a faster seed.

**The budget check after 31 rounds (round 32, 2026-10-23).** Everything above measured again on `a3e5a22`, the
production build, against the last numbers here (the frame tables of `c89f582`, the live table of 21 October, the
soak of `299c2ce`) and the passes of rounds 21 to 23 (`134818a`, `6ca81fd`). The method is the tools' (`perf.mjs
--preview`, `memory.mjs --preview`, round 21's phone pass rig: five runs, medians; `tools/pixcheck.mjs` for any fix,
none was needed). Where a number sat more than 10 % over its last value, a back-to-back pair against the kept
`6ca81fd` build dated it: the head and `6ca81fd` read the same within noise on every pair (demo inside 1.7 to 1.9 ms
of work against 1.7 to 1.8; the phone's Fast town 3.7 against 3.7 to 3.8; the live small team's town p95 2.6 to 3.3
against 3.1), so what grew did so between 2 October and round 23 (the three-room buildings, the racks and decor, the
persons, the chat marks: 0.62M to 0.78M triangles in the small team's town), was measured then and sits inside the
budget. Nothing regressed over rounds 24 to 31.

| What | Last number here | `a3e5a22` |
| --- | --- | --- |
| Bundle, `vite build`, bytes (gzip) | 2,374,398 (703,713), 30 files, round 15; 2,420,496 (714,023), round 23 | 2,432,889 (718,967), 22 files: JS 2,234,036 (616,928) in 16 chunks, CSS 116,648 (20,477), three fonts and the page 82,205; +2.5 % since round 15, +0.5 % since round 23; the 171 model files ride in the style chunk (390,799 / 84,604) |
| The town road, cold | 18 `modulepreload` links (round 4) | 15 requests, 2,273,600 bytes (11 scripts, 2 stylesheets, 1 font, the page), dressed at 478 ms in that context |
| Demo, town / inside: frame p95, work mean / p95, calls | 18.2 ms, 1.4 / 2.2, 279; 18.1 ms, 1.6 / 2.3, 430 | 18.0 ms, 1.5 / 1.7, 230; 18.1 ms, 1.8 / 2.0, 411 (steady 60, 0 slow; dark town 18.1 ms, 1.5 / 1.8, 265) |
| Phone, Fast, town, 4x | 18.1 ms, 3.6 / 5.6, 240 | 18.3 ms, 4.1 / 5.5 (3.7 in three later runs), 221 |
| Live, small team, town / inside | 18.2 ms, 1.6 / 1.8, 206, 0.62M; 18.2 / 100 ms, 2.2 / 2.6, 591, 0.97M | 18.1 ms, 1.5 / 3.3, 239, 0.78M; 18.1 / 18.7 ms, 1.9 / 2.3, 564, 1.00M (0 slow) |
| Live, studio, town / inside | 18.2 ms, 4.2 / 4.8, 674, 2.83M; 18.1 ms, 2.9 / 3.7, 520, 1.50M | 18.0 ms, 3.5 / 4.2, 692, 2.89M; 18.2 ms, 2.6 / 3.2, 487, 1.52M |
| Heap after GC, ten minutes: demo at 16x; the studio live at 16x | 22 to 25 MB; 33 MB | 22.8 to 26.2 MB (1 MB after the warm-up); 31.6 to 33.9 MB (0.8 MB); geometries, textures, DOM nodes and listeners flat but for the known bounded excursions of the need pins' words |
| Cold start to "town stands", desktop 1440 unthrottled | first frame 0.79 s (2 Oct); dressed 404 ms (round 23) | dressed 381 ms (own CPU 279 ms); `perf.mjs startup` 372 ms; Live 379 ms, the chip at 67 ms |
| The phone profile, 375 at 4x | dressed 1,409 ms, own CPU 1,170 (round 23 base) | 1,273 ms, own CPU 1,047; Live 1,267; the first-paint functions each at or under their round-21-to-23 values |
| Walk mode, a frame, desktop / phone 4x | 8 / 9 ms median / p95 | 8 / 10, worst 10; 8 / 10, worst 26 |

Where a frame's work goes now (ten seconds inside a building on the desktop, the CPU profile's self time): three's
render submission is three quarters of it (`renderBufferDirect` 78 ms, `projectObject` 75, the binding states 47,
the uniforms' `setValue` and `upload` 77 together over the ten seconds) and the matrix pass 50 ms; the page's own
code beside it is a few milliseconds a second. The same on the phone's Fast town at 4x: `renderBufferDirect` 182 ms,
`projectObject` 150, the matrix pass 139 over ten seconds, 1.6 s of CPU in all, no task over 50 ms.

## What to soak and how (rounds 27, 40 to 42)

A soak is a night job: the Mac quiet, one soak at a time, a production build (`npm run build` once), every host,
Vite and tool on ports of your own with your own `CREWHUB_WORLD_CONFIG_DIR` (never 5180, 8091, `~/.config/crewhub-world`;
8291 to 8293 only for a soak against the development loops with your own key). Nothing a soak finds goes on a branch
as a number without its date and commit. The tools' manual is [tools/README.md](../tools/README.md); the rounds this
section comes from are 27 (the two-hour live soak above), 40 and 41 (the chat soaks), 41 and 42 (the materials).

**The node guards first.** Three tests stand in for a soak and run in seconds, in `npm test`; a night that changes
the crowd, the figures or the kit runs them before anything opens a browser:

```sh
PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH
node --test apps/world/test/robotCrowdDrift.test.ts            # round 41: the far crowd under 200 emissive strengths, +0 batches
node --test packages/world-cast/test/fadedShare.test.ts        # round 42: faded figures' copies shared, 0 when none is faded
node --test packages/style-greenhouse/test/crowdBounded.test.ts  # round 43: the whole demo path bounded (below), 3 s
node --test apps/world/test/inCodeCaps.test.ts                   # round 44: the template cache of 64, the dressing memo of 256, the intent log of 40
node --test packages/world-model/test/longStream.test.ts         # round 44: 20 000 seeded envelopes through the projection and the reducer; every history list at its cap of 300, the deliveries at 500, what is keyed by ticket grows with the tickets, not the events; 0.5 s
node --test packages/demo/test/manyLoops.test.ts                 # round 44: ten demo loops at 16x with the carried chat; from loop 2 to 10 the envelopes, the chat, the facts and the memory per loop stay flat; 0.9 s
node --test packages/demo/test/directorStamps.test.ts            # round 45: the director feed over four feed-days; the plan stamps held at most a day's, the usage windows exact
node --test apps/world/test/celebrated.test.ts                   # round 45: 200 loops of celebrations in the objects layer; one entry per ticket, none once the objects are gone
```

`crowdBounded.test.ts` (round 43, r4-bundle) runs every cast on the Greenhouse kit through a seeded demo-like
timeline of 3,000 steps (the day-night drift at many strengths, look changes, faded flips, near and far, theme
switches, figures coming and going, the crowd's frame at every step); after a warm-up the batches, the live
materials, the faded copies and the geometries may not grow and the clones made are bounded. It fails on
`robotCrowd.ts` from `515dd39` (round 41's leak) and on `runtime.ts` from `cdd7747` (round 42's churn), so the next
leak of either kind fails `npm test` before any soak.

**1. The per-cast demo memory run** (the one round 41 lacked; run as round 41's fix hour). The demo with the
day-night drift on, which is the demo's default and what live mode never has, each of the four casts in turn, one hour
each, a production build behind a Vite preview. Without `CREWHUB_WORLD_PORT` the preview answers `/world-api` itself
with "no host", so the page runs the demo; the `--preview` flag only tells the tool it is a production build.

```sh
npm run build
export CREWHUB_WORLD_CONFIG_DIR=tools/out/soak/config; unset CREWHUB_WORLD_PORT
(cd apps/world && npx vite preview --port 5385 --strictPort --host 127.0.0.1) &
for cast in classic-bots overgrown-bots sprouts potlings; do
  node tools/memory.mjs --port 5385 demo --preview --cast $cast --minutes 60 --every 600 --snapshots 10,20,30,40,50,60 --json tools/out/soak/demo-$cast.json
done
```

- The heap after GC on every sample and the growth line's MB an hour (`growth.heapMBPerHour` in the JSON).
- The crowd's batches and materials: the tool does not print them. Round 41 read them from each snapshot's totals by
  constructor (`lib/heap.mjs` sums every snapshot by constructor name; the JSON keeps the 40 largest), in a copy of the
  tool with a `--count-names` option that printed `totals.byName.get(name).count` at every snapshot for three's
  `InstancedMesh` (one per batch), `MeshStandardMaterial` and `Mesh`. Their names are minified per build: find them in
  the built `three-*.js` chunk by their class bodies (`isInstancedMesh=!0`, `isMeshStandardMaterial=!0`, `isMesh=!0`;
  in the builds of 26 October `oi`, `fo`, `Jr`). r4-bundle counted the same name-free: a material is an object with
  `emissiveIntensity` and `roughness`.
- What good looks like (round 41's fix hour, the potlings): batches 90 and materials 313 to 314 at every snapshot,
  the heap after GC 25.9 to 30.3 MB, the snapshot total 49.2 to 50.4 MB. Before the fix: about 390 batches and 390
  materials more a minute, 5.4 MB a minute, and the snapshot of minute 40 no longer fit the tool (below).

**2. The live chat soak** (rounds 40 and 41). `memory.mjs live --preview` against the in-process fake, with what
the stock tool does not have: the fake's key reading the chat (`createLoopsFake({ keyReadsChat: true })` in a copy of
`lib/live.mjs` that also hands the fake out), the Chat panel opened by clicking `.chat-open` once the chip says Live,
a second tab of the same context left open and paired, a `setInterval` calling `fake.sendDm(agent, text)` every 5 s
over `g-man`, `cr-lead`, `cl-lead`, a burst of 300 sends in one loop right after the sample at the half, a wrapper on
the process's `fetch` counting every host read of `/api/dm/messages/<id>` (status, reads in flight), and a
`MutationObserver` counting the `li` rows added under `.recent-list`. Round 41 ran it three hours at `--fake-speed 1`
with `--every 600 --snapshots 10,90,180`, the minute-90 snapshot taken before the burst; it is r2-perf's scratch copy
of `tools/memory.mjs` (`memory-chat.mjs`), not in the tree: folding `--paired-tab`, `--chat-panel`, `--dm-every`,
`--burst` and `--burst-at` into the tool is a tool task for a night round. What to read:

- Rows added on the page = ids the host read = messages sent plus the storyline's own replies; none lost, none doubled
  (an id read twice at a cursor reset is the re-snapshot replaying the newest `dm.created`, the page shows it once).
- Reads in flight: at most 8 with round 35's read gate (`apps/host/src/dmReads.ts` on the answer branch for question
  14, in the merge plan's replay), all 200, no retry line, no lost line in the host's log, the burst's replies read
  within a minute at about 50 ms each; the head without the gate opened all 300 at once and lost 172 of them to
  "fetch failed" (rounds 40 and 41), so a run on a head without it reads that loss, not a regression.
- The stores at their caps (`window.__worldStores`: Recent answers 10, bubbles 2 to 3, threads 3), DOM nodes and
  listeners flat (463 to 492 and 237 to 240 with the Chat panel open), frame p95 about 18 ms, reconnects about 17 an
  hour (the fake's stream ends every 300 s and its sealed cursor expires at the 16-minute pass boundary).
- Anything the rig itself keeps in the page counts against the page: round 41's observer kept every row's label (0.3
  MB in three hours); cap such lists.

**3. The verdict, set before looking** (round 41's rule; write it in the report before the run):

- The heap after GC fitted by least squares over the last 80 minutes rises under **0.2 MB an hour**, and
- the JS-object part of the snapshot diff from the first snapshot to the last (arrays, strings, external string data,
  objects, closures, numbers, named constructors; not `(code)`, not the inspector's `NetworkResourcesData`, not V8's
  `native system /` bookkeeping) is at most **0.5 MB**.
- Samples taken while the Mac starved the process are left out and said so: a tool started in the background runs
  niced (10) and under a load of 13 to 18 its timers stall for minutes; the gaps show in the host's reads.
- The readings swing about 0.5 MB with the town's state (the samples with 186 geometries and 270 to 280 draw calls read
  above those with 180 and 230 to 250) and with the storyline pass (faded figures in one half of it); fit within one
  state when in doubt, and when the slope is still in doubt run the head beside the branch, same rig, same hour, same
  ports apart.
- JIT code grows about 0.7 MB per 90 minutes in every diff and is not the page's.

**4. How to name the holder.** In this order; stop when the holder is named.

- The tool's `--snapshots`: the 40 largest kinds per snapshot and what grew between two, by self size, in the JSON.
- A raw snapshot (the chunks of `HeapProfiler.takeHeapSnapshot` written to a file before `lib/heap.mjs` sums them;
  44 MB for the demo town, round 41's `--save-snapshots`), then a retainer walk: breadth-first over the retaining
  edges from the newest objects of the grown constructor to the nearest root, weak edges left out, the first hops
  grouped; a Map's string keys read from its `table`; what a holder reaches, counted by constructor. The minified names
  resolve in the built chunks by their class bodies (`isMeshStandardMaterial=!0`, `group.name = "robot-crowd"`, a
  class's field list). Round 41's walkers are r2-perf's scratch `retainers.mjs`, `kitmap.mjs` and `reach.mjs`.
- The sampling heap profiler for the maker: `HeapProfiler.startSampling` at 512 bytes with collected objects left out
  (`includeObjectsCollectedByMajorGC: false`) for an hour, or at 2048 bytes with them kept for at most five minutes,
  `getSamplingProfile` at the end, the stacks resolved by `url:line:column` in the chunk (round 41 named
  `packages/world-cast/src/runtime.ts`'s look function and `mergeStatic.ts`'s palette material that way). **Not**
  `startTrackingHeapObjects({ trackAllocations: true })`: it crashed the page within seconds of starting (round 41),
  and a 256-byte sampler that kept collected objects made the next snapshot take 395 s.
- The limits: a snapshot sums in about a second per 50 MB of heap (225 MB in 10 s) and holds about a gigabyte in the
  tool process while it parses; a snapshot of a heap over about **290 MB** does not fit one string (`RangeError:
  Invalid string length` in `lib/heap.mjs`) and ends the run, so a run that may grow that far takes its snapshots
  early and reads the heap after GC alone from there.

## Acceptance

The world, in demo mode and when it later reads crewhub-loops through the host,
must operate with all model access disabled. Document any new network endpoint, background loop, model trigger, and
its cancellation path when adding functionality. A visual feature is not an
exception to this policy.
