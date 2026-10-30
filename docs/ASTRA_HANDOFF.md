# Handoff: where to start

The file name is historical. It once briefed the first room, the Greenhouse, which
is gone. This is the current handoff for CrewHub World.

## What exists

CrewHub World is a thin 3D layer on crewhub-loops ([ADR 0005](decisions/0005-crewhub-world-on-loops.md)).
It runs in **demo mode by default**: a scripted in-browser source with the shapes
crewhub-loops serves, no network, no account and no model call. Every demo screen is
labelled as demo. **Live mode is built**: `apps/host` finds the Mac app's crewhub-loops,
reads it with an external bot key, never writes, and serves and pairs the browser;
`npm run world` is the one command and the key is pasted once on a Connect screen
([LOOPS_SETUP.md](LOOPS_SETUP.md)). The same reducer draws the demo and the real projects.

## Where to start

1. [AGENTS.md](../AGENTS.md): boundaries and working rules.
2. [The demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md): the contract for this build, with the addenda of every round since (the last three: live on the Mac crewhub-loops, a person in the world and closed buildings, a smooth connection).
3. [ARCHITECTURE.md](ARCHITECTURE.md): the target diagram, what is built, the host's parts, the world's gate.
4. [ROADMAP.md](ROADMAP.md): the phases and what is still open.
5. [LOOPS_INTEGRATION_PLAN.md](LOOPS_INTEGRATION_PLAN.md): the full plan, mapping in sections 4 to 7, what each phase built in section 10.
6. [The night report](reports/2026-10-01-world-demo-night.md): what each round built and how it was verified.

## Packages

| Path | What |
| --- | --- |
| [packages/loops-client](../packages/loops-client/README.md) | crewhub-loops types, validators, the `WorldSource` seam, the live source (`createHostSource`) |
| [packages/demo](../packages/demo/README.md) | The scripted source and its storyline ([CONTENT.md](../packages/demo/CONTENT.md)) |
| [packages/loops-fake](../packages/loops-fake/README.md) | A fake crewhub-loops over HTTP, for the host's tests and the live checks |
| [packages/world-model](../packages/world-model/README.md) | Projection, reducer, text description, town document |
| [packages/world-engine](../packages/world-engine/README.md) | Grid, placement, pathfinding, the prop format |
| `packages/world-style`, `packages/style-greenhouse`, `packages/world-cast`, `packages/cast-*` | The style and cast seams and their data ([WORLD_STYLES.md](WORLD_STYLES.md)) |
| [apps/world](../apps/world/README.md) | The browser app |
| [apps/host](../apps/host/README.md) | The relay to crewhub-loops: discovery, the key, the snapshot, the stream, pairing, `npm run world`, the doctor |
| [tools](../tools/README.md) | Browser checks, measurements, screenshots, the seed, the development crewhub-loops |
| [skills/prop-builder](../skills/prop-builder/SKILL.md) | The skill that builds valid props |

## Run and verify

```bash
npm ci
npm run dev          # http://127.0.0.1:5173, the demo starts by itself
npm run world        # with Crewhub.app open: the host, the pairing link, the Connect screen, the real projects
npm run check        # typecheck, tests, doc links, design guard, copy check, build
npm run prop:validate -- path/to/prop.json
node tools/regress.mjs --port <port>   # the browser regression pass against a Vite of your own
```

Look at the result in a real browser, in light and dark, at desktop and phone width.
A green build alone does not establish good feel. Keep the loops kit for 2D UI and
the Greenhouse style for 3D items ([VISUAL_DIRECTION.md](VISUAL_DIRECTION.md)).

## Not built

The host's world database (in progress, round 20: the town document moves from the browser
to the host), the real director, and every change to crewhub-loops: the viewer key (L1), the
"Connect CrewHub World" button, the chat deep link and the framing allowance are written on
the loops branch `world/viewer-key` (on origin, under `cl-lead`'s review), the world's switch
to it on `task/r19-viewer-switch`, and project groups (L22) are asked for. The chat itself is
built: loops' own, framed in the Chat panel, with bubbles where the key may read the chat. See
"Open" in the roadmap.
