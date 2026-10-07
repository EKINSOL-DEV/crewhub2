# Night report: CrewHub World in demo mode (2026-10-01)

Branch `feat/world-demo`, built overnight against the accepted spec
[2026-10-01-world-demo-mode-design.md](../superpowers/specs/2026-10-01-world-demo-mode-design.md) and its five
addenda (the prop builder as a ticket, the Greenhouse item style, the ticket drone, Greenhouse as one style of
several, styles as future plugins). The loops integrator docs were read at crewhub-loops `a1bed0f`. Nothing was
pushed or merged to `main`.

## Summary

All six phases of the plan are built **in demo mode** and merged on `feat/world-demo`, with `npm run check` green
on every merge. The world runs on a scripted, deterministic, in-browser crewhub-loops that serves exactly the loops
shapes; the projection and the reducer do not know it is a demo. There is no network call and no model call
anywhere: a scanner in `npm test` enforces it.

One assumption shaped the start: `main` had gained the loops design-system kit (PR #27) after this branch's base, and
the spec requires that kit, so `main` was merged into `feat/world-demo` first (`8559cd1`).

## What was built, per phase

| Phase | Built | Merge |
| --- | --- | --- |
| 1. First light | `packages/loops-client` (loops types, hand-written validators, the `WorldSource` seam, a types-only host source); `packages/world-model` (projection: idempotent, ordered, thin-event refetch coalesced in 250 ms; reducer to the `WorldModel`; `describeWorld` for the text view); `packages/demo` (an in-memory loops store, 31 loops-level actions with loops' rules, a 16-minute seeded storyline that loops forever, speed 0/1/4/16, seek, a stale-probe episode); the town: one building per project in the Greenhouse style, colour and emblem from `ProjectOut`, the lead in the centre, counts per status, archived buildings boarded up, post office and town hall, navigation (town, enter, back; keyboard and touch), Demo chip, playback bar, hidden text view. Removed: the Greenhouse room UI, the mock crew, `apps/bridge`, `packages/protocol`. | `ac44520` |
| 2. Chat mirror | The loops dock and chat card copied byte for byte (`Bubbles.tsx`, `queries.ts`, `useMessageViewport.ts`, `bubbles.css`, `Menu.tsx`) with the loops commit in a header line and a copy check in `npm run check`; adapters at the copy's import paths; an in-browser demo chat API answering the loops routes from the demo source; sending appends to the thread, the postman claims and forwards it, a scripted "(demo reply)" arrives with `dm.answered`; the default head is the lead of the building in view, or the crewhub lead in the town. | `0f66503` |
| 3. Building interiors | Building templates (rooms as engine `WorldLayout`s with doors; role rooms grow in 4 x 4 modules); rooms by role and by status; work objects by kind with priority tags, straps, seals, milestone bands, stickers, name tags, speech marks; piles that turn into counted pallets (instanced); postures from debounced lane status; captions; stall lamps and quiet clocks, attention beacons, waiting-on-person tags, flagged letters, release banner, the truck; freshness labels; nameplates; role overrides; keyboard room navigation; lamplight scene in dark mode. **The ticket drone** (addendum): flights in source time (2 to 4 s at 1x), the model lands the object on the drop, "in transit" in the text view, retarget mid-flight, a fade under reduced motion. **The style seam** (addenda): `packages/world-style` (contract, manifest, semantic keys), `packages/style-greenhouse` (palette and lighting as JSON, 30 models as parts-JSON, the robots, shaders and stretchable pieces as code), a registry with nothing special-cased, per-building resolution, a boundary test, and [WORLD_STYLES.md](../WORLD_STYLES.md). | `f9a4fbd` |
| 4. Town and dynamic pathfinding | Heap A* (identical paths to the old scan), weighted A*, `NavGraph` (rooms, doors, two-layer routes with cached door distances), `NavSimulation` (single-occupancy doors with queues, wait budget 1.5 s then 5 s step-aside, event-driven replans, detail levels); the world's navigation over the town grid and every building; walks from facts (hand-over walks, workers entering and leaving, real-location switches along the town path), the postman's rounds with letters, seeded idle variety (Ambient setting), the `?stress=1` fixture (12 buildings, 100 agents) with a frame overlay. | `661fa1d` |
| 5. Build mode, layout and props | The town document (`crewhub-town/1`: plots with style ids, placements, user props, rules) in IndexedDB with a memory fallback, 50-step undo/redo, export and import (an invalid import changes nothing); the catalogue (built-ins, "Mine", provenance); build mode (palette, ghost that says fits or not in words, place, turn, move, drag, delete); the minimal prop editor; attachments (agent desk props, ticket riders); rule props (milestone banner, release crate, bug jar, rocket sticker, trophy); **the prop-request flow** (addendum): a `Prop: <thing>` ticket travels the statuses, the JSON lands as a comment, a person's Done imports it into the catalogue and it materialises where the request named it, or in storage; an invalid prop is a labelled error crate; "Request a prop" (Demo) runs the flow on demand. | `8bf4807` |
| 6. Scripted director and awareness | The closed intent list (`goToProp`, `visitAgent`, `gather`, `stay`) with validation (never moves a working, blocked, stalled or waiting agent; at most 8 per building; no text); a scripted feed in the demo (scheduled every 5 min, quick plans debounced 20 s, caps 40/h and 400/day, budgets, a deliberate invalid intent now and then); the AI-presence settings (off by default, model shown, budgets, usage counter with model calls always 0); `where(model, agent)` and a "Where is …?" form in the text view; the no-model-call and no-network scanner in `npm test`. | `d0431cd` |
| Prop-builder skill | `skills/prop-builder/` (SKILL.md, format reference with a drift test, eight examples), `npm run prop:validate`, the eval below. | `c3b3087`, `40595af`, `999ec9e` |
| Docs | AGENTS.md, VISION, ARCHITECTURE, ROADMAP, docs/README, root README, ASTRA_HANDOFF (rewritten as a current handoff), status lines on TOWN_PLAN, ADR 0001, ADR 0003, ROOM_REVIEW; DESIGN_SYSTEM (the chat copy rule); GRID_ENGINE (rooms, doors, numbers); WORLD_STYLES. | `c2d9949` and the phase merges |

### Joining the phases

Phases 4 and 6 were built in parallel, so a final task joined them (`14b991b`): accepted director intents now walk
through the navigation (only in the entered building; recorded only under reduced motion or in the town view; a
fact-driven move cancels a director walk), the director checks prop tags against real approach-cell reachability
instead of a demo table, there is one Ambient setting (inside the AI-presence block), the Escape chain runs editor,
Settings, build mode, text view, selection, room, building, and the phone layout was fixed (playback bar inside 375
px, home view framed on the used plots, compact labels inside a building, 40 px touch targets on coarse pointers).

A last polish task (`task/polish`) hid phone name and alert tags outside the focused room, brought
`docs/COST_POLICY.md` and `docs/VISUAL_DIRECTION.md` up to date, and removed a dead export.

## What was not done

- `apps/host`, the live loops stream, pairing, SQLite and everything in plan section 9 (out of scope by the spec).
- A second style, external style loading, a style editor (out of scope by the addendum). The older code furniture
  (desk, sofa, shelf, bench, lamp, table, plant) is still code in the style package, not parts-JSON.
- Agents carrying tickets on foot: the ticket drone carries them (addendum); agents only walk.
- A fade when an avatar becomes a proxy (it cuts, then walks or swaps); town-hall agents stay still.
- Attaching a prop to an agent or ticket from build mode (attachments come from prop requests and imported towns);
  placements on the town square; a manual "import from ticket" for a prop ticket closed while the world was not
  running.
- Persisted building modules (role rooms follow the current agents and can shrink, which TOWN_PLAN does not want).
- Measurements on the plan's reference machine and a screen-reader pass.
- ADR 0005 still says "proposed": accepting it is the user's decision.
- Inside a focused room on a phone, two tags can still overlap (tag stacking is not built).

## Verification

### `npm run check` on the final commit

```
> npm run typecheck && npm test && npm run check:docs && npm run check:design && npm run check:copy && npm run build
tsc --noEmit                                   no errors
node --test packages/*/test/*.test.ts apps/world/test/*.test.ts scripts/test/*.test.ts
                                               # tests 233  # pass 233  # fail 0
check:docs                                     Local file links checked in 48 Markdown documents.
check:design                                   design: hex guard ok (75 files); dark token parity ok (66 vars)
check:copy                                     bubbles copy: ok (5 files identical to crewhub-loops)
vite build                                     built (the existing chunk-size warning for three.js remains)
exit 0
```

The tests cover what the spec asks for: the projection (idempotent apply, out-of-order guard, thin `ticket.updated`
coalesced into one refetch), the reducer (status to room and object look, desks, proxies, freshness, debounce,
celebration only on a person's Done), the drone flights, heap A* (identical paths to the old scan on 150 seeded grids),
the portal graph and navigation (every room of 12 buildings reachable, doors single-occupancy, no actor waits more
than 5 s in the corridor stress test), the wait budget and step-aside, demo timeline determinism (same seed,
byte-identical envelopes; seek equals straight play), the loops-client validators against fixtures, the demo chat API,
the town document (invalid import leaves the previous revision), prop requests, the prop format and its drift test,
the style boundary, and the no-model-call guard.

### No model call, no network call

- `scripts/scan-model-calls.ts` runs in `npm test`: "No model or network calls in 172 files" (AI SDK imports, model
  endpoints, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and AI SDKs in every `package.json`).
- A separate grep of every tracked `.ts`, `.tsx`, `.mjs` and `.js` file for `fetch(`, `XMLHttpRequest`,
  `new WebSocket`, `EventSource(`, `sendBeacon`, `@anthropic-ai`, `openai`, `api.anthropic.com` and `/v1/messages`
  finds nothing outside the scanner and its tests.
- Every browser run logged requests: none left `http://127.0.0.1:<port>`.

### Browser pass of the final state

On `npx vite --port 5175` (port 5173 untouched), headless Chromium on the Apple M2 Max GPU (ANGLE Metal), scripted:

| Check | Result |
| --- | --- |
| Town, Demo chip, text view with the demo line and every building | pass |
| Enter a building by keyboard, room focus announced ("Lobby: quiet."), zoom to a room, Escape back out | pass |
| Speed control (pause, 1x, 4x, 16x) and scrub: stall (CR-24 "quiet 23 min, nudged 1x"), attention beacon, release published, stale snapshot ("stale since …", greyed robots) | pass |
| Agents walking inside a building (up to 3 at once); the postman's rounds in the town view | pass (postman: walks run) |
| The ticket drone: CR-18 flies from the review room to Dispatch; the text view says "in transit" during the flight only | pass |
| Chat dock: open the head, send a message, "Queued", then "(demo reply) …" and "Answered" | pass |
| Build mode: palette, ghost, place, undo; the prop editor; a prop ticket materialising in the lobby; the error crate | pass (buildui and Dev Lead runs) |
| Settings: Style Greenhouse, director off by default, model calls 0, roles, rules; export the town (`crewhub-town-r2.json`) | pass |
| "Where is …?" answers in the text view | pass |
| Reduced motion: no walking at 16x; drone flights become fades | pass (fades: interiors run) |
| 375 px light and dark: no horizontal scroll, no overlapping chrome, 40 px hit areas for signs on touch | pass |
| A tab opened hidden draws as soon as it becomes visible (simulated `visibilitychange`) | pass |
| No request outside the dev server's origin | pass |

Not done: a pass in a real, visible desktop browser window. The Claude-in-Chrome tab opened in a background window,
where the world correctly pauses rendering (`document.hidden`), so animation feel was judged from GPU-backed headless
runs and frame sequences, not by eye in a live window.

### Stress fixture (12 buildings, 100 agents)

`?stress=1` (dev builds only) runs a loops-shaped stress source through the same seam: 12 projects, 100 agents (12
leads, 4 agents in two buildings, 84 workers) plus the postman, a steady stream of moves, progress lines and
deliveries. Measured by the Dev Lead on an Apple M2 Max, Chromium headless with ANGLE Metal, 1440 x 900, device pixel
ratio 1, playback 4x, 300 frames per row:

| View | Frame mean | p95 | max | CPU work mean / p95 | Engine tick mean / max | Draw calls |
| --- | --- | --- | --- | --- | --- | --- |
| Town | 8.4 ms | 9.9 ms | 18.0 ms | 4.0 / 4.7 ms | 0.11 / 0.60 ms | 2,514 |
| Inside one building | 9.1 ms | 16.6 ms | 18.3 ms | 2.9 / 3.6 ms | 0.11 / 0.20 ms | 1,336 |

Both stay well inside the 33 ms frame budget. The engine alone (`node packages/world-engine/bench/stress.ts`, 84
rooms, 95 doors, 100 agents, 1,800 ticks) measured a p95 tick of 0.08 to 0.10 ms. Under SwiftShader (CPU
rasterising) the same scenes take 270 to 410 ms a frame; that says little about real hardware. The plan's
"reference machine" was not available; these are development-machine numbers.

### Screenshots

In the coordinator's scratchpad
(`/private/tmp/claude-501/-Users-ekinsol-nicky-Documents-GitHub-crewhub2/bf28f894-c1d8-45e4-9db6-ee5366197e34/scratchpad/`):

- `shots-demo/p1-*`, `p3-*`, `final-std-*`: town, building and text view per phase, desktop and 375 px, light and dark.
- `shots-demo/final-*`: the final browser pass (town, building, room, stall, attention, release, stale, live walks,
  chat, build mode, settings, where, reduced motion, 375 px, dark).
- `shots-demo/drone-*`: the drone carrying CR-18; `shots-demo/stress-{town,inside}.png`;
  `shots-demo/props-{eval,demo}-{light,dark}.png`.
- Developers' shots: `shots-bubbles/`, `shots-buildui/`, `shots-director/`, and the interiors, walks and finish shots
  listed in their reports (`report-*.md` in the same scratchpad).


## The prop-builder eval

Run by a Sonnet 5.5 developer at effort medium that read only the skill and its references, on six unseen requests
and the two demo prop requests:

| Request | Validator runs to green | Renders and reads as asked |
| --- | --- | --- |
| a coffee machine | 1 | yes |
| a whiteboard with three sticky notes | 2 (scribbles 0.004 thick; the limit is 0.01) | yes |
| a bug crate | 1 | yes |
| a server rack | 1 | yes |
| a potted cactus | 1 | yes |
| a delivery truck (2 x 5 cells) | 1 | yes |
| a reading nook with a lamp (demo) | 1 | yes |
| a tall fern for the lobby (demo) | 1 | yes |

All six eval props pass the validator and render in the world's style (`/props-preview?group=eval`). The one failed
first run, and five other notes from the eval (orientation of things with a front, leaning parts, big-prop limits in
one place, composite props, appliance categories), were fixed **in the skill** (`999ec9e`), not in the props. The
eval's coffee machine now stands in every lobby. Results: `skills/prop-builder/evals/2026-10-01/RESULTS.md`.

Prop JSON travels on the ticket as **a comment with a fenced `json` block**, not as an attachment: loops accepts
`attachment.added` as a filter but never emits it, so a world following the stream could never learn about an
attachment, while `comment.created` is emitted. The world takes the most recent `json` block on the ticket.

## Developers used

Every developer ran as a Claude Code session in its own Herdr tab and git worktree, at effort medium; the Dev Lead
ran Opus 5.5 at effort high.

| Task | Model | What |
| --- | --- | --- |
| core | Opus 5.5 | loops-client, projection, reducer, text description |
| demo | Opus 5.5 | the scripted in-memory loops and storyline |
| town | Opus 5.5 | phase 1 renderer and UI, removal of the Greenhouse room and protocol |
| props | Opus 5.5 | prop format, validator CLI, prop-builder skill, parts renderer |
| propeval | Sonnet 5.5 | the skill eval (eight requests) |
| engine | Opus 5.5 | heap A*, NavGraph, NavSimulation, stress fixture and bench |
| bubbles | Opus 5.5 | phase 2 chat mirror and demo chat API |
| interiors | Opus 5.5 | phase 3, the ticket drone, the style seam and Greenhouse package |
| director | Sonnet 5.5 | phase 6 |
| buildcore | Opus 5.5 | phase 5 pure core |
| docs | Sonnet 5.5 | the documents |
| buildui | Opus 5.5 | phase 5 UI and the prop-request flow |
| walks | Opus 5.5 | phase 4 in the world |
| finish | Opus 5.5 | joins between phases 4 and 6, phone layout |
| polish | Sonnet 5.5 | phone tags, two stale documents, a dead export |

## Art pass (morning)

After a first look in a real browser, the owner's verdict was that the world had lost the freshness of the earlier
Greenhouse room, that buildings should be bigger and roomier, and that the small-town feeling (green, paths, lanterns
and other details) matters a lot. The spec gained an addendum (`cf42bf7`), and the morning went to beauty, not
features. Six developers worked in parallel (Opus 5.5 at effort medium), each in its own worktree and branch, from
11:20 to about 13:00. Every finished area was merged `--no-ff` into `feat/world-demo` as soon as it landed green, so
the world on port 5175 improved through the morning.

Reference: the Greenhouse room on `main` at `3a66363`. All of the work goes through the `WorldStyle` seam and the
building templates; the reducer, the projection and the demo source did not change. New model keys live in four
namespaces added for the pass: `building.*`, `town.*`, `civic.*` and `decor.*`.

| Area | What changed | Main merges |
| --- | --- | --- |
| Buildings (`task/art-shell`) | A bigger template (33 x 28 cells, up to 20 x 18 units, generous minimum role rooms, `dressingZones()`), plots of 24 with streets of 6. Tall back walls (the outer north wall is the greenhouse glass wall with green mullions, the west wall chalk with windows), low rims on the camera sides that swap with the walls when the camera turns, soft partitions with timber door frames and pilasters. A floating cream slab with a bevelled edge and skirting; wood, tile and concrete floors per room kind. Project colour only on the entrance awning, door, flag, trim and a name sign over the door. Archived buildings boarded up with ivy, a closed sign and the flag at half-mast. A loading apron for the truck, window boxes, entrance planters, wall lamps, a bike and a doormat; warm lit windows in the evening. From the town, every building shows a merged silhouette of its furniture. | `4875727`, `8a50ea5`, `b2efd84`, `ed05617`, `da4e035`, `8bed50d` |
| Rooms (`task/art-rooms`) | `roomDressing.ts` dresses every room kind, deterministically, with blocking pieces in the room layouts (reachability tested) and non-blocking `decor.*` drawn only in the entered building: the old room's sofa, coffee table, bookshelves, floor lamps and pictures; rugs, clocks, whiteboards, pin boards, a mood wall, charts, a coffee corner, a lobby centrepiece, real storage shelving, a hand truck in dispatch; pendant lamps on cords above desks and tables; plants and blinds along the glass wall; personal things on every desk seeded by agent key; table lamps and candles for the evening. | `cf0977b`, `cde3529`, `ce41fd6`, `b16a730`, `f9c89f5` |
| Town (`task/art-town`) | `townDressing.ts` (pure, tested): sage-green grass with a soft mottle, trees, hedges, flower beds, a pond with a bridge and ducks, cobbled paths and sett crossings that the navigation town grid now follows, lanterns with warm pools, benches, signposts, bike racks, fences and gates. Empty plots became an orchard, an allotment, a playground, a picnic lawn and a meadow; each building has its own front garden (the archived one overgrown). The town floats as a diorama on a layered earth slab. String lights over the square in the evening. The phone home view frames the used plots tightly. | `fec652d`, `fec10c9`, `f7cd671`, `5c1c9b2`, `d353eb1`, `edf9084`, `7e5b0e2` |
| Landmarks (`task/art-civic`) | A real post office and town hall, the square with a fountain, a café with striped parasols, a bus stop, a notice board, a glass greenhouse, a windmill, a welcome sign and a clock post, all parts-JSON composites; a `?group=style` preview of every data model; a consistency pass over all models; the docs below; the prop-builder skill updated for the new namespaces (its eval re-run: 6 of 6 valid on the first run). | `b54cb2b`, `0c5f015`, `005463f`, `533c60e`, `7af38ad` |
| Light (`task/art-light`) | The old room's rig back: hemisphere fill, a warm key light with soft shadows fitted to what the camera frames, ACES tone mapping. Lamplight is a blue-green evening with warm cream walls, glowing lamps, screens and windows, and amber light pools (`LIGHT_POOLS`). Blob contact shadows under buildings and robots; a soft gradient of air behind the scene. A **Graphics** setting (Pretty or Fast, per viewer, Pretty by default; Fast turns off shadow maps, pools and fine dressing). Livelier robots, Greenhouse-style ticket objects, the postman's cap and satchel, the drone's shadow and sparkle, the truck's headlights. Bloom was tried and dropped (cost and taste). | `6bcfef3`, `191615c`, `15aacdd`, `232153d` |
| Labels and camera (`task/art-labels`) | By default a name pill per robot and at most one bubble; room signs, RULE chips, UPDATE cards, tags and counts appear for the room under the pointer, the focused or zoomed room, the selection, or everywhere with **Details** (button and `D`, per viewer). One quiet name sign per building in the town. Entering a building frames its footprint in the free canvas; a focused room fills the frame. Town life: drifting cloud shadows, birds, butterflies, fireflies, ripples, steam and twinkling windows (still under reduced motion, governed by the Ambient and Graphics settings). | `ca73615`, `556d74c`, `8d9ea39`, `4bd3a3e`, `6fe6e3e` |

Performance was owned by the rooms developer in the second half of the morning. A profile of the stress town showed
4087 draw calls and 4.5 million triangles; merging piles, the truck and the landmarks, lighter far robots, no shadows
from tiny pieces, a triangle diet for the dressing and fewer shell materials brought it back to about 1800 to 2000
draw calls.

The stress fixture (`?stress=1`: 12 buildings, 101 walkers; the scripts meant 4x but ran at 1x, see "Performance rounds") on the final commit `8bed50d`, headless Chromium on
Metal (Apple M2 Max), 1440 x 900, against last night's numbers. The p95 of about 16.6 ms is the headless display pace
(one frame at 60 Hz); single spikes up to 34 ms are the frames that refresh the town's shadow map.

| View | Last night | After the art pass, Pretty | After the art pass, Fast |
| --- | --- | --- | --- |
| Town: frame mean / p95 | 8.4 / 9.9 ms | 9.2 / 16.5 ms | 9.0 / 16.6 ms |
| Town: CPU work mean | 4.4 ms | 6.1 ms | 5.2 ms |
| Town: draw calls | 2528 | 1893 | 1882 |
| Inside a building: frame mean / p95 | 9.1 / 16.6 ms | 9.5 / 17.3 ms | 9.4 / 17.5 ms |
| Inside a building: draw calls | 1388 | 1302 | 682 |

Both settings stay far inside the 33 ms budget. Verification on the final commit: `npm run check` green (250 tests,
typecheck, docs links, hex guard and dark parity, the bubbles copy check, build, the no-model and no-network
scanner), and the browser regression pass (`pass-art.mjs`, last night's pass adapted to the calm labels, Details and
the Graphics setting) 38 of 38: keyboard entry and the Escape chain, room focus announcement, stall, attention,
release and stale in the text view, walkers and the drone, chat send and scripted reply, build mode place and undo,
settings and export, where, reduced motion, 375 px light and dark without horizontal scroll, no external request, no
page or console error. Before and after screenshots are in the coordinator's scratchpad under `shots-art/`.

### What would make it more beautiful next

- Instance the far robots per part across the town (about 750 of the remaining draw calls in the stress town).
- Hang wall art on interior partitions too (they are low now, so only the tall outer walls carry pictures).
- Let cloud shadows fall on roofs and buildings, and turn the fireflies into camera-facing billboards.
- A stronger, wedge-shaped stripe for the café parasols (the parts format has no wedge yet).
- Measure on the plan's reference machine, and look at the morning's work in a real, visible browser at 4x and 16x.

## Beauty round two (night of 2026-10-01 to 02)

The owner approved the art pass's "what next" list and added performance rounds (spec addendum `35f0872`). Six
developers worked in parallel from 00:45 (Opus 5.5 at effort medium), each in its own worktree and branch. The Dev
Lead merged every finished piece `--no-ff` once `npm run check` was green, so the world on port 5175 improved through
the night: 56 merges, the last at 03:06. The reducer, the projection and the demo source did not change.

| Area | What changed | Main merges |
| --- | --- | --- |
| Rooms | <ul><li>Art on the low partitions on both faces: frames, a calendar, a pin strip, a ledge plant, a clock.</li><li>A chair at every desk, and reading nooks on bare floors.</li><li>Rugs kept inside their rooms, and pendants only over tables, so they no longer cover a desk.</li><li>The Lead's office dressed as the homeliest room.</li><li>Every room kind recognisable at a glance: a floor tone and a signature piece each.</li><li>October touches: autumn branches, a pumpkin on reception, apples, a throw on the sofa.</li></ul> | `29b7db0`, `fde07b4`, `67fc568` |
| Robots as the hero | <ul><li>Seeded idle life: glances and bursts of typing at work, a weight shift and look-round when idle, a bob while waiting. Robots are still under reduced motion.</li><li>A lit face screen at work, which follows the evening.</li><li>A larger contact shadow, and ticket objects at full size.</li><li>Labels never cover their own robot.</li><li>Far labels fade and hide when there are many.</li></ul> | `8fcffc2`, `c89f582` |
| Landmarks | <ul><li>A **wedge** part in `crewhub-prop/1`, with the validator, renderer, editor, the prop-builder skill and its drift test. The skill's eval, re-run with two wedge requests, was 8 of 8 valid.</li><li>Striped café parasols, a pie chart and cakes.</li><li>Back windows on the post office and the town hall.</li></ul> | `ed1ff00`, `6fd4093` |
| Town | <ul><li>Clustered plot dressing with flower borders.</li><li>The archived building under dust sheets.</li><li>A civic promenade.</li><li>October colour in one tree in five.</li><li>A stream with a timber bridge and waterfalls over the diorama's edge.</li><li>A market, the bus waiting at its stop, a bandstand, a chapel, hanging baskets, bunting, puddles that catch the lanterns.</li><li>A farm corner with sheep and pumpkins, and cottages beyond the outer lanes.</li></ul> | `558371a`, `7594fa4`, `165fc14`, `5fd7961`, `67af5e7`, `c88b990`, `b9d4c80`, `aa3fed1` |
| Light | <ul><li>A slow **day-night drift** on the demo clock: dawn, day, dusk and lamplight. It is a setting, "Day and night", on by default in demo mode. The theme sets the base and the drift shades it.</li><li>Lanterns, windows, fireflies and string lights follow the drift.</li><li>Reduced motion and Fast keep a fixed time.</li><li>At high speeds the light keeps at most a 4x pace.</li><li>The air behind the diorama follows the drift.</li><li>The evening glows: screens on their desks, lamp pools, light spilling from windows, a wash under the string lights, lantern streaks on the water.</li></ul> | `d71330a`, `36937f3`, `43ad204`, `4b85433`, `a785789` |
| Town life | <ul><li>Fireflies as camera-facing billboards, capped to a few pixels.</li><li>Cloud shadows that dim the light on roofs, walls and robots.</li></ul> | `6bce014`, `9e7efe3` |
| Buildings from the town | <ul><li>Timber coping and corner posts.</li><li>Quieter partitions.</li><li>A soft contact shade along the walls.</li><li>The glass wall glows in the evening.</li><li>The project colour stays on the awning, door, flag and sign. A roof-line ribbon was tried and removed, because it repeated the morning's main complaint.</li></ul> | `7bbf218`, `43d3fc0`, `d61fd1d` |
| Phone | <ul><li>A focused room, and the entered building, fill the tall screen.</li></ul> | `63625ed` |

The Dev Lead made a critical walk at the start of the night: pendant lamps over the hero, rugs crossing the walls,
desks without chairs, bare floors and plots, the archived shell, flat dark grass. A visual regression review of every
optimisation followed. It found no pop-in, no stale shadows and no colour shifts. Its two findings were fixed: long
low-sun shadows lost to culling, and fireflies that read as orbs up close. The before and after shots are in the
coordinator's scratchpad under `shots-art2/`.

## Performance rounds (night of 2026-10-01 to 02)

### Instrumentation first

- **The fps overlay.** It is in Settings and on the **F** key, kept per viewer and off by default. It shows:
  - fps over 1 second, and the frame time mean and p95 over 2 seconds;
  - the CPU work per frame;
  - draw calls and triangles;
  - geometries and textures in memory;
  - the JS heap;
  - the Graphics setting.

  It costs nothing while off, and when on it updates its text four times a second.
- **The same numbers for scripts.** `window.__worldPerf` holds them, and `window.__worldPerfWindow(ms)` gives them over a
  longer window.
- **The measurement script.** Every number of the night comes from one script (`perf.mjs` in the coordinator's
  scratchpad), on the dev server or a production build. Its scenarios: the demo town and inside, the stress fixture at
  4x and 16x, view changes, the phone in the town and inside, and startup.
- **A finding along the way.** The art pass's stress numbers ("at 4x") actually ran at 1x: the button is labelled
  "Play at 4x" and the old script's click missed it.

### The rounds

1. **Overlay and robots.**
   - The 30 fps cap became a 60 fps cap that rests when nothing moves, and that is robust against rAF jitter.
   - The far robots are drawn as one instanced crowd, and robots in unseen buildings are not followed.
2. **Scene graph and shadows.**
   - Baking drops the groups it empties: 7692 to 4379 nodes in the stress town.
   - The town shadow map redraws only on change.
3. **Batching and startup.**
   - Static meshes merge per material look, with live vertex colours.
   - A triangle diet for the town dressing.
   - Startup:
     - shaders compile in parallel before the first frame;
     - build mode and the prop editor load lazily;
     - three.js gets its own chunk.
4. **Culling and lighter detail.**
   - The town dressing is culled in 12 m cells, with long low-sun shadows kept.
   - A left building drops its interior.
   - Small parts render at lower detail.
5. **Memory, React and view changes.**
   - **A leak fixed:** a dispose closure in `mergeStatic` kept every merge's sources, 7000 meshes and 106 MB in the
     stress fixture.
   - Merged geometry drops its JS vertex arrays after upload.
   - The chrome around the scene is memoised: 187 to 16 button renders a second under the stress stream.
   - Reductions are spaced by their cost under heavy streams.
   - The first layout is sliced into short tasks.
   - The hovered building's interior is built ahead in idle time, so entering it shows no long task.
   - Instanced meshes get material twins.
6. **Matrices and the last spikes.**
   - Matrices are recomputed only for what moved, with the scene's own matrix pass.
   - Ticket templates and plant leaves batch.
   - At 16x, small shadow changes redraw the map at most every 400 ms: 90 redraws per 10 s became 25.

Final numbers, Pretty and light unless noted, on `c89f582`. The app is unchanged on the final commit, which only adds
docs.

| Scenario | Before the rounds (`35f0872`, dev) | After (`c89f582`) |
| --- | --- | --- |
| Demo town: work mean / p95 | 4.6 / 6.2 ms | 1.4 / 2.0 ms dev, 1.4 / 2.2 ms production |
| Demo town: draw calls | 676 | 279 |
| Demo inside: work mean / p95 | 5.3 / 7.2 ms | 1.6 / 2.3 ms |
| Demo inside: draw calls | 916 | 430 |
| Stress town 4x: frame max | 40.9 ms, 4 frames over 33 ms | 10.9 ms, none over 33 ms |
| Stress town 4x: work | 8.0 / 9.6 ms | 2.3 / 3.0 ms |
| Stress town 4x: draw calls | 1893 | 498 |
| Stress inside 4x: frame max | 50.8 ms, 11 frames over 33 ms | 10.5 ms, none over 33 ms |
| Stress inside 4x: work | 7.8 / 10.2 ms | 2.1 / 2.8 ms |
| Stress town 16x | not measured | max 18.6 ms, none over 33 ms, 25 shadow redraws per 10 s |
| Enter, zoom and leave | 1 long task of 61 to 73 ms (90 ms in the stress fixture) | no long task, no frame over 33 ms |
| Phone, Fast, town (375 px, 4x throttle): work | 13.1 / 17.2 ms (dev) | 3.7 / 5.2 ms dev, 3.6 / 5.6 ms production |
| Phone, Fast, town: frames over 33 ms | 0 to 2 per 10 s | 0 |
| Phone inside, production: work | not measured | Fast 2.6 / 4.4 ms, Pretty 4.3 / 6.6 ms |
| Phone inside, production: frames over 33 ms | not measured | 0 |
| Startup, first frame and dressed town | 2.1 s (dev) | 0.88 s dev, 0.79 s production |

Memory, read after a forced GC every 30 s:

- 10 minutes of the demo at 16x on a production build: the JS heap moves between 22 and 25 MB with no trend.
  Geometries, textures, DOM nodes and listeners stay the same.
- 5 minutes of the stress fixture at 16x: the heap grows 0.4 MB, and the rest stays the same.

Before the fix, a dispose closure in static batching kept every merge's sources: 7000 meshes and 106 MB of native
memory in the stress fixture.

**How to read the numbers.** Headless Chromium paces `requestAnimationFrame` at 120 Hz with about 1.5 ms of jitter.
So in the demo, which is capped at 60, a steady 60 reads as a frame p95 of about 18 ms; on a real display that is
16.7 ms. The stress fixture is uncapped and runs at the headless 120 Hz.

**Targets:**

| Target | Result |
| --- | --- |
| Frame p95 under 16.7 ms on Pretty in the normal demo | Met: steady 60, with 1.4 to 2.3 ms of work per frame |
| No frame over 33 ms except at a view change | Met, including the view changes |
| Shadow-map spikes gone | Met |
| Fast steady 60 on a phone budget | Met in the town and inside, at DPR 1 and 3 |
| No memory growth over 10 minutes at 16x | See above |
| A faster startup | 2.1 s to 0.79 s |

The rules that keep the budget are in [COST_POLICY.md](../COST_POLICY.md), "Graphics also have a budget". The style
seams that make them possible are in [WORLD_STYLES.md](../WORLD_STYLES.md).

**Verification on the final commit:**

- `npm run check` green, 279 tests.
- The browser regression pass 38 of 38: no external request, no page or console error.
- `packages/world-model`, `packages/demo` and `packages/loops-client` unchanged since `35f0872`.

**Still open:** a look and a measurement in a real, visible browser. Every number here is headless. The Chrome tab
that the Dev Lead tried at night was in the background, so its loop rested.

## Casts (2026-10-05)

The owner doubted that little robots are the right figures for agents: the world became a warm small town, and "AI
equals robot" lays it on thick. Their decision (spec addendum `cbce8fb`) was several casts side by side, which also
proves that modding works. Five developers worked in parallel (Opus 5.5 at effort medium) from 21:10 to about 22:00.
There were 14 merges, each green before the live branch moved. The reducer, the projection, the demo source and
`packages/loops-client` did not change. The town document (`townDocument.ts`) gained an optional cast id per town and
per plot, like the style id.

**The seam.** `packages/world-cast` holds the cast contract, written by the Dev Lead and refined additively by
cast-core while building it.

- **Data formats:**
  - `crewhub-cast/1`: a manifest with the cast's own colours per theme, `extends`, and the budgets;
  - `crewhub-figure/1`: joints, parts on joints filtered by role, activity, waiting, carrying and detail; still poses
    per activity; motions as waves on joint channels; looks per state; colourways; anchors;
  - `crewhub-figure-patch/1`: a re-dress of another cast.
- **The runtime:** a generic figure runtime that turns the data into `FigureHandle`s.
- **The tests:**
  - validators;
  - a contract test that every registered cast passes: every role and state builds, anchors are sane, triangles and
    meshes stay within budget near and far, and far figures are batchable;
  - a boundary test: only the registration module imports a cast, and no cast imports another.
- **How a cast draws:** through a `FigureKit` the style provides, so every cast takes the style's materials, glow,
  evening and cloud shadows, and the far robot crowd batches every cast unchanged.
- **Where it shows in the world:** the renderer derives one `FigureState` per agent from the `AgentPlacement`, the desk
  ticket, the walker and the postman's letters. The robot left the `WorldStyle` contract.

**Resolution:** a building's own cast, then the viewer's choice in Settings > Town > Cast (kept per viewer, switched
live without a reload), then the town document's cast, then the style's `defaultCast`. An unknown id falls back to the
style's default with one note in the text view. The text view names the cast once, and the fps overlay shows it. The
docs are in [WORLD_STYLES.md](../WORLD_STYLES.md), "Casts". They also describe, without building it, the later option
of an agent choosing its own figure through a ticket. It would be off by default, because it costs tokens.

**The four casts** (files and lines per package, `package.json` included):

| Cast | What | Package |
| --- | --- | --- |
| Classic bots (the default) | The robots as before, now as data; pixel-close to the old robots (at most 130 of 1.3 million pixels differ in a room, the town is identical). | 4 files, 246 lines, no code |
| Overgrown bots | A re-dress of the classic bots through `extends`. Timber and glazed ceramic, moss on head and shoulders, lantern eyes, the antenna a shoot that glows while waiting, droops when blocked and flowers when done. A rose for design, a toadstool for the analyst, a stained lead, a bare unknown with a seed. | 4 files, 103 lines, no code |
| Sprouts | Bean-shaped creatures on short legs with a growth that is the role (a little tree for the lead, a leaf, a flower, a mushroom, a dandelion for the postman that can drift, a cattail, a seedling) and the state (bud, open, drooping, glowing). Project colour in every growth. | 4 files, 273 lines (27 of code: the dandelion's drift) |
| Potlings | Walking terracotta pots with eyes and a glazed band in the project colour, the plant carrying the role (a tree, a sprig, a flower, a cactus, a post-horn flower, a topiary, a seed in an empty pot) and the state (wilting, fruiting, a lantern bud). | 4 files, 258 lines, no code |

**The casting room** (`/cast-preview`, linked from Settings) has:

- one Greenhouse sample room with every role;
- every cast alone, or all four side by side in a 2 x 2 grid;
- the whole cast in each of ten states;
- walk, carry on, a ticket by drone, a lead with its workers in tow;
- day, dusk and lamplight, light and dark, reduced motion, Pretty and Fast;
- a close camera on the figures, the whole room, or town distance through the real robot crowd.

The leader-with-followers line exists only in the casting room: the world's walks are individual errands, with no
team move to follow.

**Performance.** `perf.mjs --cast`, dev server, Pretty, light. No frame was over 33 ms in any scenario with any cast.

| Scenario | Classic bots | Overgrown bots | Sprouts | Potlings |
| --- | --- | --- | --- | --- |
| Stress town, work mean (draw calls) | 2.3 ms (499) | 2.4 ms (508) | 2.4 ms (499) | 2.5 ms (512) |
| Stress inside, work mean (draw calls) | 2.1 ms (580) | 2.3 ms (682) | 2.1 ms (613) | 2.3 ms (676) |
| Demo town, work mean (draw calls) | 1.6 ms (279) | 1.6 ms (293) | 1.6 ms (280) | 1.5 ms (286) |
| Demo inside, work mean (draw calls) | 1.8 ms (430) | 1.8 ms (486) | 1.8 ms (455) | 1.8 ms (490) |
| Phone, Fast, work mean | 3.3 ms | 3.5 ms | 3.4 ms | 3.4 ms |

**Verification on the final commit:**

- `npm run check` green, 308 tests.
- The browser regression pass with the default cast, 38 of 38.
- Screenshots of every cast in every state, near and far, light and dark, and of the world per cast, in the
  coordinator's scratchpad under `shots-casts/`.

## Perches and loops drift (2026-10-05 to 06)

Two small follow-ups, approved by the owner. Three developers worked in parallel (Opus 5.5 at effort medium) from
23:27 to about 00:05. There were five merges, each green before the live branch moved.

### Perches: small figures reach their screen

The owner's finding: sprouts and potlings were too small to see the screen on the desk. Nothing was scaled up and no
desk was lowered. Each cast now brings its own way up, as data.

- **The contract.** `figure.json` (or a patch) gains an optional `perch` per work pose (`desk`, `lead-desk`,
  `meeting-table`, `planning-table`, `review-table`) or as a `default`:
  - `step`: a small prop made of the cast's own parts, with seeded variants, plus the height the figure works at;
  - `surface`: the figure sits on the top itself, at a free spot the furniture offers;
  - `floor`: no perch at that pose.
  Each may add a `pose` and a `scale` for while the figure is up there. The handle gains `setPerch(place, cut)` and a
  `body` that the perch lifts; the contact shadow, the label, the name pill and the selection ring follow `body`.
- **The style only exposes surfaces.** `style.json` lists `workSurfaces` per model (height, half size, the screen,
  free spots). Furniture and rooms do not change with the cast. The one thing that yields is a desk's personal
  props, which leave the spot a sitter takes; the ticket slot and the lamp stay clear for the drone.
- **The casts.**
  - Sprouts stand on a stack of books, an upturned flowerpot or a small stool, seeded per figure, toes at the edge.
  - Potlings sit on the desk beside the monitor at 0.85 of their size, facing the screen.
  - Classic and overgrown bots are unchanged.
- **The details.**
  - Figures hop on and off when a walk ends or starts, and cut instead under reduced motion.
  - The step is drawn inside the figure, so the navigation grid is untouched.
  - Far figures and proxies have no perch, so the town's draw calls are unchanged.
  - The postman never perches.
- **Tests.** The contract test checks every registered cast at every work place of every style. A working figure must
  have its eyes above the surface, be turned to its work, and sit in front of the screen within reading angle. A
  fifth cast that is too small and brings no perch fails with a sentence that says so.
- **Where to see it.**
  - The casting room has a scene "At the desk" (`/cast-preview?scene=at-desk`).
  - The docs are in [WORLD_STYLES.md](../WORLD_STYLES.md), "Perches".

**Cast polish.** Three follow-ups from the casts report:

- **Potlings at a distance.** Potlings are 1.15 times larger, and every potling's rim and lugs are in the project
  colour, so they no longer pass for the decor's potted plants.
- **Sprouts:**
  - the dandelion postman carries a clock on a stalk;
  - done spreads the growth and ripens it to gold, so it differs from idle at town distance;
  - the dandelion's drift eases down instead of popping (a test samples the landing frame by frame).

### Four fixes from the crewhub-loops gap analysis

`docs/LOOPS_GAP_ANALYSIS.md` maps the world against crewhub-loops `f55d1288`. Its section 4 found four places where
the world's reading of crewhub-loops had drifted. Each is fixed, with a test that feeds a payload in the real
crewhub-loops shape (copied from its code or tests, with the path in a comment) through the validator and the
projection. The fixtures name `f55d1288` in a new `README.md`.

| # | Was | Is now |
| --- | --- | --- |
| D1 | `AgentOut.projects` as a list of slugs | `{lead: [ProjectRef], member: [ProjectRef]}`; an agent is placed in the buildings of both lists |
| D2 | `RichBody.v` as the string `"1"` | The number 1 (the string still accepted); the same for the system comment body and the team snapshot |
| D3 | `labelsCleared` as a boolean that cleared every label | A list of label names; only those are removed |
| D5 | A move to Done always celebrated | A move with `resolution: "rejected"` is not celebrated and imports no prop; the object is set aside askew in Dispatch with a dark band struck across it; the text view and the object card say "turned down" and why. The demo rejects CR-25 once, at 6:49. |

The developer checked every claim of the document against the crewhub-loops code. Every claim held, and two facts were
added to the document:

- `from == to == "done"` is also what a rejected ticket made a plain Done after all looks like;
- the demo wrote `v: "1"` in every body, not only in system comments.

`labelsCleared` is also sent from `domain/release_actions.py`, beside `domain/board.py`. The chat copy (D9, D10) was
not re-synced; that is the owner's decision.

### Performance and verification

`perf.mjs --cast`, dev server, Pretty, light, on the final commit. The machine carried other work (load about 9), so
every work time reads about 0.5 ms above the casts table, the untouched classic bots included. The draw calls are the
reliable comparison. No frame was over 33 ms in any scenario with any cast.

| Scenario | Classic bots | Overgrown bots | Sprouts | Potlings |
| --- | --- | --- | --- | --- |
| Stress town, work mean (draw calls) | 2.9 ms (499) | 2.5 ms (508) | 2.4 ms (499) | 2.6 ms (512) |
| Stress inside, work mean (draw calls) | 2.2 ms (580) | 2.3 ms (682) | 2.6 ms (655) | 2.4 ms (676) |
| Demo inside, work mean (draw calls) | 1.9 ms (430) | 1.7 ms (486) | 1.6 ms (471) | 1.8 ms (490) |
| Phone, Fast, work mean | 3.7 ms | 3.6 ms | 3.9 ms | 4.2 ms |

Sprouts' steps cost about 40 draw calls in the stress building (613 to 655), after merging each step's parts per
colour; the potlings' perch costs nothing.

- `npm run check` is green, with 335 tests (308 after the casts).
- The browser regression pass has no page or console error and no external request. Since the casts there are no
  new failures: its one failure ("stall in text view") and the build palette's timeout occur identically on the
  casts commit `661afbe`.
- Screenshots are in the coordinator's scratchpad under `shots-perch/`.

## Scale and zones (2026-10-06)

The owner's request: a fresh crewhub-loops install often has one project, and a busy one has twenty. The world must
fit both, perhaps with zones above projects that a future crewhub-loops feature could supply. Until now the town was
a fixed 4 x 3 grid. The design is the spec addendum "Scale and zones" (`2e22983`).

- **Team:** seven developers (Opus 5.5 at effort medium), from 00:20 to about 02:05.
- **Merges:** 23 merges, each green before the live branch moved.

### First: the helper scripts in the repository

A cleanup of `/tmp` had removed the Dev Lead's 38-check browser regression pass. The scripts a later task must rerun
now live in `tools/` ([README](../../tools/README.md)):

- the regression pass, `regress.mjs`, rebuilt to its 38 checks;
- `perf.mjs`, which now takes `--stress` and `--scenario`;
- `memory.mjs`;
- the screenshot helpers;
- the casting-room shots.

The browser driver, `playwright-core`, is a root dev dependency, installed from the local cache without network.
The no-network scanner covers `tools/`, and a test proves the app never imports the driver.

The same task fixed one perch detail: a sitter now takes the side of the desk that faces the camera, so a potling's
face shows.

### The settlement fits its content

- **Plots never move.** `apps/world/src/world/settlement.ts` defines:
  - lots on the old pitch;
  - districts with a fixed growth order;
  - reserved spots for the civic buildings and landmarks, so the lodge grows into the town hall and the mail hut
    into the post office, each in place;
  - tiers with hysteresis.
- **Allocation.** A project gets the next free lot of its zone's district the first time the world sees it, written
  into the town document.
- **The stability test.**
  - The setup: 24 runs, one to four zones, six orders each, with archiving and restoring mixed in, adding projects
    one by one from 0 to 40.
  - What it checks: no building's lot ever changes, nothing overlaps, and the ground always covers every lot.
- **The tiers** (`settlementDressing.ts`):
  - **clearing:** a lodge, a mailbox, a welcome sign, and a staked plot that says "Create a project in
    crewhub-loops";
  - **hamlet:** the building centred, with a lane and a green;
  - **village:** today's town, tightened;
  - **town:** the full civic set;
  - **region:** districts joined by wooded roads across streams and hedges, with a gate that carries the zone's
    name.
- **Growth.** Landmarks arrive as the town grows, seeded by the town. A new project's building goes up in
  scaffolding, or fades in under reduced motion.
- **Build mode** has "Tidy the town" (one undo step) and moving a building by hand to a plot or a zone. Archived
  buildings keep their plot; a viewer setting folds them into an old quarter.

### Zones and their looks

- **In the model.** A zone has an id, name, order, colour, emblem and look. A building's zone resolves from a manual
  assignment, then the source's group, then the default zone.
- **The group from loops.** That shape is wired in `packages/loops-client` as the future field of proposal L22,
  which the demo fills.
- **Look resolution** runs building, then zone, then viewer, then town, then style default, for the style, its
  options and the cast.
- **Style options as data.** Greenhouse declares four options in `style.json`, and a style ignores options it does
  not know:
  - season: October, spring, summer;
  - planting: town garden, orchard, market, waterside, meadow;
  - accent;
  - lantern.
- **Where to set them:** Settings > Zones and build mode set a zone's look; the viewer and the town have their own
  option rows.
- **Proposal L22, "project groups"** for crewhub-loops, is written in [LOOPS_GAP_ANALYSIS.md](../LOOPS_GAP_ANALYSIS.md)
  5.8 and section 6, and in the integration plan's section 9.

### Finding your way at scale

- **Navigation:**
  - Zoom levels region, district, building and room, in the breadcrumb and the Escape chain.
  - A jump list on `/` and `Cmd/Ctrl+K`, which lists what needs a person first.
  - A card per district with counts and one beacon.
  - A pin over each building that needs a person.
  - The text view grouped by district.
- **Far and remote buildings** draw as shell and crowd only; on Fast, remote buildings keep only their large pieces.
- **Between districts** a figure steps off at the gate of its new district and walks on. There is no drawn bus yet.

### The demo shows it

A scenario picker on the Demo chip offers:

- **Fresh install:** the first project is created at 1:00, and its building goes up.
- **One project.**
- **Small team:** the default, unchanged.
- **Studio:** twenty projects in four groups with their own seasons, plantings and casts.
- **`?stress=20`:** 200 agents in four zones.

Every scenario keeps its own town document.

### Performance

`tools/perf.mjs`, dev server, Pretty, light, on the final commit. No frame went over 33 ms in any desktop scenario.

| Projects | Town: work / draw calls | Inside: work / draw calls | Phone, Fast: work / draw calls |
| --- | --- | --- | --- |
| 0 (Fresh install) | 0.6 ms / 108 | (no building yet) | 1.6 ms / 99 |
| 1 (One project) | 0.8 ms / 100 | 1.0 ms / 244 | 2.6 ms / 92 |
| 4 (Small team) | 1.3 ms / 220 | 1.6 ms / 431 | 4.2 ms / 211 |
| 12 (`?stress=1`, 4x) | 2.8 ms / 525 | 2.6 ms / 622 | 6.9 ms / 449 |
| 20 (`?stress=20`, 4x) | 3.1 ms / 678 | 3.5 ms / 679 | 5.6 ms / 413 |
| 20 (Studio) | 3.7 ms / 784 | 3.2 ms / 453 | 7.0 ms / 442 |

**Before and after.** Measured back to back on the same machine, the state before this round (`a5ea03f`) read:

| Scenario | Before | After |
| --- | --- | --- |
| Small team, work | 1.5 ms | 1.3 ms |
| Small team, draw calls | 280 | 220 |
| Phone | 4.6 ms | 4.3 ms |
| Stress town | 2.9 ms | 2.7 ms |

**The phone.** Studio on a phone first read 13.9 ms of work, with 762 draw calls and 11 frames over 33 ms. A remote
tier on Fast and a lighter model sync brought it to the table's numbers.

- **On a production build** it is a steady 60: 6.0 ms of work and no frame over 33 ms. Small team reads 3.4 ms there.
- **On the dev build** one to three frames per run still land just over 33 ms.
- **Memory:** the heap is about 300 MB in dev with twenty projects; it has not been looked at.

**Verification:**

- `npm run check` is green with 425 tests. The old fixed-grid dressing and its tests are gone.
- `node tools/regress.mjs` passes 38 of 38, with no page or console error and no external request.
- Screenshots of every tier, light and dark, at 1440 and 375 px, are in the coordinator's scratchpad under
  `shots-scale/`.

## Loops readiness (2026-10-07)

Nicky installs a fresh crewhub-loops on this Mac (`053b5f47`, 85 commits after the one the plan read), and the world
must hook in the same day. This round built the plan's phase 1 data path without pairing and without the chat. The
design is the spec addendum "Loops readiness" (`bd3d4a3`).

- **Team:** five developers (Fable 5.1 at effort medium) from 13:36, with a hard stop at 14:46.
- **Merges:** every merge green before the live branch moved; the browser regression pass in demo mode stays 38/38.

### What runs end to end

```sh
npm run loops:fake -- --port 8091     # a fake crewhub-loops; the key goes to tools/out/loops-fake.key
CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host:start   # builds, then serves the world on 127.0.0.1:5180
```

Open `http://127.0.0.1:5180/`: the world finds the host and runs live. With the real install only the URL and the
key file change ([LOOPS_SETUP.md](../LOOPS_SETUP.md)). The Dev Lead ran this chain in a headless browser: Live after
0.6 s, "Loops down" within a second of stopping the fake, Live again after restarting it, no page reload, no console
error, and the key in no response, log or bundle file.

### The parts

- **The relay, `apps/host`** ([README](../../apps/host/README.md)). A Node program with no dependencies on
  `127.0.0.1`. It holds the key, assembles one `LoopsSnapshot` by read-model.md's recipe, keeps one loops stream for
  every tab with a ring buffer, sends `reset` when loops answers 410 or continuity is lost, and reconnects with
  backoff. Its loops routes are one allow-list; every other path is 404 and every other method 405. Host and Origin
  are checked. The known gap is written down: no pairing yet, so the host trusts loopback.
- **The live source, `HostSource`** in `packages/loops-client`. It implements the seam with `mode: "live"`: snapshot,
  events by `seq`, a new snapshot on `reset`, heartbeats for liveness, and a `connection` the UI reads. A gap in
  `seq` is normal on a real install, because loops filters the stream per key, so only the host's `reset`
  re-snapshots. The validators now accept an unknown `kind`, `status` or event `type` with one warning; `grill` and
  `PendingRequest` are typed, and the fixtures are checked against `053b5f47`.
- **The fake, `packages/loops-fake`.** It plays the demo storyline in real time behind loops' own routes, with bearer
  auth, `ambiguous_auth`, `after=`, heartbeats and a 410. The end-to-end test runs fake, host, live source and
  projection: a ticket move changes the building's counts within 2 s, a fake restart recovers, two sources share one
  upstream stream, and the key appears nowhere.
- **The world in live mode.** A source setting (Automatic, Demo, Live; `?source=`), and a connection chip where the
  Demo chip was (Connecting, Live, Catching up, Stale, Loops down, Unauthorized). The text view says the same. The
  Demo chip, the scenario picker and the playback bar are hidden; the chat corner shows "Sign in to crewhub-loops".
  The live town has its own town document. With no host, Automatic falls back to the demo without a console error.
- **Docs.** [LOOPS_SETUP.md](../LOOPS_SETUP.md), the runbook for the install; section 2b of the
  [gap analysis](../LOOPS_GAP_ANALYSIS.md), "What changed between f55d1288 and 053b5f47"; and section 10 of the
  [integration plan](../LOOPS_INTEGRATION_PLAN.md), phase 1 as built.

### Findings about crewhub-loops

- **The builder key is no fallback.** loops limits it to tickets, comments, rules and attachments of its member
  projects; projects, boards, the team and the stream answer 403. The world needs its own agent `crewhub-world` with
  the probe role and a registered key. The host still reads the builder key when nothing else exists, but only to
  show "Unauthorized" with a clear warning.
- **CORS is still absent.** `CHL_ALLOWED_ORIGINS` feeds the Origin guard only. The relay is the only road, and the
  phase 2 chat still needs L8.
- **Archived projects** reach the world only when the host sees them archived through events: an agent key may not
  list them.
- **Stale integrator docs.** `docs/integrators` still lists the removed executor routes and the agent-action events;
  the list is in the gap analysis as items for cl-lead.

### Not in this round

Pairing (plan 3.5), the chat (phase 2), a viewer role (L1), project groups (L22), and a run against the real
install, which did not exist yet.

## Readiness hardening (2026-10-07, afternoon)

Spec addendum "Readiness hardening" (`be5ab0d`). The readiness round's four known gaps are closed, still against the
fake, because crewhub-loops is not yet running on this Mac.

- **Team:** four developers (Fable 5.1 at effort medium) from 14:45, with a hard stop at 15:44. Two more, started by
  the coordinator, worked in parallel: walk (the next section) and agentcard.

### What was built

- **Pairing** ([host README](../../apps/host/README.md), [LOOPS_SETUP.md](../LOOPS_SETUP.md), "Pair this
  browser"). The flow:
  1. `npm run host -- open` prints a one-time link `http://127.0.0.1:5180/pair/<token>`, valid for 10 minutes and
     usable once.
  2. Opening it sets an HttpOnly `SameSite=Strict` cookie and lands on the world, live.
  3. Opened again, the link shows "expired or already used".

  Without the cookie, every `/world-api` route except `health` answers 401, and the world shows "Pair this browser"
  with the command and "Use the demo". `open` works with a host that is already running. A host restart ends
  pairings unless `CREWHUB_WORLD_PAIRING_FILE` keeps the secret; `CREWHUB_WORLD_PAIRING=off` serves development and
  is refused in production. A test proves that the token, the cookie and the secret appear in no response and no
  log.
- **A more faithful fake.** Streams end after 300 s as loops' do, and a test proves no event is lost across the
  reconnect. New reads: `/api/tickets/{ref}/grill`, `/api/delegations/pending` and `/api/auth/me`. With
  `--builder-key` the fake answers like loops' builder key, so the Unauthorized chip can be tested. The small-team
  storyline now meets a grill ticket and a pending request.
- **The browser regression pass** (`tools/regress.mjs`) has three groups: `walk` (the 38 checks), `demo` and `live`.
  - **demo:** the jump list, the scenario picker, and in Studio the Region level with district cards, a beacon pin
    and the Escape chain.
  - **live:** the pass starts its own fake and host and checks the Live chip, the sign-in link, Loops down, Live
    again, the pairing page and the world after pairing.
  - **Count:** 56 of 56 on `11ca428`: walk 36 checks in 119 s, demo 11 in 26 s, live 7 in 5 s, and 2 global ones.
    The full run takes 151 s; the 60 s budget holds only for the new groups, which `--groups demo,live` runs alone.
- **The allocation undo gap.** A lot, once given, is carried forward through undo and redo, so an undo past a hand
  move never re-allocates a project. Tidy the town keeps its own undo step. The stability test now mixes undo and
  redo into its sequences ([TOWN_PLAN.md](../TOWN_PLAN.md) section 11).

### Still open

- No chip state for a pairing that dies mid-session: a host restart without the pairing file shows Stale until a
  reload brings the pair page.
- The fake serves the pending request, but the world does not read it yet.
- A run against the real install.
## Walk mode (2026-10-07)

A mode to walk around inside the world: the Walk button in the camera toolbar, or `W` when nothing is selected. A
visitor figure of the town's cast (a plain worker, no project colour, tagged "You") is walked with W A S D or the arrow
keys, `Shift` hurries, a drag or a sideways trackpad scroll looks around, and a virtual stick shows on touch and narrow
screens. The visitor keeps to the navigation world's open cells (`apps/world/src/world/visitor.ts`: free positions
inside a room, a radius test against the same occupancy the agents use, sliding along walls) and changes rooms only
through the graph's doors; a front door crossed enters or leaves the building exactly as a click does. Escape returns
to the level and the camera pose the walk began on. It works in demo and live mode alike (it reads the scene's
navigation world, not the source) and asks the resolved cast for its figure like any other renderer.

- **The camera stays orthographic.** It follows from where the person turned it, with W always away from the camera,
  rather than a perspective chase camera: the labels, the far crowd, the shadow fit and the level-of-detail steps all
  read the orthographic zoom. An orthographic camera is never inside a wall; when a building stands between it and the
  visitor it tilts steeper to see over it (its way to pull in), and the entered building's back walls already give way.
- **The visitor is no actor of the simulation**: agents do not wait for it or walk around it, and it can stand where
  an agent stands.
- **Measured** on the stress fixture (`?stress=1`, Pretty, headed Chromium on the Mac, uncapped loop, four-second
  windows): no frame over 33 ms while hurrying along the street or walking inside a stress building (p95 4.6 ms).
  A phone was not measured.
- **Not done**: a hurry control on the stick (it walks; the stick's deflection sets the pace up to a stroll), a
  walked route between districts' far ends is a long walk (there is no bus for the visitor), and the mode was looked at
  in the demo only, with the default cast, at 1440 and 375 wide (no live host was running; the other casts, the
  larger tiers, reduced motion and a real touch on the stick were not looked at in a browser).


## Challenges with docs/integrators

Read at crewhub-loops `a1bed0f`. Each item names the document, what was unclear, contradictory, missing or marked
"Not available", and what it meant for the world tonight. Collected from every developer's report and the Dev Lead's
own reading; duplicates merged.

### read-model.md

1. **No JSON examples for the read models.** Only schema blocks exist (the envelope example is in events.md, the team
   snapshot example in team-and-projects.md). The spec asked for validator fixtures "copied from read-model.md
   examples". Consequence: fixtures were written from the schema blocks; they prove the validators follow the
   schemas, not that the schemas match real answers.
2. **`GET /api/agents` has no schema block.** The shapes of `projects`, `lane`, `rights`, `keys` and the meaning and
   freshness of `lastSeenAt` are not given. Consequence: `AgentOut.projects` is assumed to be a list of project slugs;
   if it holds ids (`pr_…`), member placement silently finds nothing. The chat dock's presence dot relies on
   `lastSeenAt` with no documented meaning.
3. **`TeamSnapshot.v`: `v?: "1"` (string) in the schema, `"v":1` (number) in team-and-projects.md.** Consequence: the
   validator accepts both.
4. **Archived projects cannot be listed by an agent key** (`includeArchived=true` is for human admins; an agent key
   gets 403). Consequence: a host started after a project was archived never learns it exists, so the boarded-up
   building of plan 4.1 only works for archives seen as events (or slugs fetched one by one).
5. **The Done column holds the last 30 days, `ProjectOut.counts.done` counts all.** Consequence: counts recomputed
   from cards (plan 3.3) undercount Done until the project is refetched; a live pallet count may differ from the
   sign. The demo avoids it by keeping every Done ticket younger than 30 days.
6. **The chat routes are not documented.** `GET/PUT /api/me/bubbles`, `GET /api/agents/{name}/summary` and
   `GET /api/features/global/{key}` appear only under "Endpoints not covered here" without a shape;
   `POST /api/dm/threads/{agent}/messages` and `PUT /api/dm/threads/{agent}/read` are not mentioned at all.
   `BubblesResponse`, `AgentSummaryResponse`, `GlobalFeatureResponse` and `DmMessageRequest` exist only in loops'
   web `api/types.ts`. Consequence: the world's chat (which plan 3.5 says talks to loops directly) was specified from
   router and domain source: the default pin, pin validation (at most 100, unique, enabled leads), idempotency by
   `clientId` with 409 on a changed body, the forward-only read cursor. No drift test protects these shapes.
7. **Feature route semantics.** The Feature flags section says a disabled flag answers 409 `feature_off`, while the
   copied chat code treats a 404 from `/api/features/global/bubbles` as "off"; when that route answers 404 is not
   documented.
8. **`DmThread.unreadCount` is not defined** (per reader? whose messages?). The code counts, per person, messages by
   others after that person's read cursor. Consequence: the demo had to turn its counter into a cursor.
9. **DM message paging with `before`** does not say that the first page is the newest, that a page is oldest-first,
   what `nextCursor` points at, the limit range, or that a foreign cursor is 400.
10. **`CommentOut.body` vs `bodyMarkdown`.** Not stated whether a Markdown body keeps a fenced code block byte for byte
    in `bodyMarkdown`. Consequence: the prop importer reads `bodyMarkdown` and has an untested fallback for `RichBody`.
11. **`ProjectOut.color` and `icon` are nullable in the schema but "one of" a list in team-and-projects.md.** When a
    project has none is not said. Consequence: the renderer draws a neutral trim and no emblem for null.

### events.md

12. **Thin payloads everywhere.** `ticket.updated` names fields only; `comment.created` carries only
    `{commentId, parentId}`; there is no batch ticket read. Consequence: one `GET /api/tickets/{ref}` per ticket per
    burst (coalesced 250 ms), and a milestone attach of many tickets means many reads; a prop on a ticket needs a full
    comments read (and `crewhub ticket show` returns only 5 comments).
13. **`delivery.updated` does not repeat `recipientId` or `reason`,** and `GET /api/deliveries` is router-only.
    Consequence: a viewer that missed `delivery.created` (joined later, filtered stream) can never place that letter.
14. **`attachment.added` is accepted as a filter but never emitted.** Consequence: a world following the stream cannot
    learn about attachments, so prop JSON travels as a comment with a fenced `json` block (decision recorded in the
    skill).
15. **Payload fields without types or value lists:** `ticket.stalled` `episode` and `nudge` (0 or 1, not a count;
    found in `watchdog.py`); `ticket.moved` `renumbered` (siblings' new positions are not in the payload, so an exact
    reorder needs a refetch); `project.archived/restored` and `milestone.updated` `old`/`new` shapes; the
    `ticket.updated` relation payload (keys or ids? `until` and `op` values? one event per ticket?); milestone attach
    `{old, new}` (ids or keys; the accompanying per-ticket `ticket.updated` is not mentioned).
16. **Event order inside one write is undocumented** (comment then `review_reply` move then delivery; release create;
    hand-off moves before `milestone.handoff`; publish). Consequence: a projection that assumes an order may glitch for
    a frame; the demo followed the loops source.
17. **Worker progress lines.** The event text is `"<worker>: <line>"` with the lead as `agent` and no `worker` field
    (the stored `ProgressItem` has one); the prefix collides with the kind prefixes (`klaar:`, `vraag:`) in
    agents-and-states.md. Consequence: the world guesses which prefix is a worker name (a team agent of that lead, or
    `<stem>-…`).
18. **Chat events and `dmThreadId`.** Not documented that `delivery.created/updated` for a chat carry `dmThreadId`,
    which is what loops' own web app keys its chat refresh on.
19. **Release carrier and delivery routing details** (carrier status `in_progress`, title format, publish sets
    `waitingOn` to the requester; which leads are "eligible" for comment deliveries; which delivery transitions post a
    system comment) are only in the code.
20. **`project.reordered` lists active slugs only.** Consequence: archived buildings are appended in the order seen.

### agents-and-states.md and team-and-projects.md

21. **Freshness has no field.** Loops judges staleness by its own receive time, which `GET /api/team` does not expose
    ("Not available: a receivedAt or fresh field"). Consequence: the world judges by the probe's `ts` against its own
    clock and labels "stale since HH:MM" from `ts`; clock skew can make the world and the watchdog disagree.
22. **The watchdog's "attends" rule vs workers.** Any working worker attends all of its lead's tickets, so a lead with
    one busy worker can never have a `stalled` ticket. Consequence: the demo scripts a stall anyway, for the demo's
    sake; a live world would rarely show one in a busy building.
23. **Workers map only to `<stem>-lead` leads, and there is no project-to-worker list** ("Not available").
    Consequence: a project led by an agent without the `-lead` name (the demo's `marky`, `g-man`) can never show
    workers; a lead of two projects shows its workers in both buildings (as proxies where they do not work).
24. **Roles.** Loops knows `lead`, `router`, `probe`; the world's rooms by role (design, analyst, worker) rest on name
    rules (proposal L6 not built). The postman has no world role value of its own either.
25. **Lane status `done`** is "herdr's own pane status" with no further meaning; the world shows it relaxed, never as
    success.
26. **Hand-off and held tickets:** team-and-projects.md says "Backlog tickets"; the code also releases held ones without
    a `ticket.updated` for `held`.
27. **Milestone keys are derived** from the project key on every read, so they are held by id.
28. **Avatars: Not available.** The world draws robots only; the chat dock uses loops' initial-letter Avatar.

### cli.md

29. **`crewhub ticket comment` and `ticket move` arguments are not documented** (how to pass a multi-line body).
    Consequence: the prop-builder skill's CLI steps were read from `clients/crewhub.py`.
30. **`crewhub ticket progress` is marked "milestones only" in the CLI help,** while the demo flow wants a "building
    the prop" progress line. Consequence: the skill does not require progress lines; the world does not depend on one.

### identity-and-access.md, README.md

31. **No read-only key and no CORS** (L1, L8 "Not available"). Not a blocker tonight (demo mode has no network), but
    the chat's direct-to-loops design also depends on the `SameSite=Lax` open point in README.md.
32. **Default chat head.** Plan 3.5 says the verbatim copy shows the `is_crewhub_lead` agent without an adapter; the
    spec wants the lead of the building in view. That needs the pins answer to follow the view, which is only possible
    in the demo API; against a live loops it would mean writing the person's pins.
33. **No single "movable" or "busy" notion for an agent** (agents-and-states.md: "there is no single agent state").
    The director may not move "a working, blocked, stalled or waiting agent" (plan 7.3), but these come from three
    sources (lane status, watchdog, `waitingOn`). Consequence: the world derives it from the reduced posture, desk
    objects and alerts; a stale snapshot makes every agent immovable.
34. **read-model.md, `RichBody` is `doc: {string: Any}`** with no node schema (code block type name, language
    attribute), and `CommentOut.bodyMarkdown` is optional without saying when it is absent. Consequence: the prop
    importer relies on `bodyMarkdown`; its rich-body fallback guesses ProseMirror/Tiptap names and is untested against
    real loops data.
35. **No `closedBy` on tickets** (`closedAt` only), and nothing in the stream tells a client that connects later who
    moved a ticket to Done. Consequence: a prop ticket a person closed while the world was not running is never
    imported automatically (the history endpoint would help; the world does not model it yet).
36. **Can anything but a person produce `ticket.moved` to `done`?** agents-and-states.md says a person sets Done;
    events.md lists `ticket.moved` actors as "user, agent" without saying. Consequence: the world checks
    `actor.kind === "user"` explicitly before it celebrates or imports a prop.

### Found while building the world (walks, interiors, buildui)

37. **A lane missing from the snapshot is "unknown, not offline"** (agents-and-states.md), but there is no lane id
    across snapshots and no "left" event. Consequence: a probe hiccup reads as a worker walking out and back in.
38. **`delivery.updated` cannot tell a retry from the first attempt** (a requeue looks like `pending` again), and no
    doc gives typical times from `pending` to `forwarded`. Consequence: the postman walks once per
    `delivery.created`, on its own clock; the outcome shows at the mailbox when the model has it.
39. **`delivery.created` names no project** (a DM's envelope has none). Consequence: the postman's destination is the
    recipient's real location, itself an inference; a DM to an agent in no building goes to the town hall.
40. **`uncertain` and `unroutable` carry no reason text.** Consequence: a flagged letter shows only its state word and
    recipient.
41. **The router role vs operators** (read-model.md): `g-man` and human admins can act as the router. Consequence: the
    world animates one postman (the first `router` agent) for every delivery update.
42. **`ticket.archived` carries no card and `ticket.unarchived` no status.** Consequence: the drone to the truck flies
    the last card the world saw (a ticket never loaded is archived without a flight), and the flight back from the
    truck waits for a refetch.
43. **`quietMinutes` is computed at request time** while events carry the value at tick time. Consequence: the quiet
    clock recomputes minutes from `quietSince`; the doc could say clients may.
44. **No project-level style setting in loops** (team-and-projects.md). Consequence: per-building style ids live only in
    each browser's local town document.

