# @crewhub/loops-fake

A fake crewhub-loops for tests and for running the world in live mode before the real install. It is an HTTP server
on `127.0.0.1` that plays the demo's storyline (`@crewhub/demo`) on wall time and serves what it knows exactly as
crewhub-loops would at commit `053b5f47`: the routes of `docs/integrators/read-model.md` the host reads, bearer-key
auth with loops' error bodies, `GET /api/events` with the tail recipe, and the NDJSON stream `GET /api/events/stream`
with `after=`, heartbeats and a 410 `cursor_expired` for a cursor older than the buffer it keeps.

Nothing in it talks to a real crewhub-loops. It has no runtime dependency beyond the repo's own workspaces.

## By hand

```sh
npm run loops:fake -- --port 8091 [--scenario small-team] [--speed 1] [--builder-key]
```

`npm run loops:fake -- --builder-key` plays the same storyline but the key behaves like loops' builder key (CL-120):
it reads a ticket, its comments and `GET /api/auth/me`, and everything else, health included, answers 403 `forbidden`
"This key reads tickets, comments and attachments only". The host then shows Unauthorized, so that chip can be tried
by hand without a real install.

The key is written to `tools/out/loops-fake.key` (mode 0600) on the first run and reused after that, so a restarted
fake keeps a running host's key valid. The key is never printed. The command prints the two environment lines for
the host:

```text
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8091
CREWHUB_WORLD_KEY_FILE=<repo>/tools/out/loops-fake.key
```

Switching to the real install changes only those two values. `--scenario` takes a demo scenario id (`fresh`, `one`,
`small-team`, `studio`); `--speed` is `0`, `1`, `4` or `16` times real time.

## In tests

```ts
import { createLoopsFake } from "@crewhub/loops-fake";

const fake = await createLoopsFake({ speed: 0, heartbeatMs: 100 }); // port 0: a free port on 127.0.0.1
await fake.moveTicket("CR-19", "review"); // ticket.moved on the stream; the board and ticket reads follow
fake.lastSeq(); // the tail of the log
await fake.close();
```

Options: `port` (default 0), `key` (generated), `keyName` (`crewhub-world`), `scenario`, `speed` (1), `startAt` (the
storyline position to start at, ms), `heartbeatMs` (15000), `streamMaxMs` (300000: a stream ends after this long, as
loops' 300 s; tests use 1–2 s), `bufferSize` (2000 envelopes kept for `after=`), `firstSeq` (0), `builderKey`
(false). `streamsOpened()` counts the streams opened since the start, so a test can see a reconnect. A fake made with `firstSeq` set to an old
fake's `lastSeq()` continues the log like a restart that kept its database; a lower `firstSeq` plays a fresh
install, so the host sees a lower tail and must reset.

## What it serves

| Route | Notes |
| --- | --- |
| `GET /api/health` | Public. `principal` and `watchdog` are null without a key. `version` is `0.0.0+fake.053b5f47`. |
| `GET /api/auth/me` | `{principal: {id, kind, displayName, role, theme, themeDefault}}` (`PrincipalOut`): the key's agent, role `probe`, `theme` null. |
| `GET /api/projects` | Active projects in sidebar order. `includeArchived=true` is 403 as for any agent key. |
| `GET /api/projects/{slug}` | One project, archived ones too. |
| `GET /api/projects/{slug}/features` | The three per-project flags. |
| `GET /api/projects/{slug}/milestones`, `/releases` | Paged (`limit`, `cursor`); 409 `feature_off` when the flag is off. |
| `GET /api/board/{slug}` | The five columns. |
| `GET /api/tickets/{ref}` | Key or id. |
| `GET /api/tickets/{ref}/comments`, `/progress` | Paged, 50 per page, max 100. |
| `GET /api/tickets/{ref}/grill` | CL-245 `GrillResponse`: the questions of a `grill` ticket in order, each with its answer and `sent`. The questions are the asking agent's top-level comments, an answer a person's reply to one. A ticket that is no grill has none; the small-team storyline has one from 12:36 (three questions, one answered at 12:52). |
| `GET /api/delegations/pending` | CL-240 `PendingRequestsResponse`: the owner's bound requests that wait for a click. The small-team storyline has one from 13:03 (g-man asks to restart cr-dev-2), served to the fake's key; loops serves it to the owner only and answers an agent key 403. The world does not read it yet. |
| `GET /api/team`, `/agents`, `/principals`, `/watchdog` | As the demo answers them. |
| `GET /api/events` | `after`, `limit` (max 500), `types` (an unknown type is 400). `types=attachment.added` is the tail recipe. |
| `GET /api/events/stream` | NDJSON. `after=N` replays `seq > N` from the buffer then goes live; without it, live from the tail. A heartbeat line every `heartbeatMs` of silence with the last sent seq. The stream ends after `streamMaxMs` (300 s, as loops' `Timing.max_age`) without a closing line; the host reconnects at once with `after=` its cursor and loses nothing (`test/streamEnd.test.ts` proves it through `createHost` and `createHostSource`). |

Everything else is 404 `not_found`; any method but GET or HEAD on a known route is 405 `method_not_allowed`. Auth:
401 `unauthenticated` without a key, 401 `invalid_api_key` with a wrong one, 400 `ambiguous_auth` with a key and a
`chl_session` cookie.

## Differences from crewhub-loops you should know

- The log is the demo's envelopes renumbered from `firstSeq`. When the demo storyline loops (every 16 minutes at
  speed 1), the state is rebuilt: the fake jumps its seq by 1000, empties its buffer and ends every open stream, so
  every cursor from before answers 410 and a client re-snapshots, as it would after a restore.
- No credential re-check on an open stream, no stream limit (loops: 4 per principal, 64 in all, 429
  `too_many_streams`), no `for=me`, `project` or `notify` filters.
- `GET /api/delegations/pending` answers the fake's agent key; loops answers it to the owner only (an agent key is
  403 `forbidden` "Admin only"). The fake serves it so the shape can be read before the world does.
- With `builderKey`, only the builder routes the fake has are open (`/api/tickets/{ref}`, `/comments`, `/auth/me`);
  loops' table also lists `/api/tickets?project=`, `/history`, `/rules` and `/attachments/{id}/raw`, which the fake
  does not serve (404). A ticket of a project the builder is no member of is 404 in loops; the fake's builder reads
  every project.
- `moveTicket` moves as the demo person: a move to `planned` also writes the `planned` delivery's `delivery.created`.
