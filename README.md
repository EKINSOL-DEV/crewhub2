# CrewHub

A playful browser world for the AI agents you already use.

CrewHub is being rebuilt in this repository. The goal is a visually distinctive,
responsive environment where real agent activity becomes easy to understand and
enjoy. Herdr is the first integration. A reusable local bridge will connect the
world to agents; an optional Tauri companion may package that bridge later.

## Current state

This branch contains **The Greenhouse**, the first interactive room:

- A botanical Three.js room with three procedural robot companions.
- Isometric home, free orbit, focus, zoom, and fading architectural walls.
- Shader glass, a shader grid, selection halos, and state-driven character motion.
- An independent grid engine with footprints, rotation, safe placement, four-way
  pathfinding, movement reservations, and compact semantic world snapshots.
- An oversight panel, four mock scenarios, keyboard controls, reduced motion,
  lighter graphics, a text-first fallback, and JSON layout export.
- Type checking, engine tests, documentation links, and a production build in CI.

All activity is simulated locally. No credentials, running agents, Rust toolchain,
or paid services are needed. The Herdr adapter, bridge, and Tauri companion are
future work. Visual acceptance is still pending: the cloud browser blocked preview
navigation, so no browser, GPU, or touch-device verification is claimed. See the
[review notes](docs/ROOM_REVIEW.md) for evidence and remaining checks.

## Start locally

Use Node.js 24 and npm 11. The repository uses npm workspaces and one committed
lockfile. Do not mix package managers.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Select a companion, try the scene selector, and use the
box or footprints tool to arrange furniture or walk an agent. Everything is local;
the app does not contact Herdr or an AI provider. Assets are procedural and fonts
use the system. Add `?view=list` for the text-first overview.

```bash
npm run check       # typecheck, engine tests, documentation links, production build
npm test            # headless placement and navigation checks
npm run preview     # serve the built world at http://127.0.0.1:4173
```

Run commands from the repository root. Build output is `apps/world/dist`.

## Workspace

| Path | Responsibility | Status |
| --- | --- | --- |
| [apps/world](apps/world/README.md) | Browser room and mock session presentation | Implemented; visual review pending |
| [packages/world-engine](packages/world-engine/README.md) | Grid, placement, routes, semantic snapshots | Implemented and tested |
| [apps/bridge](apps/bridge/README.md) | Independent local runtime bridge | Reserved; no executable yet |
| [packages/protocol](packages/protocol/README.md) | Renderer-independent session types | Draft, mock use only |
| [docs](docs/README.md) | Current decisions and next build brief | Authoritative for this rebuild |

## Start the next build

Read [AGENTS.md](AGENTS.md), then [the Astra handoff](docs/ASTRA_HANDOFF.md).
The next step is to run and review the room on desktop and a touch device, then
refine its visual quality and feel before connecting live agents.

## Previous version

The former desktop application is preserved on
[`archive/crewhub2-desktop`](https://github.com/EKINSOL-DEV/crewhub2/tree/archive/crewhub2-desktop).
See [archive and migration notes](docs/ARCHIVE.md) for the exact commit and recovery
commands. Git history and the original [AGPL-3.0 license](LICENSE) are preserved.
