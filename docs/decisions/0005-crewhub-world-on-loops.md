# 0005: CrewHub World is a thin 3D layer on crewhub-loops

Status: proposed (2026-09-30), revised after Nicky's first answers; awaiting
acceptance. This repository will be renamed crewhub later. Number 0005 because
0004 is taken by the design-system decision on the `feat/loops-design-system`
branch.

## Context

crewhub-loops now holds projects, tickets, agents, deliveries, messages, team
presence and stall states. It publishes them through a REST API and an NDJSON
event stream on a Unix socket and TCP, and agents use it through the `crewhub`
CLI.

CrewHub was planned as a world with its own bridge, Herdr-first adapters and a
session model. That duplicated crewhub-loops and put a runtime inside the 3D
application. On 2026-09-30 Nicky directed that crewhub-loops becomes the
driving service and that CrewHub keeps only the 3D world, with a proper local
database for world information.

## Decision

- **Source of facts.** crewhub-loops is the only source of facts. A small
  CrewHub host process runs next to it. The host:
  - reads crewhub-loops over its socket with a read-only agent key
  - keeps facts in memory only
  - owns a SQLite world database with layout, props, roles, settings and
    director plans
  - serves the browser world after pairing

  By default crewhub-loops and CrewHub run on the same machine and the browser
  uses loopback. Tailscale is always optional, and is only for remote access.

  The browser renders the world and runs the movement. Nothing is served by
  crewhub-loops, and no loops credential reaches the browser.
- **Buildings and rooms.** Every project is a building.
  - Agents sit in rooms by role, from a predefined catalogue, with the lead's
    office at the centre.
  - Tickets are physical work objects that move through rooms by status, and
    their look follows their kind.
  - An agent in several buildings is one real avatar where it works now, with
    proxies elsewhere.
- **CrewHub's own work.** Dynamic pathfinding, the visual expression of
  crewhub-loops facts, and props (a catalogue and user-made parts props).
- **Removed.** The bridge, `packages/protocol`, the simulated crew and the
  Herdr, Claude Code and Codex adapter plans.
- **Behaviour.** Presentation is deterministic by default. An optional
  `world-director` lane on Haiku, built on the postman pattern, plans idle
  movement every 5 minutes and after events. It is capped, off until switched
  on, and its usage is measured.

The full plan is [LOOPS_INTEGRATION_PLAN.md](../LOOPS_INTEGRATION_PLAN.md).

## Consequences

- CrewHub's shell is one host process, a client package, the engine and the
  renderer. It needs no Tauri, no pairing with runtimes and no protocol of its
  own.
- The host acts as an agent. It sees no DMs, which Nicky accepted, and human
  actions happen in the loops web app, which the world links to.
- CrewHub depends on the crewhub-loops contracts. It validates them at runtime
  and pins the loops commit it was tested against.
- crewhub-loops should add a read-only `viewer` role and published schemas. The
  other proposals are optional.
- Demo mode without an account becomes a labelled replay of recorded loops
  events.
- This supersedes the runtime-binding parts of
  [ADR 0001](0001-browser-world.md) and [ADR 0003](0003-towns-and-session-bindings.md).
  Their browser-first, grid and town-layout parts stay.
