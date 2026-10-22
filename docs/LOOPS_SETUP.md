# CrewHub World on the Mac crewhub-loops: the setup runbook

For Nicky, with `Crewhub.app` on this Mac. The short road is the first section; everything after it is reference.
Written against crewhub-loops `4cdcd383` (`origin/main`, 2026-10-20) and the world's rounds of 2026-10-21
([integration plan](LOOPS_INTEGRATION_PLAN.md) section 10, the addenda "live on the Mac crewhub-loops" and "a smooth
connection" of [the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md)). The loops facts below are
from the loops code at that commit (`loops:docs/external-bot.md`, `loops:apps/desktop/README.md`,
`loops:.../auth/probe.py`, `loops:.../auth/builder.py`, `loops:.../api/stream.py`) and from its web app's own words
(`loops:apps/web/src/i18n/en/agents.ts`); the world's commands are this repository's. Section 7 is for developers: it
describes a private crewhub-loops next to the app, never the app.

## The morning: `npm run world`, paste the key, done

With `Crewhub.app` open (it serves `127.0.0.1:8091` and a Unix socket in its data folder; the world finds both by
itself, read only) and a terminal in this repository:

1. `npm ci` once, then **`npm run world`**. It starts the host on `127.0.0.1:5180` (`CREWHUB_WORLD_PORT` picks
   another) with pairing on, opens your browser on a one-time pairing link, and builds the world meanwhile when the
   build is missing or older than the sources (the browser says "Building the world…" and opens it when the build is
   done). The terminal shows the steps as they complete, with ticks and times: loops found, the key, the stream, the
   first snapshot, "the world is up". Run it again later: it finds the running host and only opens a new link.
2. The world shows **Connect**: it has found crewhub-loops and has no key yet. In the app, signed in as the owner:
   **Settings > Agents > Connect CrewHub World** (a crewhub-loops with `world/viewer-key`). The card makes the bot
   `crewhub-world` as a viewer and shows its **Access key** once: press the copy button beside it, then close. (The
   browser asks you to sign in as the owner first when it has no session; the app's own window is signed in already and
   works as well.) On an older crewhub-loops without that card: **Settings > Agents > New external bot**, **Name**
   `crewhub-world`, **Read only** unticked, no project ticked under **Member of these projects**, **Make the bot and its
   access key**, copy the key from "The access key of crewhub-world" before closing; that key reads the same, and the
   world shows no chat bubbles with it (section 3).
3. Paste it in the world's Connect screen. The host checks it with crewhub-loops, stores it in
   `~/.config/crewhub-world/loops-key` (folder 0700, file 0600, never logged), and connects: the chip says **Live**
   and your projects stand as buildings. From then on `npm run world` is the whole morning: it keeps its pairing
   secret in `~/.config/crewhub-world/pairing-secret`, so a browser paired yesterday is paired after a host restart
   too (rehearsed on 2026-10-21: clone to the town in under two minutes, the paste to the Live chip in one second).

If a step was missed, **`npm run host -- doctor`** says which, one line per check (loops found, its health, the key
file, what loops says about the key, the projects, agents and team reads, the event log, the remembered archive
(how many closed projects and from which loops), the host's port, pairing),
`ok` or the fix. It reads only and never opens the stream. The table in section 5 says what each chip means. The
scripted road (a key file and an explicit URL or socket in the environment) is section 2; everything there keeps working.

**Another crewhub-loops** (not the Mac app, for example a development instance on another port): name it, and the key
file if you have one, in front of the same command:
`CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8291 CREWHUB_WORLD_KEY_FILE=~/path/to/the.key npm run world`. Without the key
file the Connect screen asks for the key as above. Section 2 has the whole table.

**The shape.** The browser never talks to crewhub-loops. It talks to the world's own relay, `apps/host`, which holds
one agent key, keeps one event stream open and serves `/world-api` on loopback. The host never writes to crewhub-loops;
its only writes are in its own folder: the stored key, the pairing secret, the archive memory and the live town's
database `world.db` (section 2).

```text
Crewhub.app :8091  --bearer key-->  apps/host :5180 (127.0.0.1)  --/world-api-->  browser
(the Mac app)                       one stream, an allow-list of GETs           snapshot, then events by seq
  or its socket                     found by itself; the key pasted once        Connect screen until then
```

## 0. Before the app: run the world against the fake

You do not need crewhub-loops to see live mode. `packages/loops-fake` is an in-process crewhub-loops that speaks
the routes the host reads, with bearer auth, `seq` and heartbeats, and plays the demo storyline in real time. Three
terminals:

```sh
npm run loops:fake -- --port 8391          # writes its key to tools/out/loops-fake.key (0600); prints how to start the host
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8391 CREWHUB_WORLD_PAIRING=off CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host
npm run dev                                 # then open http://127.0.0.1:5173/?source=live
```

Never put the fake on 8091: that port is the app's, and the host's discovery would take the fake for the app. `CREWHUB_WORLD_PAIRING=off` skips the
pairing cookie for development (the host says so loudly at start; production refuses it). The fake prints the two
env lines for the host and never the key. `npm run loops:fake -- --builder-key` makes the key behave like loops'
tickets-only keys (the builder key and the CL-313 reader key: tickets, comments, auth/me; everything else 403), so
the host shows Unauthorized. `--scenario fresh|one|small-team|studio` picks the demo scenario and `--speed 0|1|4|16`
the pace. The switch to the app later changes only the key file (section 3).

## 1. What crewhub-loops must have

### 1.1 The app is the engine: nothing to install

`Crewhub.app` is a Tauri shell around one frozen Python sidecar that is the whole API, with the web app built in.
Open it. It serves `http://127.0.0.1:8091` (the port is in `settings.json` of its data folder, default 8091; the
app offers another port when 8091 is taken and never changes it silently) and a Unix socket
`~/Library/Application Support/be.ekinsol.crewhub/run/api.sock`. No Docker, no compose files, no `mac.env`.
The first account is made in the app's own setup page: the app hands the setup code to the page itself.

Check, from a terminal:

```sh
curl -s http://127.0.0.1:8091/api/health
```

`{"ok":true,...}` is the liveness read; the host's own health read (section 4) reports it as `loops: "ok"`.

### 1.2 The credential: an external bot `crewhub-world`, not read-only

The world reads as an agent. At `4cdcd383` the only key that may read projects, boards, the team, agents, tickets
**and** the event stream, without a lane and without a pane, is an **external bot** (CL-314). The two read-only
keys loops has cannot be used: the CL-313 "Read only" box makes a reader key that reads the tickets, comments and
rules of its member projects and nothing else (`/api/projects`, `/api/board`, `/api/team`, `/api/agents` and
`/api/events` are refused at boot for it, `READER_NEVER_PREFIXES` in `loops:.../auth/builder.py`); and a `probe`
agent other than `team-probe` and `lane-watch` reads nothing at all since CL-295 (`loops:.../auth/probe.py`). The
old runbook's "agent `crewhub-world`, role `probe`" is dead: such a key gets 403 on every read.

In the app, signed in as the owner:

1. **Settings > Agents > New external bot.** Name `crewhub-world` (lower-case, cannot be changed).
2. **Member of these projects:** tick **none**. Reads are not project-scoped (any agent key lists every project and
   reads every board: `loops:docs/external-bot.md`, "What membership does and does not do"); membership only
   decides what is *delivered* to the bot, and the host never acknowledges a delivery, so a member bot would pile up
   unacknowledged deliveries that show as a counter on its card after a day.
3. **Leave "Read only" unticked.** A read-only bot is tickets-only (above) and the world would show Unauthorized.
4. **Make the bot and its access key.** The key (`chl_` + 43 characters) is made in the app's window and shown
   **once**, with a copy button; only its digest reaches the server, which can never show it again. Press the copy
   button, then in a terminal, before copying anything else:

   ```sh
   mkdir -p -m 700 ~/.config/crewhub-loops/secrets
   umask 077 && pbpaste > ~/.config/crewhub-loops/secrets/agent-crewhub-world.key
   chmod 400 ~/.config/crewhub-loops/secrets/agent-crewhub-world.key
   wc -c ~/.config/crewhub-loops/secrets/agent-crewhub-world.key      # 47 (a newline more is fine; the host trims)
   ```

   That file is the scripted road (the old default; the host still reads it, third in line after
   `CREWHUB_WORLD_KEY_FILE` and its own stored key). The simpler road is the Connect screen of the first section:
   paste the key there and the host stores it in `~/.config/crewhub-world/loops-key` itself. The folders
   `~/.config/crewhub-world` and `~/.config/crewhub-loops/secrets` are the world's, not the app's: the app keeps its
   own keys in its data folder and never reads or writes them (`loops:apps/desktop/README.md`, "secrets").

   Lost the key? The agent's page has **New key**; the old one keeps working until it is revoked under **API keys**.

**Say it plainly: this key can write.** An external bot that is not read-only is an ordinary `lead` agent key: it
could create and move tickets, comment and write progress in any project (not move to Done, not create projects).
What keeps the world read-only is the host: it holds the key on `127.0.0.1`, forwards an allow-list of `GET` paths
only (`apps/host/src/allowList.ts`; every other method is 405 and never reaches loops; a test sends them), and the
key is never in a response, a log or the bundle. Never paste the key into a browser page or a shared file. A viewer
key that cannot write is proposal L1 for crewhub-loops ([gap analysis](LOOPS_GAP_ANALYSIS.md), section 6.1), worked
out on the loops branch `world/viewer-key` and packaged for `cl-lead` in `docs/proposals/crewhub-world-viewer.md`
there (round 7); until it lands this is the credential.

**The viewer key** (decision 1 of 21 October; built on `task/r19-viewer-switch` in round 19 and on this branch since
round 28; crewhub-loops main carries the viewer key since #959). The switch is a new key file or a new paste, nothing else:
`CREWHUB_WORLD_KEY_FILE` names the viewer bot's key, or its key is pasted in the Connect screen (the loops card "Connect
CrewHub World" makes the bot and shows the key once); the bot's name stays `crewhub-world` (decision 6). That key reads
what the world needs and writes nothing (loops refuses the rest before the route runs), the Connection panel's Key row
says so (the host sees `viewer: true` on its own entry in `GET /api/agents` at the key check; no extra call), and the
chat's bubbles need no sign-in (`connection.session` says `key`). The key reads only the chat of the person who made it
(`agent_keys.made_by`, #964): that person's messages and the agents' answers to them, so the bubbles are theirs; a key
with no maker reads no chat, and an empty thread list is no error. On a crewhub-loops without the viewer key (an older
loops, today's Mac app) the world reads the same with a plain external bot's key and shows no bubbles over the key; the
page may still read your own chat itself where that crewhub-loops has the world's origin set (round 28, road 2:
`CHL_WORLD_ORIGIN=<the page's origin>`, e.g. `http://127.0.0.1:5180`, and you signed in to loops in this browser), else
the Connection panel's Chat section, the Chat panel and the text view say "this crewhub-loops does not let the world's
key read the chat" and name both ways, the origin's exact value included. The sign-in road that stood in for the viewer
key (rounds 12 to 18) is gone since round 28.

**The bot is the observer, not a worker.** Loops lists `crewhub-world` among the agents (an external bot in no
project), but the world never shows the host's own principal as a figure: the host names it on the snapshot
(`observer`, the id loops answered to `GET /api/auth/me`), the model leaves it out of the figures and the agent
counts, and the text view and the Source panel say "`crewhub-world` (this world's key) is not shown". Other external
bots are real bots elsewhere and stay in the town hall.

### 1.3 Something to look at

The world shows one building per project. The app's first project is the Inbox; until a project of yours exists,
live mode shows that one building and a Live chip. That is correct.

## 2. The world's environment

The host reads these; every one has a default that matches the app.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CREWHUB_WORLD_LOOPS_URL` | none: found | Where crewhub-loops answers, over loopback TCP. Unset (and no socket), the host finds the app by itself: the socket `<data>/run/api.sock` when it exists and answers `GET /api/health`, else `http://127.0.0.1:<port>` with the port from `<data>/settings.json` (default 8091), where `<data>` is the app's data folder `~/Library/Application Support/be.ekinsol.crewhub` (read only, never written). Nothing found: it looks again every 5 s, so opening the app later needs no restart. Set it only for another install. |
| `CREWHUB_WORLD_LOOPS_APP_DATA` | the app's data folder | The folder the discovery reads (`settings.json`, `run/api.sock`). For tests and the development instance (`~/crewhub-loops-dev`, section 7); never point it anywhere the host should not read. |
| `CREWHUB_WORLD_LOOPS_SOCKET` | none | The path of the app's Unix socket (`~/Library/Application Support/be.ekinsol.crewhub/run/api.sock`; `~/` is the home folder): the host then reads loops over the socket instead of TCP (`node:http` with `socketPath`, Host `127.0.0.1`), same allow-list, same stream, same timeouts. Explicit only; the path must exist and be a socket when the host starts (so open the app first), else a clear error; set together with `CREWHUB_WORLD_LOOPS_URL` it is a configuration error. `--loops-socket <path>` on the command line is the same. The health read says `transport: "unix"` or `"tcp"`. |
| `CREWHUB_WORLD_LOOPS_WEB_URL` | the URL's origin, or the port found | Where the Chat panel's frame and its "Open in the crewhub-loops app" link, and the card's ticket links, go (`loopsWebUrl`). A socket has no origin: with `CREWHUB_WORLD_LOOPS_SOCKET` the default is `http://127.0.0.1:8091`; the development instance names `http://127.0.0.1:8291`. |
| `CREWHUB_WORLD_KEY_FILE` | none | The key the host sends as `Authorization: Bearer`, read once, never logged, never in a response or the bundle (a test checks). Unset, the host reads its own stored key `~/.config/crewhub-world/loops-key` (what the Connect screen saved), then the old default `~/.config/crewhub-loops/secrets/agent-crewhub-world.key`; none of them: the host starts without a key and the world shows Connect. A configured file that cannot be read is an error, never a fallback. There is no builder-key fallback any more. |
| `CREWHUB_WORLD_CONFIG_DIR` | `~/.config/crewhub-world` | The host's own folder: the stored key, `archived.json`, the session and the world database `world.db` live here (folder 0700, files 0600). Tests and developers point it elsewhere. |
| `CREWHUB_WORLD_PORT` | `5180` | The host's own port, bound to `127.0.0.1` only. |
| `CREWHUB_WORLD_ALLOWED_ORIGINS` | none | A comma list of extra browser origins the host accepts besides `http://127.0.0.1:<port>` and `http://localhost:<port>`. Not needed for `npm run dev` of the same checkout: the dev server tells the host its origin itself (section 7); for an older dev server or another tool's page, for example `http://127.0.0.1:5173`. |
| `CREWHUB_WORLD_PAIRING` | `on` | `off` drops the pairing cookie gate: development only, logged loudly at start, refused with `NODE_ENV=production`. |
| `CREWHUB_WORLD_PAIRING_FILE` | none; `npm run world`: `~/.config/crewhub-world/pairing-secret` | A file (created, mode 0600) that keeps the pairing secret across host restarts, so paired browsers stay paired. Without it the secret is per run: a restart means pairing again (an open tab is left on Stale). `npm run world` keeps it in the host's own folder unless this names another file. |
| `CREWHUB_WORLD_PUBLIC_URL` | none | The URL a browser reaches the host at when a TLS proxy stands in front; `https` makes the cookie `Secure`, and that origin passes the Host/Origin guard. |

The Vite dev server proxies `/world-api` and `/pair` to `http://127.0.0.1:${CREWHUB_WORLD_PORT ?? 5180}` with
`changeOrigin`, so the Host header the host checks is its own.

## 3. Run the world in live mode

With the app open:

```sh
npm run world                                         # builds when needed, serves apps/world/dist with pairing on, opens the browser on the link
npm run world -- --no-open                            # the same, prints the link instead
npm run host:start                                    # builds, then serves apps/world/dist; open http://127.0.0.1:5180/ (pair: see below)
```

Without a key the world shows Connect (first section); with one (a file, or stored from a paste) it connects at once.

`host:start` is production: pairing on, the bundle served by the host, TCP to `127.0.0.1:8091` by default. For
development, Vite serves the world and the host serves the data:

```sh
npm run host                                          # the relay; reads the env of section 2
npm run dev                                           # Vite; open http://127.0.0.1:5173/?source=live
```

Over the app's socket instead of TCP (section 2; the app must be open, the socket exists only while it runs):

```sh
CREWHUB_WORLD_LOOPS_SOCKET="$HOME/Library/Application Support/be.ekinsol.crewhub/run/api.sock" npm run host:start
curl -s http://127.0.0.1:5180/world-api/health                        # "transport":"unix"
```

### Pair this browser

The host answers `/world-api` only to a browser it has paired (plan 3.5): without the cookie every data route is
`401 {"error":"not_paired"}`, only `/world-api/health` stays open, and the world shows a "Pair this browser" page
instead of the town. Pairing is one command and one click:

```sh
npm run host:start -- open                            # a running host on the port, or starts one; prints a one-time link
npm run host -- open                                  # the same in development
```

The link is `http://127.0.0.1:5180/pair/<token>`, good for 10 minutes and once. Opening it sets an `HttpOnly`,
`SameSite=Strict` cookie for `127.0.0.1` and lands on `/`; the page never shows the link itself, and the host never
logs the token or the cookie. A used or expired link gets a plain "This link has expired or was already used" page:
run the command again. Each browser (and each profile) pairs once. The cookie is signed with a per-run secret, so a
host restart asks for pairing again unless `CREWHUB_WORLD_PAIRING_FILE` keeps the secret (section 2); `npm run world`
keeps it by default.

In development the world runs on the Vite origin, and cookies ignore ports: a browser paired on `127.0.0.1:5180` is
paired on `127.0.0.1:5173` too. Either open the link as printed, or ask for one on the Vite origin, which proxies
`/pair` to the host: `npm run host -- open --origin http://127.0.0.1:5173`. Or skip pairing in development:
`CREWHUB_WORLD_PAIRING=off npm run host`.

The source setting is `auto` by default: Live when a host answers `/world-api/health` within 1.5 s, else Demo.
`?source=live` or `?source=demo` overrides it; Settings > Source shows the choice, the host URL and why the source was
chosen, and changing it reloads the page (the source is decided once, before the world starts). In live mode the
Demo chip, the scenario picker and the playback bar are hidden, the chat corner is one chip, "Chat", which opens the
Chat panel: crewhub-loops' own chat, framed in the world (round 12; also "Chat with <name>" on a lead's card: loops
chats with leads only, so a worker's card says so and offers its lead's chat instead). The
frame carries your own loops session (sign in to loops in this browser as a person, with chat bubbles switched on in
loops); signed out, loops' own sign-in shows in the frame, and the world never sees a password or a session. The
panel opened from a card asks loops for that agent's chat (`?chat=<agent id>`, a loops of world/viewer-key cb163004
or later; an older loops ignores it, so the panel also says which chat head to open) and always links to the app, the
fallback for a frame that never loads. The connection chip sits where the Demo chip was. The text view says where chat lives.

Zones: every live project sits in the default zone until crewhub-loops has project groups (L22); zones drawn by
hand in build mode are part of the live town document of this installation, which the world's host keeps since round
20 in `~/.config/crewhub-world/world.db` (one row per crewhub-loops web app the host names) and every paired browser
shares; the browser keeps a copy under its own key (IndexedDB) and edits on it while the host is away, then offers it
again. The Connection panel's "Town" and "Zones" lines and the text view say where the town is kept. Since round 21 the
undo history is the host's too (an undo in one browser shows in every other and survives a restart), and Settings > Town
restores a town from a file or from a `world.db.bak-v<n>` copy only after a preview of what changes and a confirm; the
restore is a new revision, so Undo goes back. A live town made before the key carried the
installation (under the plain `crewhub-world.live`) is copied once into the installation's key the first time that
key holds nothing; the earlier copy is kept as it was, a town already under the new key is never overwritten, a demo
page never copies, and Settings > Town and the text view say "Copied once from the town kept under the earlier key" that
once.

## 4. The health read

```sh
curl -s http://127.0.0.1:5180/world-api/health
```

What it answered on 2026-10-21 against the development instance (section 7), with pairing off and a developer's
track key (yours says `crewhub-world`):

```json
{"loops":"ok","keyName":"crewhub-world-setupdocs","sharedKey":false,"loopsWebUrl":"http://127.0.0.1:8291","paired":true,"pairing":"off","loopsCommit":"0.1.0","cursor":13}
```

Since the smooth connection the answer also carries `connection`:

```json
"connection":{"discovery":{"state":"found","via":"app-socket","target":"~/Library/Application Support/be.ekinsol.crewhub/run/api.sock"},
              "key":{"state":"ok","name":"crewhub-world","source":"stored"},
              "stream":{"state":"ok","cursor":257,"lastEventAt":"2026-10-21T01:02:03.000Z","reconnects":0},
              "snapshot":{"state":"ready","projects":5,"reads":18,"ms":27},
              "archived":{"source":"log","count":1,"at":"2026-10-21T01:02:00.000Z","slugs":["ops-tooling"]}}
```

`discovery.state` is `found` or `searching` (`via`: `env-url`, `env-socket`, `app-socket`, `app-port`); `key.state` is
`none` (the Connect screen), `unchecked` (the host holds a key but loops has not answered about it: down, restarting,
a timeout), `checking`, `rejected` (with `reason`, in words to act on, and `recheckAt`: when the host asks loops about the
kept key again, every 5 min, a keyless health probe first) or `ok` (`source`: `env`, `stored`, `default`);
`stream.state` is `idle`, `ok`, `down`, `unauthorized` or `busy` (loops' 429, with the reason); `snapshot.state` is
`idle`, `reading` (the reads so far, the project count once the list is in), `ready` (projects, reads, ms) or `failed`
(the reason): what the page's first-snapshot line shows. Health answers within a second even while the key check is
under way. Only a definite 401 or 403 from a loops whose health answers makes a key `rejected`; a rejected stored key
is kept with its reason until you paste another or press **Forget this key** (on the rejected screen or in the
Connection panel). `archived` says where the closed buildings came from: `list` (loops listed them, an admin key),
`log` (loops' event log, read in this run), `remembered` (the host's own file `~/.config/crewhub-world/archived.json`
from an earlier run, for a loops that will not read its log from the start; each slug confirmed with loops before it
counts) or `none`. An unpaired browser gets the states only: no target, no name, no cursor, no slugs.
`npm run host -- doctor` prints the same in the terminal. `connection.session` says the host's half of the chat's road:
`{ "state": "key" }` when this crewhub-loops lets the world's key read the chat (a viewer key, which reads only the chat
of the person who made it), so that person's agents' answers come as speech bubbles over the key's own stream with no
session anywhere; absent when it does not (an older loops, a plain external bot's key): no bubbles over the key. The
page's own road (round 28, road 2) is not in health: the page probes it itself where that crewhub-loops has
`CHL_WORLD_ORIGIN` set to the page's origin, and the Connection panel's Chat section says which road is on or, with
neither, how to make a viewer key (Settings > Agents > Connect CrewHub World) and the exact origin setting. The sign-in
road of rounds 12 to 18 (the host signed in as you and kept your session in `<config>/loops-session` for chat reads; the
states `signed-out`, `signed-in` and `expired`; the Connection panel's form and "Forget the session") was removed in
round 19 on `task/r19-viewer-switch` and is gone from this branch since round 28 (decision 9; cl-lead's review finding
F8): a leftover `loops-session` file is deleted on start with one log line, and `/world-api/session` is gone.

**Road 2 (round 28): the page reads the chat itself.** crewhub-loops main (#968, CL-494 step 4) lets ONE loopback
origin read the signed-in person's own conversation from the browser: the owner sets `CHL_WORLD_ORIGIN` on loops to
the world page's exact origin (`http://127.0.0.1:<the world's port>`; empty by default, so nothing changes until it
is set), and loops then answers `GET` on four routes from that origin with the person's own session cookie:
`/api/dm/threads`, `/api/dm/threads/{agent}/messages`, `/api/dm/messages/{id}` and `/api/events` (a poll; the
types forced to `dm.created,dm.answered`, `limit` at most 50; no stream). The page (`apps/world/src/state/pageChat.ts`,
`packages/loops-client/src/pageChat.ts`) asks exactly that: `fetch(url, { method: "GET", credentials: "include" })`
and nothing else in the request (no header of its own, not even a content type, so every call is a simple request and
the browser sends no pre-flight; loops offers none), never a key, at the loops web origin the host names in its health
(`loopsWebUrl`: the API is on that same origin). The first events ask is `from=tail` (nothing from before the page
opened), then the sealed cursor loops hands back; every agent message named by a `dm.created` is read by id and shown as
the same bubble, chat mark, Recent answers row and card line as on the host's road; the threads are read again after a
`dm.*` event for the card. The poll runs every 5 s while the page shows, once a minute hidden, doubling to a minute
after a failure, not at all offline (the `online` event asks again). **Which road**: `key` when the host's key reads the
chat (health `connection.session.state === "key"`), else `page` when the page's own probe (one `GET /api/dm/threads`
with credentials) answers 200, else `none`. The probe's verdict stands in the Connection panel under Chat and behind
the Chat panel's "About this chat": *on*; *signed out* (loops answered through the origin with a 401: sign in to loops
in this browser, the Chat panel's frame will do, and the road comes on by itself within 30 s); *the origin is not set*
(the browser hides a refused origin as one opaque failure, the same as a server that is not there, so the page asks the
same route once more in `no-cors` mode: an opaque answer proves something answers, and the words then carry the exact
value to set, `CHL_WORLD_ORIGIN=<this page's origin>`; a loops from before the setting lands here too); *unreachable*
(nothing answered). Nothing of this road goes through the host, and the page keeps nothing. The proof against the
development loops 8293: `node tools/road2proof.mjs` (tools/README.md).

`loops` is `ok`, `down` or `unauthorized` (a loops 401 or 403; also no key yet, for the world from before);
`transport` is `tcp` or `unix`; `keyName` is the key's agent name (from the file name `agent-<name>.key`, or the
principal loops answered; empty without a key); `sharedKey` is always `false` now; `loopsCommit` is what
loops' own health read calls its `version` (the app says `0.1.0`, not a commit), and `loopsCommitBefore` the version
the host read first this run, only when loops has answered another since (loops updated under the running host: the
Connection panel says "crewhub-loops version 0.2.0; it was 0.1.0 when this host started", the host logs the change
once, and the restart that came with the update re-snapshots the world as any Loops down does); `cursor` is the last `seq` the host
holds: at start the host asks `GET /api/events?from=tail` for "now" (the newest `seq` this key may see, and a sealed
opaque `cursor` token), opens the stream with that token, and afterwards sends back the sealed `cursor` of the last
heartbeat or `after=<seq>` of the last event, never both; a key sees gaps in `seq` (loops filters events per
principal), which is normal and not a reset; `loopsWebUrl` is the origin of the loops URL, where the chat chip and the card's ticket links point (the app's web and
its API share 8091). The key itself is never in the answer. A request with a foreign Host header gets 421 and one
with a foreign Origin 403: the guard against other sites and DNS rebinding. `paired` says whether the request's
cookie is a valid pairing (`curl` has none, so `false` with pairing on); `pairing` is `on` or `off`.

## 5. The chip or the screen says X, do Y

| The chip or the screen says | What it means | Do |
| --- | --- | --- |
| **Live** | The snapshot is loaded and events arrive; a heartbeat came in the last 40 s. | Nothing. A ticket move in the app (or `crewhub ticket move <KEY> in_progress` from the app's own CLI) changes the building's counts within 2 s. |
| **Connecting** | The browser has not yet reached the host, or the host has not yet answered its first `status`. | Wait a few seconds. Longer: is the host running (`npm run host:start`)? Does `curl http://127.0.0.1:5180/world-api/health` answer? In dev, is the Vite proxy pointing at the host's port (`CREWHUB_WORLD_PORT`)? |
| **Catching up** | The host sent `reset`: loops answered 410 `cursor_expired` (a sealed cursor that no longer opens, for example after a restored backup), the log's tail went backwards (a restored database), the tab asked for a cursor the host's buffer no longer covers, or loops came back after Loops down or Unauthorized; the browser loads a new snapshot and replays from it. A gap in `seq` is normal (loops filters events per key) and is not a reason. | Nothing. It clears by itself within a few seconds. If it repeats every minute, the host is reconnecting over and over: read its log. |
| **Stale** | No event and no heartbeat for 40 s. Loops sends a heartbeat every 15 s and ends every stream after 300 s (the host reopens it); three heartbeats were missed. The scene is the last known state. Since round 27 the browser heals this itself: at Stale it ends the silent read and reopens the stream at its cursor (the host replays its buffer or sends `reset`), and again at once when the tab comes back into view; a Stale that stays is a host that does not answer the new ask. | Check loops: `curl -s http://127.0.0.1:8091/api/health`. If it answers, the host's stream is wedged: restart the host; the browser recovers without a reload. If it does not, see "Loops down". |
| **Pair again** | The host answered 401 `not_paired` to the snapshot or the stream after the town was up: a host restarted without its pairing secret (a plain `npm run host`; `npm run world` keeps the secret), or the cookie is gone. The world shows the **Pair this browser** screen instead of the town and asks the host every couple of seconds. | `npm run world` (a new one-time link in your default browser; `-- --no-open` prints it). The moment the link is opened the town comes back by itself, from a fresh snapshot. |
| **Loops down** | The host cannot reach crewhub-loops (`loops: "down"`): a refused connection, a timeout, a 5xx or a restart. The host retries with backoff and re-snapshots when loops is back; the browser keeps the last state. The key keeps its state (`ok`, or `unchecked` when loops never answered about it): a loops that is down is never a verdict on the key. | Is `Crewhub.app` open? Open it (it starts its engine itself). After a Mac restart: open the app. Another port: the app's menu says which; set `CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:<port>` and restart the host. |
| **Connect** (no key) | The host found crewhub-loops and has no key (`connection.key.state: "none"`), or loops rejected the one it had (`rejected`, with the reason on screen: an unknown key, a probe key, a read-only bot). A rejected key is kept until you act: the host never forgets one by itself. | Make the external bot (first section) and paste its access key. A rejected key: paste a new one (Settings > Agents > `crewhub-world` > **New access key**), or **Forget this key** on that screen. |
| **No loops found** | The host has not found crewhub-loops (`discovery.state: "searching"`): nothing answers on the app's socket or port. It keeps looking every 5 s. | Open `Crewhub.app`. Another port or install: `CREWHUB_WORLD_LOOPS_URL`. `npm run host -- doctor` lists what was looked for. |
| **Busy** (stream budget) | Loops refused the host's stream with 429 `too_many_streams` (`connection.stream.state: "busy"`, reason "stream budget exhausted (429): another host or tab uses this key"): loops admits four streams per key, and other hosts on this key (a second `npm run world`, a developer's host on your key) hold them. The host retries after `Retry-After` (5 s); the chip must say Busy, not Loops down or Stale. | Close the other hosts; one host serves every tab. `npm run host -- doctor` says when a host already runs on the port. |
| **Key rejected** (the screen; over a live tab too) | Loops answered 401 or 403 (`loops: "unauthorized"`, `connection.key.state: "rejected"`). 401 `invalid_api_key`: a wrong, mistyped or revoked key (a bogus key gave exactly this on 2026-10-21). 403: a key that may not read these routes: a read-only bot ("This key reads tickets, comments and attachments only"), a `probe` agent ("A probe key reads its own routes only") or the builder key. A key revoked while the town was open (round 7): the host's stream gets the 401 from a loops whose health answers, and the screen stands over the live tab (loops' reason, the kept key, Forget this key, a field for another key) instead of an Unauthorized chip over a town that would never move again. While the key is rejected the host leaves loops alone (no stream retries): it waits for a new key, Forget or a discovery change, and asks loops about the kept key every five minutes (one keyless health probe, then the key check only when loops answers; at most one probe a minute), so a bot re-enabled in loops comes back by itself; the rejected screen and the Connection panel say when the next check is (`connection.key.recheckAt`). | Paste another key in the field: the host switches to it without a restart and the town comes back by itself, without a reload. `npm run host -- doctor` names the problem. In the app, Settings > Agents > `crewhub-world`: it must be an external bot without the "Read only" chip, with an active key under **API keys**. Wrong kind of bot: make a new one (the read-only flag cannot be changed). |

One more answer the host may meet from the stream: a **401 or 403 one minute in**: loops re-checks the credential every 60 s and ends the stream silently when the key was revoked; the
reconnect gets the error and the Key rejected screen stands over the town.

**The Connection panel** (the chip opens it) has these rows: **Now** (the chip's state and its reason), **crewhub-loops**
(found through its socket or its port, the Mac app's, or the env's URL or socket; or not found yet), **Key** (its name,
state and source: env, stored, default; a rejected key adds "checked again in 4 min"), **Stream** (streaming, down, refused, busy), **Cursor**, **Last event**,
**Reconnects**, **Closed buildings** (how many and where the list came from: listed by loops, its event log, remembered
from an earlier run), **crewhub-loops version** (and, after an upgrade under the host, "it was 0.1.0 when this host
started: crewhub-loops was updated under the host, which read everything again"), **Host** (over TCP or the Unix
socket) and **Forget this key**. It asks the host the moment the connection's state changes and every 5 s otherwise;
an unpaired browser sees the states only. For a screen reader (round 8) the rows are a definition list, the "Updated
3 s ago" line is visible but not live, and one small live region says once when the host stops answering or answers
again; a connection change over the town (Live to Loops down, Stream busy, Catching up) is said once by the page.

## 6. Taking it away

The world keeps nothing in crewhub-loops. Stop the host; the live town document stays in the host's `world.db` and a
copy in the browser's storage under its own key. In the app, Settings > Agents > `crewhub-world` > **Access keys** > revoke, and delete the stored
key `~/.config/crewhub-world/loops-key` (or `DELETE /world-api/connect` from the world's page does it), the pairing
secret `~/.config/crewhub-world/pairing-secret` and, if you made one,
`~/.config/crewhub-loops/secrets/agent-crewhub-world.key`. **Forget** in the world's Connection panel removes only the
key: the host's folder `~/.config/crewhub-world` also keeps the pairing secret, `archived.json` (the slugs of the
closed buildings it learnt) and `world.db` (the live town per installation, with `world.db.bak-v<n>` copies from
schema changes), so delete the whole folder to remove everything. The app itself is untouched by any of this.

## 7. For developers: the private crewhub-loops next to the app

**`npm run dev` beside `npm run host`** (round 23): the page runs on Vite's origin and Vite proxies `/world-api` to the
host (`CREWHUB_WORLD_PORT`, default 5180). Once Vite listens it tells the host that origin (`POST /world-api/dev-origin`:
accepted only from a program on this machine, only for a loopback http origin, only from the same checkout, never a
wildcard), and the host accepts it for the run, so connect and town writes (the sign-in road is gone since round 28) from the page work without
`CREWHUB_WORLD_ALLOWED_ORIGINS`. Both sides say so in one line at start (`dev: the page's writes come from … told to
the host on …` and `dev origin … accepted`); the dev server also says when the host is older and cannot be told, or
not there yet (it is told when one answers). Pairing is as before: the page still pairs through the one-time link
(`npm run host -- open --origin http://127.0.0.1:5173`).

Development never runs against the app. `tools/loops-dev.sh` runs a second crewhub-loops from a checkout, with its
own port, data folder and socket; the app, its data folder and its port are never touched.

| | |
| --- | --- |
| Checkout | `~/Documents/GitHub/crewhub-loops-world` (branch `world/dev-instance` at `4cdcd383`; `services/api` synced with `uv`, `apps/web` built). Override: `LOOPS_DEV_CHECKOUT`. |
| Port | **8291** (`LOOPS_DEV_PORT`; 8091, 8000 and 9443 are refused: the app, `make dev-api`, nginx https). |
| Data | `~/crewhub-loops-dev` (`LOOPS_DEV_DATA`, 0700): `state/crewhub.db`, `uploads/`, `run/api.sock`, `run/serve.pid`, `serve.log`, `plugin-secrets.key`. |
| Seed | `config/generic` of the checkout: the Inbox project and the agents `crewhub-lead`, `postman`, `team-probe`, `builder`; no people. First account id `nicky` (`LOOPS_DEV_OWNER`). |
| Web | the checkout's built `apps/web/dist`, served by the API itself at `http://127.0.0.1:8291`. |

```sh
tools/loops-dev.sh start          # uv run python -m crewhub_loops.serve with the CHL_* env of `env`; waits for /api/health
tools/loops-dev.sh status         # the listener's pid (and a stale pid file), GET /api/setup/status
tools/loops-dev.sh log [n]        # the last n lines of serve.log
tools/loops-dev.sh stop
tools/loops-dev.sh setup-token    # crewhub-setup-token on the same database: the one-time setup code, printed once
tools/loops-dev.sh env            # the CHL_* lines, for a CLI against the same database
```

Since round 7 the script works from the port, not from a pid file (a stop that killed only the `uv` wrapper and left
the server running was crewy's root cause that morning): `start` refuses a port that is already served (exit 0 and
"already running" when the listener is crewhub-loops, exit 1 when it is something else) and writes `run/serve.pid` only
once health answers 200, with the pid of the process that serves the port; `stop` kills that listener, its `uv` wrapper
and whatever the pid file names, waits until the port is free (SIGKILL after 20 s), removes the pid file, and never
kills a listener that is not crewhub-loops; `status` names the listener's pid and a stale pid file. Since round 8 a
piped `start` (`tools/loops-dev.sh start | cat`) returns once health answers: the server's stdio goes to the log, not
to the caller's pipe.

**How the first admin and the world's bot were made** (the recipe of 2026-10-20; the Lead runs it, once, on a fresh
data folder). Every write with the admin session needs `-H "Origin: http://127.0.0.1:8291"` (the Host/Origin guard;
there is no CSRF token). The admin password and the cookie jar live in `tools/out/loops-dev.env` and
`tools/out/loops-dev.cookies` (0600, git-ignored); developers' panes use bearer keys only.

```sh
TOKEN=$(tools/loops-dev.sh setup-token)
curl -s -c tools/out/loops-dev.cookies -H "Origin: http://127.0.0.1:8291" -H "content-type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"id\":\"nicky\",\"name\":\"Nicky\",\"password\":\"<test password>\"}" \
  http://127.0.0.1:8291/api/setup/admin                                            # 201, session cookies
curl -s -b tools/out/loops-dev.cookies -H "Origin: http://127.0.0.1:8291" -H "content-type: application/json" \
  -d '{"name":"crewhub-lead","session":"default"}' http://127.0.0.1:8291/api/setup/lead
curl -s -b tools/out/loops-dev.cookies -H "Origin: http://127.0.0.1:8291" -H "content-type: application/json" \
  -d '{"name":"crewhub-world","displayName":"CrewHub World","external":true}' http://127.0.0.1:8291/api/agents   # 201
# the key is made locally, like the app's window does: chl_ + 43 base64url characters of 32 random bytes
KEY="chl_$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
DIGEST=$(printf '%s' "$KEY" | shasum -a 256 | cut -d' ' -f1)                        # sha256 of the whole string, chl_ included
(umask 077 && printf '%s' "$KEY" > ~/crewhub-loops-dev/agent-crewhub-world.key && chmod 400 ~/crewhub-loops-dev/agent-crewhub-world.key)
curl -s -b tools/out/loops-dev.cookies -H "Origin: http://127.0.0.1:8291" -H "content-type: application/json" \
  -d "{\"digest\":\"$DIGEST\"}" http://127.0.0.1:8291/api/agents/crewhub-world/keys    # 201, scope agent
unset KEY
```

`POST /api/agents` with `external: true` must come from a human session (an agent key gets 403: "An external bot is
made by the owner in the web"); the role is forced to `lead` and `herdrSession` to `external:none`.
`POST /api/agents/{name}/keys` registers the digest with scope `agent`; `crewhub-agents register` refuses an
external bot's digest on purpose. Project creation is admin-only too (403 for any key). One bot per developer
(`crewhub-world-<track>`, key `~/crewhub-loops-dev/agent-crewhub-world-<track>.key`) gives each host its own
four-stream budget.

A host against the development instance, on a port of your own (`tools/loops-dev.sh start` writes
`~/crewhub-loops-dev/settings.json` with its port, so the discovery finds it the way it finds the app):

```sh
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8291 CREWHUB_WORLD_KEY_FILE=~/crewhub-loops-dev/agent-crewhub-world.key \
CREWHUB_WORLD_PORT=5185 CREWHUB_WORLD_PAIRING=off npm run host
CREWHUB_WORLD_LOOPS_APP_DATA=~/crewhub-loops-dev CREWHUB_WORLD_CONFIG_DIR=/tmp/my-world CREWHUB_WORLD_PORT=5185 npm run host -- doctor
CREWHUB_WORLD_LOOPS_APP_DATA=~/crewhub-loops-dev CREWHUB_WORLD_CONFIG_DIR=/tmp/my-world CREWHUB_WORLD_PORT=5185 npm run world -- --no-open
curl -s http://127.0.0.1:5185/world-api/health
```

The second and third lines are the morning path against the development instance: the socket is found first
(`via: "app-socket"`), the web URL is `http://127.0.0.1:8291` from its `settings.json`, the key is pasted in Connect and
stored under `CREWHUB_WORLD_CONFIG_DIR` (never the real `~/.config/crewhub-world` from a developer's pane).

**The never-touch list**, for every developer and every agent on this Mac: `~/Library/Application Support/be.ekinsol.crewhub`
(the app's data folder: database, keys, socket, lock), port 8091 (and 8092, the app's sharing port), port 8000
(taken) and 9443, `/Applications/Crewhub.app`, `~/.local/bin/crewhub` (the app re-installs its wrapper at every
start), `~/Library/LaunchAgents` (a `dev.crewhub.*` plist there stops the app from starting that job), and
`scripts/install-mac.sh` of the loops checkout (it writes exactly those plists). Never stop or restart a shared
development instance that another developer tests against.

## What is not there yet

- **A viewer role in today's Mac app** (L1). crewhub-loops main carries the viewer key since #959 (the chat read
  narrowed to the key's maker, #964) and the world switched to it in round 28 (section 3, "The viewer key"); today's Mac
  app (`4cdcd383`) is older, so there the key is a lead-grade external bot, the host's allow-list and a test keep every
  unsafe method out, and there are no bubbles over the key until the app carries loops main.
- **The "Connect CrewHub World" card in the loops web** (Settings > Agents), which makes the viewer bot and shows its
  key once next to the world's address and a button that opens the world, so steps 2 and 3 above are one dialog: on
  loops main with the viewer key, not yet in today's Mac app. The key is still pasted in the world's Connect screen;
  nothing hands it to the host behind the person's back.
- **The chat** is loops' own, framed in the Chat panel (round 12, road A of the spec addendum "chat with the
  agents"): the person's session cookie (`SameSite=Lax`, one site on 127.0.0.1 whatever the port) travels into the
  frame, and nothing in loops sets `frame-ancestors` or `X-Frame-Options`. **Bubbles over the figures when an agent
  answers** (road B) come over the viewer key's own stream where loops lets it read the chat (road 1: only the chat of
  the person who made the key), or by the page's own read where that loops has the world's origin set (road 2, round 28:
  `CHL_WORLD_ORIGIN=<the page's origin>`, the person's cookie, GET only, never through the host); on an older loops there
  are none (the world's bot key never sees the person's DM threads), and nothing else stands in for them since round 28.
- **Pending delegations** need the owner's session, not a key: out.
- **Project groups** (L22): zones live in the browser until crewhub-loops offers them, or until the host's world
  database keeps them per installation (the roads are in the spec addendum of round 7; the per-browser road is what
  runs today, per installation in that browser).
- **Pairing beyond one machine.** The one-time link pairs a browser with the host on `127.0.0.1` (section 3); a
  host behind a TLS proxy sets `CREWHUB_WORLD_PUBLIC_URL` for a `Secure` cookie, but nothing hands out links to a
  remote person yet: the command runs where the host runs.
