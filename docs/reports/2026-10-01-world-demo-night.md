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

The stress fixture (`?stress=1`: 12 buildings, 101 walkers, 4x) on the final commit `8bed50d`, headless Chromium on
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

