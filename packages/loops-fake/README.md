# @crewhub/loops-fake

A fake crewhub-loops for tests and for running the world in live mode before the real install. It is an HTTP server
on `127.0.0.1` that plays the demo's storyline (`@crewhub/demo`) on wall time (through a pause of the process, the Mac
asleep or a debugger holding it, its clock follows the wall clock, so what it stamps afterwards is never behind the
clock: round 64, w2-3; the story plays on in order from where it stopped) and serves what it knows exactly as
crewhub-loops would: the routes of `docs/integrators/read-model.md` the host reads (the shapes of `053b5f47`), bearer-key
auth with loops' error bodies, and the event routes as crewhub-loops `4cdcd383` serves them (`docs/LOOPS_REAL_VS_FAKE.md`):
`GET /api/events` with `from=tail` and a sealed opaque `cursor`, the NDJSON stream `GET /api/events/stream` with
`after=` or `cursor=` or a `Last-Event-ID` header, heartbeats that carry a cursor, 429 `too_many_streams` at the fifth
stream of the key, a 410 `cursor_expired` for a cursor that does not open or an `after` older than the buffer it keeps,
and the per-principal visibility of a lead agent's key, so its `seq` has gaps as a real key's does.

Nothing in it talks to a real crewhub-loops. It has no runtime dependency beyond the repo's own workspaces.

## By hand

```sh
npm run loops:fake -- --port 8391 [--scenario small-team] [--speed 1] [--builder-key] [--viewer-key]   # default 8391; 8091, 8000, 9443 and 5180 are refused
npm run loops:fake -- --help                                                                           # the usage; the fake does not start
```

An unknown flag or a stray word is refused with exit 2, and the fake does not start.

`npm run loops:fake -- --builder-key` plays the same storyline but the key behaves like loops' builder key (CL-120):
it reads a ticket, its comments and `GET /api/auth/me`, and everything else, health included, answers 403 `forbidden`
"This key reads tickets, comments and attachments only". The host then shows Unauthorized, so that chip can be tried
by hand without a real install. `npm run loops:fake -- --viewer-key` (round 65) makes the key read the chat, as loops'
viewer key does (`keyReadsChat` below): the world shows speech bubbles and Recent answers over the fake; the two flags
together are refused. `GET /` is a small HTML page saying the fake has no web app, for the world's Chat panel, which
frames the loops origin's root; every other path outside `/api` is the JSON 404.

The key is written to `tools/out/loops-fake.key` (mode 0600) on the first run and reused after that, so a restarted
fake keeps a running host's key valid (`LOOPS_FAKE_KEY_FILE` names another file, for a test that starts the command
beside others). The key is never printed. The command prints the two environment lines for
the host:

```text
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8391
CREWHUB_WORLD_KEY_FILE=<repo>/tools/out/loops-fake.key
```

Switching to the real install changes only those two values. `--scenario` takes a demo scenario id (`fresh`, `one`,
`small-team`, `studio`; another is refused with exit 2); `--speed` is `0`, `1`, `4` or `16` times real time.

## In tests

```ts
import { createLoopsFake } from "@crewhub/loops-fake";

const fake = await createLoopsFake({ speed: 0, heartbeatMs: 100 }); // port 0: a free port on 127.0.0.1
await fake.moveTicket("CR-19", "review"); // ticket.moved on the stream; the board and ticket reads follow
await fake.moveTicket("CR-21", "done", { rejected: "Not this way." }); // a person turns the work down
fake.lastSeq(); // the tail of the log, hidden rows included
fake.lastVisibleSeq(); // the newest seq the key may see (what from=tail says)
await fake.close();
```

Options: `port` (default 0), `key` (generated), `keyName` (`crewhub-world`), `scenario`, `speed` (1), `scheduler` (the
wall clock and timers the story plays on; default `Date.now()` and the real ones; a test injects one and jumps its
clock as a sleep does: the stamps follow the wall), `startAt` (the
storyline position to start at, ms), `heartbeatMs` (15000), `streamMaxMs` (300000: a stream ends after this long, as
loops' 300 s; tests use 1–2 s), `bufferSize` (2000 envelopes kept for `after=`), `firstSeq` (0), `builderKey`
(false), `visibility` (`principal`: what a lead agent's key sees, with gaps; `all`: every row), `emptyTeam` (false:
`GET /api/team` answers the demo's snapshot; true: `{"v":1,"ts":"","sessions":[]}`, as an instance where no team
probe has reported), `version` (what `/api/health` says; another value after a restart on one port is a loops upgraded
under a running host), `person` (who can sign in), `keyReadsChat` (default false; true: the key reads the chat, as a viewer key,
sees the `dm.*` rows, and `/agents` says `viewer: true`) and `worldOrigin` (loops' `CHL_WORLD_ORIGIN`;
`setWorldOrigin()` changes it on a running fake). `streamsOpened()` counts the streams opened since the start, so a test can see a reconnect. A
fake made with `firstSeq` set to an old fake's `lastSeq()` continues the log like a restart that kept its database
(and writes no history again); a lower `firstSeq` plays a fresh install, so the host sees a lower tail and must reset.

`moveTicket` moves as the demo person (`actor.kind: "user"`): in loops only a person moves into Done
(`human_only_done`), and the demo's agents never do; `rejected` makes it a turned-down move (`resolution: "rejected"`).

A fresh install (`firstSeq` 0) starts its log with the install's history: two admin-only rows for the owner making
the key's bot (`agent.created`, `agent-membership.updated`; hidden from the key, so its first visible seq is 3, as on
the development instance) and a `project.archived` for every project the scenario starts with archived (ops-tooling
in the small team), so a client can learn the archived slugs from `GET /api/events?types=project.archived,project.restored&after=0`
as the host does.

## What it serves

| Route | Notes |
| --- | --- |
| `GET /api/health` | Public. `principal` and `watchdog` are null without a key. `version` is `0.1.0+fake.4cdcd383` (loops says its package version, `0.1.0`). |
| `GET /api/auth/me` | `{principal: {id, kind, displayName, role, theme, themeDefault}}` (`PrincipalOut`): the key's agent, role `lead` (an external bot's key is a lead's; the `probe` road is closed since CL-295), `theme` null. |
| `GET /api/projects` | Active projects in sidebar order. `includeArchived=true` is 403 `forbidden` "Only an admin lists archived projects", as for any agent key. |
| `GET /api/projects/{slug}` | One project, archived ones too (`archivedAt` set). The storyline restores ops-tooling at 5:00 (`project.restored`) and archives it again at 13:44 (`project.archived`). |
| `GET /api/labels`, `GET /api/projects/{slug}/labels` | The global labels alone, or with the project's own, as loops lists them. The demo's globals (`awaiting-deploy`, `release`) are among loops' reserved names (`RESERVED_LABELS`: `smoke`, `awaiting-deploy`, `release`, `tutorial`), which no project label may take. |
| `GET /api/projects/{slug}/features` | The three per-project flags. |
| `GET /api/projects/{slug}/milestones`, `/releases` | Paged (`limit`, `cursor`); 409 `feature_off` when the flag is off. |
| `GET /api/board/{slug}` | The five columns. |
| `GET /api/tickets/{ref}` | Key or id. |
| `GET /api/tickets/{ref}/comments`, `/progress` | Paged, 50 per page, max 100. |
| `GET /api/tickets/{ref}/grill` | CL-245 `GrillResponse`: the questions of a `grill` ticket in order, each with its answer and `sent`. The questions are the asking agent's top-level comments, an answer a person's reply to one. A ticket that is no grill has none; the small-team storyline has one from 12:36 (three questions, one answered at 12:52). |
| `GET /api/delegations/pending` | CL-240 `PendingRequestsResponse`: the owner's bound requests that wait for a click. The small-team storyline has one from 13:03 (g-man asks to restart cr-dev-2), served to the fake's key; loops serves it to the owner only and answers an agent key 403. The world does not read it yet. |
| `GET /api/team`, `/agents`, `/principals`, `/watchdog` | As the demo answers them: the lanes and computers are the demo's own (`packages/demo/src/lanes.ts`), `/agents` adds the key's principal as the external bot it is; `emptyTeam` makes `/api/team` the empty snapshot. |
| `GET /api/events` | `after` or `cursor` (both: 400) or a `Last-Event-ID` header (an integer is `after`, anything else a sealed cursor; the `after` query wins), `limit` (max 500), `types` (an unknown type is 400), `from=tail`. Every answer carries `lastSeq` and a sealed `cursor` (CL-406). `from=tail` answers no events, the newest seq the key may see and the cursor of "now" (its watermark the real tail). `lastSeq` is the last row returned, else the `after` sent (CL-390), so the old tail trick `types=attachment.added` answers 0, as on the real loops. Only rows the key may see are served (below). |
| `GET /api/events/stream` | NDJSON. `after=N` replays `seq > N` from the buffer then goes live; `cursor=<token>` (from a heartbeat or `GET /api/events`) or a `Last-Event-ID` header replays from the token's watermark; without either, live from the visible tail. A heartbeat line every `heartbeatMs` of silence with the last sent seq and a fresh sealed `cursor`, `ts` last. The fifth open stream of the key is 429 `too_many_streams` with `Retry-After: 5`. The stream ends after `streamMaxMs` (300 s, as loops' `Timing.max_age`) without a closing line; the host reconnects after a short jittered pause from its cursor and loses nothing (`test/streamEnd.test.ts` proves it through `createHost` and `createHostSource`). |

Also served, for the chat roads (rounds 12 and 28): `POST /api/auth/login` (the fake's `person`; 401 `bad_credentials`;
sets `chl_session`, and that session reads as an admin: every event, the chat) and `POST /api/auth/logout` (204); the
chat reads `GET /api/dm/threads`, `/api/dm/threads/{agent}/messages` and `/api/dm/messages/{id}` (403 to a key
unless `keyReadsChat`); the first two are the demo api's (`packages/demo/src/api.ts`, the fake is its HTTP adapter as
the world's dock is its in-page one), so a thread's messages page newest-last at 50 (`limit` 1 to 100, `before` a
message id of the thread, `nextCursor` the page's oldest id while older ones exist) and the agent must be an enabled
lead (404 unknown, 403 otherwise, as loops' `dm.py`; round 61, W2). With `worldOrigin` set, a request from that
origin passes only as a GET on loops' four world routes, with the CORS headers, and any other `Origin` is 403
`origin_forbidden`.

Loops' wire grammar, the pure pieces, is written once in `src/wire.ts` and spoken by two servers: this fake and the
host's test stub (`apps/host/test/loopsStub.ts`, which imports it from `@crewhub/loops-fake`): the error envelope
(`errorBody`, `WireError`), where a read or a stream resumes (`parseResume`: `after=` or `cursor=`, never both, else
the `Last-Event-ID` header), the heartbeat line (`heartbeatLine`, `ts` last) and the 429 answer (`tooManyStreams`,
`RETRY_AFTER_S`). Each server seals and opens its own cursors and keeps its own server loop (round 61, W3).

Everything else is 404 `not_found`; on a known route any method but GET or HEAD is 405 `method_not_allowed`, except
login and logout (POST only) and the stream (GET only). Auth: 401 `unauthenticated` without a key, 401
`invalid_api_key` with a wrong one, 400 `ambiguous_auth` with a key and any cookie.

## Differences from crewhub-loops you should know

- The log is the demo's envelopes renumbered from `firstSeq`. When the demo storyline loops (at speed 1 every 16
  minutes in `small-team` and `studio`, 10 in `fresh` and `one`), the state is rebuilt: the fake jumps its seq by 1000, empties its buffer and ends every open stream, so
  every cursor from before answers 410 and a client re-snapshots, as it would after a restore. Loops itself keeps
  every event and answers 410 only for a sealed cursor that does not open; an `after` below the fake's buffer is the
  fake's own 410.
- The sealed cursor is sealed with a per-fake secret: a token from another fake (a restart) is 410, like a token
  made under a rotated `device-cookie.key` in loops. The token is 34 bytes in 46 base64url chars, so its last char
  carries two bits and four of padding that the decoder drops, in the fake as in loops' `urlsafe_b64decode`: a token
  that differs only there is the same token and opens. A test that wants a foreign token must change a char whose
  bits all count (the fake's own test changes one inside the MAC).
- **Visibility is per principal, as in loops** (`api/stream.py` `event_visibility_sql`, for a lead agent's key): the
  key is not served chat it is no part of (`dm.*`, anything with a `dmThreadId`, unless the row names the key as the
  thread's agent or the delivery's recipient), a `lane.alert` whose `leadId` is another agent, a lane-wake delivery
  for somebody else, `host.reported`, `onboarding.updated`, `owner-request.updated`, the old agent-action rows or any
  of `ADMIN_EVENT_TYPES`. Hidden rows keep their `seq`, so the key sees gaps; the heartbeat's `seq` and `from=tail`
  are the newest visible seq, the cursor's watermark the real tail. `visibility: "all"` serves everything. The chat
  rule is an approximation: loops looks the thread up; the fake reads the row's `agentId`/`recipientId`.
- No credential re-check on an open stream, no total stream limit (loops: 64 in all), no `for=me`, `project` or
  `notify` filters.
- `GET /api/delegations/pending` answers the fake's agent key; loops answers it to the owner only (an agent key is
  403 `forbidden` "Admin only"). The fake serves it so the shape can be read before the world does.
- With `builderKey`, only the builder routes the fake has are open (`/api/tickets/{ref}`, `/comments`, `/auth/me`);
  loops' table also lists `/api/tickets?project=`, `/history`, `/rules` and `/attachments/{id}/raw`, which the fake
  does not serve (404). A ticket of a project the builder is no member of is 404 in loops; the fake's builder reads
  every project.
- `moveTicket` moves as the demo person: a move to `planned` also writes the `planned` delivery's `delivery.created`.
- The storyline carries the three event types of CL-312 and CL-298 the loops way: `ticket.quiet` (actor `system`,
  `{status, minutes, since, ticket}`, CR-17 at 8:10) and `automation.ran` (actor `system`, `{runId, automationId,
  outcome, automation:{id, name}}`, three runs from 8:40, one `failed`; the label an automation adds comes first as a
  `ticket.updated` flagged with `automation`), both served to the key; `owner-request.updated` (a person's, 9:42 and
  9:50) is in the log and never served to the key, as loops shows it to that owner alone (`visibility: "all"` serves it).
