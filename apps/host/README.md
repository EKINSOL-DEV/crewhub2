# `@crewhub/host`: the world's relay to crewhub-loops

A small Node program (Node 22, no dependencies beyond Node itself) that stands between the browser and
crewhub-loops: integrator "Option A" of loops' `docs/integrators/identity-and-access.md`, section 3.5 of
[docs/LOOPS_INTEGRATION_PLAN.md](../../docs/LOOPS_INTEGRATION_PLAN.md). It holds the one read-only agent key,
reads crewhub-loops with safe methods only, and answers the browser under `/world-api` on `127.0.0.1`.

What it does:

- **Snapshot** `GET /world-api/snapshot`: one `LoopsSnapshot` (the seam's type in `packages/loops-client`),
  assembled by read-model.md "Loading a snapshot": the stream's position first, then projects, boards per active
  project, principals, agents, team, watchdog, and milestones and releases where the project has the feature on.
  Paged lists are followed to the last page. `groups` is `[]` until loops has project groups (L22).
- **Stream** `GET /world-api/stream?cursor=N`: Server-Sent Events, `data: <json>` per message, `id: <seq>` on
  events. ONE upstream `GET /api/events/stream` is shared by every browser tab; a ring buffer of the last 2000
  envelopes catches a tab up from its cursor. Messages: `status` (`ok` / `down` / `unauthorized`), `event`
  (loops' envelope unchanged), `heartbeat` (loops' passed through, the host's own every 15 s while loops is
  down), `reset` with a reason (`gone`: loops answered 410; `reconnected`: the log's tail went backwards, a
  restore or a fresh install; `cursor`: the tab asked for a cursor the buffer no longer covers). On a reset the
  client re-snapshots.
- **Refetch routes** passed through with loops' status and body: `/world-api/tickets/{ref}`,
  `/tickets/{ref}/comments|progress`, `/projects/{slug}`, `/projects/{slug}/milestones|releases`, `/board/{slug}`,
  `/watchdog`, `/team`. Only `limit` and `cursor` of a query string are passed. `/world-api/project-groups`
  answers `{ "groups": [] }` locally.
- **Health** `GET /world-api/health`: `{ loops, keyName, sharedKey, loopsWebUrl, paired, pairing, loopsCommit?, cursor? }`;
  `loopsWebUrl` is the origin of the loops URL, for the world's "sign in to crewhub-loops" link; `paired` is whether
  this request carries a valid pairing cookie; `pairing` is `on` or `off`. Health carries no data and needs no cookie.
- **Pairing** (plan 3.5, `src/pairing.ts`): every other `/world-api` route answers `401 {"error":"not_paired"}`
  unless the request carries the cookie `crewhub_world_pair` (`HttpOnly; SameSite=Strict; Path=/`, plus `Secure`
  when `CREWHUB_WORLD_PUBLIC_URL` is https). `GET /pair/<token>` sets it and answers `303 Location: /`; a used,
  expired or unknown token gets a plain HTML 403 page. See "Pairing" below.
- **Allow-list** in `src/allowList.ts`: the loops routes the host may read and the browser routes it answers,
  in one file. Every other path is 404, every method but GET is 405, and nothing reaches loops for either.
- **Host and Origin guard**: the `Host` header must be `127.0.0.1:<port>` or `localhost:<port>` (else 421), an
  `Origin` header when present must be the host's own or one from `CREWHUB_WORLD_ALLOWED_ORIGINS` (else 403).
- **Reconnect**: when loops goes away the host retries with backoff (1 s doubling to 30 s), reconnects from its
  cursor so nothing is lost, and tells the tabs `status: down` and then `ok` (the world shows "stale" meanwhile).
- **Static files**: with `NODE_ENV=production` the host serves `apps/world/dist` with an SPA fallback to `index.html`.
- **The key** is read once from the key file, kept in memory, never logged, never in a response (a test greps every
  response for it; loops' error bodies pass through scrubbed of it).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `CREWHUB_WORLD_LOOPS_URL` | `http://127.0.0.1:8091` | crewhub-loops' API. On the Mac this is loopback TCP into Docker Desktop: the plan's "socket client" does not apply across Docker Desktop, so the host speaks HTTP to `127.0.0.1:8091`. |
| `CREWHUB_WORLD_KEY_FILE` | `~/.config/crewhub-loops/secrets/agent-crewhub-world.key` | The agent key file. When it is missing and nothing is configured, the host falls back to `agent-builder.key` in the same folder with a loud warning (see below). |
| `CREWHUB_WORLD_PORT` | `5180` | The port on `127.0.0.1`. |
| `CREWHUB_WORLD_ALLOWED_ORIGINS` | none | Comma list of extra origins, e.g. the Vite dev server `http://localhost:5173`. |
| `CREWHUB_WORLD_PAIRING` | `on` | `off` removes the cookie gate: development only (the Vite proxy), logged loudly at start, refused with `NODE_ENV=production`. |
| `CREWHUB_WORLD_PAIRING_FILE` | none | Keeps the pairing secret across restarts (created with mode 0600). Without it the secret is per run and a restart invalidates every pairing. |
| `CREWHUB_WORLD_PUBLIC_URL` | none | The URL a browser reaches the host at behind a TLS proxy: `https` makes the cookie `Secure`; its host and origin pass the guard. |
| `NODE_ENV` | | `production` serves `apps/world/dist`. |

**The builder key is not a working fallback.** crewhub-loops limits the shared `builder` key to the tickets,
comments and attachments of its member projects; `/api/projects`, `/api/board`, `/api/team` and the event stream
answer 403, so the world shows "Unauthorized" and `health.sharedKey` is `true`. The working setup is a seeded agent
`crewhub-world` with a `probe`-role key; the runbook is [docs/LOOPS_SETUP.md](../../docs/LOOPS_SETUP.md).

## Running

Against the fake crewhub-loops (`packages/loops-fake`), before the real install:

```sh
npm run loops:fake -- --port 8091        # writes the key to tools/out/loops-fake.key and prints the next line
CREWHUB_WORLD_PAIRING=off CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host
npm run dev                              # Vite proxies /world-api and /pair to 127.0.0.1:5180; open with ?source=live
```

Against the real install on this Mac (after [docs/LOOPS_SETUP.md](../../docs/LOOPS_SETUP.md)):

```sh
npm run host                             # dev: the world comes from Vite, the data from the host
npm run host -- open                     # prints a one-time pairing link (starts the host when none runs on the port)
npm run host:start                       # production: builds the world and serves apps/world/dist on 127.0.0.1:5180
npm run host:start -- open               # the same, and prints the link
curl -s http://127.0.0.1:5180/world-api/health
```

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
3. A used or expired link gets "This link has expired or was already used. Run `npm run host -- open` for a new one."
4. Until then the world (live mode) shows its "Pair this browser" page with the command and a "Use the demo" button;
   `health.paired` is what it checks.

How it holds: the token is 32 random bytes (base64url); only its hash is kept, with its expiry, and redeeming
deletes it. The cookie is `<id>.<HMAC-SHA256(secret, id)>`, verified with a constant-time compare, so nothing about a
cookie is stored: the secret alone decides. Per run by default, so a restart asks for pairing again;
`CREWHUB_WORLD_PAIRING_FILE` keeps the secret (0600) across restarts. The Host/Origin guard stays in front of
everything, pairing included.

Development: `CREWHUB_WORLD_PAIRING=off` drops the gate (loud warning at start; refused with `NODE_ENV=production`),
or pair through the Vite origin, which proxies `/pair`: `npm run host -- open --origin http://127.0.0.1:5173`.
Cookies ignore ports, so a browser paired on `127.0.0.1:5180` is paired on `127.0.0.1:5173` as well.

Programmatic: `createHost` takes `pairing?: "on" | "off"`, `pairingSecret?`, `publicUrl?`, `mintSecret?` and `now?`,
and returns `mintPairLink(origin?)`. `createHostSource` (loops-client) takes `headers` for a Node caller's cookie;
the browser sends it same-origin. Tests: `test/pairing.test.ts`.
