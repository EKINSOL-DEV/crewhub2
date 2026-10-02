# Handoff: where to start

The file name is historical. It once briefed the first room, the Greenhouse, which
is gone. This is the current handoff for CrewHub World.

## What exists

CrewHub World is a thin 3D layer on crewhub-loops ([ADR 0005](decisions/0005-crewhub-world-on-loops.md)).
Tonight it runs **only in demo mode**: a scripted in-browser source with the shapes
crewhub-loops serves, no network, no account and no model call. `apps/host` is
planned, not built. Every demo screen is labelled as demo.

## Where to start

1. [AGENTS.md](../AGENTS.md): boundaries and working rules.
2. [The demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md): the contract for this build.
3. [ARCHITECTURE.md](ARCHITECTURE.md): the target diagram and "What is built (demo mode)".
4. [ROADMAP.md](ROADMAP.md): the phases and what is still open.
5. [LOOPS_INTEGRATION_PLAN.md](LOOPS_INTEGRATION_PLAN.md): the full plan, mapping in sections 4 to 7.

## Packages

| Path | What |
| --- | --- |
| [packages/loops-client](../packages/loops-client/README.md) | crewhub-loops types, validators, the `WorldSource` seam |
| [packages/demo](../packages/demo/README.md) | The scripted source and its storyline ([CONTENT.md](../packages/demo/CONTENT.md)) |
| [packages/world-model](../packages/world-model/README.md) | Projection, reducer, text description, town document |
| [packages/world-engine](../packages/world-engine/README.md) | Grid, placement, pathfinding, the prop format |
| [apps/world](../apps/world/README.md) | The browser app |
| [skills/prop-builder](../skills/prop-builder/SKILL.md) | The skill that builds valid props |

## Run and verify

```bash
npm ci
npm run dev          # http://127.0.0.1:5173, the demo starts by itself
npm run check        # typecheck, tests, doc links, design guard, copy check, build
npm run prop:validate -- path/to/prop.json
```

Look at the result in a real browser, in light and dark, at desktop and phone width.
A green build alone does not establish good feel. Keep the loops kit for 2D UI and
the Greenhouse style for 3D items ([VISUAL_DIRECTION.md](VISUAL_DIRECTION.md)).

## Not built

The host, the world database, the live stream, real chat, the real director and
every change to crewhub-loops. See "Open: the host" in the roadmap.
