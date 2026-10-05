# Agent instructions

## Mission and scope

CrewHub World is a delightful browser world that shows what happens in
crewhub-loops: a thin 3D layer on top of it. Every project is a building, agents
sit in rooms by role, and tickets are physical work objects that move through the
rooms by status. The decision is [ADR 0005](docs/decisions/0005-crewhub-world-on-loops.md),
the full plan is [docs/LOOPS_INTEGRATION_PLAN.md](docs/LOOPS_INTEGRATION_PLAN.md) and
tonight's build is [the demo-mode spec](docs/superpowers/specs/2026-10-01-world-demo-mode-design.md).

**Tonight the world runs only in demo mode.** A scripted in-browser source
produces data in exactly the shapes crewhub-loops serves. There is no network
call, no account and no model call. `apps/host` (the process that would read
crewhub-loops) is planned, not built. Implement the scope the user actually
assigns; do not describe planned parts as implemented.

Start with [docs/README.md](docs/README.md) for the document index and
[docs/ROADMAP.md](docs/ROADMAP.md) for what is built and what is open. All 2D UI
uses the crewhub-loops design system, described in
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Colours come only from `tokens.css`
variables, with no hex outside it; reuse the primitives and add variants, not new
components.

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

- `apps/world` owns presentation. Keep credentials, keys, and machine access out of
  it. All data arrives through a `WorldSource`; in the planned design it comes from
  the CrewHub host, never from a runtime.
- `apps/host` is planned, not built. It would be CrewHub's only process: it reads
  crewhub-loops over its socket with a read-only key, owns the world database and
  serves the world. It never controls agents or holds provider secrets.
- `packages/loops-client` holds the crewhub-loops types, hand-written runtime
  validators for every response and event, and the `WorldSource` seam. It stays free
  of React, Three.js, the DOM, the network, and runtime dependencies. It replaces
  `packages/protocol`.
- `packages/world-model` turns facts into the world: projection, reducer, text
  description, town document, catalogue, director intents and `where`. It has the
  same purity rules and never knows whether its source is the demo or a host.
- `packages/demo` is the scripted in-memory crewhub-loops behind `WorldSource`. It is
  pure TypeScript and deterministic.
- `packages/world-style` is the `WorldStyle` contract; `packages/style-greenhouse` is the
  Greenhouse style (models as parts-JSON where possible, the palette and lighting as data).
  Only `apps/world/src/world/style.ts` imports a style package; renderers ask the resolved
  style of a building for meshes by semantic key. A test enforces this. See
  [docs/WORLD_STYLES.md](docs/WORLD_STYLES.md).
- `packages/world-cast` is the cast contract and the generic figure runtime; `packages/cast-*` are the casts (the
  figures that stand for agents), data first: `cast.json` and `figure.json`. Only `apps/world/src/world/cast.ts`
  imports a cast package, a cast imports no other cast, and renderers ask the resolved cast for figures. Tests
  enforce the boundary and the contract. See "Casts" in [docs/WORLD_STYLES.md](docs/WORLD_STYLES.md).
- `packages/world-engine` owns grid coordinates, footprints, placement, movement,
  pathfinding, and semantic world descriptions. Keep it free of rendering and provider code.
  Register geometry separately from prop semantics; never infer collision from meshes.
- crewhub-loops is the only source of facts. The world never talks to Herdr or to
  an agent runtime. Identity is the loops principal id.
- Keep demo and replay data explicitly labelled. Never imply that it describes a
  real running session or that an unimplemented control works.
- No model call exists in the codebase. `scripts/scan-model-calls.ts` runs in
  `npm test` and fails on an AI SDK import or a model endpoint. Keep it green.
- Normal rendering, motion, state changes, and attention signals require zero
  model calls. Optional AI features follow the cost policy.
- Do not automatically start agents, run meetings, or resume sessions on app load.
- New props are built with the `prop-builder` skill in
  [skills/prop-builder/](skills/prop-builder/SKILL.md): a `crewhub-prop/1` JSON file
  that `npm run prop:validate -- <file.json>` accepts.

## Visual work

The Greenhouse establishes the art direction of the 3D scene: a botanical miniature
studio, soft robots, orthographic overview, and optional free orbit. The town, its
buildings and every prop are made in that style; the room itself is gone. See
"World styles" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Preserve clear
status and grid semantics while refining its look and feel. 2D UI around the scene
follows the crewhub-loops design system, not the scene's materials. Review the actual room before
growing the feature count. See [grid architecture](docs/GRID_ENGINE.md).

Inspect the rendered result, including animation and interaction, in a real
browser. A successful build or screenshot alone does not establish good feel.
Provide keyboard access, text status, reduced motion, touch targets, and a useful
fallback for unsupported graphics. Do not make color the only status signal.

## Working and verification

- Use Node.js 24, npm 11, and the committed npm lockfile. Run `npm ci`. Tests run
  with `node --test` directly on `.ts` files (type stripping): use `import type`,
  no enums, and relative imports ending in `.ts`.
- Run `npm run check` before delivery. Add focused tests when introducing actual
  projection, state, identity, reconnect, or command behavior; do not add trivial
  tests that only restate static fixtures.
- Add dependencies when used. Do not preinstall a rendering engine, UI kit, agent
  SDK, or tooling for a later milestone.
- Do not introduce API keys or paid calls merely to build, preview, or verify UI.
- Work within the assigned scope without repeated permission questions. Keep
  changes reviewable on the rebuild branch and report concrete blockers honestly.
- Preserve LICENSE, the archive branch, and existing history. Never force-push or
  merge to main as part of a bootstrap task.
- End with what changed, verification performed, limitations, and a clear next
  step. Never describe planned integrations as implemented.
