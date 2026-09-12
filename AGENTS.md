# Agent instructions

## Mission and scope

Build CrewHub as a delightful browser world connected to existing agent runtimes
through a reusable bridge. The user requested a clean start because the previous
version's appearance and feel were unsatisfactory.

The first room is implemented as a local simulation. For its design and review
status, start with [docs/ASTRA_HANDOFF.md](docs/ASTRA_HANDOFF.md). Implement the scope the
user actually assigns; do not silently expand a room prototype into a platform.

## Language

Use English for documentation, code identifiers, comments, UI copy, commit
messages, and pull request descriptions. Keep provider names and commands exact.

## Read in this order

1. [Product vision](docs/VISION.md)
2. [Visual direction](docs/VISUAL_DIRECTION.md)
3. [Architecture](docs/ARCHITECTURE.md)
4. [Cost policy](docs/COST_POLICY.md)
5. [Roadmap](docs/ROADMAP.md)

The user's latest instructions are authoritative. Older plans in Git history are
historical references, not active requirements. Do not restore them wholesale.
Update these documents when an accepted decision changes; distinguish decisions,
proposals, and implemented behavior.

## Implementation boundaries

- `apps/world` owns presentation. Keep Tauri APIs, filesystem access, process
  execution, provider credentials, and runtime-specific control logic out of it.
- `apps/bridge` is the future independent service. It must remain useful without
  CrewHub's UI or a Tauri window. Rust is the intended starting point, not a reason
  to port the old desktop application before a bridge is needed.
- `packages/protocol` stays free of React, Three.js, Tauri, and runtime dependencies.
  Its bootstrap types are provisional; add actual wire validation before live use.
- `packages/world-engine` owns grid coordinates, footprints, placement, movement,
  and semantic world descriptions. Keep it free of rendering and provider code.
  Register geometry separately from prop semantics; never infer collision from meshes.
- Herdr comes first. Add direct runtime adapters only for a concrete missing need.
- Keep mock activity explicitly labeled. Never imply that fixture data describes
  a real running session or that an unimplemented control works.
- Normal rendering, motion, state changes, and attention signals require zero
  model calls. Optional AI features follow the cost policy.
- Do not automatically start agents, run meetings, or resume sessions on app load.

## Visual work

The Greenhouse establishes the first art direction: a botanical miniature studio,
soft robots, orthographic overview, and optional free orbit. Preserve clear status
and grid semantics while refining its look and feel. Review the actual room before
growing the feature count. See [grid architecture](docs/GRID_ENGINE.md).

Inspect the rendered result, including animation and interaction, in a real
browser. A successful build or screenshot alone does not establish good feel.
Provide keyboard access, text status, reduced motion, touch targets, and a useful
fallback for unsupported graphics. Do not make color the only status signal.

## Working and verification

- Use Node.js 24, npm 11, and the committed npm lockfile. Run `npm ci`.
- Run `npm run check` before delivery. Add focused tests when introducing actual
  protocol, state, identity, reconnect, or command behavior; do not add trivial
  tests that only restate static fixtures.
- Add dependencies when used. Do not preinstall a rendering engine, UI kit, agent
  SDK, or Tauri tooling for a later milestone.
- Do not introduce API keys or paid calls merely to build, preview, or verify UI.
- Work within the assigned scope without repeated permission questions. Keep
  changes reviewable on the rebuild branch and report concrete blockers honestly.
- Preserve LICENSE, the archive branch, and existing history. Never force-push or
  merge to main as part of a bootstrap task.
- End with what changed, verification performed, limitations, and a clear next
  step. Never describe planned integrations as implemented.
