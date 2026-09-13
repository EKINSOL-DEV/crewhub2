# Roadmap

Milestones are deliberately small. They are not commitments to dates or estimates.
The next sequence is detailed in [the town implementation plan](TOWN_PLAN.md).
M2 onward is planned work, not functionality delivered by the planning change.

## M0 — Bootstrap (merged)

Included: preserved desktop archive, clean workspace, runnable browser fixture,
mock session contract, English instructions and design documents, type checking,
documentation link checking, build, and CI definition.

Exit: `npm ci` and `npm run check` pass; the fixture runs in a browser; the archive
points to the original commit; the change is reviewable without rewriting history.
Report CI separately from local checks. Creating a workflow is not a passing CI run.

## M1 — One excellent room (merged; visual direction accepted)

The Greenhouse implements one room, three procedural characters, four deterministic
scenarios, selection/focus, activity inspection, keyboard and touch controls,
reduced motion, and graphics fallback. It also establishes the requested grid
foundation: rectangular footprints, rotation, placement, pathfinding, movement
reservations, and semantic snapshots. Three.js is the only rendering engine.

The user reviewed the room positively and accepted its visual direction. The UI
will be refined after the user establishes a design system. Automated checks pass;
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

## M5 — Bridge and Herdr observation

Build the independent bridge with pairing, validated schemas, capability discovery,
stable source identity, and reconnect reconciliation. Import an existing Herdr
session's hierarchy into the already working town and follow native events.

Exit: observation does not start, resume, or prompt agents. Disconnects become stale
state; reconnect and pane replacement preserve the right identities. Unsupported
capabilities and uncertain outcomes remain explicit.

## M6 — Direct Claude Code and Codex observation

Begin with separate feasibility checks, then implement each supported adapter in
its own PR. Prove visibility of existing live sessions rather than assuming that
saved history or a new SDK/App Server process supplies it. Group direct sessions
by project or explicit assignment; allow mixed-runtime rooms.

Exit: each supported adapter works without Herdr. The same native conversation
discovered through two sources stays one character with one selected command
route. If live access cannot be proven, report the limitation instead of resuming
a session to make it observable.

## M7 — Explicit interaction

Add on-demand output and native focus/open where supported, then explicit prompt
and interrupt controls. Herdr controls depend on M5; direct runtime controls also
depend on the relevant M6 adapter. Preserve native approvals and distinguish
submitted, failed, waiting, completed, and uncertain-delivery outcomes.

Exit: commands reach one intended target through one route. Duplicate submission,
stale occupant identity, unsupported operations, and transport loss are handled.

## Later scope

Optional Tauri packaging, remote access, cross-device persistence, additional
clients, cross-room walking, generated models, and autonomous coordination each
need a separate scope based on the working town. Optional AI features must satisfy
[the cost policy](COST_POLICY.md). Claude.ai/ChatGPT conversation import and cloud
hosting are not implied by direct Claude Code and Codex support.
