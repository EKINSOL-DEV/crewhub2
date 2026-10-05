# CrewHub World on crewhub-loops: gap analysis

Status: analysis, 2026-10-05. This document changes no code. It re-maps what CrewHub World needs from
crewhub-loops against what crewhub-loops provides today, and lists what is still missing.

Update, 2026-10-05 (later): D1, D2, D3 and D5 of section 4 are fixed in the world; their rows say so. The
verdict and the other sections describe the world as it was before those fixes.

Update, 2026-10-06: section 5.8 and proposal L22 ("project groups") are new. The world now has zones, a level
above projects, and keeps them itself until crewhub-loops offers one.

Two readers: the owner (Nicky), who decides what to ask of crewhub-loops, and the crewhub-loops lead agent
(`cl-lead`), who receives section 6 as work. Each section can be read on its own.

**What was compared.**

- crewhub-loops at commit `f55d1288` (`origin/main`, 2026-10-05), against commit `a1bed0f`, the commit the world
  was built against. 274 commits lie between them.
- CrewHub World at this branch: [the integration plan](LOOPS_INTEGRATION_PLAN.md) (proposals L1 to L8 in its
  section 9), [ADR 0005](decisions/0005-crewhub-world-on-loops.md),
  [the night report](reports/2026-10-01-world-demo-night.md) (44 numbered challenges),
  [the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md) with its addenda, and the code in
  `packages/loops-client`, `packages/world-model`, `packages/demo` and the copied chat files in `apps/world`.

**Citations.** `loops:<path>` is a file in the crewhub-loops repository at `f55d1288`. `loops:.../` abbreviates
`loops:services/api/src/crewhub_loops/`. `CL-nnn` is a crewhub-loops ticket; the short hash next to it is the
commit. Plain paths are in this repository. "Verified" means the code was read (and, for the validators, run);
"not verified" means it could not be checked from the two checkouts.

**Words.** The *host* is the planned process `apps/host` that reads crewhub-loops with an agent key and serves
the browser. A *viewer key* is the key the host uses. The *chat copy* is the set of crewhub-loops web files copied
verbatim into `apps/world`.

## 1. Verdict

The live connection can be started on crewhub-loops as it is today for five of the six phases, each with a
workaround that is already known. Phase 2 (the chat) is blocked: crewhub-loops still sends no CORS headers
(`loops:.../api/security.py`, class `HostOriginGuard`; no `Access-Control-*` string exists in
`loops:services/api/src`), so a page on the world's origin cannot call the chat routes. Nothing in
crewhub-loops was built for the world since `a1bed0f`: none of L1 to L8 exists, and none of the 44 challenges
was resolved in the documents. Three shapes the world already validates are wrong against the real server and
must be fixed in the world before the first live read (section 4): they fail on every `GET /api/agents`, on
every ticket or chat message with a body, and on one common `ticket.moved` payload.

| Phase (plan section 10) | Status today | The one reason |
| --- | --- | --- |
| 1. First light (host, projects, counts, leads) | Ready with a workaround | No read-only key exists (L1); the host uses a `probe` key, which can also write the team snapshot (`loops:.../auth/deps.py`, `PROBE_WRITES`). |
| 2. Chat bubbles | **Blocked** | No CORS (L8). The only way around it is a relay in the host that forwards the person's session, which changes a decision in ADR 0005 (section 8, question 1). |
| 3. Buildings (rooms, objects, postures, stalls) | Ready with a workaround | Roles, a worker's ticket and snapshot freshness are still inferred by the world (L6, L3, L10); every event still needs a refetch (L4). |
| 4. Town and pathfinding | Ready | It adds no need beyond phase 3; delivery events reach an agent key (`loops:.../api/stream.py`, `event_visibility_sql`). |
| 5. Build mode and props | Ready with a workaround | Layout and props live in the world's own database. The prop-as-ticket flow works through comments and `ticket.moved`, once an admin creates the CrewHub project and a `prop` label in crewhub-loops. |
| 6. Director and awareness | Ready with a workaround | `where` needs nothing from crewhub-loops. crewhub-loops offers an integrator no way to wake a lane, so the director is a direct model call from the host or a lane the host prompts itself (section 8, question 6). |

On a Mac the host must use the loopback port instead of the Unix socket: a socket in a bind mount does not cross
Docker Desktop's VM, and the agent key already works over `http://127.0.0.1:<CHL_HTTP_PORT>`
(`loops:docs/porting/PORT-MAP.md`, section 0b, CL-208, `e867bb94`). Plan section 3.2 already names that
fallback.

## 2. What changed in crewhub-loops since `a1bed0f` that matters to the world

Only integrator-relevant changes. Everything else in the 274 commits (the installer, the host tools, the lane
create wizard, test stability, the web app's pages) has no bearing and is left out.

| Change | Ticket, commit | Where | What it means for the world |
| --- | --- | --- | --- |
| The global flag `agents_admin` is gone. `GET /api/agents` always returns the detail shape: `isCrewhubLead`, `isCoordinator`, `isOperator`, `isLauncher`, `isBuilderReader`, `successorId`, `projects`, `lane`, `rights`, `revision`, plus a top-level `lanesAuthority`. | CL-70 `ad8b090c`, CL-66 `4cd829be` | `loops:.../api/routers/agents.py` (`list_agents`), `loops:.../contracts/agents.py` (`AgentDetailOut`) | Good: project membership of registered agents is always available. Bad: `projects` is `{lead: [{slug, key}], member: [{slug, key}]}`, not the list of slugs the world assumed. The world's validator rejects the answer (section 4, D1). |
| A ticket can be closed as rejected ("won't do"): `resolution: "rejected"` and `resolutionReason` on every ticket shape; `ticket.moved` carries `resolution`, `resolutionReason` or `resolutionCleared`; a rejection of a ticket already in Done is a `ticket.moved` with `from == to`, and so is a rejected ticket that a person makes a plain Done after all (`resolutionCleared` inside Done). | CL-89 `b50382e1` | `loops:.../domain/board.py` (the `ticket.moved` emit), `loops:docs/integrators/agents-and-states.md` ("Ticket facts") | A move to Done is no longer always a success. The world celebrates it and imports a prop from it (section 4, D5). |
| Subtasks: a ticket with a parent has key `CL-111.2`, `parentKey`, and the parent carries `subtasks: {total, done}`. Lists and the board leave subtasks out unless `subtasks=include`. The parent gets `ticket.updated` with `changed: ["subtasks"]`. `TICKET_KEY_RE` now allows the `.n` suffix. | CL-111 `7ff8302a`, `a90ea538` | `loops:docs/integrators/read-model.md` ("Subtasks"), `loops:.../ids.py` (`TICKET_KEY_RE`) | Subtask events arrive in the stream but subtasks are not in the board the world loads. The world shows a subtask as a new object until the next board reload (section 4, D6). |
| Deploy: a per-project feature `deploy`, a sixth virtual board column `ready_for_deploy` (`BoardColumn.column`; its `status` is `in_progress`), `GET /api/deploys`, the event `deploy.updated`, and `ticket.moved` with `code: "deployed"` when a deploy moves its tickets to Review as the owner who pressed. | CL-128 `a76a0e06`, `1b924e7e` | `loops:.../domain/board.py` (`board_columns`), `loops:.../api/routers/board.py`, `loops:.../domain/deploys.py` (`_move_snapshot`) | The world reads cards by their own `status`, so the sixth column is harmless (verified by running the validator). Tickets that wait for a deploy sit on desks as in-progress work. The deploy moves leave In progress with the `awaiting-deploy` label, which triggers D3 in section 4. |
| Questions to a person: a `question` progress line with `--on PERSON`, or an `@person VRAAG` comment line, sets `waitingOn`; `ticket.updated` reasons `question`, `withdrawn`. | CL-134 `86c280b6`, CL-139 `bf665988` | `loops:docs/integrators/events.md` ("ticket.updated payloads") | More tickets carry a person's name tag. No change needed: the world refetches on `ticket.updated`. |
| Parking: a ticket can be parked until a time (`parked: ParkOut` on every ticket shape); `GET /api/watchdog` gains `parked`. | CL-159 `65a66e04`, `6f9c9a16` | `loops:docs/integrators/read-model.md` (`ParkOut`, `WatchdogResponse`) | A new ticket fact the world does not draw. Unknown keys are dropped, so nothing breaks. |
| Review and process rules per project and per ticket (`GET /api/projects/{slug}/rules`, `GET /api/tickets/{ref}/rules`), `hasRuleOverrides` on cards, `ticket.updated` with `changed: ["rule_overrides"]`. | CL-115 `99ac1c89` | `loops:docs/integrators/read-model.md` | No bearing on the scene. One more cause of a harmless ticket refetch. |
| A batch read by key: `GET /api/tickets/lookup?keys=A-1,B-2` answers up to 50 tickets with `key`, `title`, `status`, `resolution`, `priority`, `archived` only. The CLI gains `crewhub ticket list`. | CL-114 `17af4614`, CL-103 `0fdc225c` | `loops:.../api/routers/tickets.py` (`lookup_tickets`), `loops:docs/integrators/cli.md` | A cheap way to confirm many statuses at once. It has no assignee and no waiting-on, so it does not replace the per-ticket refetch (L4 stays open). The copied chat now calls it for ticket keys in messages. |
| A read-only key exists, for one purpose: the builders' shared key, a `probe` agent flagged `is_builder_reader`, limited to an exact table of seven `GET` routes and to its member projects. | CL-120 `83ba5636` | `loops:.../auth/builder.py` (`BUILDER_READ_ROUTES`), `loops:docs/integrators/identity-and-access.md` | Not usable by the world (no project list, no board, no team, no events). It is the pattern L1 can copy: a flag on a `probe` agent plus a route table. |
| Host keys (`chh_`), a third kind of credential that opens three routes of its own host. | CL-43 `93e6cb07` | `loops:.../api/security.py` (`HOST_ROUTES`) | No bearing; listed so nobody mistakes it for a viewer key. |
| The ten administration event types are accepted by `types=` and served to human admins only. New types: `deploy.updated`, `agent_action.expired`, `lane.alert`, `lane-watch.updated`, `host.reported`, `onboarding.updated`. | CL-124 `7263c6b9`, CL-204 `fa5c502e`, CL-93 to CL-107 (`58e93c3c`, `2361a689`, `beea70d3`) | `loops:docs/integrators/events.md` | The world's allow-list skips all of them. Of the new ones only `deploy.updated` reaches a viewer key. |
| Lane watch: a second probe watches worker lanes every 3 s and raises alerts (blocked, at capacity, asking). A new delivery reason `lane`; `delivery.created` and `delivery.updated` for it carry `laneAlertId` and are served only to the recipient, admins and operators. | CL-93 to CL-98, CL-107 | `loops:docs/lane-wakes.md`, `loops:.../api/stream.py` (`lane_delivery`), `loops:.../domain/deliveries.py` (`_emit_updated`) | A viewer key never sees lane alerts or lane wakes, so the postman has no letter for them. `DeliveryOut.reason` gained the value `lane` (section 4, D8). The alert carries `ticketKey` for a worker lane, which is what L3 asks for, but not where a viewer can read it. |
| Operators, the coordinator and the launcher are flags on agents, no longer fixed names. | CL-66 `4cd829be`, CL-104 `eb71056d`, CL-155 `54b798e2` | `loops:.../auth/deps.py` (`is_operator`), `loops:config/agents.yaml` | The world's rule "the first `router` agent is the postman" still holds for the seed (`postman` is the only router). The integrator documents still say "the agents `g-man` and `cl-lead`" in places. |
| Agent limits: `agent_limit` per project, `agent_limit_total` and `agent_limit_builders` for the installation; `GET /api/limits`. Lanes without an observation count as live. | CL-88 `67be3c74`, CL-118 `0aee4b37` | `loops:.../domain/features.py` | A director lane (phase 6) would count against these limits. |
| Removing an agent from a project hands its open tickets to the lead, one `ticket.updated` per ticket. | CL-152 `3d0f264f` | `loops:docs/integrators/team-and-projects.md` | A burst of refetches; nothing else. |
| The chat grew: file attachments (`DmMessage.attachments`, `POST /api/attachments`, `GET /api/attachments/{id}/raw`), rich messages, ticket key links with a hover card, resizing and a focus mode, Ctrl+Enter to send, new refusals `dispatch_gated`, `attachment_foreign` and `key_like`. | CL-179 `858199b3` `aa20e191`, CL-195 `36aef1cd`, CL-180 `e33b3eb6`, CL-114 `bc017bcb`, CL-178 `e253e819`, CL-202 `2b347244`, CL-181 `c7f9d679`, CL-43 O1a `8ad5ffd3` | `loops:apps/web/src/components/bubbles/`, `loops:.../contracts/dm.py`, `loops:.../domain/dm.py` | The four changed files of the chat copy are 19 commits behind (section 4, D9). L8 must cover more routes than the plan listed. |
| A tutorial: a sample project "that reaches no agent", listed like any project while its run is open. | CL-43 O8a `dd395dfb` | `loops:.../domain/tutorial.py`, `loops:.../domain/projects.py` (`list_projects` does not filter it) | It would appear as a building. `ProjectOut` has no field that marks it (L20). |
| A project's settings are eight pages under `/settings/projects/<slug>/…`, among them Features, Rules and Labels. | CL-197 `2bfad51c` | `loops:apps/web/src/routes.tsx` | The per-project feature list is a registry in code with five keys; nothing in it is a free field a client could use (section 5.3). |
| The stack runs on Docker Desktop for Mac only over the loopback port. | CL-208 `e867bb94` | `loops:docs/porting/PORT-MAP.md` | See the verdict: the host needs its loopback transport from day one on a Mac. |
| A herdr pane id may hold letters and digits in both parts (`wT:p1`). | CL-211 `17ae6a3c` | `loops:docs/integrators/team-and-projects.md` | None: the world treats `paneId` as an opaque string. |

Not changed, and worth saying because the plan depends on it: the envelope, the stream rules (heartbeat 15 s,
end after 300 s, 4 streams per principal, replay in pages of 500: `loops:.../api/stream.py`, `TIMING`, `BATCH`),
the team snapshot fields, the watchdog thresholds, the session cookie (`SameSite=Lax`, host-only, path `/`:
`loops:.../api/routers/auth.py`, the `set_cookie` call of the login route), and every rule the demo copied from `domain/dm.py`; the chat only gained the three new
refusals and messages that consist of attachments alone.

## 3. Status of every earlier item

Status words: **resolved**, **partly** (partly resolved), **unchanged**, **changed** (the ground moved under the
item, for better or worse). "Doc" is `loops:docs/integrators/`. L1 to L8 are the plan's proposals; 1 to 44 are
the night report's challenges, with its numbers.

Count: resolved 0, partly 4, changed 3, unchanged 45.

| # | Item | Status today | Evidence |
| --- | --- | --- | --- |
| L1 | Read-only `viewer` role | Unchanged | `AgentRole` is still `lead`, `router`, `probe` (`loops:.../contracts/common.py`). The builder key (CL-120) is a working pattern for it. |
| L2 | Published schemas with a drift test | Unchanged | `openapi_url=None`; only the schema blocks in `read-model.md`, which render integer constants as strings (L9). |
| L3 | `TeamAgent.ticketKey` | Unchanged | `loops:.../contracts/team.py` has no such field. `ProgressItem.ticketKey` is new but names a subtask on a parent's page. |
| L4 | `ticket.updated` with the new `assigneeId` and `waitingOnId` | Unchanged | The payload is still `{changed, …}` (`loops:.../domain/tickets.py`, the `ticket.updated` emit). |
| L5 | Payload-free DM envelopes for a viewer | Unchanged | Chat events go to the thread's agent and human admins only (`loops:.../api/stream.py`). Still optional. |
| L6 | A role attribute on agents | Unchanged | New flags exist (`isCoordinator`, `isOperator`, `isLauncher`, `isBuilderReader`) and `lane.kind`; none says design, analyst or developer. |
| L7 | One line about `crewhub-world where` in the briefing snippet | Unchanged | No `crewhub-world` in `loops:docs/agents-briefing-snippet.md`. |
| L8 | CORS for the chat routes | Changed (not built, and it must cover more) | No CORS code. The chat now also calls `POST /api/attachments`, `GET /api/attachments/{id}/raw` and `GET /api/tickets/lookup`. |
| 1 | No JSON examples for the read models | Unchanged | `read-model.md` has no `json` block. |
| 2 | `GET /api/agents` has no schema block | Partly | The flag is gone and the doc names the keys; the shapes are still not given. Code: `AgentDetailOut`, `AgentProjects {lead, member}` of `{slug, key}`. `lastSeenAt` is still undefined in the doc. |
| 3 | `TeamSnapshot.v`: `"1"` or `1` | Unchanged | Doc block still says `v?: "1"`. The wire value is the number 1 (`loops:.../contracts/team.py`, `v: Literal[1]`). The doc tool quotes every literal (`loops:services/api/tests/integrator_doc_tools.py`, `type_text`). |
| 4 | Archived projects cannot be listed by an agent key | Unchanged | `loops:.../api/routers/projects.py`, `list_projects`: 403 unless admin. |
| 5 | Done column holds 30 days, `counts.done` counts all | Unchanged | `DONE_WINDOW_DAYS = 30` (`loops:.../domain/board.py`). `closedSince` on `GET /api/board/{slug}` widens the window; the world does not use it yet. |
| 6 | The chat routes are not documented | Changed (worse) | Still only named under "Endpoints not covered here"; `POST …/messages` and `PUT …/read` still unmentioned; the chat needs three more routes now. |
| 7 | When `/api/features/global/{key}` answers 404 | Unchanged in the doc | Code: 404 for a key the registry does not name; any principal may read it (`loops:.../domain/features.py`, `get_global_feature`; `loops:.../api/routers/inventory.py`). |
| 8 | `DmThread.unreadCount` is not defined | Unchanged in the doc | Code, as the night report found: messages by others after the reader's cursor (`loops:.../domain/dm.py`, `list_threads`). |
| 9 | DM paging with `before` | Unchanged in the doc | Code: `limit` 1 to 100, default 50 (`loops:.../api/routers/dm.py`, `messages`). |
| 10 | Does `bodyMarkdown` keep a fenced block byte for byte | Unchanged in the doc | Code: yes for the block's text. Markdown in becomes a `codeBlock` node with its text; Markdown out writes the fence, the language and the text (`loops:.../richtext/markdown_in.py`, `_code_block`; `markdown_out.py`). A trailing newline is dropped; input is capped at 256 KiB. |
| 11 | `color` and `icon` nullable or "one of" | Unchanged | Both documents as before. |
| 12 | Thin payloads, no batch read | Partly | `GET /api/tickets/lookup` (CL-114) and `crewhub ticket list` (CL-103) exist. Neither returns a card; payloads are as thin as before. |
| 13 | `delivery.updated` repeats neither `recipientId` nor `reason` | Unchanged | `loops:.../domain/deliveries.py`, `_emit_updated`: `{deliveryId, state}` plus `dmThreadId` or `laneAlertId`. |
| 14 | `attachment.added` is never emitted | Unchanged | It is only a ticket history row (`loops:.../uploads/bind.py`). |
| 15 | Payload fields without types | Unchanged in the doc | Code: `episode` and `nudge` are integers (`loops:.../contracts/events.py`, `TicketStalledPayload`); `labelsCleared` is a **list of label names**, `["awaiting-deploy"]`, not a boolean (`loops:.../domain/board.py`). The last one breaks the world (D3). |
| 16 | Event order inside one write | Unchanged | Not documented. |
| 17 | Worker progress lines have no `worker` field in the event | Unchanged | `loops:.../domain/progress.py`, the `ticket.progress` emit: `{ticket, agent, kind, text}`. |
| 18 | `dmThreadId` on chat deliveries | Unchanged | Listed in the catalogue row, not explained. |
| 19 | Release carrier and delivery routing details | Unchanged | Only in code. CL-138 (`fd3cc212`) changed one of them: a publish keeps a person the carrier already waits on. |
| 20 | `project.reordered` lists active slugs only | Unchanged | Doc row as before. |
| 21 | Freshness has no field | Unchanged | The server stores `received_at` (`loops:.../domain/team.py`, `store_snapshot`'s `team_snapshot` row) and does not return it (`load_snapshot`). |
| 22 | A working worker attends all of its lead's tickets | Unchanged | `loops:.../domain/watchdog.py`, `attends`. |
| 23 | Workers map only to `<stem>-lead`; no project-to-worker list | Partly | Unchanged for workers. For registered agents, `projects.member` is now always in `GET /api/agents`. |
| 24 | Roles are `lead`, `router`, `probe` | Unchanged | See L6. |
| 25 | Lane status `done` has no further meaning | Unchanged | Doc as before. |
| 26 | Hand-off also releases held tickets | Unchanged | `team-and-projects.md` still says "Backlog tickets". |
| 27 | Milestone keys are derived | Unchanged | Doc as before. |
| 28 | Avatars: not available | Unchanged | Doc as before. |
| 29 | `ticket comment` and `ticket move` arguments undocumented | Unchanged | `cli.md` lists them as write commands only. Code: `--body`, `--body-file` (a file, or `-` for stdin), `--parent` (`loops:clients/crewhub.py`, the `comment` parser). |
| 30 | `ticket progress` help says "milestones only" | Unchanged | Same help string in `loops:clients/crewhub.py`. `--on PERSON` was added (CL-134) and is described in `agents-and-states.md`, not in `cli.md`. |
| 31 | No read-only key and no CORS | Unchanged | See L1 and L8. |
| 32 | The default chat head is the crewhub lead, not the lead in view | Unchanged | `loops:.../domain/dm.py`, `bubbles`: the pins, else the enabled `is_crewhub_lead` agents. |
| 33 | No single "movable" or "busy" notion | Unchanged | Doc as before ("There is no single agent state"). |
| 34 | `RichBody.doc` has no node schema; when is `bodyMarkdown` absent | Unchanged in the doc | Code: the node is `codeBlock` with `attrs.language` (`loops:.../richtext/profiles.py`), as the world guessed. `bodyMarkdown` is null only for a deleted or a system comment (`loops:.../api/serializers.py`, `comments_out`). |
| 35 | No `closedBy` on tickets | Unchanged | `GET /api/tickets/{ref}/history` answers it: a row with `field: "status"`, `new: "done"`, `actor`, `ts`, newest first (`loops:.../domain/board.py`, `add_history`; `loops:.../domain/history.py`). The world does not read it yet. |
| 36 | Can anything but a person move a ticket to Done | Partly | `agents-and-states.md` now says Done and rejected are a person's act and agents get 403 `human_only_done`; `events.md` still lists "user, agent". Code: `require_human_for_done` refuses every agent (`loops:.../domain/tickets.py`). New: the move may be a rejection. |
| 37 | No lane id across snapshots, no "left" event | Unchanged | Doc as before. |
| 38 | `delivery.updated` cannot tell a retry from a first attempt | Unchanged | See 13. |
| 39 | `delivery.created` names no project | Unchanged | The envelope's `project` is null for a chat delivery. |
| 40 | `uncertain` and `unroutable` carry no reason | Unchanged | `lastError` is on `DeliveryOut`, which only the router may read. |
| 41 | The router role versus operators | Changed | Operators are a flag now (CL-66, CL-104); the doc still names `g-man` and `cl-lead`. A router may also be the launcher (CL-155). |
| 42 | `ticket.archived` carries no card, `ticket.unarchived` no status | Unchanged | Catalogue rows as before. |
| 43 | `quietMinutes` is computed at request time | Unchanged | Doc as before. |
| 44 | No project-level style setting | Unchanged | See section 5.3. |

## 4. Drift in what the world already built

Each row: the file in the world, the source of truth in crewhub-loops, and the fix. D1 to D3 were confirmed by
running the world's validators on payloads built from the crewhub-loops contracts (the validators answered
`expected array, got object`, `expected "1", got 1` and `expected boolean, got array`). None of this affects demo
mode, which never reads a real server.

| # | In the world | Source of truth in crewhub-loops | What goes wrong live | Fix in the world |
| --- | --- | --- | --- | --- |
| D1 | `packages/loops-client/src/types.ts:495` (`projects?: string[]`), `validate.ts:539` (`optional(arrayOf(str))`), `packages/world-model/src/agents.ts:122`, the demo agents (`packages/demo/src/content.ts:38`, `stress.ts:161`) | `loops:.../contracts/agents.py`, `AgentProjects`: `{lead: [ProjectRef], member: [ProjectRef]}`; the shape was the same at `a1bed0f`, behind the flag | `validateAgents` and `validateLoopsSnapshot` fail on every real answer, so the snapshot never loads | Type and validate `projects` as `{lead, member}` of `{slug, key}`; in `listAgents` use both lists; drop the `agents_admin` comments (`types.ts:482`, `source.ts:49`); make the keys required. **Fixed in the world on 2026-10-05** (`packages/world-model/test/loopsDrift.test.ts`). |
| D2 | `packages/loops-client/src/types.ts:248` (`RichBody.v?: "1"`), `validate.ts:348` (`literal("1")`); the demo writes `v: "1"` in system comment bodies (`packages/demo/src/actions.ts:568`) and in every ticket, comment and chat body (`packages/demo/src/store.ts`, `richBody`) | `loops:.../contracts/richtext.py`: `v: Literal[1] = 1`; `loops:apps/web/src/api/types.ts`, `RichBody { v: 1 }` | `validateTicket` fails for every ticket with a body, so every refetch after an event is thrown away; `validateDmMessagesResponse` fails for every message | Accept the number 1 (and, for safety, the string) in `RichBody.v` and the system comment body; the team snapshot already accepts both (`validate.ts:459`). **Fixed in the world on 2026-10-05** (`packages/world-model/test/loopsDrift.test.ts`). The comment body is now validated too (a rich body, a system comment body, or null for a deleted comment). |
| D3 | `packages/loops-client/src/types.ts:617` (`labelsCleared?: boolean`), `validate.ts:594`, `packages/world-model/src/projection.ts:264` (clears all labels) | `loops:.../domain/board.py`, the `ticket.moved` emit: `"labelsCleared": ["awaiting-deploy"]` | Every move of a ticket out of In progress that carried `awaiting-deploy` (every deploy, CL-128) is counted as an invalid event and dropped; the object stays in the old room | Validate a list of strings; remove only the named labels from the card. **Fixed in the world on 2026-10-05** (`packages/world-model/test/loopsDrift.test.ts`). |
| D4 | `packages/loops-client/src/types.ts` (`TicketCard`, `Ticket`, `TicketMovedPayload`) | `read-model.md`: `resolution`, `resolutionReason`, `parked`, `parentKey`, `subtasks`, `hasRuleOverrides`, `readyForDeploy`, `BoardColumn.column`, `ProjectResponse.lead`, `WatchdogResponse.parked`, `DmMessage.attachments`, `ProgressItem.ticketKey` | Nothing fails (unknown keys are dropped), but the world cannot see the facts | Add the keys the world will draw: at least `resolution`, `parentKey`, `subtasks`, `parked`, and `attachments` on `DmMessage` (the chat copy needs it). |
| D5 | `packages/world-model/src/objects.ts:107-110` (celebration), `propRequests.ts:73` (prop import), `projection.ts` (`lastMoves` keeps no resolution) | `loops:.../domain/board.py`: a move to Done by a person may carry `resolution: "rejected"`; a rejection of a Done ticket is `from == to == "done"` | A rejected ticket is celebrated, and a rejected prop request is imported into the town | Keep `resolution` in the move fact and on the card; no celebration and no import when it is `rejected`; draw a rejected object differently in Dispatch. **Fixed in the world on 2026-10-05** (`packages/world-model/test/loopsDrift.test.ts`). A rejected object lies askew in Dispatch with a dark band struck across it, and the demo storyline rejects one ticket. Not covered: a prop that was imported when its ticket reached Done stays in the town if the ticket is rejected afterwards. |
| D6 | `packages/world-model/src/projection.ts` (`ticket.created` makes a card for any ticket), `packages/world-model/src/agents.ts:17` (`TICKET_KEY` has no `.n` part) | `read-model.md` ("Subtasks"): the board leaves subtasks out by default; keys are `CL-111.2` | A subtask appears as an object when its event arrives and vanishes at the next board reload; a worker line that names `CL-111.2` is credited to `CL-111` | Decide one rule (section 8, question 4): either load boards with `subtasks=include` and draw them, or drop every card with a `parentKey`. Extend the key pattern to `loops:.../ids.py`, `TICKET_KEY_RE`. |
| D7 | `packages/loops-client/src/types.ts` (`WORLD_EVENT_TYPES`) | `events.md`: `deploy.updated` is new and reaches an agent key | Skipped, which is correct. A deploy shows only through its `ticket.moved` events | None needed. Add `deploy.updated` only if the world wants a "deploy running" sign. |
| D8 | `packages/loops-client/src/types.ts:57-68` (`DELIVERY_REASONS`), `validate.ts:471` (strict `oneOf`) | `loops:.../contracts/common.py`, `DeliveryReason`: adds `lane`; `DeliveryOut` also gains `laneAlertId` | `validateDeliveryOut` would fail on a lane wake. The host never reads `GET /api/deliveries` (router only), so this is latent | Make `reason` a tolerant string as the event payloads already do; add `lane` to the list. |
| D9 | The chat copy: `apps/world/src/components/bubbles/{Bubbles.tsx,queries.ts,bubbles.css,useMessageViewport.ts}`, `apps/world/src/components/primitives/Menu.tsx`, and the adapter files `apps/world/src/api/types.ts`, `apps/world/src/i18n/en.ts`, `components/Icon.tsx`, `Avatar.tsx`, `board/format.ts` (all `@ a1bed0f`) | `loops:apps/web/src/components/bubbles/` and the `Menu` primitive changed in 19 commits: `Bubbles.tsx` +124 lines, `queries.ts` +42, `bubbles.css` +28, `Menu.tsx` +516; new files `attachments.ts`, `chatSize.ts`, `useChatSize.ts`, `ChatGrip.tsx`; new imports from `richtext/paste`, `ticket/Rich`, `ticket/TicketKeyLink`, `ticket/format`, `settings/testNotification`, and `isSendChord` from `primitives` | `npm run check:copy` **still passes** against `f55d1288` (run: "ok (5 files identical to crewhub-loops)"), because it compares each copy with the commit in its header; it prints four "changed in crewhub-loops after a1bed0f; re-copy it" notes. Only `useMessageViewport.ts` is unchanged upstream. The chat the world shows is no longer the chat crewhub-loops shows: no attachments, no rich messages, no ticket key links, no resizing or focus mode, no Ctrl+Enter | Re-copy at `f55d1288` and extend the adapter: the new files join `COPIES` in `scripts/bubbles-copy.ts`; the rich view, the key link and the upload helper need copies or shims; the demo chat API (`packages/demo/src/api.ts`) must answer `POST /api/attachments`, `GET /api/tickets/lookup` and return `attachments` on messages. This is a real piece of work, not a re-copy (section 8, question 3). |
| D10 | `apps/world/src/styles/kit.css` and `tokens.css` (`@ 79ecfa0`) | `loops:design/kit.css` +448 lines and `loops:design/tokens.css` +2 lines since `79ecfa0` (CL-178 to CL-180 added the chat's sized card, grip, file chip and media card) | The new chat styles depend on kit classes the world's copy does not have | Re-copy both files together with D9. |
| D11 | `packages/demo/src/api.ts:47` (`CLIENT_ID` up to 64 characters) | `loops:.../contracts/dm.py`, `DmMessageRequest`: up to 128 (it was 128 at `a1bed0f` too) | The demo refuses a `clientId` crewhub-loops accepts; the copied chat sends a UUID (36), so nothing shows | Use 128. |
| D12 | `docs/LOOPS_INTEGRATION_PLAN.md` section 2.3 and 3.5: "the `probe` role may only read and PUT the team snapshot, inputs and runtime"; section 2.1: per-project features `releases`, `milestones`, `watchdog_nudge`; the global flag `agents_admin` | `loops:.../auth/deps.py` (`PROBE_WRITES` lists four routes; the fourth, `/api/lane-watch/observations`, is refused for any principal but `lane-watch`: `loops:.../api/routers/lane_watch.py`); `loops:.../domain/features.py` (`REGISTRY` adds `deploy` and `agent_limit`; `agents_admin` is gone) | Documentation only | Update the plan when it is next revised. |

**Wrong enough to matter for the demo.** Only D9: a demo shown next to crewhub-loops today no longer matches
its chat, which the plan calls a hard requirement ("an exact mirror"). Everything else is invisible in demo
mode. D1, D2 and D3 matter on the first live read and must be fixed before phase 1 starts.

## 5. New needs since the first mapping

### 5.1 The prop builder as a ticket

| Need | Can crewhub-loops serve it today | Evidence |
| --- | --- | --- |
| A ticket in a CrewHub project with the label `prop` | Yes, after setup by a person. No project named CrewHub exists in the seed (`loops:config/projects.yaml`); an admin creates it and its `prop` label (`/settings/projects/<slug>/labels`). A label needs an admin or a project-admin right (`identity-and-access.md`, "What an agent key may write"). | Not a code gap. |
| The prop JSON as a comment with a fenced `json` block | Yes. An agent posts it with `crewhub ticket comment REF --body-file -`. The block's text survives byte for byte in `bodyMarkdown`, except a trailing newline (challenge 10). Limit: 256 KiB of Markdown per comment (`loops:.../richtext/markdown_in.py`, `MAX_MARKDOWN_BYTES`). | Verified in code. |
| The world learns about the comment | Yes: `comment.created` reaches an agent key; the world then reads `GET /api/tickets/{ref}/comments` (pages of 50, at most 100). | `events.md`, `read-model.md`. |
| Who may close the ticket | Any person, admin or member; never an agent (403 `human_only_done`). | `loops:.../domain/tickets.py`, `require_human_for_done`. |
| Telling an accepted prop from a rejected one | Yes, but the world does not look yet: `resolution` on the ticket and in the `ticket.moved` payload (D5). | CL-89. |
| Who closed it, when the world was not running | Yes, through `GET /api/tickets/{ref}/history` (challenge 35). To find such tickets after a restart: `GET /api/tickets?project=<slug>&label=prop&status=done&closedSince=<last run>`. | `loops:.../api/routers/tickets.py`, `list_tickets`, `ticket_history`. The `label` filter's value (name or id) is not verified. |
| "Request a prop" from build mode | Partly: the world can open `/new?project=<slug>` in the crewhub-loops web app; the page reads no other query parameter, so the title and label are typed by the person. | `loops:apps/web/src/pages/NewTicket.tsx`. |

No change in crewhub-loops is needed for the prop flow. The world needs D5 and the history read.

### 5.2 The ticket drone

Every status change arrives as `ticket.moved` with `from`, `to` and `position`, and the envelope carries the
ticket's `id`, `key` and `title`. That is enough to fly a ticket the world already holds, which is every ticket
on a loaded board. Three cases lack data:

- **A ticket the world never loaded** (a Done ticket older than 30 days that is reopened, a subtask): the event
  has no `kind`, `priority` or assignee. The world refetches the ticket and flies it when the answer arrives.
- **`ticket.unarchived`** has no status (challenge 42): the flight from the truck waits for the refetch.
- **`ticket.archived`** of a ticket never loaded has no card: no flight. Acceptable.

A deploy and a hand-off move many tickets in one transaction. Each is its own `ticket.moved`, so the drone
logic needs no change, only the budget in 5.6.

### 5.3 Style and cast per building

crewhub-loops has a per-project store, `project_features` (project, key, JSON value, revision), behind
`GET` and `PUT /api/projects/{slug}/features`. It is not usable for a world setting today:

- The keys are a closed registry in code with five entries (`loops:.../domain/features.py`, `REGISTRY`:
  `releases`, `milestones`, `watchdog_nudge`, `deploy`, `agent_limit`). An unknown key is refused.
- The project read path knows `bool` and `int` only (`_state` turns anything that is not `int` into a boolean),
  so a style id cannot be stored even if a key were added.
- Only an admin writes it, and an admin's change emits no event (`events.md`, "Changes that emit no event").

`ProjectOut.color` and `icon` are the only presentation fields, and the world already uses them. So the style
id and the cast id per building stay in the world's own store, which is where ADR 0005 puts presentation
settings. With the host built they move from each browser's town document to the world database, and then
every browser sees the same style. Asking crewhub-loops for a place (L21) only makes sense if the owner wants
the style to be set from the crewhub-loops settings pages.

### 5.4 The day-night drift

Nothing is needed from crewhub-loops. The drift runs on the source clock
(`apps/world/src/world/dayClock.ts`); live, that is the host's clock. One related need is real: the world
compares the probe's `ts` with its own clock to call a snapshot stale (challenge 21), so clock skew between the
probe machine and the host shows as a wrong "stale" label. That is L10, not a day-night need.

### 5.5 The director and `where`

- **`where`** is the world's own command on the host's socket. An agent lane has `CREWHUB_AGENT` set
  (`cli.md`, "Environment"), which is all `crewhub-world where` reads. The only thing crewhub-loops can add is the
  one line in its briefing snippet (L7).
- **The director lane.** crewhub-loops has no route by which an integrator can wake a lane: a delivery is
  created only by crewhub-loops' own events, and a chat message is sent only by a human admin
  (`loops:.../api/routers/dm.py`, `send`: `AdminDep`). The plan's watcher "prompts the lane with one line", and
  the same plan says the host has no Herdr access. Both cannot hold. The plan's own fallback, a direct Haiku
  call from the host, needs nothing from crewhub-loops.
- **If it is a lane after all**, three crewhub-loops rules apply to it: it counts against the agent limits (CL-88);
  the lane watch may raise alerts about it; and it must not be named `<stem>-<x>` in the session of a
  registered `<stem>-lead`, because then it is that lead's worker, appears in the lead's building, and as a
  working worker it "attends" every ticket of that lead, which suppresses stalls
  (`loops:.../domain/watchdog.py`, `attends`).

### 5.6 The frame budget under the real event rate

What crewhub-loops can produce, from its code. No production event log was available, so the real rate is
**not verified**; these are the bounds.

| Source | Rate or burst | Evidence |
| --- | --- | --- |
| `team.updated` | At most one per probe upload (every 30 s), only when the sessions changed; a changed status line counts as a change | `loops:.../domain/team.py`, `store_snapshot` (`changed`) |
| `ticket.progress` | Per ticket, agent and worker at most one every 180 s (60 s for `done` or `question` after another kind) | `loops:.../domain/progress.py`, `RATE_SECONDS`, `FLOOR_SECONDS` |
| Watchdog | One tick every 120 s; at most 5 nudges per tick | `agents-and-states.md`, "Pinned to the code" |
| Ordinary ticket work | One to three events per action (a move, its delivery, a system comment) | `events.md` |
| Archive all Done | One `ticket.archived` per ticket in one transaction, with `batchId` and `batchSize`; the size is the Done column | `events.md`, `ticket.archived` |
| Hand-off of a milestone | Per ticket a `ticket.moved` and a `delivery.created` (and a `ticket.updated` for a held one), then one `milestone.handoff` | `events.md`, `team-and-projects.md` |
| Deploy done | One `ticket.moved` per ticket of the deploy | `loops:.../domain/deploys.py`, `_move_snapshot` |
| Membership removal | One `ticket.updated` per open ticket of that agent | CL-152 |
| Replay after a reconnect | Pages of 500 envelopes, back to back; a reader that stalls for 10 s is dropped | `loops:.../api/stream.py`, `BATCH`, `TIMING.send_timeout` |

So the steady rate is a few events per minute per active lane, and a burst is tens to a few hundred envelopes
at once. The cost for the world is not the envelopes but the refetches: one `GET /api/tickets/{ref}` per
ticket per burst.

**Batch reads that exist today:**

- `GET /api/board/{slug}`: all cards of one project in one call. Best after an archive-all, a hand-off or a
  deploy.
- `GET /api/tickets?project=<slug>&updatedSince=<ts>&limit=200`: every ticket summary changed since a time,
  with all card fields. It misses rule-override changes (they do not move `updatedAt`; `events.md`) and leaves
  subtasks out unless `subtasks=include`.
- `GET /api/tickets/lookup?keys=…`: up to 50 keys, six fields, no assignee.

Recommendation for the host: when more than about ten ticket refetches for one project are pending inside the
250 ms window, replace them with one board read. That keeps the load flat without any change in crewhub-loops.

### 5.7 Agents choosing their own figure through a ticket (later)

It would work like the prop flow: a ticket in the CrewHub project with a label such as `figure`, the agent
posts its choice as a comment, a person closes the ticket. What it needs:

- **Identity.** The author of the comment is the proof of who chose. A registered agent comments under its own
  key. A worker has no principal: it writes with its lead's key, so the comment's author is the lead. The
  builder label (`Crewhub-Builder`) is logged and "never used for a right" (`identity-and-access.md`), and the
  builder key cannot write at all. So a worker's own choice cannot be verified today; the lead would choose for
  its workers, naming each in the comment.
- **A stable key for a worker.** The world keys a worker by session and name. A worker that is closed and
  started again under the same name keeps the figure; under a new name it does not.
- **Cost.** The tokens are spent in the agent's own lane, inside crewhub-loops. Nothing new on the server.

Nothing to ask of crewhub-loops now.

### 5.8 Scale and zones: a level above projects

The world now fits one project and twenty ([the spec addendum "Scale and zones"](superpowers/specs/2026-10-01-world-demo-mode-design.md)).
From about ten projects it draws **districts**, and a district is a **zone**: a level above projects with a name,
an order, an optional colour and emblem, and a look of its own (a season, a planting, a cast).

**What crewhub-loops has today** (verified at `f55d1288`): no level above projects.

- `projects` has no parent column, and no table groups projects. `ProjectOut` (`loops:.../contracts/projects.py`)
  has no field for one.
- What exists next to it is **order**, not grouping: the admin's order of active projects (`projects.sort`,
  `PUT /api/projects/order`, the event `project.reordered` with `{slugs}`, `orderRevision` on the list) and each
  person's own sidebar order and favourites (`user_project_prefs`, `GET` and `PUT /api/me/sidebar`, CL-16). The
  favourites are one fixed section per person, not groups a team shares.
- Labels belong to tickets. `herdrSession` on a project is a fallback route, not a grouping. Agents belong to
  projects (`agent_projects`), not to anything above them.

**What the world does without it.** Zones live in the world's own store: today the town document in each
browser, later the world database. A building's zone resolves in one place
(`packages/world-model/src/zones.ts`, `resolveZones`), in this order:

1. a manual assignment in the town document (build mode);
2. the project's group from the source (`groupOf` in `packages/loops-client/src/groups.ts`);
3. the one default zone.

Item 2 is already wired, in the shape of proposal L22 below: `ProjectOut.groupId`, a `ProjectGroup` type, a
validator and `listProjectGroups()` on the source seam. Only the demo fills it, marked as a future field in
code. A source for a real crewhub-loops lists no groups, so every project lands in the default zone until a
person makes zones by hand.

The cost of doing without: **two people see different districts.** One browser's zones are not another's, so
"the client work is in the east district" means nothing to a colleague. The world database fixes that for
people who use the world, but the crewhub-loops board still shows one flat list, and the two never agree on
what belongs together.

**What it gains with L22.** Everyone sees the same districts, because the grouping is a fact of the
installation and arrives like every other fact. The board, the sidebar and the project pickers in crewhub-loops
can group the same way, so a district in the world and a section in the sidebar are the same thing under the
same name. For the world it is a mapping, not a redesign: the resolver's second step starts answering.

**Naming.** The proposal says "group" and means nothing more by it. Whether crewhub-loops calls it an area, a
workspace, a team or a category, and what else it hangs on it later (members, defaults, rights), is for
crewhub-loops to decide. The world needs only the shape in L22.

**The look stays the world's.** A zone's look (style id, style options, cast id) is presentation, like the
style and cast per building in 5.3, and stays in the world's store: ADR 0005 puts presentation settings there.
The group's `color` and `icon` are the exception, as on `ProjectOut`: the world draws them on the district's
gate and on each building's sign. If crewhub-loops ever offers a place for a client's per-project settings
(L21), the same place per group could hold a zone's look, so the look is shared without the world database.
That is the only link between the two proposals; L22 does not need L21.

## 6. What is still missing: the list for `cl-lead`

Ordered by priority. Ids continue the plan's L-series; L1 to L8 keep their ids. "Phase" is the world's phase
from section 1. The second list needs no code in the API: the server already behaves as described and only the
documents (or the tool that writes them) are wrong or silent.

### 6.1 crewhub-loops must change code

| Id | Ask | Why the world needs it; what breaks without it | Smallest change | Priority | The world's workaround until then |
| --- | --- | --- | --- | --- | --- |
| L8 | Answer CORS, with credentials and never `*`, for the configured CrewHub origins on the routes the chat calls. | The chat runs in the world's page with the person's session. Without CORS the browser refuses every answer, so phase 2 cannot start. The route list is longer than the plan's: `GET /api/features/global/bubbles`, `GET` and `PUT /api/me/bubbles`, `GET /api/dm/threads`, `GET` and `POST /api/dm/threads/{agent}/messages`, `PUT /api/dm/threads/{agent}/read`, `GET /api/agents`, `GET /api/agents/{name}/summary`, `GET /api/events/stream`, and now `POST /api/attachments`, `GET /api/attachments/{id}/raw` and `GET /api/tickets/lookup`, plus `GET /api/auth/me` so the dock knows who is signed in. | A small ASGI middleware next to `HostOriginGuard` in `loops:.../api/security.py`: for an `Origin` in `CHL_ALLOWED_ORIGINS` and a path on the list, add `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Credentials: true`, `Vary: Origin`, and answer the pre-flight `OPTIONS` (refused today: `identity-and-access.md`, "There is no CORS"). Document it in `identity-and-access.md`. The open point in `loops:docs/integrators/README.md` stays: the cookie is `SameSite=Lax`, so it works for two ports on one host name and not for two host names. | **Blocker for phase 2** | None without a decision: a relay in the host that forwards the person's cookie (section 8, question 1). |
| L1 | Add a read-only viewer key: safe methods only, on the read-model routes and the two event routes. | The host's key today is a `probe` key, which may overwrite the team snapshot every client shows, or a `lead` key, which may write tickets. A bug or a break-in in the host must not be able to write. | Copy the builder key: a seed flag on a `probe` agent (as `builder_read` in `loops:config/agents.yaml`), a table like `BUILDER_READ_ROUTES` in a new `loops:.../auth/viewer.py` that lists the `GET` routes marked `yes` in `read-model.md` plus `/api/events` and `/api/events/stream`, checked in `current_principal` (`loops:.../auth/deps.py`), and the same database-unchanged sweep test as `test_builder_read.py`. No project scoping is needed. | Needed before production (phase 1 can start without it) | A `probe` key in a host that sends `GET` only, with an allow-list of paths in one file. |
| L10 | Put the server's receive time of the team snapshot on `GET /api/team` (`receivedAt`, or a boolean `fresh`). | The world must grey out agents when the snapshot is old. It can only compare the probe's `ts` with its own clock, so clock skew makes the world and the watchdog disagree, and a dead probe is noticed late. Already finding 10 in `loops:docs/integrators/README.md`. | `loops:.../domain/team.py`, `load_snapshot`: read the `received_at` column that `store_snapshot` already writes, and add `receivedAt?: string` to `TeamSnapshot` in `loops:.../contracts/team.py` (a server-side addition like `lead`). | Needed for phase 3 | Judge by `ts` against the host's clock; label "stale since HH:MM". |
| L3 | Add `ticketKey` (nullable) to each agent of `GET /api/team`: the in-progress ticket the lane or worker is credited to. | Which ticket lies on which desk is the core picture of a building. The world re-parses `contextLine` with its own copy of the key rule; the server already applies the rule for progress lines and for lane alerts. | `loops:.../domain/team.py`, `load_snapshot`: reuse the key rule of `loops:.../domain/progress.py` (`key_pattern`, the one that turns a status line into a line on a ticket) and add `ticketKey?: string | null` to `TeamAgent` in `loops:.../contracts/team.py`. | Needed for phase 3 (the workaround is acceptable) | Parse `contextLine` in `packages/world-model/src/agents.ts`; label the desk ticket as an inference. |
| L14 | Repeat `recipientId` and `reason` in the `delivery.updated` payload. | A viewer that missed `delivery.created` (it started later, or reconnected after a long gap) cannot place the letter: `GET /api/deliveries` is for the router only. | `loops:.../domain/deliveries.py`, `_emit_updated`: add the two keys from the row it already holds; add them to `DeliveryUpdatedPayload` in `loops:.../contracts/events.py` and to the catalogue row in `events.md`. | Needed for phase 4 (the workaround is acceptable) | Draw the outcome at the mailbox only when the world saw the `delivery.created`. |
| L4 | Put the new `assigneeId` and `waitingOnId` in `ticket.updated` when `changed` names them. | These two changes move an object to another desk or put a name tag on it. Today each costs a ticket read before the picture can change. | `loops:.../domain/tickets.py`, the `ticket.updated` emit in the field-edit path: add the two keys when `assignee` or `waiting_on` is in `changed`; document in `events.md`, "ticket.updated payloads". | Nice to have | One coalesced `GET /api/tickets/{ref}` per ticket, or a board read for a burst (5.6). |
| L15 | Add `worker` to the `ticket.progress` payload when the line is a worker's. | The event text is `"<worker>: <line>"` and the prefix collides with the kind prefixes (`klaar:`, `vraag:`). The world guesses which prefix is a worker name. The stored row already has the column. | `loops:.../domain/progress.py`, the `ticket.progress` emit: add `"worker": worker` (null for the lead's own line); `events.md` row. | Nice to have (phase 3) | The guess in `lineWorker` (`packages/world-model/src/agents.ts`). |
| L16 | Let an agent key (or the viewer key of L1) list archived projects. | A host that starts after a project was archived never learns it exists, so its boarded-up building is missing until someone restores it. | `loops:.../api/routers/projects.py`, `list_projects`: allow `includeArchived=true` for agents, or for the viewer flag only. | Nice to have (phase 3) | The world database remembers every slug it has seen and reads each with `GET /api/projects/{slug}`. |
| L17 | Add `status` to the `ticket.unarchived` payload. | The drone's flight back from the truck waits for a refetch because the event does not say which room the ticket returns to. | The three `ticket.unarchived` emits in `loops:.../domain/archive.py` and `loops:.../domain/releases.py`; `events.md` row. | Nice to have | Refetch, then fly. |
| L20 | Mark the tutorial's sample project on `ProjectOut` (for example `tutorial: true`). | While a tutorial run is open its project is in `GET /api/projects` like any other, so the world builds a building for a project that reaches no agent. | `loops:.../contracts/projects.py`, `ProjectOut`, filled from `projects.tutorial_run_id`. | Nice to have | None; the building appears and disappears with the run. |
| L6 | A role attribute on agents that a client can read (or a documented naming convention). | Rooms by role rest on name rules (`<stem>-design-n`, `<stem>-analyst-n`). A worker named outside the convention lands in the workers room. | Write the naming convention for workers (`<stem>-dev-n`, `<stem>-design-n`, `<stem>-analyst-n`) into `team-and-projects.md` and pin it with a test, so the world's rule cannot drift from the leads' practice. A stored role field is the larger step and is not asked now. | Optional | Name rules plus a per-agent override in the world. |
| L2 | Publish JSON Schemas for the envelope and the read models the world loads (`ProjectOut`, `BoardResponse`, `TeamSnapshot`, the agents answer, `Ticket`, `CommentOut`, `WatchdogResponse`), kept in step by a test. | The world's hand-written validators had three mistakes (D1 to D3) that no test could catch. A published schema would have caught all three. | Write `model_json_schema()` of those models to `loops:docs/integrators/schemas/` from `loops:services/api/tests/integrator_doc_tools.py`, with the same drift test as the schema blocks. This needs `response_model` on the routes that return a `dict` today (`GET /api/agents`). | Nice to have once L9 and L11 to L13 are done | Hand-written validators, checked against fixtures recorded from a real server (section 7). |
| L21 | A per-project place for a client's presentation settings. | Only if the owner wants the building style to be set in crewhub-loops (5.3). | A `str` feature type with a pattern in `loops:.../domain/features.py` and two registry keys, or a separate small key-value route. | Only on the owner's decision; not recommended | The world database. |
| L22 | **Project groups**: a level above projects. A group has `id`, `slug`, `name`, `order`, and optional `color` and `icon` (the same value sets as a project's). `ProjectOut` gains `groupId` (nullable). A list route, `GET /api/project-groups` answering `{groups, orderRevision}`, readable by every principal that may list projects (and by the viewer key of L1). Events: `project_group.created`, `project_group.updated` and `project_group.deleted` (`{changed, old, new}` like the project events), `project_group.reordered` (`{ids}`), and a project moving between groups as `project.updated` with `changed: ["groupId"]` and the old and new id. The name is neutral on purpose: crewhub-loops decides whether it is an area, a workspace, a team or a category. | With ten or more projects the world draws districts (5.8). Without a group in crewhub-loops, zones live in each browser's town document, so two people see different districts and the board cannot group the same way. With it, everyone sees the same districts and the board, the sidebar and the pickers can use the same grouping. | A table `project_groups` (id, slug, name, sort, color, icon, revision) and a nullable `projects.group_id` (deleting a group sets it to null); the field on `ProjectOut` in `loops:.../contracts/projects.py`; `groupId` among the editable fields of `PATCH /api/projects/{slug}` (`loops:.../api/routers/projects.py`), so the move emits the existing `project.updated`; admin routes to create, edit, delete and reorder a group, the reorder as compare-and-swap like `PUT /api/projects/order`; rows in `events.md` and blocks in `read-model.md`. A group holds no rights and no members in this proposal. | Nice to have; worth it from about ten projects | Zones in the world's own store (`resolveZones`), assigned by hand in build mode. The world already reads this shape (`packages/loops-client`, marked as future); only the demo fills it. |
| L5 | Payload-free chat envelopes for a viewer key. | The scene shows no chat activity. Accepted by the owner. | `loops:.../api/stream.py`, `event_visibility_sql`. | Optional, not asked now | The chat dock shows chat; the scene does not. |

### 6.2 crewhub-loops only needs to document what it already does

| Id | Ask | Why; what went wrong without it | Where | Priority | The world's workaround until then |
| --- | --- | --- | --- | --- | --- |
| L9 | Make the schema blocks print integer constants as numbers. | `read-model.md` says `v?: "1"` for `RichBody`, `TeamSnapshot`, `SystemCommentBody` and `ActivityItem`; the wire value is the number 1. The world built a validator from the block and it rejects every real body (D2). | `loops:services/api/tests/integrator_doc_tools.py`, `type_text`: quote only string literals. Regenerate the blocks. | **High: fix first**, it is one line and removes a trap | The world accepts both. |
| L11 | Give `GET /api/agents` a schema block, and say what `lastSeenAt` means. | The doc names the keys but not their shapes; the world guessed `projects` wrong (D1). The chat's presence dot uses `lastSeenAt`. | `read-model.md`: blocks for `AgentsDetailResponse`, `AgentDetailOut`, `AgentProjects`, `AgentLane`. Setting `response_model` on `list_agents` (`loops:.../api/routers/agents.py`) lets the existing tool write them. | High | Read the shape from `loops:.../contracts/agents.py`. |
| L13 | Type the payload columns of `events.md`. | At least: `labelsCleared` is a list of label names (D3); `renumbered` is `true` when present; `episode` and `nudge` are integers and what `nudge` counts; the shapes of `relation`, of `milestone: {old, new}` and of `old`/`new` on project and milestone events. | `events.md`, the catalogue and "ticket.updated payloads". Finding 1 in `README.md` (a type registry with payload schemas) would do this by construction. | High | Read the emitting code. |
| L12 | Document the chat routes as an integrator surface for a person's session. | The world's chat was specified from router and domain source. Undocumented: `GET` and `PUT /api/me/bubbles` (default pin, at most 100, unique, enabled leads), `GET /api/agents/{name}/summary`, `GET /api/features/global/{key}` (404 for an unknown key, any principal may read), `POST /api/dm/threads/{agent}/messages` (`clientId` pattern, the same `clientId` with another body is 409, refusals `dispatch_gated`, `key_like`, `attachment_foreign`), `PUT …/read` (forward-only cursor), paging with `before` (newest page first, oldest first inside a page, a foreign cursor is 400), what `unreadCount` counts, and the attachment upload. | A section in `read-model.md` with schema blocks for `BubblesResponse`, `AgentSummaryResponse`, `GlobalFeatureResponse`, `DmMessageRequest`, `DmAttachment`; the list of global flags there also omits `lane_wakes` (`loops:.../domain/features.py`, `GLOBAL_REGISTRY`). | Needed for phase 2, together with L8 | Read `loops:.../api/routers/dm.py` and `domain/dm.py` at each re-copy. |
| L18 | Say in the documents how a client learns who closed a ticket, and who can. | Challenges 35 and 36. The facts exist: `GET /api/tickets/{ref}/history` has a row `field: "status"` with the actor; only a person can move to Done or reject. `events.md` still lists the actors of `ticket.moved` as "user, agent" with no note. | `read-model.md`: the values of `HistoryItem.field`; `events.md`: one sentence on the `ticket.moved` row. | Needed for phase 5 (the prop import after a restart) | The world checks `actor.kind === "user"` on the event. |
| L19 | Document `crewhub ticket comment` and `ticket progress` in `cli.md`, and correct the help string. | The prop-builder skill's steps were read from the client's source. `ticket progress` says "milestones only" in its help while `agents-and-states.md` describes it as the general status line. | `cli.md` (arguments of `comment`: `--body`, `--body-file`, `--parent`; of `progress`: `--kind`, `--on`); `loops:clients/crewhub.py`, the `progress` parser's help. | Nice to have | The skill carries its own copy of the steps. |
| L7 | One line in the agents' briefing snippet that points to `crewhub-world where`. | Agents learn that they can look themselves up. | `loops:docs/agents-briefing-snippet.md`. | Needed for phase 6, and only once the command exists | None needed before phase 6. |

Smaller documentation points, no id: the event order inside one write (challenge 16), the meaning of
`dmThreadId` on chat deliveries (18), the release carrier rules (19), the hand-off releasing held tickets (26),
and the places that still name `g-man` and `cl-lead` as the operators (41).

## 7. What the world should change on its own side

Not crewhub-loops' work. In order.

1. Fix D1, D2 and D3 in `packages/loops-client` and `packages/world-model`, with a test per shape built from
   the crewhub-loops contract, and make the demo emit the corrected shapes. Done on 2026-10-05.
2. Add `resolution` to the card and to the move fact; no celebration and no prop import for a rejected ticket
   (D5). Done on 2026-10-05.
3. Decide and implement the subtask rule and extend the ticket key pattern (D6).
4. Record validator fixtures from a real crewhub-loops (`make dev` and its seed) for every response the host
   reads, and run the validators on them in `npm test`. This replaces fixtures written from schema blocks, the
   weakness challenge 1 named.
5. Re-copy the chat and the kit at one crewhub-loops commit and extend the adapter and the demo chat API (D9,
   D10, D11), or record the decision to freeze the copy (section 8, question 3).
6. In the host, when it is built: a loopback TCP transport from the start (the Mac cannot use the socket); the
   tail recipe of `events.md` or stream-first, one of the two; a board read instead of many ticket reads in a
   burst (5.6); `closedSince` on the board when a full Done count is wanted (challenge 5); the history read for
   prop tickets closed while the host was down (5.1).
7. The host receives the crewhub-loops session cookie on every request from a signed-in browser when both run
   on one host name, because a cookie is scoped by host name and not by port. The host must never log or store
   request cookies, whatever the answer to question 1 is. Plan section 3.5 ("no loops credential ever reaches
   the browser") should say this.
8. Update the plan (D12) and move L9 to L21 into its section 9 once the owner has chosen. (L22 is already
   there: it was written with the zones.)

## 8. Open questions for the owner

1. **The chat without L8.** Wait for CORS in crewhub-loops, or let the host relay the chat routes with the
   person's cookie? The relay needs no change in crewhub-loops (a request without an `Origin` header passes the
   guard), but then the host handles a person's session and forwards writes, which ADR 0005 rules out ("the host
   never writes").
2. **Start phase 1 on a `probe` key, or wait for L1?** The risk is confined to the team snapshot while the host
   sends only `GET`.
3. **Re-copy the chat now or freeze it at `a1bed0f` for the demo?** The re-copy brings attachments, rich
   messages and ticket key links, and with them more files to copy or shim and more routes in the demo API.
4. **New ticket facts: which ones does the world draw?** Subtasks (hide them, or draw them as small objects by
   their parent), rejected tickets (a different look in Dispatch), tickets ready for deploy (their own spot, or
   the desk with the rocket), parked tickets.
5. **Style and cast per building: world database only (recommended), or also settable in crewhub-loops (L21)?**
6. **The director: a direct Haiku call from the host, or a lane?** A lane needs either Herdr access in the host
   or a new way in crewhub-loops to wake a lane from an integrator; neither exists.
7. **The CrewHub project in crewhub-loops.** Who creates it, which agent leads it, and who may close prop
   tickets (any person can today).
8. **Which of section 6 goes to `cl-lead` now?** The proposal: L9, L11 and L13 at once (documentation; they remove the cause of
   three real bugs), L8 with L12 when phase 2 is scheduled, L1 and L10 before production, the
   rest when a phase asks for it.

9. **Project groups (L22): ask crewhub-loops for them, and under which name?** The world works without them
   (zones made by hand, per browser, later in the world database). Asking makes the districts the same for
   everyone and lets the crewhub-loops board group the same way. The proposal's shape is small and holds no
   rights; the name ("group") is a placeholder for whatever crewhub-loops wants the level to be.