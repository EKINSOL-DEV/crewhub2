# CrewHub World in demo mode: the whole plan, scripted

Date: 2026-10-01. Status: accepted by the user for an overnight build.
Branch: `feat/world-demo` (worktree `/Users/ekinsol_nicky/Documents/GitHub/crewhub2-world-demo`),
based on `docs/loops-integration-plan`, so the plan and ADR 0005 are in this tree.
Delivery: one PR to `main` at the end of the night. Do not merge; the user reviews.

## Decision

Build everything that [LOOPS_INTEGRATION_PLAN.md](../../LOOPS_INTEGRATION_PLAN.md)
describes for the 3D world, but **100% in demo mode**:

- No network call to crewhub-loops. No `apps/host`. No socket, no key, no session.
- No model call of any kind. The director lane, agent awareness and every
  "AI presence" feature are replaced by scripted behaviour that goes through
  the same validated seams.
- A complete, believable world: a town with a few demo projects (the Dev Lead
  chooses them), each a building with rooms, a lead in the centre, workers by
  role, tickets as physical objects moving through rooms, deliveries carried
  between buildings, chat bubbles, stalls and attention states, milestones,
  a release, and props.
- Everything scripted is deterministic, seeded, loops forever, and is labelled
  as demo everywhere it shows. Nothing may imply a real running session.

The user's words: "absolutely no communication with the AI tool, but a full
demo mode; it may all be scripted at first; the full world with a few projects
you may choose yourself as demo."

## The one architectural rule for tonight

The demo data must have **exactly the shapes crewhub-loops serves**, as
documented in `crewhub-loops/docs/integrators/` (read-model.md, events.md,
team-and-projects.md, agents-and-states.md). Those docs are the current truth.
Concretely:

- `packages/loops-client`: the TypeScript types and runtime validators for
  `Envelope` (v1), `ProjectOut`, `ProjectsResponse`, `BoardResponse`,
  `BoardColumn`, `TicketCard`, `TicketSummary`, `Ticket`, `CommentOut`,
  `ProgressItem`, `TeamSnapshot`, `TeamSession`, `TeamAgent`,
  `MilestoneSummary`, `ReleaseSummary`, `DmThread`, `DmMessage`,
  `DeliveryOut`, `WatchdogResponse`, and the event payloads the world uses.
  Hand-written validators (loops publishes no schemas yet, proposal L2). No
  React, no Three.js, no DOM.
- A `WorldSource` interface with two implementations tonight: `DemoSource`
  (in-browser, scripted) and a stub for the future host SSE (types only, not
  implemented). `DemoSource` produces a snapshot in loops shapes and then a
  stream of `Envelope` events with strictly increasing `seq`, plus periodic
  `TeamSnapshot` updates every 30 s of demo time, just as the plan's host would.
- The **projection** (facts → world model) and the **world reducer** (facts →
  buildings, rooms, objects, agent placements) consume only `WorldSource`
  output. They must not know they run on demo data. When the host exists, only
  the source changes.
- The demo timeline is data: a seeded script of loops-shaped events with demo
  timestamps, with a speed control (1x, 4x, 16x, pause) and a scrub bar. It
  covers every event type the world reacts to (see plan section 4 and
  `events.md`): ticket created/moved/updated/archived, comments, progress lines
  (`start`, `update`, `done`, `question`), `team.updated` with lane statuses
  (`working`, `idle`, `done`, `blocked`, `unknown`), `ticket.stalled` and
  `ticket.resumed` with reasons `stalled` and `attention`, `waitingOnHuman`,
  deliveries (`delivery.created/updated` with the postman states), DMs
  (`dm.created`, `dm.answered`), milestones (created, tickets attached,
  completed, handoff), a release (created, published), a project archived and
  restored.
- Respect what the docs say a client may and may not conclude
  (`agents-and-states.md`): a lane status never proves a task succeeded; a
  snapshot older than 5 minutes is unknown and is shown as unknown; Ticket
  Done is a ticket status a person sets.

## Demo content

The Dev Lead chooses three to five demo projects. Suggested, mirroring the
loops seed so the naming rules are exercised: a product project (key `CR`), the
loops project itself (`CL`), a creative or marketing project (`MK`), and one
archived project that gets restored during the script. Each project has:

- one lead lane (`<stem>-lead` or a lead with another name, both cases occur
  in loops, see `team-and-projects.md`) with `ProjectOut.lead` set;
- workers by the name convention `<stem>-dev-n`, `<stem>-analyst-n`,
  `<stem>-design-n`, and at least one worker outside the convention (lands in
  the workers room);
- tickets in all five statuses (`backlog`, `planned`, `in_progress`, `review`,
  `done`) and of the kinds the plan maps to objects (folder, box, bug crate,
  question envelope), with priorities, a blocked one, labels, and one that waits
  on a person (name tag on the box);
- at least one milestone with attached tickets and a target date, one release
  with a carrier ticket, comments and progress lines with realistic text;
- one postman lane (`router` role) that carries deliveries between buildings;
- one agent that works in two buildings (real avatar where it works now,
  translucent proxies elsewhere).

Take inspiration from crewhub v1's demo mode
(`/Users/ekinsol_nicky/Documents/GitHub/crewhub/frontend/src/contexts/DemoContext.tsx`,
`hooks/useDemoMeeting.ts`, `lib/mock/`, `scripts/seed_demo_data.py`): the
staggered "naturally timed" sessions, the scripted meeting with rounds and
turns, the persisted user edits, the F-key toggle, the "Watch a demo" button.
The screenshot of that version is in the scratchpad
(`crewhub-v1-demo-screenshot.png`): a campus of colour-coded rooms with agents
and speech labels, a room picker along the bottom, an assistant avatar and an
agents bubble at the top. Do not copy its look; the design system is now the
crewhub-loops kit. Copy the idea: a lively, readable, self-running world.

## Scope by phase (the plan's phases, in demo form)

Build in this order. Each phase ends with `npm run check` green, a commit on
the integration branch, and something a person can open in the browser. If the
night ends early, later phases are reported as not done, never half-merged.

1. **First light.** `packages/loops-client`, `WorldSource`, `DemoSource` with
   the snapshot, the town with one building per project (plot, colour and icon
   from `ProjectOut.color` and `icon` mapped to design tokens), the lead in the
   centre of each building, status counts per building, navigation (town
   overview, enter a building, back), a Demo badge, a hidden text view that
   lists every fact the scene shows. The Greenhouse room and the mock crew are
   removed in this phase, together with `apps/bridge` and `packages/protocol`
   (plan section 8). Keep what `packages/world-engine` and the renderer already
   do well.
2. **Chat mirror.** The bubbles dock: a verbatim copy of
   `crewhub-loops/apps/web/src/components/bubbles/` with the loops commit
   recorded in a header line, the same sync rule as the design-system tokens.
   It calls the same query functions as in loops (`queries.ts`), backed by an
   in-browser demo fetch layer that answers those routes from `DemoSource`
   (threads, messages, pins, the `bubbles` feature flag). Sending a message in
   demo mode appends to the demo thread and a scripted reply arrives; a Demo
   label says so. The default head is the project lead of the building you are
   in, or the crewhub lead in the town view.
3. **Building interiors.** Rooms by role from the plan's catalogue (lead's
   office at the centre, workers, analyst, design; role from the name rule with
   a per-agent override stored locally), the ticket flow as objects (storage,
   planning table, the agent's desk, the review pile, dispatch, the truck for
   archived), ticket kinds as object looks, priority and blocked and milestone
   as tags and bands, piles becoming pallets with a count, postures from lane
   status (debounced), captions for `ticket.progress`, stalled and attention
   and waiting-on-human shown with their loops meaning, freshness labels when
   the team snapshot is old. Every scene state has a text equivalent.
4. **Town and dynamic pathfinding.** Portal graph of doors between rooms and
   buildings, local A* per room with a binary heap, one leg at a time,
   single-occupancy doors, wait budgets with step-aside, event-driven
   replanning, moving obstacles (other agents, the postman, a moved prop),
   postman deliveries walking between buildings. Detail levels: one detailed
   interior at a time, offscreen buildings do no cosmetic routing. A stress
   fixture with 12 buildings and 100 agents must stay inside the 33 ms frame
   budget on the reference machine; record the numbers.
5. **Build mode, layout and props.** Local `TownDocument` (IndexedDB) with
   plots, modules, placements and user props; export and import as JSON; undo.
   Prop catalogue, a parts-JSON prop model (v1's idea, `PropModel`-style
   primitives), a minimal prop editor, placement through the grid engine's
   footprint rules, props attached to a ticket, an agent or a room, and rule
   props generated from facts (a milestone banner, a release crate). Reload
   restores the same town; an invalid import leaves the previous revision
   intact.
6. **Scripted director and agent awareness.** The AI-presence settings panel
   exists (off by default, budget fields visible, a usage counter), but the
   director is a scripted intent feed from the demo timeline that goes through
   the same closed intent list and engine validation the real director would.
   `where` is a pure function over the world model, exposed in the text view
   ("Where is cl-lead?"). No model call exists in the codebase; a test asserts
   that no module imports an AI SDK or calls a model endpoint.

## Out of scope tonight

- `apps/host`, SQLite, pairing, the real loops stream, CORS, anything in plan
  section 9 for loops.
- Any real Herdr, Claude Code or Codex integration (removed, not replaced).
- Persisting anything outside the browser.
- Merging to main.

## Rules

- English everywhere. Small logical commits. The design system is the
  crewhub-loops kit: tokens only, the hex guard stays green; scene material
  colours derive from tokens or from the loops project colour names
  (`coral`, `tangerine`, `circle`, `mist`, `ink`).
- `AGENTS.md` boundaries that this plan replaces (Herdr first, the bridge,
  `packages/protocol`) are updated in this branch to match what is built, using
  plan section 12 as the list. `docs/ROADMAP.md`, `ARCHITECTURE.md` and
  `docs/README.md` follow. Do not describe the host as implemented.
- Tests for real behaviour: the event projection (idempotent apply, out-of-order
  guard, thin `ticket.updated` handling), the world reducer (status → room and
  object), the portal graph and A*, the wait budget, the demo timeline
  determinism (same seed, same sequence), the loops-client validators against
  fixture JSON copied from `read-model.md` examples, and the no-model-call
  guard. No trivial fixture-restating tests.
- Zero model calls, zero network calls outside the app's own origin. Vite dev
  needs no proxy in demo mode.
- Accessibility as before: keyboard navigation between town, building and
  rooms; text status next to colour; reduced motion; 40 px targets on touch;
  the text view is complete.

## Verification for the night report

- `npm run check` green on the final commit, output recorded.
- Headless screenshots per phase (desktop and 375 px, light and dark) in the
  scratchpad, and a real browser pass by the Dev Lead of the final state on
  `npm run dev` (port 5175; never touch 5173).
- The stress fixture numbers.
- A section **Challenges with docs/integrators**: every place where the
  integrator docs were unclear, contradictory, missing, or where the world
  needed something the docs mark as not available. The user wants this list.
- What was not done, and why.

## Addendum (2026-10-01, from the user): the prop builder as a ticket, and a prop-builder skill

Building a prop is not a thing a person does in a 3D editor alone. **A prop is
requested as a ticket in the CrewHub project in crewhub-loops**, an agent builds
it with a dedicated skill, the result lands on the ticket, and the world picks it
up. Two deliverables come out of this, and both are in scope tonight.

### A. The `prop-builder` skill (built and fully tested tonight)

A Claude Code skill in this repo, `skills/prop-builder/`, that any agent lane can
use to turn a prop request into a valid prop. It must produce exactly the output
the world consumes.

- `SKILL.md` (frontmatter `name`, `description` that triggers on "build a prop",
  "make a prop", "prop request", ticket labels `prop`), written for an agent that
  has never seen this repo: what a prop is, the parts-JSON format (shapes,
  sizes, positions, colours as loops palette names or tokens, never hex), the
  footprint and the semantics the grid engine needs (geometry separate from
  semantics, collision from the declared footprint, never from meshes), size
  limits, naming, and the exact steps: read the request, sketch parts, write
  the JSON, run the validator, fix until green, attach the result.
- `references/prop-format.md`: the authoritative format description, generated
  or checked against the TypeScript types in `packages/world-engine` (a drift
  test).
- `references/examples/`: five to eight hand-made props that pass, from simple
  (a plant) to compound (a workbench with a lamp), each with the request text
  that led to it.
- A validator CLI, `npm run prop:validate -- <file.json>`, exit 1 with precise
  messages; the same code the world uses at import.
- Tests: the validator (good and bad inputs, limits, a footprint that does not
  match the parts), the drift test, and an **eval**: the Dev Lead runs the skill
  with a developer agent (Sonnet or Opus at medium) on six unseen requests, for
  example "a coffee machine", "a whiteboard with three sticky notes", "a bug
  crate", "a server rack", "a potted cactus", "a delivery truck"; all six must
  pass the validator and render in the world. Record the eval in the night
  report with the request texts and the outcome. If the skill fails an eval,
  fix the skill, not the props.

### B. The prop-request flow in the world (demo)

- In the demo content, the CrewHub project has tickets with the label `prop`
  and kind task, titled "Prop: <thing>". The demo script moves such a ticket
  through backlog, planned and in progress; a progress line reads "building
  the prop"; when the ticket reaches Review, the prop JSON is on the ticket;
  when a person moves it to Done, the prop enters the catalogue and appears in
  the world with the materialise effect, at a place the request named (a room
  or an agent's desk) or in the building's storage.
- How the JSON travels on the ticket: choose one of attachment or comment, and
  document the choice and its reason in the night report. Note for the
  challenges section: `attachment.added` is accepted as a filter but never
  emitted (`events.md`), so a world following the stream cannot learn about an
  attachment; a comment with a fenced `json` block does emit `comment.created`.
  The validator runs on import; an invalid prop on a Done ticket shows a
  labelled error object, never a crash.
- Build mode (phase 5) keeps the local editor for quick edits, and gains a
  "Request a prop" action that, in demo mode, creates a scripted `prop` ticket
  in the CrewHub building and lets you watch the flow. Label it as demo.
- The world treats a prop from a ticket and a prop from the local editor the
  same way once imported: one catalogue, one placement system, provenance kept
  (ticket key or "local").

Sequencing: the skill and its validator belong to the foundation (their format
is the prop model of phase 5, so define the format early and let phase 5 build
on it); the flow itself is part of phases 3 and 5.

## Addendum (2026-10-01, from the user): keep the existing 3D item style

The user: "the style of the items that were already there is very nice." The
Greenhouse's art direction for 3D items stays the art direction of the town:
the soft toon materials, warm timber, chalk walls, framed glass, planted
details and the soft robots in `apps/world/src/world/` (`models.ts`, `Scene.ts`,
`shaders.ts`). Buildings, rooms, furniture, ticket objects, the postman's cart
and every prop-builder example are made in that style. The crewhub-loops kit
governs the 2D interface only. Removing the Greenhouse *room* in phase 1 does
not mean removing its models, materials or lighting: reuse them, and grow the
catalogue from them.

## Addendum (2026-10-01, from the user): the ticket drone

When a ticket changes status, its object does not teleport or slide: **a small
drone appears out of nowhere, flies in, picks up the package, carries it to the
room the new status maps to, and drops it there**, then leaves the way it came.

- Trigger: every `ticket.moved` where `from != to` (a reorder inside a column is
  not a flight), plus archive (to the truck) and unarchive (from the truck).
- The drone is in the Greenhouse item style: a soft, rounded body, a quiet
  rotor blur, a small carrying hook; the Dev Lead decides the exact look. It
  materialises above the package with the same materialise effect as props,
  descends, hooks the object (a short lift animation), flies a smooth arc
  through the building (doors are not needed for a drone, it goes over the
  walls), lands, releases the package into its slot (desk, table, pile,
  dispatch, truck), and de-materialises.
- Timing: the whole flight lasts about 2 to 4 seconds at 1x demo speed and
  scales with the speed control; at 16x flights still complete, but several
  may be in the air at once. Under reduced motion the drone still appears and
  the package is placed, but the flight is a short fade instead of an arc.
- Movement is deterministic and cosmetic: it needs no pathfinding and no AI.
  The world model updates when the drone drops the package, not when it picks
  it up, so a text-view reader sees the new room at the same moment the drop
  happens. During the flight the object is marked "in transit" in the text view.
- Between buildings (a ticket moved to another project is not a loops
  operation today, so this stays inside one building). The postman keeps
  carrying deliveries on foot; the drone only carries tickets.
- Interruptions: if a second status change arrives while a package is in the
  air, the drone changes destination mid-flight; it never drops a package on the
  floor.

This belongs to phase 3 (interiors and ticket flow) and reuses the phase 5
materialise effect; if phase 5 lands later, a simple fade stands in.

## Addendum (2026-10-01, from the user): Greenhouse is one style of several

The Greenhouse look is the first **style**, not the only one. Build the world
so that a style is a swappable package, but build only the Greenhouse style
tonight. No second style is needed now.

- Introduce one seam, for example `WorldStyle`, that owns everything a look
  consists of: materials and their parameters, the model set for buildings,
  rooms, furniture, ticket objects, the drone and the postman's cart, lighting
  per theme (day and lamplight), the environment (ground, sky, planting), and
  the character look of the robots. Semantics (what a desk is, what a review
  pile is, footprints, room roles) stay in the world model and the grid engine
  and know nothing about style.
- Renderers ask the style for a mesh by semantic key (`desk`, `ticket.bug`,
  `drone`, `wall`, `door`) and never import a Greenhouse model directly.
- Props from the prop builder carry their own parts and colours, but colours
  are palette names that the style resolves, so a prop survives a style change.
- The style id is stored with the town document; the settings panel shows the
  current style with only one option for now. A test asserts that no module
  outside the style package imports the Greenhouse models.
- Do not build a second style, a style editor, or per-building styles tonight.
- Leave the door open for a style **per project**: renderers resolve the style
  through the building they draw (plot style id, falling back to the town
  default), never through a global singleton. Tonight every plot resolves to
  Greenhouse; the per-plot field exists but has no UI.
- Direction, not tonight's scope: a style should become a **plugin or
  extension that people can add or adapt themselves**. What that asks of
  tonight's seam: `WorldStyle` is a documented contract (a manifest with id,
  name, version and the semantic keys it covers; a resolver from semantic key
  to model and material; palette resolution; lighting presets per theme;
  environment), registered in a style registry, with Greenhouse as the first
  registered style and nothing special-cased for it. Prefer data (JSON
  manifests, parts-JSON models, palette names) over code wherever the
  Greenhouse style allows it, so a future style can be authored without
  TypeScript. Write `docs/WORLD_STYLES.md`: the contract, how Greenhouse
  implements it, and what a third-party style would have to provide. Loading
  styles from outside the bundle, a style marketplace or an editor are not
  tonight's work.

## Addendum: the Greenhouse art pass (morning of 2026-10-01)

After the first look in a real browser, the owner's verdict: the world misses the freshness of the buildings and
interiors of the earlier Greenhouse room, buildings should be bigger and roomier, and the small-town feeling
(green, paths, lanterns and other details) is very important. The following hours go to beauty, not features;
functional work resumes afterwards. Nothing functional may be lost.

Reference: the Greenhouse room on `main` at 3a66363. What it had and the world lost: tall back walls with the
greenhouse glass wall, soft directional light with shadows and a cream floor slab, homely props in the rooms (sofa,
bookshelf, lamps, pictures, plants), few labels (name pill and one bubble per robot), a close camera.

Scope of the pass, all through the `WorldStyle` seam and the building templates:

- Buildings bigger and roomier, tall walls on the back sides, the glass wall as the signature outer wall, project
  colour as an accent rather than a ribbon, the old lighting and floor slab, every room type dressed with the homely
  props, a camera that frames the building and the focused room closely.
- A real small town in the Greenhouse palette: green, paths that the navigation grid follows, lanterns lit in dark
  mode, benches, signposts, a square, real post office and town hall buildings, archived buildings boarded up but
  pretty.
- Labels: by default only a name pill and at most one bubble per robot; everything else on hover, selection or a
  persisted details toggle. The text view keeps everything.
- The gate, the stress fixture budget, reduced motion, 375 px and both themes keep holding. Four to six
  implementers in parallel; visual work on Opus 5.5 at effort medium.

## Addendum: beauty round two and performance rounds (night of 2026-10-01 to 02)

Approved by the owner after the art pass. Two parts, in order:

1. **Beauty round two:** the Lead's own follow-ups (wall art on interior partitions, cloud shadows, billboard
   fireflies, café parasols with a wedge part, a slow day-night drift on the demo clock as a setting) and a
   critical walk through the town and every room kind.
2. **Performance rounds:** first an fps overlay (fps, frame mean and p95, draw calls, triangles, memory, the
   Graphics setting; toggled from Settings and with `F`, off by default, near-zero cost when off, the same
   numbers exposed to the headless scripts). Then repeated rounds of measure, fix the largest contributor,
   re-measure: instancing of far robots and repeating dressing, merged static geometry, shared materials,
   culling, amortised shadow maps, cheap label layout, O(visible) ambient life, no memory growth over a long
   run, faster startup with lazy-loaded build mode and previews, a steady Fast setting on a phone budget. No
   visible regression on Pretty against the art-pass screenshots; optimisations live in the renderer and the
   style package, never in the model.

## Addendum: casts (2026-10-05)

The owner doubts that little robots are the right figures for agents: the world became a warm small town, and
"AI equals robot" lays it on thick. Decision: the cast, the set of figures that stand for agents, becomes a
swappable part of a style with its own contract and registry, and four casts ship side by side, which also proves
that modding works:

1. **Classic bots**: the current robots, unchanged, the default.
2. **Overgrown bots**: the same robots re-dressed in wood, ceramic and moss; shows how small a cast mod can be.
3. **Sprouts**: an own species, a bean-shaped body with a growth on its head that carries role and state.
4. **Potlings**: a walking terracotta pot with a plant that carries role and state.

A cast is data first (a manifest, parts-JSON models, a small rig description). A style names its default cast,
the viewer can choose one in Settings, and the town document can set one per building. A casting room
(`/cast-preview`) shows every cast in the same sample room in every role and state, alone and side by side.

Later, not now: an agent choosing its own figure through a ticket (a character builder next to the prop
builder). It costs tokens, so it will be off by default, with a plain pick from the cast as the default.

## Addendum: scale and zones (2026-10-06)

The owner, translated: "In the beginning we usually start small. A fresh installation of crewhub-loops has for
example only one project, and we must be ready for that. But it must also be possible to have 20 projects. Think
about how we handle that, maybe several zones that are then also linked to a future feature in crewhub-loops, a level
above the projects, or a category. That must be possible with CrewHub World. We could set the styling per zone
ourselves."

Today the town is a fixed 4 x 3 grid. Buildings stand on the plot of their index in `model.buildings`, and the
town document's plot cells do not decide anything yet. One project looks lost in that grid, and twenty do not fit.

### Four principles (fixed)

1. **The settlement fits its content.** The world is as big as what lives in it: a clearing for nothing, a hamlet
   for one project, a village, a town, a region of districts. It never shows a grid of empty plots waiting.
2. **Nothing moves by itself.** People find a project by where it stands. A building keeps its place when projects
   are added, archived or regrouped; growth adds at the edges. Only an explicit action ("Tidy the town", or moving a
   building by hand in build mode) re-lays anything.
3. **Zones are a level above projects that the world owns until crewhub-loops has one.** The world model gets
   zones now. Where a project's zone comes from is one small resolver, so a future loops feature plugs in without
   touching the renderer.
4. **Look resolves from the most specific to the most general:** building, then zone, then the viewer's choice,
   then the town, then the style's default. This holds for the style, its options and the cast. (It inserts the
   zone into the casts' order; the viewer's choice now yields to a zone that sets a look.)

### The layout seam: lots, districts and tiers

Pure functions in `apps/world/src/world/settlement.ts` (no Three.js), owned by one developer. Every other part reads
them:

- **Lots.** The town stands on a lattice of square lots of today's pitch (a 24-unit plot plus a 6-unit street). A
  plot in the town document is a lot coordinate: `cell` keeps its 0 to 127 range, with the centre lot at
  `{x: 64, z: 64}`.
- **Districts.** Each zone owns a district, and a district has a fixed **growth sequence**: an ordered list of
  district-local lot offsets that depends on nothing but the index. The sequence has three properties:
  - the first lot is the hamlet's lot beside the district's green;
  - the next ones form a block of four to six lots around that green;
  - further blocks follow around small greens of their own, ringing outward.
- **District slots.** A district's slot (its origin on a coarse lattice of district cells, spiralling out from the
  centre) is assigned the first time the world sees the zone, then stored. Reordering zones changes lists and
  labels, never where a district stands. Districts are separated by natural borders on the coarse lattice's gaps:
  the stream, hedges, a bridge, a gate with the district's name.
- **Civic lots are reserved.** The central district's sequence skips them. The lodge stands where the town hall
  will stand, and the mail hut where the post office will. The square, the café, the bus stop and the landmark
  spots (windmill, chapel, bandstand, farm corner, cottages) also sit on spots that no project ever takes. Civic
  buildings grow in place, so they never move either.
- **Allocation.** A project gets the next free lot of its zone's sequence the first time the world sees it. The lot
  is written into the town document as its plot and never changes after that, except by Tidy or by hand.
  - Archived projects keep their plot, boarded up.
  - A viewer setting may fold archived buildings into an "old quarter" row. That is an explicit choice, and it is
    shown as such.
  - A project that moves to another zone stays where it stands. It carries its new zone's colour, and the text view
    and build mode say it belongs elsewhere; Tidy or a hand move rehouses it.
- **Tier.** The tier is chosen from the number of projects that are not archived, with hysteresis: a tier is
  entered at its threshold and left only two projects below it.

  | Projects | Tier | What it is |
  | --- | --- | --- |
  | 0 | Clearing | A small lodge, a mailbox, a welcome sign, and one staked-out plot that says what to do next ("create a project in crewhub-loops"). The operator and the postman are at home. |
  | 1 | Hamlet | One building as the centre of the picture, the lodge and the mail hut close by, one lane, a small green. |
  | 2 to 4 | Village | One street and a small square: today's town, tightened. |
  | 5 to 9 | Town | Square, streets and the full civic set. |
  | 10 and more | Region | Districts, joined by roads and separated by natural borders. With a single zone, the district's blocks read as neighbourhoods without names. |

  The tier decides the ground's extent (always covering every allocated lot), the streets, the civic set and which
  landmarks have arrived. It never moves a lot.
- **Landmarks** arrive with growth, deterministically: seeded by the town, the same on every load.
- **A new project** appears as a building going up: scaffolding for a moment, then the building. Under reduced
  motion it fades in.
- **The stability test:** add projects one by one from 0 to 40, in several orders and spread over one to four
  zones, with archiving and restoring mixed in. No building's lot may ever change, and no lot may overlap another
  or a reserved spot.

### Zones

- **In the model:** a zone has an id, a name, an order, an optional colour and emblem, and a look (style id, style
  options, cast id). Every building belongs to exactly one zone. Without any grouping there is one unnamed default
  zone, and the world behaves as a single settlement.
- **Where a building's zone comes from,** in order:
  1. a manual assignment in the town document (build mode);
  2. a group from the source;
  3. the default zone.

  Item 2 sits behind one function in `packages/loops-client`, in the shape the world would like crewhub-loops to
  offer: a group with an id, slug, name, order and optional colour and icon, plus `groupId` on `ProjectOut`. The
  demo source feeds it as the one clearly marked future field.
- **Look per zone:** Settings and build mode let a person set a zone's style, style options and cast. Only
  Greenhouse exists, so **style options** prove the idea. Greenhouse declares them as data in its `style.json`:
  - season: October as today, spring, summer;
  - planting: orchard, market, waterside, meadow;
  - accent;
  - lantern type.

  A style ignores options it does not know. A zone with a different season and cast must read as a different
  district at a glance.
- **Proposal L22 "project groups"** for crewhub-loops is written, not built. It goes in `docs/LOOPS_GAP_ANALYSIS.md`
  section 6 and the integration plan's section 9, named neutrally as a "group".

### Finding your way at scale

- **Zoom levels:** region, district, building, room. The breadcrumb and the Escape chain follow them. The home view
  frames what exists:
  - the building, for a hamlet;
  - the settlement, for a village or town;
  - the districts, for a region.
- **Zoomed out, the world summarises.** Per district: its name, counts per status, and one beacon when anything
  inside needs a person (waiting on a person, attention, stalled). Per building the same, one level down. The calm
  labels rule holds.
- **A jump list:** a searchable list of zones, projects and agents (a button, plus `/` and `Cmd/Ctrl+K`) that flies
  the camera there. The text view groups by zone and offers the same jumps. On a phone, the jump list is the main
  way around a region.
- **Far districts are cheap:** silhouettes and the instanced crowd, and interiors are not built until approached.
  The performance rounds' frame targets hold for 20 buildings and 200 agents in four zones (`?stress=20`).
- **Travel between districts:** figures take the bus between districts (walk to the stop, the bus drives, walk on),
  or the simplest honest substitute if the bus is more than a small addition to the navigation.

### The demo shows all of it

A scenario picker on the Demo chip offers:

- **"Fresh install":** no project. A minute in, the first project is created and its building goes up.
- **"One project".**
- **"Small team":** today's four projects and storyline, still the default.
- **"Studio":** twenty projects in four zones with different looks and casts, with enough going on to light the
  beacons.
- **The stress fixtures.**

Every scenario is deterministic and seeded, and every scenario keeps its own town document, so switching does not
mix plots. In "Fresh install" and "One project" the chat, the drone, the prop request and build mode all still work.

### Out of scope

- A second full style.
- Building the loops side of L22.
- Re-syncing the chat copy (D9, D10 of the gap analysis).
