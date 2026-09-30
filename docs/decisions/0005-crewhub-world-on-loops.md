# 0005: CrewHub World is a thin 3D client of crewhub-loops

Status: proposed (2026-09-30); awaiting Nicky's acceptance. Number 0005 because
0004 is taken by the design-system decision on the `feat/loops-design-system`
branch.

## Context

crewhub-loops now holds projects, tickets, agents, deliveries, messages, team
presence and stall states, and it publishes them through a REST API, an NDJSON
event stream and an agent CLI. CrewHub was planned as a world with its own
bridge, Herdr-first adapters and a session model. That duplicated what
crewhub-loops already does and put a runtime inside the 3D application. On
2026-09-30 Nicky directed that crewhub-loops becomes the driving service and
that CrewHub keeps only the 3D world.

## Decision

- crewhub-loops is the only source of facts. CrewHub World reads it with the
  signed-in person's session, from the same origin as the loops web app: initial
  REST reads plus the event stream with `lastSeq` replay.
- CrewHub stores only layout and presentation state, locally at first.
- Every project is a building. Rooms follow the ticket workflow, and the lead is
  at the centre of its building.
- CrewHub's own work is dynamic pathfinding, the visual expression of
  crewhub-loops facts, and props (a catalogue and user-made parts props).
- The bridge, `packages/protocol`, the simulated crew and the Herdr, Claude Code
  and Codex adapter plans are removed.
- The world does not run a relay around the `crewhub` CLI. The CLI stays the
  agents' surface, and the world uses it for fixtures, tests and an optional
  director lane.
- Presentation is deterministic by default. AI-driven behaviour is optional,
  off by default and budgeted under the cost policy.

The full plan is [LOOPS_INTEGRATION_PLAN.md](../LOOPS_INTEGRATION_PLAN.md).

## Consequences

- CrewHub no longer needs machine access, pairing, Tauri or its own protocol.
  Its shell shrinks to a client module, the engine and the renderer.
- CrewHub depends on the crewhub-loops contracts. It must validate them at
  runtime and pin the loops commit it was tested against.
- crewhub-loops needs a same-origin mount and a sign-in `next` path. It should
  also publish schemas. A viewer role and server-side world storage are needed
  only for later phases.
- Demo mode without an account becomes a labelled replay of recorded loops
  events.
- This supersedes the runtime-binding parts of
  [ADR 0001](0001-browser-world.md) and [ADR 0003](0003-towns-and-session-bindings.md).
  Their browser-first, grid and town-layout parts stay.
