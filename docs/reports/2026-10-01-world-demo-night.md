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

FINISH-PLACEHOLDER

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
- `docs/COST_POLICY.md` and `docs/VISUAL_DIRECTION.md` still mention the bridge and Herdr in places; ADR 0005 still
  says "proposed".

VERIFY-PLACEHOLDER

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

