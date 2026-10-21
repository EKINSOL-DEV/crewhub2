# Roadmap

Milestones are deliberately small. They are not commitments to dates or estimates.
The direction changed on 2026-09-30: [ADR 0005](decisions/0005-crewhub-world-on-loops.md)
and [the integration plan](LOOPS_INTEGRATION_PLAN.md) replace M5 to M7 (runtime
adapters) with the phases below. The town, rooms and growth of M2 to M4 continue in phases 3 to 5.

## M0 — Bootstrap (merged)

Included: preserved desktop archive, clean workspace, runnable browser fixture,
mock session contract, English instructions and design documents, type checking,
documentation link checking, build, and CI definition.

Exit: `npm ci` and `npm run check` pass; the fixture runs in a browser; the archive
points to the original commit; the change is reviewable without rewriting history.
Report CI separately from local checks. Creating a workflow is not a passing CI run.

## M1 — One excellent room (merged; visual direction accepted; the room itself was later replaced by the town)

The Greenhouse implements one room, three procedural characters, four deterministic
scenarios, selection/focus, activity inspection, keyboard and touch controls,
reduced motion, and graphics fallback. It also establishes the requested grid
foundation: rectangular footprints, rotation, placement, pathfinding, movement
reservations, and semantic snapshots. Three.js is the only rendering engine.

The user reviewed the room positively and accepted its visual direction. A
reference-based design-system kit was replaced by the crewhub-loops
[design system](DESIGN_SYSTEM.md), which now provides light/dark tokens and
primitives for the 2D UI. The 3D scene keeps its own materials; visual review of the
migrated room is pending. Automated checks pass;
the cloud agent's browser preview was blocked, so technical browser/device and
performance verification remains outstanding. See [ROOM_REVIEW.md](ROOM_REVIEW.md).

Exit: cohesive visual direction, useful behavior, browser inspection, interaction
recording where available, documented performance, and zero model calls. The user
can evaluate the look and feel before feature expansion. Do not keep the bootstrap
page's appearance as a constraint.

## M2 — Shared town and session model

Introduce towns, rooms, workstations, slots, character identities, canonical runtime
sessions, and source bindings. Replace fixed crew counts and index-based session
lookups with a dynamic projection. Keep The Greenhouse's current art and working
demo. Start with mock Herdr, Claude Code, and Codex observations.

Exit: source order, removal, reconnect, and pane replacement cannot confuse session
identity. Verified duplicate observations become one character. Zero, one, three,
and eight agents work without hard-coded scene or panel assumptions.

## M3 — Growing rooms and persistence

Parameterize room geometry and camera bounds. Allocate usable slots, reserve growth
modules, and preserve a fixed room origin. Implement atomic expansion, local saved
layouts, undo, validated import/export, and migration of the current room JSON.

Exit: growth keeps furniture, actors, doors, and routes valid without moving old
cells. Invalid or blocked expansion leaves the previous revision intact. Session
inactivity does not automatically shrink the room.

## M4 — A convincing mock town

Add town plots and paths, room summaries, town/room/character camera scopes, and
detail-level switching. Integrate the user's design system when available. The
model and engine work can proceed with provisional controls until then.

Exit: three rooms with different capacities are clear and pleasant to navigate;
only one detailed interior is active initially. Exercise a 12-room, 100-session
oversight fixture and record device, frame-time, memory, and accessibility evidence.

## The loops phases

The phases of plan section 10, built first in demo mode: a scripted in-browser source
with the shapes crewhub-loops serves, no network, no account and no model call
([the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md)). Since
2026-10-07 the same world runs live through the host, and since 2026-10-21 against the
real crewhub-loops ("The host" below). A status says "built in demo mode", "live" when
the real data drives that part through the same reducer, or "not built"; the parts of a
phase that need the host's world database, the chat or the director are named where
they are not built.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1. First light | `packages/loops-client`, `WorldSource`, the demo source, one building per project, navigation, hidden text view | Built in demo mode (2026-10-01); live since 2026-10-07 (against the fake) and against crewhub-loops `4cdcd383` since 2026-10-21 |
| 2. Chat bubbles | The loops chat mirrored verbatim, backed by an in-browser demo chat API | Built in demo mode (2026-10-01). Live: not built, blocked on CORS in crewhub-loops (L8); the dock shows the sign-in link only |
| 3. Buildings | Rooms by role, tickets as objects in rooms, the ticket drone, postures and captions, the `WorldStyle` seam | Built in demo mode (2026-10-01); live from the same model, with the real lane facts on the card, a person carrying work into Done and closed buildings (2026-10-21). Not built: the world database |
| 4. Town and dynamic pathfinding | Doors, town paths, heap A*, wait budget, detail levels, stress fixture | Built in demo mode (2026-10-01); live from the same model |
| 5. Build mode: layout and props | Local town document with undo and export/import, prop catalogue, the `crewhub-prop/1` format and the `prop-builder` skill | Built in demo mode (2026-10-01); live mode keeps its own town document in the browser. Not built: the world database |
| 6. Director and awareness | A scripted intent feed through the validated intent list, `where`, the settings block, the no-model-call guard | Built in demo mode (2026-10-01); `where` works live. Not built: the real director |

Walk mode (2026-10-07, built in demo mode): the person walks a visitor figure through the town and into buildings over
the navigation world, with a follow camera ("Walk mode" in
[the night report](reports/2026-10-01-world-demo-night.md)).

A person in the world (2026-10-21, spec addendum "a person in the world, and closed buildings", part 1): a
`ticket.moved` into Done by a user is a person's act in loops, so the world shows a person: a plain figure of the
building's cast comes in by the front door, carries the package from its rack or desk to the Done rack and leaves. The
model records the visit (`Building.visits`, one person per building, a queue of three, the rest land at once; the
celebration follows the landing), the text view and `where` tell it, a click says who and what. Under reduced motion
the package lands at once. Part 2, closed buildings, is built as well (round 2, below).

## The host

Built on 2026-10-07 and brought to the Mac app on 2026-10-21 (plan section 10, "Phase 1 as built" and "Phase 1
against the Mac app"; the runbook is [LOOPS_SETUP.md](LOOPS_SETUP.md)): `apps/host` reads crewhub-loops with one
agent key over loopback TCP (the Mac app's `127.0.0.1:8091`) or over the app's Unix socket
(`CREWHUB_WORLD_LOOPS_SOCKET`, explicit only), keeps one event stream, serves `/world-api` as SSE
with pairing and the static bundle, and `createHostSource` is the live `WorldSource`. The key is an external bot's
(CL-314), lead-grade; the host's `GET`-only allow-list keeps the world read-only until crewhub-loops has a viewer key
(L1). Since the round of 2026-10-21 ("a smooth connection") the host finds the app by itself (its socket or port from
its data folder, read only), starts without a key, takes one pasted in the world's Connect screen
(`POST /world-api/connect`, checked with loops, stored 0600 in `~/.config/crewhub-world`), reports the states in
`health.connection`, and `npm run world` is the one command; `npm run host -- doctor` is the terminal view.

Closed buildings (2026-10-21, round 2): an archived project is a closed building, boarded up with its lights off, a
Closed sign that carries the archive date, no packages and no agents; the sign, the click and the text view say
since when and by whom, and it can still be entered. `project.archived` plays a short closing (the lights go out,
the boards come down), `project.restored` the reverse; reduced motion cuts. The host learns archived projects
from the event log (`GET /api/events?types=project.archived,project.restored`, paged) and reads each with
`GET /api/projects/{slug}`, since an agent key may not list them (L16).

Round 3 (2026-10-21, the same night): `npm run world` starts the host and opens the browser first and builds the
world beside them when the build is missing or stale (a "Building the world…" page hands over by itself); the
terminal prints a step list with times; the snapshot is assembled under a read cap and timed; health answers within
a second and says how far the first snapshot is, which the page shows ("Reading 12 projects from crewhub-loops…");
the pairing secret is kept in the host's folder, so a host restart keeps every paired browser, and an unpaired tab
shows "Pair this browser" instead of a Stale chip; the doctor never asks for a restart the host does not need; the
host's own principal is hidden as the observer; the demo scripts its own lanes and the agent card opens on any
figure, in the town hall and at the post office too. Measured with `tools/timeworld.mjs` against the development
loops: the dressed town about 1.1 s after `npm run world` warm and about 2.4 s cold. Rehearsed from a fresh clone by
a developer following the runbook: about 90 s hands on, including the loops dialog; the measure was two minutes.
Nicky's first run against the app itself is still to come.

## Open

Everything below is planned and not built. Each item needs crewhub-loops running.

- **World database.** SQLite with migrations and backup replaces the browser's
  IndexedDB town document (phase 3 and 5 of the plan in live form).
- **Real chat.** The bubbles talk to crewhub-loops as the person; this needs CORS
  for the CrewHub origin (proposal L8).
- **Real director.** The `crewhub-world` CLI, the watcher and the `world-director`
  lane, off by default, capped and measured. No model call exists today.
- **Project groups (L22).** Zones stay in each browser's town document until
  crewhub-loops has a level above projects ([gap analysis](LOOPS_GAP_ANALYSIS.md), section 5.8).
- **Proposals on the loops side**, worked out with tests on the unpushed branch
  `world/viewer-key` of the world's loops checkout (2026-10-21) and accepted by nobody
  yet: the **viewer key** (L1: an external bot flag that may read exactly the host's read
  list and the stream and write nothing; until it lands the world runs on a lead-grade
  key behind the host's `GET`-only allow-list) and, on top of it, a **"Connect CrewHub
  World" card** in Settings > Agents that makes the viewer bot and shows its key once with
  the world's address. The other proposals of plan section 9 (L2 to L8) stand as written.

## Later scope

Remote access, cross-device persistence, additional clients, generated models, and
autonomous coordination each need a separate scope based on the working town. Optional AI features must satisfy
[the cost policy](COST_POLICY.md). Direct Herdr, Claude Code and Codex adapters are removed, not
postponed: Herdr stays behind crewhub-loops.
