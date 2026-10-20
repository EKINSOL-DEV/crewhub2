# CrewHub World on the Mac crewhub-loops: the setup runbook

For Nicky, with `Crewhub.app` on this Mac. The world's side of it: the one credential crewhub-loops must have, how
the world's host relay reaches the app, how to run the world in live mode, and what each state chip means.
Written against crewhub-loops `4cdcd383` (`origin/main`, 2026-10-20) and the world's live-on-the-Mac round of
2026-10-21 ([integration plan](LOOPS_INTEGRATION_PLAN.md) section 10, the addendum "live on the Mac crewhub-loops"
of [the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md)). The loops facts below are from
the loops code at that commit (`loops:docs/external-bot.md`, `loops:apps/desktop/README.md`,
`loops:.../auth/probe.py`, `loops:.../auth/builder.py`, `loops:.../api/stream.py`); the world's commands are this
repository's. Section 7 is for developers: it describes a private crewhub-loops next to the app, never the app.

**The shape.** The browser never talks to crewhub-loops. It talks to the world's own relay, `apps/host`, which holds
one agent key, keeps one event stream open and serves `/world-api` on loopback. The host never writes to crewhub-loops.

```text
Crewhub.app :8091  --bearer key-->  apps/host :5180 (127.0.0.1)  --/world-api-->  browser
(the Mac app)                       one stream, an allow-list of GETs           snapshot, then events by seq
```

## 0. Before the app: run the world against the fake

You do not need crewhub-loops to see live mode. `packages/loops-fake` is an in-process crewhub-loops that speaks
the routes the host reads, with bearer auth, `seq` and heartbeats, and plays the demo storyline in real time. Three
terminals:

```sh
npm run loops:fake -- --port 8091          # writes its key to tools/out/loops-fake.key (0600); prints how to start the host
CREWHUB_WORLD_PAIRING=off CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host
npm run dev                                 # then open http://127.0.0.1:5173/?source=live
```

Pick another port for the fake while the app runs: 8091 is the app's. `CREWHUB_WORLD_PAIRING=off` skips the
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
2. **Member of these projects:** tick none, or all; it does not matter for the world. Membership decides what is
   *delivered* to the bot and where it is shown as a member; reads are not project-scoped (any agent key lists every
   project and reads every board: `loops:docs/external-bot.md`, "What membership does and does not do").
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

   That path is the host's default key file. Any other path works with `CREWHUB_WORLD_KEY_FILE=<path>`. The
   folder `~/.config/crewhub-loops/secrets` is the world's, not the app's: the app keeps its own keys in its data
   folder and never reads or writes that folder (`loops:apps/desktop/README.md`, "secrets").

   Lost the key? The agent's page has **New key**; the old one keeps working until it is revoked under **API keys**.

**Say it plainly: this key can write.** An external bot that is not read-only is an ordinary `lead` agent key: it
could create and move tickets, comment and write progress in any project (not move to Done, not create projects).
What keeps the world read-only is the host: it holds the key on `127.0.0.1`, forwards an allow-list of `GET` paths
only (`apps/host/src/allowList.ts`; every other method is 405 and never reaches loops; a test sends them), and the
key is never in a response, a log or the bundle. Never paste the key into a browser page or a shared file. A viewer
key that cannot write is proposal L1 for crewhub-loops ([gap analysis](LOOPS_GAP_ANALYSIS.md), section 6.1), asked
again this round with a worked proposal; until then this is the credential.

### 1.3 Something to look at

The world shows one building per project. The app's first project is the Inbox; until a project of yours exists,
live mode shows that one building and a Live chip. That is correct.

## 2. The world's environment

The host reads these; every one has a default that matches the app.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CREWHUB_WORLD_LOOPS_URL` | `http://127.0.0.1:8091` | Where crewhub-loops answers, over loopback TCP. Change it only when the app runs on another port. |
| `CREWHUB_WORLD_LOOPS_SOCKET` | none | **Planned (built tonight on the `unixsock` track; the Lead marks it built on merge).** The path of the app's Unix socket (`~/Library/Application Support/be.ekinsol.crewhub/run/api.sock`): the host then reads loops over the socket (`node:http` with `socketPath`, Host `127.0.0.1`), same allow-list, same stream. Explicit only, never guessed; the health read says `transport: "unix"` or `"tcp"`. |
| `CREWHUB_WORLD_KEY_FILE` | `~/.config/crewhub-loops/secrets/agent-crewhub-world.key` | The key the host sends as `Authorization: Bearer`. Read once, never logged, never in a response or the bundle (a test checks). Missing: the host falls back to `agent-builder.key` in the same folder with a warning; that key only diagnoses (Unauthorized), and the app never makes it, so on the Mac the fallback simply fails loudly. |
| `CREWHUB_WORLD_PORT` | `5180` | The host's own port, bound to `127.0.0.1` only. |
| `CREWHUB_WORLD_ALLOWED_ORIGINS` | none | A comma list of extra browser origins the host accepts besides `http://127.0.0.1:<port>` and `http://localhost:<port>`; in development the Vite dev server's origin, for example `http://127.0.0.1:5173`. |
| `CREWHUB_WORLD_PAIRING` | `on` | `off` drops the pairing cookie gate: development only, logged loudly at start, refused with `NODE_ENV=production`. |
| `CREWHUB_WORLD_PAIRING_FILE` | none | A file (created, mode 0600) that keeps the pairing secret across host restarts, so paired browsers stay paired. Without it the secret is per run: a restart means pairing again. |
| `CREWHUB_WORLD_PUBLIC_URL` | none | The URL a browser reaches the host at when a TLS proxy stands in front; `https` makes the cookie `Secure`, and that origin passes the Host/Origin guard. |

The Vite dev server proxies `/world-api` and `/pair` to `http://127.0.0.1:${CREWHUB_WORLD_PORT ?? 5180}` with
`changeOrigin`, so the Host header the host checks is its own.

## 3. Run the world in live mode

With the app open and the key file in place (section 1):

```sh
npm run host:start                                    # builds the world, then serves apps/world/dist; open http://127.0.0.1:5180/
```

`host:start` is production: pairing on, the bundle served by the host, TCP to `127.0.0.1:8091` by default. For
development, Vite serves the world and the host serves the data:

```sh
npm run host                                          # the relay; reads the env of section 2
npm run dev                                           # Vite; open http://127.0.0.1:5173/?source=live
```

Over the app's socket instead of TCP, once the `unixsock` track is merged (section 2):

```sh
CREWHUB_WORLD_LOOPS_SOCKET="$HOME/Library/Application Support/be.ekinsol.crewhub/run/api.sock" npm run host:start
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
host restart asks for pairing again unless `CREWHUB_WORLD_PAIRING_FILE` keeps the secret (section 2).

In development the world runs on the Vite origin, and cookies ignore ports: a browser paired on `127.0.0.1:5180` is
paired on `127.0.0.1:5173` too. Either open the link as printed, or ask for one on the Vite origin, which proxies
`/pair` to the host: `npm run host -- open --origin http://127.0.0.1:5173`. Or skip pairing in development:
`CREWHUB_WORLD_PAIRING=off npm run host`.

The source setting is `auto` by default: Live when a host answers `/world-api/health` within 1.5 s, else Demo.
`?source=live` or `?source=demo` overrides it; Settings > Source shows the choice, the host URL and why the source was
chosen, and changing it reloads the page (the source is decided once, before the world starts). In live mode the
Demo chip, the scenario picker and the playback bar are hidden, the chat dock shows the "sign in to crewhub-loops"
link (the chat is phase 2 and needs CORS in loops, L8), and the connection chip sits where the Demo chip was. The
text view says the same.

Zones: every live project sits in the default zone until crewhub-loops has project groups (L22); zones drawn by
hand in build mode are kept in the live town document, which is separate from the demo scenarios' documents.

## 4. The health read

```sh
curl -s http://127.0.0.1:5180/world-api/health
```

What it answered on 2026-10-21 against the development instance (section 7), with pairing off and a developer's
track key (yours says `crewhub-world`):

```json
{"loops":"ok","keyName":"crewhub-world-setupdocs","sharedKey":false,"loopsWebUrl":"http://127.0.0.1:8291","paired":true,"pairing":"off","loopsCommit":"0.1.0","cursor":13}
```

`loops` is `ok`, `down` or `unauthorized` (a loops 401 or 403); `keyName` is the key file's agent name (from the
file name `agent-<name>.key`); `sharedKey` is `true` when the builder key is the fallback; `loopsCommit` is what
loops' own health read calls its `version` (the app says `0.1.0`, not a commit); `cursor` is the last `seq` the host
holds; `loopsWebUrl` is the origin of the loops URL, where the chat dock's sign-in link points (the app's web and
its API share 8091). The key itself is never in the answer. A request with a foreign Host header gets 421 and one
with a foreign Origin 403: the guard against other sites and DNS rebinding. `paired` says whether the request's
cookie is a valid pairing (`curl` has none, so `false` with pairing on); `pairing` is `on` or `off`.

## 5. The chip says X, do Y

| The chip says | What it means | Do |
| --- | --- | --- |
| **Live** | The snapshot is loaded and events arrive; a heartbeat came in the last 40 s. | Nothing. A ticket move in the app (or `crewhub ticket move <KEY> in_progress` from the app's own CLI) changes the building's counts within 2 s. |
| **Connecting** | The browser has not yet reached the host, or the host has not yet answered its first `status`. | Wait a few seconds. Longer: is the host running (`npm run host:start`)? Does `curl http://127.0.0.1:5180/world-api/health` answer? In dev, is the Vite proxy pointing at the host's port (`CREWHUB_WORLD_PORT`)? |
| **Catching up** | The host sent `reset`: loops answered 410 `cursor_expired` (a sealed cursor that no longer opens, for example after a restored backup), the log's tail went backwards (a restored database), the tab asked for a cursor the host's buffer no longer covers, or loops came back after Loops down or Unauthorized; the browser loads a new snapshot and replays from it. A gap in `seq` is normal (loops filters events per key) and is not a reason. | Nothing. It clears by itself within a few seconds. If it repeats every minute, the host is reconnecting over and over: read its log. |
| **Stale** | No event and no heartbeat for 40 s. Loops sends a heartbeat every 15 s and ends every stream after 300 s (the host reopens it); three heartbeats were missed. The scene is the last known state. | Check loops: `curl -s http://127.0.0.1:8091/api/health`. If it answers, the host's stream is wedged: restart the host; the browser recovers without a reload. If it does not, see "Loops down". |
| **Loops down** | The host cannot reach crewhub-loops (`loops: "down"`). The host retries with backoff and re-snapshots when loops is back; the browser keeps the last state. | Is `Crewhub.app` open? Open it (it starts its engine itself). After a Mac restart: open the app. Another port: the app's menu says which; set `CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:<port>` and restart the host. |
| **Unauthorized** | Loops answered 401 or 403 (`loops: "unauthorized"`). 401 `invalid_api_key`: the key file holds a wrong, mistyped or revoked key (a bogus key gave exactly this on 2026-10-21). 403: a key that may not read these routes: a read-only bot ("This key reads tickets, comments and attachments only"), a `probe` agent ("A probe key reads its own routes only") or the builder key. | `curl http://127.0.0.1:5180/world-api/health`: `keyName` must be `crewhub-world` and `sharedKey` `false`. In the app, Settings > Agents > `crewhub-world`: it must be an external bot without the "Read only" chip, with an active key under **API keys**. Wrong kind of bot: make a new one (the read-only flag cannot be changed), save its key (section 1.2) and restart the host; the key is read once at start. |

Two more answers the host may meet, both from the stream: **429 `too_many_streams`** (`Retry-After: 5`): loops
admits four open streams per key; the host opens one, so a 429 means other hosts run on the same key (a second
`npm run host`, a developer's host on your key). Close them; one host serves every tab. And a **401 or 403 one
minute in**: loops re-checks the credential every 60 s and ends the stream silently when the key was revoked; the
reconnect gets the error and the chip says Unauthorized.

## 6. Taking it away

The world keeps nothing in crewhub-loops. Stop the host; the live town document stays in the browser's storage
under its own key. In the app, Settings > Agents > `crewhub-world` > **API keys** > revoke, and delete
`~/.config/crewhub-loops/secrets/agent-crewhub-world.key`. The app itself is untouched by any of this.

## 7. For developers: the private crewhub-loops next to the app

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
tools/loops-dev.sh status         # pid and GET /api/setup/status
tools/loops-dev.sh log [n]        # the last n lines of serve.log
tools/loops-dev.sh stop
tools/loops-dev.sh setup-token    # crewhub-setup-token on the same database: the one-time setup code, printed once
tools/loops-dev.sh env            # the CHL_* lines, for a CLI against the same database
```

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

A host against the development instance, on a port of your own:

```sh
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8291 CREWHUB_WORLD_KEY_FILE=~/crewhub-loops-dev/agent-crewhub-world.key \
CREWHUB_WORLD_PORT=5185 CREWHUB_WORLD_PAIRING=off npm run host
curl -s http://127.0.0.1:5185/world-api/health
```

**The never-touch list**, for every developer and every agent on this Mac: `~/Library/Application Support/be.ekinsol.crewhub`
(the app's data folder: database, keys, socket, lock), port 8091 (and 8092, the app's sharing port), port 8000
(taken) and 9443, `/Applications/Crewhub.app`, `~/.local/bin/crewhub` (the app re-installs its wrapper at every
start), `~/Library/LaunchAgents` (a `dev.crewhub.*` plist there stops the app from starting that job), and
`scripts/install-mac.sh` of the loops checkout (it writes exactly those plists). Never stop or restart a shared
development instance that another developer tests against.

## What is not there yet

- **The socket transport** (`CREWHUB_WORLD_LOOPS_SOCKET`): planned on the `unixsock` track of 2026-10-21; TCP to
  8091 works today and stays the default.
- **A viewer role** (L1). The key is a lead-grade external bot; the host's allow-list and a test keep every unsafe
  method out. A read-only key that may read the board, the team, agents and the stream is proposed to loops on the
  branch `world/viewer-key` of the loops checkout (not pushed), the ask for `cl-lead`.
- **The chat** (phase 2) needs CORS in crewhub-loops (L8). There is still no `Access-Control-Allow-Origin` anywhere
  in `loops:.../api/security.py`; `CHL_ALLOWED_ORIGINS` feeds the Host/Origin guard only. A bearer key must never
  reach a browser and the person's session is an HttpOnly cookie, so the relay is the way for data and the chat stays
  out.
- **Pending delegations** need the owner's session, not a key: out.
- **Project groups** (L22): zones live in the browser until crewhub-loops offers them.
- **Pairing beyond one machine.** The one-time link pairs a browser with the host on `127.0.0.1` (section 3); a
  host behind a TLS proxy sets `CREWHUB_WORLD_PUBLIC_URL` for a `Secure` cookie, but nothing hands out links to a
  remote person yet: the command runs where the host runs.
