# Tools

Scripts that open the running world in a headless browser, to check it, measure it and look at it. Plain `.mjs`
files, run with `node`; not a workspace package and not part of `npm run check` (they need a browser and a running
server). Anything a later task must rerun lives here, not in a scratch folder.

## Running one

1. Install once: `npm ci` (the browser driver, `playwright-core`, is a root dev dependency). The browser itself
   comes from Playwright's cache (`~/Library/Caches/ms-playwright`); if it is missing, fetch it once with
   `npx playwright-core install chromium`.
2. Serve the world on a port of your own (never one somebody is watching):
   `(cd apps/world && npx vite --port <port> --strictPort --host 127.0.0.1)`
3. `node tools/<script> --port <port> ...`, from the repository root. `--help` prints the usage; the comment at the
   top of each script is its manual.

Every script takes:

| Option | Meaning |
| --- | --- |
| `--port <port>` | Required. The port your server listens on; the scripts only ever open `http://127.0.0.1:<port>/`. |
| `--out <dir>` | Where screenshots, logs and results go. Default: `tools/out/`, which is git-ignored. |
| `--swiftshader` | Software rendering, for a machine without a GPU. Pictures are fine; never compare its timings with GPU runs. |

Where they apply: `--theme light,dark`, `--cast <id>` (the viewer's cast choice, as Settings > Town > Cast stores
it), `--stress <n>` (the stress fixture's size, the page's `?stress=<n>`; dev builds only: `1` is 12 buildings with
about 100 agents, `20` is 20 buildings with 200 agents in four groups), `--scenario <id>` (a demo scenario from the
Demo chip's picker, the page's `?scenario=<id>`; `perf.mjs` and `shots.mjs`) and `--tag <name>` (the prefix of the files written).

**The browser.** Headless Chromium from `playwright-core`, launched with
`--headless=new --use-angle=metal --enable-gpu` (GPU-backed, Metal ANGLE: macOS), or with
`--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader` under `--swiftshader`. 1440 x 900 at DPR 1
unless a script says otherwise; a phone is 375 x 812 with touch.

## The scripts

| Script | What it does | Writes |
| --- | --- | --- |
| `regress.mjs` | The browser regression pass: 38 checks along a visitor's walk through the demo (keyboard, text view, Details, timeline, chat, build mode, settings, the where form, reduced motion, themes, a phone), failing on any page error, console error or request that leaves the page. Prints `regress: <passed>/<total>` last; exit code 0 only at full marks. Needs a dev server (two checks read `window.__town`). About two minutes. | `<tag>-NN-<stop>.png`, `<tag>-results.json`, `<tag>.log` |
| `perf.mjs` | Frame time, work per frame, draw calls, triangles and heap per scenario (`demo-town`, `demo-inside`, `stress-town`, `stress-inside`, `phone-fast`, `startup`, and more: see its header). `--preview` for a production build, `--cast`, `--quality`, `--theme`, `--scenario`, `--stress`. | The table on stdout; `--json <file>` for every number |
| `memory.mjs` | Heap after GC, GPU geometries and textures, DOM nodes and listeners over a long 16x run (`demo` or `stress`), and the growth after warm-up. | Lines on stdout; `--json <file>` |
| `shots.mjs` | The world in screenshots: `--views` (`town`, `building`, `room`, `walk`, `stress`) x `--theme` x `--width`, in any `--scenario`. `walk` is the critical walk through every building and room. | `<tag>-<view>-<theme>-<width>.png` |
| `castshots.mjs` | The casting room (`/cast-preview`): every cast in every state, the scenes, dusk, reduced motion, Fast, far, the drone, and the side-by-side view. `--cast`, `--states`, `--only` narrow it. | `room-<cast>-<what>-<theme>.png` |
| `castworld.mjs` | The world as each cast draws it (the viewer's choice): town, building, room per theme and width, and the stress fixture with the dev overlay's numbers. | `<tag>-<cast>-<view>-<theme>-<width>.png` |

`lib/world.mjs` is what they share (the command line, the browser, the error and request watch, seeking and
playback); `lib/shots.mjs` is the view walker behind `shots.mjs` and `castworld.mjs`.

Examples:

```sh
node tools/regress.mjs --port 5180
node tools/perf.mjs --port 5180 stress-town stress-inside --cast potlings --json perf-potlings.json
node tools/memory.mjs --port 5180 stress --minutes 5
node tools/shots.mjs --port 5180 --tag before --views town,building,room --width 1440,375
node tools/castshots.mjs --port 5180 --cast sprouts --only states --theme light
node tools/castworld.mjs --port 5180 --cast potlings,sprouts --views town,building,room
```

## Rules for a tool

- **Tooling only.** Nothing under `apps/` or `packages/` imports `playwright-core` or this folder, and no workspace
  lists a browser driver. `scripts/scan-model-calls.ts` (run by `npm test`) enforces it.
- **This machine only.** A tool addresses `127.0.0.1` or `localhost`, spelled out, and uses no network call of its
  own. The same scanner checks every address under `tools/`. No model call, as everywhere.
- **No absolute paths.** Output goes to `--out`; nothing is read from or written to a path outside the repository
  unless the caller names it.
- **Parameters, not copies.** A new need is an option on a script here, not a copy of it somewhere else. If you
  improve a tool, commit it.
- **When the app changes, fix the check where the app is right.** `regress.mjs` reads the demo script's own times
  and the app's own names; a check that fails after a deliberate change is updated here, with the reason in the
  commit.
