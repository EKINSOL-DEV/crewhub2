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
| `--cpu-throttle <rate>` | `regress.mjs` only: the page's CPU slowed `rate` times through the browser's own throttle (`Emulation.setCPUThrottlingRate`), a slow machine on purpose. The timed checks (walk mode's steered walk in `rooms`) must hold at 16; the measurements never use it. |

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
| `regress.mjs` | The browser regression pass, in six groups (`--groups`, default all, connect first): `connect`, 21 checks of the connect flow in two halves, both behind your Vite (the stub host of `lib/connectStub.mjs` on `--host-port`, always: every Connect screen in order on one page, up to the town without a reload, the key in no DOM, storage or URL, Forget this key, the Connection panel, Pair this browser over an unpaired live tab and the town back by itself, the Stream busy chip; then, against the real development loops on 8291, a keyless host the tool starts itself: the one-time link to the Connect screen, a Read only bot's key refused with the words to untick Read only, a bogus key refused with the screen usable, the key pasted to Live with the real projects named and the key nowhere, a host restart with the kept pairing secret Live again without a re-pair, Forget back to Connect), the 8291 half skipped with one INFO line when that loops is down; `walk`, 36 checks along a visitor's walk through the demo (keyboard, text view, Details, timeline, chat, build mode, settings, the where form, reduced motion, themes, a phone); `demo`, 12 checks of the jump list (including the postman's card in the town), the scenario picker and the Studio scenario's Region level (district cards, beacon, pin, Escape chain); `live`, 7 checks of live mode against a fake crewhub-loops and a host the tool starts itself (the pairing page without a cookie, the one-time link, the Live chip, the sign-in link, Loops down, Live again); `rooms`, 12 checks of the three-room building behind `?rooms=three` (three room signs and a rack sign with its count, the arrow keys between the halls, the text view's racks and desks with a package on each, the lead's office beacon, a person carrying a package to the Done rack, the agent card on a figure at a desk, walk mode through the front door into Administration and, steered stop by stop through the door at administration cell (18, 0), on to the floor); `real`, up to 8 checks of live mode against the real development crewhub-loops on 8291 (the host's snapshot from the real loops, the Live chip, the real projects by name, a building's real tickets in the text view, the counts following a move, the host staying on loops, then a second host over loops' Unix socket: `transport: unix` and the same project count), skipped with one INFO line when that loops is down (the socket part alone when there is no socket). Two closing checks count page errors, console errors and requests that leave the page, so the five offline groups print `regress: 82/82` (the stub half of `connect` is offline: it opens only the page's own origin). Prints `regress: <passed>/<total>` last; exit code 0 only at full marks. Needs a dev server (some checks read `window.__town`). Times: `walk` about 120 s, `demo` about 30 s, `live` about 6 s, `connect` about 25 s (both halves), `rooms` about 35 s, `real` under 60 s; together about 275 s, so a check under the one-minute budget runs `--groups demo,live,connect`. | `<tag>-NN-<stop>.png`, `<tag>-results.json`, `<tag>.log` |
| `perf.mjs` | Frame time, work per frame, draw calls, triangles and heap per scenario (`demo-town`, `demo-inside`, `stress-town`, `stress-inside`, `phone-fast`, `startup`, and more: see its header). `--preview` for a production build, `--cast`, `--quality`, `--theme`, `--scenario`, `--stress`; `--source live` for live mode (below). | The table on stdout; `--json <file>` for every number |
| `memory.mjs` | Heap after GC, GPU geometries and textures, DOM nodes and listeners over a long 16x run (`demo`, with `--scenario`; `stress`; or `live`, below, 30 minutes by default), and the growth after warm-up. `--snapshots <min,...>` takes a heap snapshot at those minutes, sums it by constructor (`lib/heap.mjs`) and prints the largest kinds and, from the second on, what grew most since the one before. `--preview` measures a production build (live only: the host serves `apps/world/dist`). | Lines on stdout; `--json <file>` |
| `shots.mjs` | The world in screenshots: `--views` (`town`, `building`, `room`, `walk`, `stress`, `person`) x `--theme` x `--width`, in any `--scenario`. `walk` is the critical walk through every building and room. `person` is a frame sequence of a person carrying work into Done: the demo sought to `--seek` ms (3:20, just before the storyline's first move into Done), Enter on `--building`, then `--frames` shots `--every` ms at 1x, with a line per frame saying where the person is; `--zoom` zooms hall `--room` first and clicks the figure once it holds the package, for a shot of its plate. | `<tag>-<view>-<theme>-<width>.png` |
| `castshots.mjs` | The casting room (`/cast-preview`): every cast in every state, the scenes, dusk, reduced motion, Fast, far, the drone, and the side-by-side view. `--cast`, `--states`, `--only` narrow it. | `room-<cast>-<what>-<theme>.png` |
| `castworld.mjs` | The world as each cast draws it (the viewer's choice): town, building, room per theme and width, and the stress fixture with the dev overlay's numbers. | `<tag>-<cast>-<view>-<theme>-<width>.png` |
| `connectshots.mjs` | The Connect screens and the Connection panel (spec addendum "a smooth connection") in screenshots, per state x theme x width, against a **stub host** it starts itself (`lib/connectStub.mjs`: health in each state, `POST`/`DELETE /world-api/connect`, the town over a real host and the fake when connected or busy), plus a keyboard walk through the whole connection (Tab to the field, paste, Enter, the host checks, the town without a reload, the key in no DOM or storage, the panel, Escape, Forget this key, a bad key refused with the reason). `--stub-port` is the port the Vite proxy forwards to (`CREWHUB_WORLD_PORT`). `--real` runs the same against a real host behind the proxy (`--pair-link` from `npm run host -- open --origin <vite origin> --no-open`, `--key-file` for the connected step, `--readonly-key-file` for the `rejected-readonly` step, which exists only with `--real`; the keys are typed into the field and never printed). Prints `connectshots: <passed>/<total>` last. | `<tag><state>-<theme>-<width>.png` |
| `connectstub.mjs` | No browser: the stub host of `connectshots.mjs` on its own, to look at the screens by hand (`--port`, `--state`; `POST /__stub/state {"state": …}` switches it). Its states are the screens' (`no-loops`, `pair`, `connect`, `checking`, `rejected`, `loops-down`, `connected`, `busy`, `older`) and `unpaired`, a host that no longer knows the browser's pairing (401 `not_paired` to everything but health); a state change ends every stream it was proxying, so an open tab meets the new state at once. | nothing |
| `loops-seed.mjs` | No browser: replays a demo scenario's storyline (`packages/demo`) into the **development** crewhub-loops through its API, as an external bot (`--key-file`, or `CREWHUB_WORLD_KEY_FILE`; a lead agent's key, never a person's cookie), so the world shows real data that moves. `--url` (default `http://127.0.0.1:8291`; only this machine, never port 8091, 8000 or 9443), `--scenario <id>`, `--speed <n>` (16 = a minute a pass), `--once`, `--projects <n>`, `--dry-run` (reads, prints the plan, writes nothing), `--restart`, `--no-rewind`, `--agent-keys <dir>` (the demo agents' own keys, `agent-<id>.key`: an action is written as its demo author when that agent's key is there and loops confirms it, so the world shows the right author and the agent's `lastSeenAt` moves; the seed bot writes the rest). Idempotent: projects by slug (never created: the plan prints the admin's request), tickets by title, a stopped run resumes. Whatever a lead agent may not write (a move into Done, projects, labels, milestones, releases, lanes, the chat) is skipped with the loops rule that refuses it. Without `--once` it loops until Ctrl+C: press it once and the run stops after the current entry. Pure helpers in `lib/seed.ts`, tested by `scripts/test/loops-seed.test.ts`. | `loops-seed.state.json` (where it stopped), `loops-seed-person-only.json` (the Done moves a person must make) |
| `timeworld.mjs` | No Vite: runs the real `npm run world -- --no-open` with a port of its own (`--port`, the host's), stamps every line the host prints (the step list), opens the one-time link in a headless browser and watches until the town is drawn and dressed and the text view names every project of the host's snapshot. One line per step with the time since the command started, and the page's `world:snapshot`, `world:first-frame`, `world:walks` and `world:town-dressed` marks. `--cold` removes `apps/world/dist` first (the build is part of the run), `--runs <n>` repeats (warm after the first), `--fake <port> [--scenario studio]` starts a fake crewhub-loops and points the host at it, else the host finds the development loops in `--app-data` (default `~/crewhub-loops-dev`) with the key file of `--loops-env` (`LOOPS_DEV_KEY_FILE`); `--config-dir` is the host's own folder (default under `--out`). The host is stopped by its pid. | `<tag>-<run>-town.png`; `--json <file>` for every number |
| `liveshots.mjs` | The world in live mode (`?source=live`) against whatever host your Vite proxies to: the town, the connection chip, Settings > Source, the text view's connection line, and with `--card <agent>` the agent card of each named agent (the page, the card, and the card scrolled to its Lane section), its text on stdout. `--state` only names the files. | `<tag>-<state>-<view>-<theme>-<width>.png`, `<tag>-<state>-card-<agent>-...png`, `...-cardonly-...`, `...-cardlane-...` |

**Live mode (`perf.mjs --source live`, `memory.mjs live`).** The world against a crewhub-loops behind a host the tool
starts itself (`lib/live.mjs`): an in-process fake (`packages/loops-fake`, a free port; `--fake-scenario <id>`, default
`small-team`; `--fake-speed 0|1|4|16`, default 16: the fake's clock is the only playback) or the loops `--loops-url`
names with `--key-file <file>` (the fake started with `npm run loops:fake -- --port <port>`, or the development loops
on 8291 with your own key; loopback only, never 8091). In a dev run the host listens on `--host-port` (default 5180)
behind your Vite, so start Vite with `CREWHUB_WORLD_PORT=<host-port>`; with `--preview` the host serves
`apps/world/dist` (run `npm run build` first) on `--host-port` (`0`: a free port) and the browser opens the host
directly, so several production runs can go at once. Pairing stays on, as in production: every context opens a
one-time link first. The page gets `?source=live`; the demo's `--scenario`, `--stress` and the playback buttons do not
apply, and the stress scenarios are skipped. One host at a time against the development loops: it admits four
streams per key.

`lib/world.mjs` is what they share (the command line, the browser, the error and request watch, seeking and
playback); `lib/shots.mjs` is the view walker behind `shots.mjs` and `castworld.mjs`.

**What the page leaves for a script.** Besides the `world:town-dressed` mark the scripts wait for (and `world:snapshot`,
`world:first-frame`, `world:walks`: the first drawn frame, and the navigation graph and walkers landing after it), the
world records performance measures (`performance.getEntriesByName(name)`, each with a `detail`): `world:sync` (a model sync;
`created`, `deferred`), `world:shell-built` (a building's shell; `slug`, `pull`, `archived`), `world:dressing-built`
(the settlement dressing, wall time from its first step; `pieces`, `atOnce`), `world:dressing-step` (one frame's
share of a stepped rebuild) and `world:interior-built` (an interior; `slug`, `atOnce`, `detailed`). A long frame can
be laid beside them to see what it was.

**Walk mode in `regress.mjs`.** `walkTo` steers the visitor to a navigation cell with the arrow keys. The keys push on
screen and the follow camera stands at a 45 degree yaw when walk mode begins (Up alone is north-west, Up+Right is
north), so the wanted world direction is turned into screen axes with the yaw the page reports (`__town.visitor.yaw`),
and the keys are held in bursts bounded by the distance left (at most 100 ms), every key released before the position
is read again: an iteration's latency on a loaded machine cannot carry the visitor past a cell. A room is entered
through its door, so a walk into another room stops on the door cell first and then on the cell beyond it. Before this
(2026-10-21) the keys were taken for world axes and held across the read; under load the west correction overshot the
one-cell corridor to the floor's door and the visitor walked north in the column beside it, stuck against the wall
("walking on reaches the floor" failing with the visitor in the doorway).

**The live group of `regress.mjs`.** It starts its own fake (`packages/loops-fake`, a free port) and its own host
(`apps/host`), both on `127.0.0.1`, and closes them at the end. When `apps/world/dist` exists (after `npm run build`)
the host serves it on a free port and the browser opens the host directly. Otherwise the host listens on `--host-port`
(default 5180, the Vite proxy's default target) and the browser opens your Vite, so start that Vite with
`CREWHUB_WORLD_PORT=<host-port>`; the port must be free. The page is opened without `?source=live`: the source is
`auto`, the probe finds the host, and the health it answers is what the sign-in link follows.

**The connect group of `regress.mjs`.** Both halves sit behind your Vite, started with `CREWHUB_WORLD_PORT=<host-port>`:
first the stub host (`lib/connectStub.mjs`) and then a real, keyless host (`apps/host`) listen on `--host-port`, and
the browser opens your Vite. The group never looks at `apps/world/dist`: a build on disk sends the live group to the
host's own origin, never this one (the stub serves no files, and a one-time pairing link must land on the Vite origin
to pair the page that opens it). The real half reads the same `--loops-env` file as the real group (`LOOPS_DEV_URL`,
`LOOPS_DEV_KEY_FILE`, and `LOOPS_DEV_READONLY_KEY_FILE` for the Read only bot's key; without that line it tries the key
file's name with `-ro` before `.key`, and without a file it skips that one check with an INFO line), skips the half
with one INFO line when that loops does not answer, and gives its host what `npm run world` gives it: the discovery
through `--loops-app-data` (default `~/crewhub-loops-dev`, `tools/loops-dev.sh`'s folder, which must hold a
`settings.json`), a fresh config folder `<out>/<tag>-connect-config` for the stored key and the pairing secret
(`pairing-secret`, read again by the restarted host: that is what keeps the tab paired), removed at the end of the
group. The keys are read from their files, typed into the field and never printed, logged or kept in the results. The
browser's own console lines for the refused keys' 403 and the unpaired tab's 401 are expected and kept apart from the
closing checks. One host at a time against that loops (4 streams per key).

**The real group of `regress.mjs`.** It talks to the real development crewhub-loops (`tools/loops-dev.sh`, port
8291; never the Mac app on 8091). It reads `--loops-env` (default: the first `tools/out/loops-dev.env` that exists
in this worktree, in the main checkout found through `git rev-parse --git-common-dir`, or in
`~/Documents/GitHub/crewhub2-world-demo`), takes only `LOOPS_DEV_URL` (loopback) and `LOOPS_DEV_KEY_FILE` from
it (the admin lines are never read or printed), and when that loops does not answer `/api/health` it prints
`INFO real: skipped, 8291 is down` and counts nothing. Otherwise it starts its own host on `--host-port` with that
key (the key never reaches a log, a screenshot or the results), so start Vite with `CREWHUB_WORLD_PORT=<host-port>`,
and the browser opens your Vite. The count check needs a `ticket.moved` during its 15 s window: run
`tools/loops-seed.mjs` alongside, or move a ticket in the loops web; without one it prints an INFO line. Loops admits
4 streams per key: do not run it while another host of yours follows the same loops with the same key. After the
TCP host is closed, a second host reads the same loops over its Unix socket (`--loops-socket`, default
`~/crewhub-loops-dev/run/api.sock`, the development instance's; the host's `CREWHUB_WORLD_LOOPS_SOCKET`): its health
must say `transport: unix` and its snapshot must have the project count the TCP host had. Without a socket at that
path it prints `INFO real: socket check skipped` and counts nothing for that part.

Examples:

```sh
node tools/regress.mjs --port 5180
node tools/regress.mjs --port 5180 --groups demo,live --host-port 5181   # Vite started with CREWHUB_WORLD_PORT=5181
node tools/regress.mjs --port 5300 --groups connect,live,real --host-port 5200 --loops-env ~/my-loops.env   # the connect flow, then the fake, then the real dev loops; Vite started with CREWHUB_WORLD_PORT=5200
node tools/regress.mjs --port 5281 --groups real --host-port 5181        # the real dev loops; Vite started with CREWHUB_WORLD_PORT=5181
node tools/regress.mjs --port 5281 --groups real --host-port 5181 --loops-env ~/my-loops.env
node tools/regress.mjs --port 5281 --groups real --host-port 5181 --loops-socket ~/crewhub-loops-dev/run/api.sock
node tools/regress.mjs --port 5180 --groups rooms                        # the three-room building, ?rooms=three
node tools/perf.mjs --port 5180 stress-town stress-inside --cast potlings --json perf-potlings.json
node tools/memory.mjs --port 5180 stress --minutes 5
node tools/perf.mjs --port 5180 --source live --preview --fake-scenario studio --host-port 0   # production, the fake's studio at 16x
node tools/memory.mjs --port 5180 live --preview --minutes 30 --every 60 --snapshots 0,10,30 --host-port 0 --fake-scenario studio
node tools/memory.mjs --port 5180 live --preview --minutes 10 --host-port 0 --loops-url http://127.0.0.1:8291 --key-file ~/crewhub-loops-dev/agent-crewhub-world-<name>.key
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
