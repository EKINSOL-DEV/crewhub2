# CrewHub

A playful browser world for the AI agents you already use.

CrewHub is being rebuilt in this repository. The goal is a visually distinctive,
responsive environment where real agent activity becomes easy to understand and
enjoy. Herdr is the first integration. A reusable local bridge will connect the
world to agents; an optional Tauri companion may package that bridge later.

## Current state

This branch contains **the bootstrap and design handoff only**:

- A runnable React + TypeScript + Vite workspace.
- A deterministic mock session fixture and a draft shared contract.
- English product, visual, architecture, cost, and implementation guidance.
- Type checking, local Markdown link checking, and a production build in CI.

The room, characters, live Herdr adapter, bridge process, and Tauri companion have
not been built. The temporary page is a development fixture, not the new design.
No credentials, running agents, Rust toolchain, or paid services are needed.

## Start locally

Use Node.js 24 and npm 11. The repository uses npm workspaces and one committed
lockfile. Do not mix package managers.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The button cycles mock activity; it does not contact
Herdr or an AI provider. Runtime assets and fonts are local.

```bash
npm run check       # typecheck, documentation links, production build
npm run preview     # serve the built world at http://127.0.0.1:4173
```

Run commands from the repository root. Build output is `apps/world/dist`.

## Workspace

| Path | Responsibility | Status |
| --- | --- | --- |
| [apps/world](apps/world/README.md) | Browser experience and mock fixture | Runnable bootstrap |
| [apps/bridge](apps/bridge/README.md) | Independent local runtime bridge | Reserved; no executable yet |
| [packages/protocol](packages/protocol/README.md) | Renderer-independent session types | Draft, mock use only |
| [docs](docs/README.md) | Current decisions and next build brief | Authoritative for this rebuild |

## Start the next build

Read [AGENTS.md](AGENTS.md), then [the Astra handoff](docs/ASTRA_HANDOFF.md).
The next milestone is one polished, interactive room with simulated activity.
Its visual quality and feel come before expanding features or connecting live agents.

## Previous version

The former desktop application is preserved on
[`archive/crewhub2-desktop`](https://github.com/EKINSOL-DEV/crewhub2/tree/archive/crewhub2-desktop).
See [archive and migration notes](docs/ARCHIVE.md) for the exact commit and recovery
commands. Git history and the original [AGPL-3.0 license](LICENSE) are preserved.
