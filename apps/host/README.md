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
- **Health** `GET /world-api/health`: `{ loops, keyName, sharedKey, loopsCommit?, cursor? }`.
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
| `NODE_ENV` | | `production` serves `apps/world/dist`. |

**The builder key is not a working fallback.** crewhub-loops limits the shared `builder` key to the tickets,
comments and attachments of its member projects; `/api/projects`, `/api/board`, `/api/team` and the event stream
answer 403, so the world shows "Unauthorized" and `health.sharedKey` is `true`. The working setup is a seeded agent
`crewhub-world` with a `probe`-role key; the runbook is `docs/LOOPS_SETUP.md`.

## Running

Against the fake crewhub-loops (`packages/loops-fake`), before the real install:

```sh
npm run loops:fake -- --port 8091        # writes the key to tools/out/loops-fake.key and prints the next line
CREWHUB_WORLD_KEY_FILE=tools/out/loops-fake.key npm run host
npm run dev                              # Vite proxies /world-api to 127.0.0.1:5180; open with ?source=live
```

Against the real install on this Mac (after the runbook `docs/LOOPS_SETUP.md`):

```sh
npm run host                             # dev: the world comes from Vite, the data from the host
npm run host:start                       # production: builds the world and serves apps/world/dist on 127.0.0.1:5180
curl -s http://127.0.0.1:5180/world-api/health
```

Tests: `node --test apps/host/test/*.test.ts` (part of `npm test`). They start a tiny loops stub on `127.0.0.1`
port 0 and talk to it over loopback only. The end-to-end test against `packages/loops-fake` is `test/e2e.test.ts`
(owned by the fake).

## KNOWN GAP: no pairing yet

This round the host **trusts loopback**: any page running in the same browser (or any process on this machine)
can read the world's data through `http://127.0.0.1:5180/world-api`. The Host and Origin guard keeps other
*sites* from reading it through a browser (a page on `evil.example` gets 403; a DNS-rebinding name gets 421), but a
page or a script that can reach loopback and set its own headers is not stopped.

The plan's design (section 3.5 of the integration plan) is pairing: `crewhub-world open` prints a one-time link;
opening it sets an `HttpOnly`, `SameSite=Strict` cookie for the host's origin, and from then on `/world-api`
answers only requests with that cookie. Until that is built, run the host only on a machine you trust, and do not
mistake the guard for pairing. The data is read-only in any case: the host never writes to crewhub-loops.
