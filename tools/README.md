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
about 100 agents, `20` is 20 buildings with 200 agents in four groups; given to a `phone-*` scenario of `perf.mjs` it
measures the fixture at 4x on the phone instead of the demo), `--scenario <id>` (a demo scenario from the
Demo chip's picker, the page's `?scenario=<id>`; `perf.mjs` and `shots.mjs`) and `--tag <name>` (the prefix of the files written).

**The browser.** Headless Chromium from `playwright-core`, launched with
`--headless=new --use-angle=metal --enable-gpu` (GPU-backed, Metal ANGLE: macOS), or with
`--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader` under `--swiftshader`. 1440 x 900 at DPR 1
unless a script says otherwise; a phone is 375 x 812 with touch.

## The scripts

| Script | What it does | Writes |
| --- | --- | --- |
| `regress.mjs` | The browser regression pass, in five groups (`--groups`, default all): `walk`, 36 checks along a visitor's walk through the demo (keyboard, text view, Details, timeline, chat, build mode, settings, the where form, reduced motion, themes, a phone); `demo`, 11 checks of the jump list, the scenario picker and the Studio scenario's Region level (district cards, beacon, pin, Escape chain); `live`, 7 checks of live mode against a fake crewhub-loops and a host the tool starts itself (the pairing page without a cookie, the one-time link, the Live chip, the sign-in link, Loops down, Live again); `rooms`, 10 checks of the three-room building behind `?rooms=three` (three room signs and a rack sign with its count, the arrow keys between the halls, the text view's racks and desks with a package on each, the lead's office beacon, the agent card on a figure at a desk, walk mode through the front door into Administration and on to the floor); `real`, up to 5 checks of live mode against the real development crewhub-loops on 8291 (the Live chip, the real projects by name, a building's real tickets in the text view, the counts following a move, the host staying on loops), skipped with one INFO line when that loops is down. Fails on any page error, console error or request that leaves the page. Prints `regress: <passed>/<total>` last; exit code 0 only at full marks. Needs a dev server (some checks read `window.__town`). Times: `walk` about 120 s, `demo` about 30 s, `live` about 6 s, `rooms` about 50 s, `real` under 60 s; together about 265 s, so a check under the one-minute budget runs `--groups demo,live`. | `<tag>-NN-<stop>.png`, `<tag>-results.json`, `<tag>.log` |
| `perf.mjs` | Frame time, work per frame, draw calls, triangles and heap per scenario (`demo-town`, `demo-inside`, `stress-town`, `stress-inside`, `phone-fast`, `startup`, and more: see its header). `--preview` for a production build, `--cast`, `--quality`, `--theme`, `--scenario`, `--stress`. | The table on stdout; `--json <file>` for every number |
| `memory.mjs` | Heap after GC, GPU geometries and textures, DOM nodes and listeners over a long 16x run (`demo` or `stress`), and the growth after warm-up. | Lines on stdout; `--json <file>` |
| `shots.mjs` | The world in screenshots: `--views` (`town`, `building`, `room`, `walk`, `stress`) x `--theme` x `--width`, in any `--scenario`. `walk` is the critical walk through every building and room. | `<tag>-<view>-<theme>-<width>.png` |
| `castshots.mjs` | The casting room (`/cast-preview`): every cast in every state, the scenes, dusk, reduced motion, Fast, far, the drone, and the side-by-side view. `--cast`, `--states`, `--only` narrow it. | `room-<cast>-<what>-<theme>.png` |
| `castworld.mjs` | The world as each cast draws it (the viewer's choice): town, building, room per theme and width, and the stress fixture with the dev overlay's numbers. | `<tag>-<cast>-<view>-<theme>-<width>.png` |
| `loops-seed.mjs` | No browser: replays a demo scenario's storyline (`packages/demo`) into the **development** crewhub-loops through its API, as an external bot (`--key-file`, or `CREWHUB_WORLD_KEY_FILE`; a lead agent's key, never a person's cookie), so the world shows real data that moves. `--url` (default `http://127.0.0.1:8291`; only this machine, never port 8091, 8000 or 9443), `--scenario <id>`, `--speed <n>` (16 = a minute a pass), `--once`, `--projects <n>`, `--dry-run` (reads, prints the plan, writes nothing), `--restart`, `--no-rewind`. Idempotent: projects by slug (never created: the plan prints the admin's request), tickets by title, a stopped run resumes. Whatever a lead agent may not write (a move into Done, projects, labels, milestones, releases, lanes, the chat) is skipped with the loops rule that refuses it. Without `--once` it loops until Ctrl+C: press it once and the run stops after the current entry. Pure helpers in `lib/seed.ts`, tested by `scripts/test/loops-seed.test.ts`. | `loops-seed.state.json` (where it stopped), `loops-seed-person-only.json` (the Done moves a person must make) |
| `liveshots.mjs` | The world in live mode (`?source=live`) against whatever host your Vite proxies to: the town, the connection chip, Settings > Source, the text view's connection line, and with `--card <agent>` the agent card of each named agent (the page, the card, and the card scrolled to its Lane section), its text on stdout. `--state` only names the files. | `<tag>-<state>-<view>-<theme>-<width>.png`, `<tag>-<state>-card-<agent>-...png`, `...-cardonly-...`, `...-cardlane-...` |

`lib/world.mjs` is what they share (the command line, the browser, the error and request watch, seeking and
playback); `lib/shots.mjs` is the view walker behind `shots.mjs` and `castworld.mjs`.

**The live group of `regress.mjs`.** It starts its own fake (`packages/loops-fake`, a free port) and its own host
(`apps/host`), both on `127.0.0.1`, and closes them at the end. When `apps/world/dist` exists (after `npm run build`)
the host serves it on a free port and the browser opens the host directly. Otherwise the host listens on `--host-port`
(default 5180, the Vite proxy's default target) and the browser opens your Vite, so start that Vite with
`CREWHUB_WORLD_PORT=<host-port>`; the port must be free. The page is opened without `?source=live`: the source is
`auto`, the probe finds the host, and the health it answers is what the sign-in link follows.

**The real group of `regress.mjs`.** It talks to the real development crewhub-loops (`tools/loops-dev.sh`, port
8291; never the Mac app on 8091). It reads `--loops-env` (default `tools/out/loops-dev.env` of the main checkout,
found through `git rev-parse --git-common-dir`), takes only `LOOPS_DEV_URL` (loopback) and `LOOPS_DEV_KEY_FILE` from
it (the admin lines are never read or printed), and when that loops does not answer `/api/health` it prints
`INFO real: skipped, 8291 is down` and counts nothing. Otherwise it starts its own host on `--host-port` with that
key (the key never reaches a log, a screenshot or the results), so start Vite with `CREWHUB_WORLD_PORT=<host-port>`,
and the browser opens your Vite. The count check needs a `ticket.moved` during its 15 s window: run
`tools/loops-seed.mjs` alongside, or move a ticket in the loops web; without one it prints an INFO line. Loops admits
4 streams per key: do not run it while another host of yours follows the same loops with the same key.

Examples:

```sh
node tools/regress.mjs --port 5180
node tools/regress.mjs --port 5180 --groups demo,live --host-port 5181   # Vite started with CREWHUB_WORLD_PORT=5181
node tools/regress.mjs --port 5281 --groups real --host-port 5181        # the real dev loops; Vite started with CREWHUB_WORLD_PORT=5181
node tools/regress.mjs --port 5281 --groups real --host-port 5181 --loops-env ~/my-loops.env
node tools/regress.mjs --port 5180 --groups rooms                        # the three-room building, ?rooms=three
node tools/perf.mjs --port 5180 stress-town stress-inside --cast potlings --json perf-potlings.json
node tools/memory.mjs --port 5180 stress --minutes 5
node tools/shots.mjs --port 5180 --tag before --views town,building,room --width 1440,375
node tools/castshots.mjs --port 5180 --cast sprouts --only states --theme light
node tools/castworld.mjs --port 5180 --cast potlings,sprouts --views town,building,room
```

## The development crewhub-loops

One script here is not a browser check: it runs the crewhub-loops the live checks and the host are developed
against, next to the Mac app and never inside it.

| Script | What it does | Writes |
| --- | --- | --- |
| `loops-dev.sh` | `start`, `stop`, `status`, `log [n]`, `setup-token`, `env`: a private crewhub-loops from a checkout (`LOOPS_DEV_CHECKOUT`, default `~/Documents/GitHub/crewhub-loops-world`, `services/api` synced with `uv` and `apps/web` built), on port **8291** (`LOOPS_DEV_PORT`; 8091, 8000 and 9443 are refused), with its own data folder `~/crewhub-loops-dev` (`LOOPS_DEV_DATA`: database, uploads, the Unix socket `run/api.sock`, the pid file and `serve.log`) and the `config/generic` seed. `setup-token` prints the one-time setup code for the first admin; `env` prints the `CHL_*` lines for a loops CLI against the same database. The recipe for the first admin and the world's external bot, and the never-touch list (the app's data folder, port 8091, launchd, `install-mac.sh`), are in [docs/LOOPS_SETUP.md](../docs/LOOPS_SETUP.md), section 7. | `~/crewhub-loops-dev/` (outside the repository, on purpose: a database is not a tool output) |

`loops-dev.sh` is a plain `bash` script, not a `node` one, and takes no `--port`: its knobs are the environment
variables above. It never touches `~/Library/Application Support/be.ekinsol.crewhub`, port 8091 or launchd.

## Rules for a tool

- **Tooling only.** Nothing under `apps/` or `packages/` imports `playwright-core` or this folder, and no workspace
  lists a browser driver. `scripts/scan-model-calls.ts` (run by `npm test`) enforces it.
- **This machine only.** A tool addresses `127.0.0.1` or `localhost`, spelled out, and uses no network call of its
  own. The same scanner checks every address under `tools/`. No model call, as everywhere. The one exception is
  `loops-seed.mjs`, which talks to the development crewhub-loops on loopback and is on the scanner's allowlist for it.
- **No absolute paths.** Output goes to `--out`; nothing is read from or written to a path outside the repository
  unless the caller names it.
- **Parameters, not copies.** A new need is an option on a script here, not a copy of it somewhere else. If you
  improve a tool, commit it.
- **When the app changes, fix the check where the app is right.** `regress.mjs` reads the demo script's own times
  and the app's own names; a check that fails after a deliberate change is updated here, with the reason in the
  commit.
