# ADR 0001: Browser world with an independent bridge

Status note: the browser-first, grid and town parts stay. The independent bridge and the Herdr-first adapters are superseded by [ADR 0005](0005-crewhub-world-on-loops.md): crewhub-loops is the service and a small CrewHub host (planned, not built) would read it.

- Status: Accepted direction; implementation staged by milestone
- Date: 2026-09-12

## Context

The owner wants a complete visual rethink within the existing CrewHub2 repository.
The former desktop version is preserved. The new experience emphasizes playful
interaction, Herdr integration, and cost efficiency. The bridge should also be
useful to other software.

## Decision

Build the main experience as a browser application. Separate native machine access
into an independent local bridge with a shared, versioned contract. Start visual
work with deterministic mock data. Integrate Herdr first. Treat Tauri as an optional
companion for packaging and desktop lifecycle, rather than a required UI transport.

Use a small React/TypeScript/Vite npm workspace for the bootstrap. Defer rendering
dependencies, bridge libraries, and desktop tooling until their implementation
milestones. Preserve the original license and Git history.

## Consequences

The world can be developed and reviewed without native runtime access. Other
clients can reuse the bridge. The team gains visual freedom and must explicitly
design local pairing, origin handling, events, and reconnect behavior before live
control. Browser-first does not mean public hosting or remote access is automatic.

Tauri already renders web content; replacing it does not guarantee better graphics.
Visual quality depends on design and execution, and performance must be measured.

## Deferred decisions

Rendering engine, final art direction, bridge server library, wire schemas, desktop
packaging, multi-machine deployment, and optional AI features. See
[the architecture](../ARCHITECTURE.md) and [roadmap](../ROADMAP.md).
