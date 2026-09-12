# Roadmap

Milestones are deliberately small. They are not commitments to dates or estimates.

## M0 — Bootstrap (merged)

Included: preserved desktop archive, clean workspace, runnable browser fixture,
mock session contract, English instructions and design documents, type checking,
documentation link checking, build, and CI definition.

Exit: `npm ci` and `npm run check` pass; the fixture runs in a browser; the archive
points to the original commit; the change is reviewable without rewriting history.
Report CI separately from local checks. Creating a workflow is not a passing CI run.

## M1 — One excellent room (implemented; visual acceptance pending)

The Greenhouse implements one room, three procedural characters, four deterministic
scenarios, selection/focus, activity inspection, keyboard and touch controls,
reduced motion, and graphics fallback. It also establishes the requested grid
foundation: rectangular footprints, rotation, placement, pathfinding, movement
reservations, and semantic snapshots. Three.js is the only rendering engine.

Local checks are passing. Browser security policy blocked interactive preview,
so browser rendering, animation feel, touch behavior, shader compilation, and
hardware performance remain unverified. See [ROOM_REVIEW.md](ROOM_REVIEW.md).

Exit: cohesive visual direction, useful behavior, browser inspection, interaction
recording where available, documented performance, and zero model calls. The user
can evaluate the look and feel before feature expansion. Do not keep the bootstrap
page's appearance as a constraint.

## M2 — Bridge and live observation

Create the independent local bridge. Define pairing, validated protocol schemas,
capability negotiation, session identity, and reconnect reconciliation. Connect
to Herdr and observe one existing session in the already working world.

Exit: actual sessions are visibly distinct from demo data; status reflects native
events; disconnects become stale state; reconnects recover; pane replacement does
not impersonate the old session. Focused tests cover these risks. No model calls
or process spawning are required merely to observe.

## M3 — Explicit interaction

Add output inspection and prompt submission to supported Herdr sessions. Preserve
native approvals and distinguish submitted, failed, waiting, and completed states.

Exit: explicit commands reach one intended target through one route; duplicate
submission, unsupported operations, wrong targets, and transport loss are handled.
No hidden resume, approval, or automatic work occurs.

## M4 — Reuse and expansion

Use observed needs to select the next addition: another bridge client, optional
Tauri companion, another runtime adapter, project rooms, or task/result linkage.
Optional AI features must first satisfy [the cost policy](COST_POLICY.md).

Web deployment, remote access, cloud agents, chat integrations, multi-user work,
and autonomous coordination each need explicit scoped implementation. They are
not prerequisites for M1 and are not delivered by the bootstrap.
