# CrewHub World

A playful 3D browser world for the AI agents you already use.

CrewHub World is a thin 3D layer on [crewhub-loops](docs/decisions/0005-crewhub-world-on-loops.md).
Every project is a building, agents sit in rooms by role, and tickets are physical
work objects that move through the rooms by status. Nothing in it controls an agent.

## Current state

**The world runs only in demo mode.** A scripted in-browser source produces data in
exactly the shapes crewhub-loops serves, loops forever and is labelled as demo
everywhere. There is no network call, no account and no model call.

Built in demo mode (the status of each phase is listed in the [roadmap](docs/ROADMAP.md)):

- A town with one building per demo project, rooms by role, and tickets as objects.
- The crewhub-loops chat bubbles, mirrored from crewhub-loops and backed by a fake chat API.
- A grid engine with doors, town paths and pathfinding.
- Build mode with a local town document, and props made with the `prop-builder` skill.
- A scripted director, a "Where is ...?" lookup and a hidden text view of every fact.

Planned, **not built**: `apps/host` (the process that would read a live crewhub-loops),
its world database, the real chat and the real director. See the
[architecture](docs/ARCHITECTURE.md).

## Start locally

Use Node.js 24 and npm 11. The repository uses npm workspaces and one committed
lockfile. Do not mix package managers.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The demo starts by itself: use the playback bar for speed
and scrubbing, click a building to enter it, and press T for the text view.

```bash
npm run check       # typecheck, tests, doc links, design and copy guards, build
npm test            # all package and app tests
npm run prop:validate -- path/to/prop.json
npm run preview     # serve the built world at http://127.0.0.1:4173
```

Run commands from the repository root. Build output is `apps/world/dist`.

## Workspace

The 2D UI uses the crewhub-loops [design system](docs/DESIGN_SYSTEM.md). The 3D items
keep the Greenhouse style.

| Path | Responsibility | Status |
| --- | --- | --- |
| [apps/world](apps/world/README.md) | The browser world: town, buildings, UI | Demo mode only |
| [packages/loops-client](packages/loops-client/README.md) | crewhub-loops types, validators, the `WorldSource` seam | Implemented and tested |
| [packages/demo](packages/demo/README.md) | The scripted in-memory crewhub-loops | Implemented and tested |
| [packages/world-model](packages/world-model/README.md) | Projection, world reducer, text description | Implemented and tested |
| [packages/world-engine](packages/world-engine/README.md) | Grid, placement, routes, props | Implemented and tested |
| [skills/prop-builder](skills/prop-builder/SKILL.md) | Skill: a prop request becomes a valid prop | Implemented and evaluated |
| [docs](docs/README.md) | Decisions, plan and handoff | Authoritative for this rebuild |

## Start the next build

Read [AGENTS.md](AGENTS.md), then [the handoff](docs/ASTRA_HANDOFF.md). The open work
is the host and everything that needs a live crewhub-loops: see the
[roadmap](docs/ROADMAP.md).

## Previous version

The former desktop application is preserved on
[`archive/crewhub2-desktop`](https://github.com/EKINSOL-DEV/crewhub2/tree/archive/crewhub2-desktop).
See [archive and migration notes](docs/ARCHIVE.md) for the exact commit and recovery
commands. Git history and the original [AGPL-3.0 license](LICENSE) are preserved.
