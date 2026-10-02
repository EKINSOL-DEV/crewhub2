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
([the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md)). The
status lines are "built in demo mode" or "not built"; a host phase is never marked
built.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1. First light | `packages/loops-client`, `WorldSource`, the demo source, one building per project, navigation, hidden text view | Built in demo mode (2026-10-01) |
| 2. Chat bubbles | The loops chat mirrored verbatim, backed by an in-browser demo chat API | Built in demo mode (2026-10-01) |
| 3. Buildings | Rooms by role, tickets as objects in rooms, the ticket drone, postures and captions, the `WorldStyle` seam | Built in demo mode (2026-10-01) |
| 4. Town and dynamic pathfinding | Doors, town paths, heap A*, wait budget, detail levels, stress fixture | Built in demo mode (2026-10-01) |
| 5. Build mode: layout and props | Local town document with undo and export/import, prop catalogue, the `crewhub-prop/1` format and the `prop-builder` skill | Built in demo mode (2026-10-01) |
| 6. Director and awareness | A scripted intent feed through the validated intent list, `where`, the settings block, the no-model-call guard | Built in demo mode (2026-10-01) |

## Open: the host

Everything below is planned and not built. Each item needs crewhub-loops running.

- **Host.** `apps/host`: key file, socket client, stream-first projection, SSE,
  pairing, the static bundle, and a `host` `WorldSource`. Phase 1 of the plan in
  live form.
- **World database.** SQLite with migrations and backup replaces the browser's
  IndexedDB town document (phase 3 and 5 of the plan in live form).
- **Real chat.** The bubbles talk to crewhub-loops as the person; this needs CORS
  for the CrewHub origin (proposal L8).
- **Real director.** The `crewhub-world` CLI, the watcher and the `world-director`
  lane, off by default, capped and measured. No model call exists today.
- **Proposals for crewhub-loops** L1 to L8 (plan section 9), for example a read-only
  `viewer` role and published schemas.

## Later scope

Remote access, cross-device persistence, additional clients, generated models, and
autonomous coordination each need a separate scope based on the working town. Optional AI features must satisfy
[the cost policy](COST_POLICY.md). Direct Herdr, Claude Code and Codex adapters are removed, not
postponed: Herdr stays behind crewhub-loops.
