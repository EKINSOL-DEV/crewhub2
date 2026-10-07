# CrewHub World on a fresh crewhub-loops: the setup runbook

For Nicky. The world's side of the Mac install: what crewhub-loops must have before the world can hook in, how
the world's host relay reaches it, how to run the world in live mode, and what each state chip means. Written
against crewhub-loops `053b5f47` (2026-10-07) and the world's phase 1 build of the same day
([integration plan](LOOPS_INTEGRATION_PLAN.md) section 10). Every loops command below is copied verbatim from
`loops:docs/porting/MAC-QUICKSTART.md`, except the two lines in step 3 that are marked as not from there; the
world's commands are this repository's.

**The shape.** The browser never talks to crewhub-loops. It talks to the world's own relay, `apps/host`, which holds
one agent key, keeps one event stream open and serves `/world-api` on loopback. Nothing is written to crewhub-loops.

```text
crewhub-loops :8091  --bearer key-->  apps/host :5180 (127.0.0.1)  --/world-api-->  browser
(or the fake)                         one stream, a ring buffer, an allow-list   snapshot, then events by seq
```

## 0. Before the install: run the world against the fake

You do not need crewhub-loops to see live mode. `packages/loops-fake` is an in-process crewhub-loops that speaks
the routes the host reads, with bearer auth, `seq`, heartbeats and a 410 past its buffer, and plays the demo
storyline in real time. Three terminals:

```sh
npm run loops:fake -- --port 8091          # writes its key to tools/out/loops-fake.key (0600); prints how to start the host
CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host
npm run dev                                 # then open http://127.0.0.1:5173/?source=live
```

The switch to the real install later changes only the URL and the key file (section 3).

## 1. What crewhub-loops must have

All of this is `loops:docs/porting/MAC-QUICKSTART.md`, sections 0 to 5 and 8. In short:

1. **The stack up on 8091, with the three compose files, always** (`compose.yaml`, `compose.local.yaml`,
   `compose.mac.yaml`; without the Mac overlay the database sits on a bind mount and gets damaged). The quickstart
   makes `~/.config/crewhub-loops/mac.env`, which defines `chl_compose` with all three and is sourced first in
   every new terminal:

   ```sh
   source ~/.config/crewhub-loops/mac.env
   cd "$checkout" && chl_compose up -d --build
   ```

   Check:

   ```sh
   chl_compose ps --format '{{.Name}}\t{{.Status}}\t{{.Ports}}'
   curl -s http://127.0.0.1:$port/api/health
   ```

   `GET /api/health` is the liveness read; the host's own health read (section 4) reports it as `loops: "ok"`.

2. **The first admin, in the browser.** A fresh stack asks for it: open `http://127.0.0.1:8091`
   (`/api/setup/status` says `{"needsSetup":true}` until then). The world does not need the admin for reading, but
   admin keys cannot be registered before a human admin exists.

3. **A key the host can use: a dedicated agent `crewhub-world`.** There is no viewer role at `053b5f47`
   (proposal L1 is open); the role for a process that only reads is still spelled `probe`
   (`loops:.../contracts/common.py`, `AgentRole`). A `probe` key may `GET` like any agent and may `PUT` only the
   four team and lane-watch routes in `PROBE_WRITES` (`loops:.../auth/deps.py`), which the host never calls and
   its allow-list cannot reach. `crewhub-agents register` refuses a name the seed does not know
   (`unknown agent 'crewhub-world' (add it to config/agents.yaml)`), so the agent is added to the seed first, as a
   plain `probe` with no other flag, then imported, then given a key:

   ```sh
   source ~/.config/crewhub-loops/mac.env
   # in $checkout/config/agents.yaml, next to team-probe:
   #   - { name: crewhub-world, session: ekinsol, role: probe }
   chl_compose exec -T api crewhub-seed --import-missing --dry-run    # lists what would be added; drop --dry-run to add it
   bash scripts/gen-agent-key.sh --print-digest crewhub-world "$conf/secrets" | sed -n 's/^gen-agent-key: digest //p' | chl_compose exec -T api crewhub-agents register crewhub-world --digest-stdin
   ```

   This leaves `~/.config/crewhub-loops/secrets/agent-crewhub-world.key` (0400), the host's default key file.
   `--digest-stdin` registers with scope `agent` (CL-244); never give the world an `admin` scope key. The
   `crewhub-seed --import-missing` command is the seed's own (`loops:.../seed/features.py`); the quickstart does
   not run it, so that line and the YAML line are the two things here that are not verbatim from the quickstart.

   **The builder key is not a fallback that works.** The quickstart's step 5 registers `builder`, and the host
   falls back to `agent-builder.key` with a warning (`health.sharedKey: true`) when no `crewhub-world` key exists.
   But `builder` is a `probe` flagged `is_builder_reader`, and that flag limits its key to an exact table of eight
   `GET` routes (tickets of a member project, one ticket, its comments, history and rules, a project's rules, an
   attachment, `/api/auth/me`: `loops:.../auth/builder.py`, `BUILDER_READ_ROUTES`). Every other route, among them
   `/api/projects`, `/api/board/{slug}`, `/api/team` and `/api/events/stream`, is `403 forbidden`
   ("This key reads tickets, comments and attachments only"). With the builder key the chip says Unauthorized.
   The fallback exists so the host starts and says what is wrong, not to run the world.

   Check, names and fingerprints only:

   ```sh
   ls -l "$conf/secrets"
   chl_compose exec -T api crewhub-agents list
   ```

4. **Something to look at.** A fresh install has no projects. The world shows one building per project; until the
   first project exists (the loops web app, or `crewhub lead new` from the quickstart's section 8), live mode shows
   an empty town with a Live chip. That is correct.

## 2. The world's environment

The host reads these; every one has a default that matches the quickstart.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CREWHUB_WORLD_LOOPS_URL` | `http://127.0.0.1:8091` | Where crewhub-loops answers (`CREWHUB_LOOPBACK_PORT` in `mac.env`, 8091). |
| `CREWHUB_WORLD_KEY_FILE` | `~/.config/crewhub-loops/secrets/agent-crewhub-world.key` | The key the host sends as `Authorization: Bearer`. Missing: falls back to `agent-builder.key` in the same folder, with a warning. Read once, never logged, never in a response or the bundle (a test checks). |
| `CREWHUB_WORLD_PORT` | `5180` | The host's own port, bound to `127.0.0.1` only. |
| `CREWHUB_WORLD_ALLOWED_ORIGINS` | none | A comma list of extra browser origins the host accepts besides `http://127.0.0.1:<port>` and `http://localhost:<port>`; in development the Vite dev server's origin, for example `http://127.0.0.1:5173`. |

The Vite dev server proxies `/world-api` to `http://127.0.0.1:${CREWHUB_WORLD_PORT ?? 5180}` with `changeOrigin`,
so the Host header the host checks is its own.

## 3. Run the world in live mode

Against the real install (after section 1):

```sh
npm run host                                          # the relay, development; reads the env above
npm run dev                                           # Vite; open http://127.0.0.1:5173/?source=live
```

In production the host also serves the built bundle:

```sh
npm run build
npm run host:start                                    # then open http://127.0.0.1:5180/
```

The source setting is `auto` by default: Live when a host answers `/world-api/health` within 1.5 s, else Demo.
`?source=live` or `?source=demo` overrides it; Settings > Source shows the choice and the host URL. In live mode the
Demo chip, the scenario picker and the playback bar are hidden, the chat dock shows the "sign in to crewhub-loops"
link (the chat is phase 2), and the connection chip sits where the Demo chip was. The text view says the same.

Zones: every live project sits in the default zone until crewhub-loops has project groups (L22); zones drawn by
hand in build mode are kept in the live town document, which is separate from the demo scenarios' documents.

## 4. The health read

```sh
curl http://127.0.0.1:5180/world-api/health
```

```json
{"loops":"ok","keyName":"crewhub-world","sharedKey":false,"loopsCommit":"...","cursor":1234}
```

`loops` is `ok`, `down` or `unauthorized`; `keyName` is the key file's agent name; `sharedKey` is `true` when the
builder key is the fallback; `cursor` is the last `seq` the host holds. The key itself is never in the answer.

## 5. The chip says X, do Y

| The chip says | What it means | Do |
| --- | --- | --- |
| **Live** | The snapshot is loaded and events arrive; a heartbeat came in the last 40 s. | Nothing. A ticket move in loops (`crewhub ticket move <KEY> in_progress`) changes the building's counts within 2 s. |
| **Connecting** | The browser has not yet reached the host, or the host has not yet answered its first `status`. | Wait a few seconds. Longer: is the host running (`npm run host`)? Does `curl http://127.0.0.1:5180/world-api/health` answer? In dev, is the Vite proxy pointing at the host's port (`CREWHUB_WORLD_PORT`)? |
| **Catching up** | The host sent `reset` (loops answered 410, or the host reconnected past its buffer, or the asked cursor is too old) or the browser saw a gap in `seq`; the browser loads a new snapshot and replays from it. | Nothing. It clears by itself within a few seconds. If it repeats every minute, the host is reconnecting over and over: read its log. |
| **Stale** | No event and no heartbeat for 40 s. Loops sends a heartbeat every 15 s, so three were missed. The scene is the last known state. | Check loops: `curl -s http://127.0.0.1:8091/api/health`. If it answers, the host's stream is wedged: restart `npm run host`; the browser recovers without a reload. If it does not, see "Loops down". |
| **Loops down** | The host cannot reach crewhub-loops (`loops: "down"`). The host retries with backoff and re-snapshots when loops is back; the browser keeps the last state. | `source ~/.config/crewhub-loops/mac.env && chl_compose ps`. Not up: `cd "$checkout" && chl_compose up -d`. After a Mac restart: start Docker Desktop first, then the same. Wrong port: `CREWHUB_WORLD_LOOPS_URL`. |
| **Unauthorized** | Loops answered 401 or 403 (`loops: "unauthorized"`): the key file is missing, revoked or not registered, or it is the builder key, which may not read projects, boards, the team or the stream. | `curl http://127.0.0.1:5180/world-api/health`: `sharedKey: true` means the builder fallback, so register the `crewhub-world` agent (section 1, step 3). Else `ls -l ~/.config/crewhub-loops/secrets` and `chl_compose exec -T api crewhub-agents list`: the key's agent must be listed with an active fingerprint. After a new file: restart `npm run host`; the key is read once at start. |

## 6. Taking it away

The world keeps nothing in crewhub-loops. Stop the host and the dev server; the live town document stays in the
browser's storage under its own key. The loops side is the quickstart's "Taking it away again".

## What is not there yet

- **Pairing.** The plan's one-time link exchanged for an HttpOnly cookie (plan 3.5) is not built; this round the
  host trusts loopback and checks Host and Origin only. Any page in the same browser can read `/world-api` on
  `127.0.0.1:5180`. The host's README says the same.
- **A viewer role** (L1). The key is `probe`, which could write the team snapshot if the host were ever broken;
  the host's allow-list and a test keep every unsafe method out.
- **The chat** (phase 2) needs CORS in crewhub-loops (L8). `CHL_ALLOWED_ORIGINS` is in the loops env (the
  quickstart's `env` file sets it to the two loopback origins on 8091), but it feeds the Host/Origin guard only:
  there is still no `Access-Control-Allow-Origin` anywhere in `loops:.../api/security.py`. A bearer key must never
  reach a browser and the person's session is an HttpOnly cookie, so the relay is the way for data and the chat
  stays out.
- **Project groups** (L22): zones live in the browser until crewhub-loops offers them.
