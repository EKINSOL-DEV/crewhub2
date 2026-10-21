# `@crewhub/host`: the world's relay to crewhub-loops

A small Node program (Node 24, as the repository requires; no dependencies beyond Node itself) that stands between the browser and
crewhub-loops: integrator "Option A" of loops' `docs/integrators/identity-and-access.md`, section 3.5 of
[docs/LOOPS_INTEGRATION_PLAN.md](../../docs/LOOPS_INTEGRATION_PLAN.md). It holds the one agent key (an external
bot's, which could write: the host is what keeps it read-only), reads crewhub-loops with safe methods only (over
loopback TCP or over loops' Unix socket), and answers the browser under `/world-api` on `127.0.0.1`. What the real
crewhub-loops stream does and how the host follows it is in [docs/LOOPS_REAL_VS_FAKE.md](../../docs/LOOPS_REAL_VS_FAKE.md).

What it does (since the spec addendum "a smooth connection" it starts without loops and without a key: see "The
smooth connection" below):

- **Snapshot** `GET /world-api/snapshot`: one `LoopsSnapshot` (the seam's type in `packages/loops-client`),
  assembled by read-model.md "Loading a snapshot": the stream's position first, then projects, boards per active
  project, principals, agents, team, watchdog, and milestones and releases where the project has the feature on;
  then the archived projects from the event log (round 2) and, round 9, the open quiet stretches and the latest
  automation runs from the log ("The snapshot carries what only the log holds" below), handed over as `quiet` and
  `automationRuns`. Paged lists are followed to the last page. `groups` is `[]` until loops has project groups (L22). The reads run in
  parallel under a cap (`snapshotConcurrency`, default 6; `mapLimit` in `src/snapshot.ts` keeps the projects' order)
  and are timed and counted; health's `connection.snapshot` says how far the assembly is (`idle`, `reading` with
  the reads done and the project count once the list is in, `ready` with what it cost, `failed` with the reason), so
  the world can say "Reading 12 projects from crewhub-loops…" while the first snapshot loads. Health itself answers
  within a second even while the key check or the first stream attempt is still on its way (`HEALTH_WAIT_MS`): the
  page's 1.5 s probe never takes a slow loops for a missing host.
- **Stream** `GET /world-api/stream?cursor=N`: Server-Sent Events, `data: <json>` per message, `id: <seq>` on
  events. ONE upstream `GET /api/events/stream` is shared by every browser tab, and never more than one is open
  (a test counts); a ring buffer of the last 2000 envelopes catches a tab up from its cursor. Messages: `status`
  (`ok` / `down` / `unauthorized`), `event` (loops' envelope unchanged, unknown types included), `heartbeat` (loops'
  passed through as `{seq, ts}`, the host's own every 15 s while loops is down), `reset` with a reason (`gone`:
  loops answered 410 `cursor_expired`; `reconnected`: the log's tail went below the host's cursor, a restore or a
  fresh install; `cursor`: the tab asked for a cursor the buffer no longer covers). On a reset the client
  re-snapshots. Upstream the host follows loops' own rules (events.md, CL-378, CL-406): it reads
  `GET /api/events?from=tail` before every connection (an older loops without it gets the old filter trick), opens
  the stream with the sealed `cursor` loops gave while no event followed it and with `after=<seq>` otherwise, never
  both, and keeps the sealed cursor to itself.
- **Refetch routes** passed through with loops' status and body: `/world-api/tickets/{ref}`,
  `/tickets/{ref}/comments|progress`, `/projects/{slug}`, `/projects/{slug}/milestones|releases`, `/board/{slug}`,
  `/watchdog`, `/team`. Only `limit` and `cursor` of a query string are passed. `/world-api/project-groups`
  answers `{ "groups": [] }` locally.
- **Health** `GET /world-api/health`: `{ loops, keyName, sharedKey, loopsWebUrl, transport, paired, pairing, loopsCommit?, loopsCommitBefore?, cursor?, connection }`
  (`connection` is under "The smooth connection" below; `connection.key.recheckAt` says when a rejected key is re-checked (round 8: the host
  makes no stream retry with a refused key; it waits for a new key, a Forget or a discovery change and asks loops about the kept key
  every 5 min, one keyless health probe first and the key check only when loops answers, so a bot re-enabled in loops comes back by
  itself; at most one probe a minute); `loopsCommitBefore` is the version the host read first this
  run, present only when loops has answered another since: loops was updated under the running host, which logs the
  change once and reads everything again after the restart that came with it);
  `loopsWebUrl` is the origin of the loops URL, for the world's chat chip ("Chat: in the crewhub-loops app") and the card's ticket links; `transport` is `tcp`
  (the URL) or `unix` (the socket); `paired` is whether this request carries a valid pairing cookie; `pairing` is `on`
  or `off`. Health carries no data and needs no cookie.
- **Pairing** (plan 3.5, `src/pairing.ts`): every other `/world-api` route answers `401 {"error":"not_paired"}`
  unless the request carries the cookie `crewhub_world_pair` (`HttpOnly; SameSite=Strict; Path=/`, plus `Secure`
  when `CREWHUB_WORLD_PUBLIC_URL` is https). `GET /pair/<token>` sets it and answers `303 Location: /`; a used,
  expired or unknown token gets a plain HTML 403 page. See "Pairing" below.
- **Allow-list** in `src/allowList.ts`: the loops routes the host may read and the browser routes it answers,
  in one file. Every other path is 404, every method but GET is 405, and nothing reaches loops for either.
- **Host and Origin guard**: the `Host` header must be `127.0.0.1:<port>` or `localhost:<port>` (else 421), an
  `Origin` header when present must be the host's own or one from `CREWHUB_WORLD_ALLOWED_ORIGINS` (else 403).
- **Reconnect**: loops ends every stream after 300 s (and at a credential re-check or a stop); the host waits 1.5 to
  3 s with jitter and reconnects from its cursor, so nothing is lost and no tab hears of it. When loops goes away
  (a network error, a 5xx, a 200 that closed without a line) the host retries with backoff (1 s doubling to 30 s)
  and tells the tabs `status: down` and then `ok` (the chip says Loops down meanwhile). A 429 `too_many_streams`
  waits loops' `Retry-After` (5 s). A 401 or 403 from a loops whose health answers is `unauthorized` and ends the
  retries (round 8): the host drops the stream, waits for a new key, a Forget or a discovery change, and re-checks the
  kept key every 5 min (`recheckAt` in health).
- **Static files**: with `NODE_ENV=production` the host serves `apps/world/dist` with an SPA fallback to `index.html`.
- **The key** is read once from the key file, kept in memory, never logged, never in a response (a test greps every
  response for it; loops' error bodies pass through scrubbed of it).
- **Transport seam** (`src/transport.ts`): one `request(path, query, { accept, signal, timeoutMs })` that resolves with
  a web `Response` (status, headers, body stream). `tcp` is `fetch` against the loops URL; `unix` is `node:http` with
  `socketPath` and `Host: 127.0.0.1`. Both run the allow-list, send the same headers (the bearer key, an `Accept`, never
  an Origin), follow no redirect and honour the same signal and timeout, so `loops.ts` and the stream never know which
  one they read. The tests run the stub loops on a socket in a temp folder (`test/unixsock.test.ts`).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `CREWHUB_WORLD_LOOPS_URL` | none: the discovery | crewhub-loops' API over loopback TCP (the Mac app serves `127.0.0.1:8091`; so does the loops nginx under Docker Desktop, where the socket is not reachable). Unset, with no socket, the host finds the app itself (`src/discovery.ts`): `<data>/run/api.sock` when it exists and answers `GET /api/health`, else `http://127.0.0.1:<port>` from `<data>/settings.json` (default 8091), `<data>` being `CREWHUB_WORLD_LOOPS_APP_DATA` or `~/Library/Application Support/be.ekinsol.crewhub`, read only; nothing found: again every 5 s. Not together with `CREWHUB_WORLD_LOOPS_SOCKET`. |
| `CREWHUB_WORLD_LOOPS_APP_DATA` | the app's data folder | What the discovery reads. Tests inject a temp folder; the development instance is `~/crewhub-loops-dev` (`tools/loops-dev.sh` writes its `settings.json`). |
| `CREWHUB_WORLD_LOOPS_SOCKET` | none | Read loops over its Unix socket instead of TCP (the same allow-list, headers, stream and timeouts; `Host: 127.0.0.1`). The path must exist and be a socket when the host starts, else a clear error; `~/` is the home folder. **Explicit only: the host never guesses a socket outside the app's data folder.** `--loops-socket <path>` on the command line is the same and wins. Setting both the URL and the socket is a configuration error. See "The socket" below. |
| `CREWHUB_WORLD_LOOPS_WEB_URL` | the URL's origin, or the port found | Where the chat chip and the card's ticket links go (`health.loopsWebUrl`), as an origin. With a socket from the env the default is the app's `http://127.0.0.1:8091`; set it when the web app is elsewhere, e.g. `http://127.0.0.1:8291` for the development instance. |
| `CREWHUB_WORLD_KEY_FILE` | none | The agent key file, first in line. Unset: the stored key `<CREWHUB_WORLD_CONFIG_DIR>/loops-key` (what `POST /world-api/connect` saved), then the old default `~/.config/crewhub-loops/secrets/agent-crewhub-world.key`; none: the host starts without a key (`connection.key.state: "none"`) and waits for a paste. A configured file that cannot be read is an error. The builder-key fallback is gone. |
| `CREWHUB_WORLD_CONFIG_DIR` | `~/.config/crewhub-world` | The host's own folder for the stored key and the archive memory `archived.json` (0700; the files 0600). Tests and developers' runs point it elsewhere. |
| `CREWHUB_WORLD_PORT` | `5180` | The port on `127.0.0.1`. |
| `CREWHUB_WORLD_ALLOWED_ORIGINS` | none | Comma list of extra origins, e.g. the Vite dev server `http://localhost:5173`. |
| `CREWHUB_WORLD_PAIRING` | `on` | `off` removes the cookie gate: development only (the Vite proxy), logged loudly at start, refused with `NODE_ENV=production`. |
| `CREWHUB_WORLD_PAIRING_FILE` | none; `npm run world`: `<CREWHUB_WORLD_CONFIG_DIR>/pairing-secret` | Keeps the pairing secret across restarts (created with mode 0600). Without it the secret is per run and a restart invalidates every pairing (an open tab is left on Stale). `npm run world` keeps it in the host's own folder unless this names another file (`worldEnv` in `src/config.ts`). |
| `CREWHUB_WORLD_PUBLIC_URL` | none | The URL a browser reaches the host at behind a TLS proxy: `https` makes the cookie `Secure`; its host and origin pass the guard. |
| `NODE_ENV` | | `production` serves `apps/world/dist`. |

**The key is an external bot's.** The working setup at crewhub-loops `4cdcd383` is an **external bot** `crewhub-world`,
made by the owner in Settings > Agents, **not** read-only (the CL-313 reader key is tickets-only, a `probe` agent reads
nothing since CL-295, and the shared builder key reads tickets of its member projects only; the host refuses all three
with the reason, `src/keyCheck.ts`); the runbook is [docs/LOOPS_SETUP.md](../../docs/LOOPS_SETUP.md).

## The smooth connection

The host starts with neither loops nor a key and reports the honest states; the world shows one screen per state.

- **Discovery** (`src/discovery.ts`, pure, tested with an injected folder): the env's URL or socket is taken as given;
  else the app's socket, then its port from `settings.json`, each probed with `GET /api/health` (public, no key);
  else searching, again every 5 s. The web URL for the chat chip ("Chat: in the crewhub-loops app") follows what was found. Loops going away later
  (the stream reports down) makes the host look again.
- **The key** (`src/config.ts` `loadKey`): `CREWHUB_WORLD_KEY_FILE`, then the stored key, then the old default file;
  none: keyless. Every key is checked with `GET /api/auth/me` and one board read (`src/keyCheck.ts`): a probe key, a
  reader (read-only bot), the builder key and an unknown key are `rejected` with a reason in the loops web's words.
- **A rejected key is never confused with loops being down.** Only a definite 401 or 403 from a loops whose health
  answers (a keyless `GET /api/health` right after) makes a key `rejected`: in the check, on the tail read and on the
  stream alike (the 60 s credential re-check that ends a stream shows as a 401 on the next attempt). A timeout, a
  refused connection, a 5xx, an answer that is not loops' or a loops that is restarting is `down`, and the key keeps
  its state: `unchecked` (held, loops has not answered about it) or `ok` as before. A rejected stored key stays on
  disk with its reason (health `key.reason`) until a new one is pasted or `DELETE /world-api/connect` forgets it; the
  host never drops a key by itself. `test/keyStates.test.ts` runs every path against the stub.
- **The snapshot carries what only the log holds** (round 9, `src/snapshot.ts` `readLogFacts`): no read model
  carries a quiet stretch (`ticket.quiet`, CL-312) or an automation's run (`automation.ran`), so a tab opened after the
  quiet job spoke would show no dust and no card. The host reads `GET /api/events?types=ticket.quiet,automation.ran`
  from 20 000 seqs before the cursor, paged (at most 20 pages), bounded to the open tickets of the boards (planned, in
  progress, review); then the ticket and comment events from the oldest candidate quiet on, and drops a stretch a
  person or an agent touched since (a `system` row, an automation's own answer, does not count: loops'
  `people_activity` says the same, which is why the ticket's `updatedAt` cannot decide it). The facts go with the
  snapshot as the envelopes they are (`quiet`, `automationRuns`); the step line says "from the log 2 quiet, 3 runs";
  past the page cap no quiet is handed over (undecided is never shown), the runs read so far are.
- **The closed buildings are remembered** (`src/archiveStore.ts`): the slugs the event log or the stream taught go
  to `<configDir>/archived.json` (0600, written whole, only when the set changed), so a loops that will not read its
  log from the start (the fake after a restart answers 410) still shows them on the next start; every remembered
  slug is confirmed with `GET /api/projects/{slug}` before it counts, and a restored project leaves the file. Health
  says where the list came from: `connection.archived: { source: "list" | "log" | "remembered" | "none", count, at? }`
  (`slugs` for a paired browser).
- **`POST /world-api/connect`** `{"key": "chl_…"}` from a paired browser on an allowed origin, `application/json`, at
  most 4 KB: the key is checked against the loops found (403 `key_rejected` with `reason`; 503 `no_loops` or
  `loops_down`), stored by `src/keyStore.ts` (`<configDir>/loops-key`, 0700/0600, written whole) and the host switches
  to it: the old upstream stream is stopped first, the new one opened, every tab gets a `reset` and re-snapshots. One
  upstream stream per host process stays the rule. **`DELETE /world-api/connect`** forgets the stored key and goes
  keyless. Both are local routes on the allow-list; the loops allow-list stays GET only. The key is never logged,
  echoed or returned; `test/connect.test.ts` greps every response and log line.
- **Health** carries `connection: { discovery: { state, via?, target? }, key: { state, name?, source?, reason?, recheckAt? },
  stream: { state, reason?, cursor?, lastEventAt?, reconnects }, archived: { source, count, at?, slugs? },
  snapshot: { state, projects?, reads?, ms?, reason? } }` (the type in `packages/loops-client`, `HostConnection`;
  `key.state` is `none`, `unchecked`, `checking`, `rejected` or `ok`).
  `stream.state` is `busy` with the reason "stream budget exhausted (429): another host or tab uses this key" while
  loops refuses the stream with 429 `too_many_streams` (four per key; the host retries after `Retry-After`); the
  status message on `/world-api/stream` carries `stream: "busy"` and the reason too, next to the old `loops: "down"`.
  Before pairing only the states are there (no target paths, no names). `loops` keeps the old tri-state for the world
  from before: `down` while searching, `unauthorized` without a key or with a rejected one.
- **`npm run world`** (`main.ts world`): starts the host at once (production mode, pairing on), mints a link and opens
  the default browser on it (`--no-open` prints it), and builds the world meanwhile when `apps/world/dist` is missing
  or older than the sources: the browser shows "Building the world…" (a one-line page that asks the host every quarter
  second) and opens the world the moment the build is done. The freshness check (`src/build.ts`, pure and tested) walks the world's
  `src`, `index.html`, `vite.config.ts` and `package.json`, every package and the root lockfile (about 450 files in
  under 10 ms), compares the newest mtime with `dist/index.html` and, when the host built the dist itself, the file
  count and newest mtime it stamped in `dist/.crewhub-world-build.json` (a deleted or added source is a rebuild). The
  terminal gets a short step list with ticks and times and nothing else: the build check, the host listening, the
  browser, loops found, the key's verdict, the stream open at its seq, the first snapshot ("5 projects, 16 reads in
  33 ms, slowest /api/board/crewhub 16 ms") and "the world is up, 1.3 s after the host started (0.8 s after the key)",
  once, on the first paired browser that attaches (its snapshot, or its stream back at a cursor after a restart: "a
  paired browser is back at seq 531"); a person's later tab is a quiet "snapshot again (2)" line or nothing. `createHost`
  takes `onStep` for that list; without it (serve mode) the same facts are log lines as before. A second run finds the
  running host through the run file and only opens a new link. The pairing secret is kept in `<configDir>/pairing-secret`
  (0600, the folder 0700; `worldEnv` in `src/config.ts`), so a host restart keeps every paired browser: an open tab
  goes Stale for the restart and is Live again a few seconds later. `tools/timeworld.mjs` measures the whole road.
- **`npm run host -- doctor`** (`src/doctor.ts`): the same states in the terminal, one line per check, `ok` or the
  fix; exit 0 only when all pass. Read only, never the stream; tests run it against the stub.

## The socket

The Mac app (`Crewhub.app`) serves the same API on a Unix socket in its data folder:
`~/Library/Application Support/be.ekinsol.crewhub/run/api.sock`, or `$TMPDIR/chl-<uid>-<port>/api.sock` when that
path is over 100 bytes (macOS caps a socket path at 104). The socket is mode 0600, owned by the user who runs the
app: the host runs as that user, so the mode is no obstacle, and no other user on the machine can reach it. Use it
when you want nothing of the world's reads on a TCP port, or when the app's port is not loopback-only on your
machine. The host only uses a socket you name:

```sh
CREWHUB_WORLD_LOOPS_SOCKET="$HOME/Library/Application Support/be.ekinsol.crewhub/run/api.sock" npm run host:start
npm run host -- --loops-socket ~/crewhub-loops-dev/run/api.sock      # the development instance of tools/loops-dev.sh
curl -s http://127.0.0.1:5180/world-api/health                        # "transport":"unix"
```

The chat chip's link (and the card's ticket links) is `CREWHUB_WORLD_LOOPS_URL`'s origin (its default is the app's `http://127.0.0.1:8091`): a socket
has no origin a browser can open. When the web app is elsewhere, name it: `CREWHUB_WORLD_LOOPS_WEB_URL=http://127.0.0.1:8291`
for the development instance. Under Docker Desktop the socket is inside the VM and not reachable; use the URL.

## Commands

All from the repository root; the env of the table above applies to each.

| Command | What it does |
| --- | --- |
| `npm run world` | The morning: starts the host in production mode with pairing on, opens the default browser on a one-time pairing link, builds `apps/world/dist` beside it when it is missing or stale, prints the step list. `-- --no-open` prints the link instead. A second run finds the running host and only mints a new link. The pairing secret is kept in `<config dir>/pairing-secret`. |
| `npm run host -- doctor` | The preflight: one line per check (loops found, its health, the key file, what loops says about the key, the projects, agents and team reads, the event log, the remembered archive, the host's port, pairing), `ok` or the fix; exit 0 only when all pass. Reads only, never the stream. |
| `npm run host -- open` | Prints a one-time pairing link: asks a host already running on the port (a loopback-only `GET /pair-mint` guarded by a per-run mint secret in a 0600 run file), else starts one. `--origin <url>` mints the link on another origin (the Vite dev server, which proxies `/pair`). It prints and never opens a browser; the whole usage is `node apps/host/src/main.ts [--loops-socket <path>] [open [--origin <url>] \| world [--no-open] \| doctor]`. |
| `npm run host` | Serve mode for development: the data from the host, the world from Vite (`npm run dev`, opened with `?source=live`); the pairing secret is per run. `-- --loops-socket <path>` reads loops over that Unix socket. |
| `npm run host:start` | Production serve mode: builds the world, then serves `apps/world/dist` on `127.0.0.1:5180` with pairing on. `-- open` also prints the link. |

Against the fake crewhub-loops (`packages/loops-fake`), without any install:

```sh
npm run loops:fake -- --port 8391        # never 8091, the app's port; writes the key to tools/out/loops-fake.key and prints the next lines
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8391 CREWHUB_WORLD_PAIRING=off CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host
npm run dev                              # Vite proxies /world-api and /pair to 127.0.0.1:5180; open with ?source=live
```

Against the Mac app (the runbook is [docs/LOOPS_SETUP.md](../../docs/LOOPS_SETUP.md)): `npm run world`, then
`curl -s http://127.0.0.1:5180/world-api/health` to look at the states.

Tests: `node --test apps/host/test/*.test.ts` (part of `npm test`). They start a tiny loops stub on `127.0.0.1`
port 0 and talk to it over loopback only. The end-to-end test against `packages/loops-fake` is `test/e2e.test.ts`
(owned by the fake).

## Pairing

The host answers `/world-api` data routes only to a browser it has paired. The flow as a person sees it:

1. `npm run host -- open` (or `npm run host:start -- open`) prints `http://127.0.0.1:5180/pair/<token>`. When a
   host already runs on the port the command asks it for the link (a loopback-only `GET /pair-mint` guarded by a
   per-run mint secret in a 0600 run file in the user's temp folder, removed at exit); otherwise it starts the host
   and prints the link.
2. Opening the link once, within 10 minutes, sets the cookie and lands on `/`. The page never shows the link; the
   host never logs the token, the cookie or the secret (a test greps every response and log line).
3. A used or expired link gets "This link has expired or was already used. Run `npm run world` for a new one."
4. Until then the world (live mode) shows its "Pair this browser" page with the command (`npm run world`) and a "Use
   the demo" button; `health.paired` is what it checks. A tab that was live and gets 401 `not_paired` later (a host
   restarted without its secret) shows the same page with the chip word "Pair again" and comes back by itself once a
   new link is opened in that browser.

How it holds: the token is 32 random bytes (base64url); only its hash is kept, with its expiry, and redeeming
deletes it. The cookie is `<id>.<HMAC-SHA256(secret, id)>`, verified with a constant-time compare, so nothing about a
cookie is stored: the secret alone decides. `npm run host` and `npm run host:start` use a per-run secret, so a
restart asks for pairing again; `npm run world` keeps it in `<config dir>/pairing-secret` (0600), and
`CREWHUB_WORLD_PAIRING_FILE` names another file for any mode. The Host/Origin guard stays in front of everything,
pairing included.

Development: `CREWHUB_WORLD_PAIRING=off` drops the gate (loud warning at start; refused with `NODE_ENV=production`),
or pair through the Vite origin, which proxies `/pair`: `npm run host -- open --origin http://127.0.0.1:5173`.
Cookies ignore ports, so a browser paired on `127.0.0.1:5180` is paired on `127.0.0.1:5173` as well.

Programmatic: `createHost` takes `pairing?: "on" | "off"`, `pairingSecret?`, `publicUrl?`, `mintSecret?`, `now?`, `recheckMs?` (the rejected key's re-check, 5 min),
`retryMs?` (the error backoff) and `reconnectMs?` (the pause after a normal stream end; tests make both short),
and returns `mintPairLink(origin?)`. `createHostSource` (loops-client) takes `headers` for a Node caller's cookie;
the browser sends it same-origin. Tests: `test/pairing.test.ts`.
