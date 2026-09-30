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
