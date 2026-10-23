# CrewHub World

A playful 3D browser world for the AI agents you already use.

CrewHub World is a thin 3D layer on [crewhub-loops](docs/decisions/0005-crewhub-world-on-loops.md).
Every project is a building, agents sit in rooms by role, and tickets are physical
work objects that move through the rooms by status. Nothing in it controls an agent.
[The introduction](docs/INTRODUCTION.md) tells the whole of it for a reader who knows crewhub-loops:
the town and what every loops fact becomes, demo and live mode, how it connects, the chat, and what is
proposed on the loops side.

## Current state

**The world runs in demo mode by default.** A scripted in-browser source produces data in
exactly the shapes crewhub-loops serves, loops forever and is labelled as demo
everywhere. There is no network call, no account and no model call.

**Live mode is built.** `apps/host`, the world's relay, finds the Mac app (`Crewhub.app`) by
itself, reads it with one external bot key over loopback TCP or the app's Unix socket, never
writes to it, and serves the same world with the real projects: `npm run world` is the whole
morning ([the runbook](docs/LOOPS_SETUP.md)), rehearsed from a fresh clone nine times, the last against crewhub-loops
main as well as the Mac app's loops. It holds when
loops stops, when the key is revoked while the town is open and when loops is upgraded under it,
each with an honest screen. The chat is crewhub-loops' own, framed in the world's Chat panel, and an
agent's answer shows as a speech bubble over its figure where the key may read the chat. The host keeps the live
town (zones, layout, props, the undo history) in SQLite in its own folder, shared by every paired browser, with
backups and a previewed restore. Planned, **not built**: the real director. The chat is read through two narrow roads only
(round 28): the host's viewer key, which reads only the chat of the person who made it, or the page itself where
crewhub-loops on this computer has the world's origin set; the sign-in road is gone, and where neither reads the chat
the world says so, names both ways, and shows no bubbles. Both roads were reviewed and walked from a cold clone against
crewhub-loops main in round 29. See the [architecture](docs/ARCHITECTURE.md) and the [roadmap](docs/ROADMAP.md).

Built in demo mode and shown live from the same model:

- A town with one building per project, three rooms by role, and tickets as packages on racks and desks.
- A person who carries finished work into Done; closed buildings for archived projects.
- Dust and a clock tag on a ticket that has gone quiet; a card on the building's board when an automation runs.
- A grid engine with doors, town paths and pathfinding; walk mode; four swappable casts.
- Build mode on a town document (the host's in live mode, the browser's in the demo), and props made with the `prop-builder` skill.
- A "Where is ...?" lookup, the agent card with what crewhub-loops offers for one agent, and a hidden text view of every fact.
- A six-step introduction inside the world the first time a browser opens it, reopenable from Settings and the "?" in the toolbar.
- The chat: crewhub-loops' own chat framed in the Chat panel (from the Chat chip or a lead's card), an agent's answer as a speech bubble over its figure, a chat mark over its building from the town, and a Recent answers list; in the demo a scripted dock feeds the same.
- A scripted director, no model: in the demo, and in live mode as an opt-in that is off by default and says "scripted" on every line.

## Start locally

Use Node.js 24 and npm 11. The repository uses npm workspaces and one committed
lockfile. Do not mix package managers.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The demo starts by itself: use the playback bar for speed
and scrubbing, click a building to enter it, and press T for the text view.

With `Crewhub.app` open, `npm run world` starts the host, opens your browser on a
one-time pairing link and shows a Connect screen that asks for the bot's key once
([three steps](docs/LOOPS_SETUP.md)). `npm run host -- doctor` checks the connection.

```bash
npm run check       # typecheck, tests, doc links, design and copy guards, build
npm test            # all package and app tests (offline)
```

Both stop at once on another Node major than `.nvmrc`'s ("Node 24 required (.nvmrc), found v22.22.0: run nvm use",
`scripts/check-node.mjs`): an older Node runs the tests without a syntax error and fails them slowly instead.

```bash
npm run prop:validate -- path/to/prop.json
npm run preview     # serve the built world at http://127.0.0.1:4173 (CREWHUB_WORLD_PORT=<port> to reach a host; without it, the demo)
```

Run commands from the repository root. Build output is `apps/world/dist`. The
browser checks and measurements are in [tools/](tools/README.md).

## Workspace

The 2D UI uses the crewhub-loops [design system](docs/DESIGN_SYSTEM.md). The 3D items
keep the Greenhouse style.

| Path | Responsibility | Status |
| --- | --- | --- |
| [apps/world](apps/world/README.md) | The browser world: town, buildings, UI, the Connect screens | Demo and live mode |
| [apps/host](apps/host/README.md) | The relay: finds and reads crewhub-loops, serves and pairs the browser, keeps the live town in SQLite | Built and tested |
| [packages/loops-client](packages/loops-client/README.md) | crewhub-loops types, validators, the `WorldSource` seam, the live source | Implemented and tested |
| [packages/demo](packages/demo/README.md) | The scripted in-memory crewhub-loops | Implemented and tested |
| [packages/loops-fake](packages/loops-fake/README.md) | A fake crewhub-loops over HTTP for the host's tests and the live checks | Implemented and tested |
| [packages/world-model](packages/world-model/README.md) | Projection, world reducer, text description | Implemented and tested |
| [packages/world-engine](packages/world-engine/README.md) | Grid, placement, routes, props | Implemented and tested |
| `packages/world-style`, `packages/style-greenhouse` | The style seam and the Greenhouse style ([WORLD_STYLES.md](docs/WORLD_STYLES.md)) | Implemented and tested |
| `packages/world-cast`, `packages/cast-*` | The cast seam and the four casts | Implemented and tested |
| [skills/prop-builder](skills/prop-builder/SKILL.md) | Skill: a prop request becomes a valid prop | Implemented and evaluated |
| [tools](tools/README.md) | Browser checks, the pixel-identical proof, measurements, the first-paint profiler, screenshots, the seed and the development crewhub-loops | Tooling, not shipped |
| [docs](docs/README.md) | Decisions, plan, runbook and handoff | Authoritative for this rebuild |

## Start the next build

Read [AGENTS.md](AGENTS.md), then [the handoff](docs/ASTRA_HANDOFF.md). The open work
is listed in the [roadmap](docs/ROADMAP.md): the real director, and the proposals still waiting on crewhub-loops
(the viewer key and the world's origin setting landed in loops main). The questions that wait on Nicky are one page:
[docs/proposals/open-questions.md](docs/proposals/open-questions.md). Reviewing the pull request that brings this
branch to `main`: [docs/REVIEWING.md](docs/REVIEWING.md) says what to skip, the reading order by area with the risky
parts and what pins them, how to run it in five minutes, and what is deliberately not in it.

## Previous version

The former desktop application is preserved on
[`archive/crewhub2-desktop`](https://github.com/EKINSOL-DEV/crewhub2/tree/archive/crewhub2-desktop).
See [archive and migration notes](docs/ARCHIVE.md) for the exact commit and recovery
commands. Git history and the original [AGPL-3.0 license](LICENSE) are preserved.
