# Demo content and storyline

Everything here is fiction, played by `@crewhub/demo` in the browser. It has exactly
the shapes crewhub-loops serves (`docs/integrators/` at loops commit `a1bed0f`, with the agents answer, body
versions, `labelsCleared` and a ticket's `resolution` as the loops code has them at `f55d1288`), so
the world cannot tell it from a live host. Every surface that shows it labels it
as demo. The data lives in `src/content.ts`; the storyline lives in
`src/script.ts`.

This file describes **Small team**, the default scenario, in full. The other scenarios (the picker on the Demo
chip, or `?scenario=<id>`) are in [Scenarios](#scenarios) at the end.

## People and agents

| Id | Kind | Role | Notes |
|---|---|---|---|
| `nicky` | person | admin | Plans, reviews and closes tickets; DMs `g-man`. |
| `sam` | person | member | Comments, asks for the broken sign, unarchives MK-5. |
| `g-man` | agent | lead | `isCrewhubLead: true`, the main agent; answers the DM. Leads no project. |
| `cr-lead` | agent | lead | Leads CR. |
| `cl-lead` | agent | lead | Leads CL **and** OPS: one real avatar, one proxy. |
| `marky` | agent | lead | Leads MK. It has no `-lead` name, so no worker maps to it. |
| `analyst` | agent | lead | A member of CL and MK (`projects.member`); holds in-progress tickets in CL (CL-40) and MK (MK-12): it works in two buildings. |
| `ux-lead` | agent | lead | A member of MK; works there through MK-9; a delivery to it ends `unroutable`. |
| `postman` | agent | router | Claims and forwards every delivery. |
| `team-probe` | agent | probe | Uploads the team snapshot. Never shown. |

The herdr session `ekinsol` holds every lead lane, the postman and these workers.
The server adds `lead` to each worker by the longest `<stem>-lead` stem:

| Worker | `lead` | Room by name rule |
|---|---|---|
| `cr-dev-1`, `cr-dev-2` | `cr-lead` | workers |
| `cr-design-1` | `cr-lead` | design |
| `cr-scout` | `cr-lead` | workers (outside the convention) |
| `cl-dev-1`, `cl-dev-2` | `cl-lead` | workers |
| `cl-analyst-1` | `cl-lead` | analyst |
| `cl-dev-3` | `cl-lead` | joins at 3:10 as `unknown`, works, leaves at 9:28 |

## Projects

| Slug | Key | Name | Colour | Icon | Lead | Features | Tickets at start |
|---|---|---|---|---|---|---|---|
| `crewhub` | CR | CrewHub World | coral | home | `cr-lead` | milestones, releases, watchdog nudge | 18 open, 4 archived in release 3 |
| `crewhub-loops` | CL | crewhub-loops | circle | inbox | `cl-lead` | milestones, releases | 17 |
| `marketing` | MK | Launch & Marketing | tangerine | spark | `marky` | milestones | 13 |
| `ops-tooling` | OPS | Ops & Tooling | ink | bot | `cl-lead` | none | 4; archived 12 days before the start |

Every active project has tickets in all five statuses, and all four kinds occur.
Every Done ticket was closed within the last 30 days, so the Done column is the
whole Done count.

- **Blocked:** CR-28 (planned) is blocked by CR-21. It is released when CR-21 goes
  to review at 2:15.
- **Held:** MK-15 is a held backlog ticket in MK-M1. The hand-off releases it.
- **Waiting on a person, in progress:** CR-23 waits on Nicky (`waitingOnHuman`).
- **Review, waiting on Nicky (name tag):** CR-17, CR-18, CL-80 and MK-7.
- **Labels:** `awaiting-deploy` is on CL-45, and CL-76 gets it at 1:26. `release` is
  on the carriers. `prop` is on the prop tickets. There are also project labels:
  `renderer`, `pathfinding`, `api`, `docs`, `copy`, `launch` and `ci`.
- **Milestones:** CR-M2 "Walkable town" is active, with a target of 2026-10-09 and
  5 tickets. CL-M3 "Integrator docs" is active and completes at 8:40. MK-M1
  "Launch week" is planned; it becomes active and is handed off at 7:00. CL-M4
  "Host stream resume" is created at 9:40.
- **Releases:** CR release 3 (0.3.0, "Town skeleton") is a draft with carrier
  CR-19. The script publishes it. CL release 5 (0.9.0) is created during the
  script and archives CL-70, CL-71 and CL-72: the truck.

## Prop requests

A prop is requested as a CR ticket labelled `prop`, of kind task, titled
"Prop: <thing>". The builder posts the prop as a **comment** with a fenced `json`
block. We chose a comment because `comment.created` is emitted and
`attachment.added` never is. Each flow runs like this:

1. The ticket is created by a person (or already sits in the backlog).
2. Nicky plans it, which creates a `planned` delivery.
3. `cr-lead` takes it and moves it to in progress.
4. A worker line reads "building the prop".
5. The prop comment is posted, and the ticket moves to review.
6. Nicky moves it to done.

| Ticket | Thing | Builder | JSON |
|---|---|---|---|
| CR-37 (created 0:26 by Nicky) | a reading nook with a lamp | `cr-design-1` | `src/props/reading-nook.json` |
| CR-35 (backlog at start) | a tall fern for the lobby | `cr-dev-1` | `src/props/tall-fern.json` |
| CR-38 (created 8:20 by Sam) | a broken sign | `cr-scout` | `src/props/broken-sign.json`, **invalid on purpose**: a part lies far outside its 1 × 1 footprint |

`createPropRequest(thing)` runs the same flow from the current position, for
build mode's "Request a prop" action (demo only). The lead builds the placeholder
prop itself (a small crate).

The JSON follows the `crewhub-prop/1` shape as known tonight. The format and its
validator belong to `packages/world-engine/src/props.ts`.

## Storyline (16:00 per loop at 1x, then it loops)

The times are the authored ones; a seeded jitter of ±1.2 s moves them a little.
Something happens every 2 to 11 s. The only exception is one deliberate quiet
stretch around 15:30, which makes the stream send a heartbeat. The probe uploads
at 0:18, 0:48 and so on, and emits `team.updated` only when something changed.
The poll re-reads the team at 0:03, 0:33 and so on, so a `team` message goes out
every 30 s.

| Time | What happens |
|---|---|
| 0:00–0:30 | Progress lines on CR-21 (a worker line from `cr-dev-1`), CL-81, MK-9 and CL-40. `cr-scout` starts working. Nicky creates **Prop: a reading nook** (a `new_ticket` delivery to `cr-lead`, then claimed and forwarded). |
| 0:40–1:10 | Nicky plans the nook (a `planned` delivery). `cr-lead` sets CR-20 as waiting on Nicky and asks Nicky to try it. `cr-lead` takes the nook and fetches it; `cr-design-1` "building the prop". |
| 1:14–1:56 | Sam comments on MK-7 (a `comment` delivery to `marky`). `cl-lead` labels CL-76 `awaiting-deploy`. Nicky answers the question on CR-23 (`wait_reply`: waiting on a human ends). `marky` fetches MK-11. |
| 2:00–2:56 | CR-21 goes to review, which releases the block on CR-28 (`changed: ["blocked"]` and an `unblocked` delivery). Sam and `cr-lead` comment on CR-21 within a minute: the meeting inference. The nook prop comment is posted and the nook moves to review. The watchdog opens `stalled` on CR-24: quiet 22 min, nudge 1, and a `stalled` delivery. |
| 3:04–3:52 | `cl-lead` comments on the unassigned CL-83, which auto-assigns it. `cl-dev-3` appears as `unknown`, then starts working. Nicky closes the nook (**prop materialises**) and CR-18. Nicky DMs `g-man` (a `dm` delivery). |
| 4:00–4:54 | Nicky plans the fern. `g-man` answers (`dm.created` and `dm.answered`). `cr-dev-2` is `done` (herdr's word, not the ticket's). CL-81 goes to review with a `done` line. |
| 5:00–5:56 | **OPS is restored** and its building opens. Nicky comments on CL-80, a review ticket that waits on Nicky: a **review reply** sends it back to in progress. `cl-lead` fetches OPS-4, so its real avatar moves to OPS. OPS gets a new description (`project.updated`). The **projects are reordered**. CR-22 goes to review. |
| 6:10–6:54 | `cr-lead` posts a progress line on CR-24, and the watchdog closes the stall (`activity`). CL-80 goes back to review, waiting on Nicky. The fern prop comment is posted and the fern moves to review. At 6:49 Nicky **turns CR-25 down** (Done with `resolution: "rejected"` and a reason): it goes from Planning to Dispatch without a celebration. |
| 7:00–7:56 | MK-M1 becomes active (`milestone.updated`). Nicky **hands off** MK-M1 to `marky`: three tickets move from backlog to planned with `planned` deliveries, and MK-15 is no longer held. `cl-dev-2` is **blocked** on a permission prompt, with the rest of CL idle. Nicky closes the fern (**prop materialises**). |
| 8:00–8:44 | The watchdog opens **attention** on CL-44. Nicky archives MK's Done column: three `ticket.archived` share one `batchId` (**the truck**). Sam asks for **Prop: a broken sign**. CL-81 and CL-80 are done, and **CL-M3 completes**. |
| 8:50–9:53 | `cr-scout` builds the sign. `cl-dev-2` works again, and the watchdog closes the attention (`attending`). Sam unarchives MK-5 and comments; that delivery ends **`uncertain`** (a system comment). `cl-dev-3` leaves the snapshot. Nicky assigns MK-16 to `ux-lead`; that delivery ends **`unroutable`** (a system comment). Nicky creates **CL-M4** and attaches CL-84 and CL-86, then plans CL-86. |
| 10:04 | Nicky asks `cr-lead` to publish release 3 (`release.updated`, `publish_requested`, a `release` delivery). |
| **10:10–15:40** | **The probe is silent**: no upload between 9:48 and 15:48. From about 14:48 the last snapshot is older than 5 minutes: the world must show "stale since 09:48" and grey the lanes, and `GET /api/watchdog` reports `unavailable:snapshot_stale`. Work goes on meanwhile. |
| 10:20–10:34 | `cl-lead` blocks CL-82 on CL-44 (two `changed: ["relation"]` events). `cr-lead` **publishes 0.3.0**: the carrier moves to review, waiting on Nicky, then `release.published`. |
| 11:12 | Nicky **creates CL release 5** (0.9.0). Carrier CL-88 is in progress for `cl-lead`. CL-70, CL-71 and CL-72 are archived with reason `release`, sharing one batch: the truck again. A `release` delivery goes out. |
| 11:34–12:58 | Nicky closes CR-20, the carrier CR-19 and MK-7, and the broken sign (**the invalid prop shows its labelled error object**). The analyst sends CL-40 to review. A `question` line on MK-12 is answered by Nicky. |
| 13:06–14:10 | CR-23 goes to review. OPS-4 is done, and **OPS is archived again** (`project.archived`), so the loop ends where it began. CL-76 is done. |
| 14:26–15:56 | Chatter. Around 15:30 it is quiet on purpose (a heartbeat). At 15:48 the probe is back: `team.updated`, and the picture is fresh again. |
| 16:00 | The loop ends. A new `snapshot` of the initial state goes out, with its cursor 100 000 above the previous loop's. |

## Time, seq and determinism

- The demo clock is `2026-10-01T08:00:00Z` plus the loop's position, and each loop
  starts one duration later (loop k starts at 08:00 + 16k min). Demo time never
  runs backwards, except when a person seeks back.
- Reset k (the first start, each loop, each seek) starts its seqs at
  `4700 + k × 100000`. So seq keeps increasing across loops and seeks within one
  stream.
- The same seed produces a byte-identical stream, at any speed. A different seed
  changes only the jitter.

## Scenarios

A scenario is an installation (`DemoContent`) plus a storyline (`Story`), played by the same `createDemoSource`.
The world offers them on the Demo chip and reads `?scenario=<id>`; choosing one reloads the page. Each scenario
keeps its own town document (`DemoScenario.townKey`, the name of the browser database), so plots, placements and
zones never mix. Every scenario is deterministic and seeded like the default one, and every message passes the
same loops-client validators.

| Id | Name | Installation | Loop | Town document |
|---|---|---|---|---|
| `fresh` | Fresh install | no project; Nicky, `g-man`, `fn-lead`, the postman, the probe | 10:00 | `crewhub-world.fresh` |
| `one` | One project | Pocket Garden (PG): `pg-lead`, `pg-dev-1`, `pg-design-1`, 11 tickets | 10:00 | `crewhub-world.one` |
| `small-team` | Small team (default) | the four projects above | 16:00 | `crewhub-world` |
| `studio` | Studio | twenty projects in four groups, 20 leads and 56 workers | 16:00 | `crewhub-world.studio` |

### Fresh install

Crewhub-loops right after the installer. The first snapshot has no project, no board and two lanes (`g-man` and the
postman). The lead agent `fn-lead` is already registered, because loops' onboarding registers a lead before it
asks for a project; it has no lane yet.

| Time | What happens |
|---|---|
| 0:14–0:30 | Nicky writes to `g-man` ("Loops is installed. Are you there?"); the postman claims and forwards it; `g-man` answers. |
| **1:00** | **Nicky creates Field Notes (FN):** `project.created` with the payload loops writes (`slug`, `key`, `leadId`, `changed`, `old: {}`, `new` with the initial values). The projection refetches the project and its empty board. |
| 1:10–2:12 | `fn-lead`'s lane starts. Nicky creates FN-1 "Write the README" (a `new_ticket` delivery) and plans it; the lead takes it. |
| 2:30–3:24 | FN-2 "List notes by day" and the bug FN-3 are created. `fn-dev-1` joins as a worker. |
| 3:40–4:30 | FN-1 goes to review, waiting on Nicky; the lead starts FN-2; Nicky closes FN-1. |
| 5:10–7:22 | **Prop: a welcome mat** (FN-4), the usual prop flow, built by `fn-dev-1`. |
| 7:34–9:30 | FN-3 is planned; a question and an answer on FN-2; FN-2 goes to review and Nicky closes it. |
| 10:00 | The loop ends and the installation is empty again. |

"Request a prop" before 1:00 is accepted and starts when the project exists. The chat works from the first second.
A real fresh crewhub-loops also has its built-in Inbox project; the demo leaves it out, and how the world should
show the Inbox is an open question.

### One project

Pocket Garden with a lead and two workers: work on PG-5 and PG-6, a review reply on PG-4 (1:48), the prop from the
backlog (PG-11, from 2:30), a `stalled` episode with a nudge on PG-5 (5:20 to 6:10), a new bug from Nicky (7:14),
and a question that waits on Nicky (8:10, answered at 8:46).

### Studio

Twenty projects, five in each of four groups:

| Group | Projects | District look in the town seed |
|---|---|---|
| Apps | Pocket Garden, Field Notes, Trail Maps, Recipe Box, Bird Log | season `summer`, planting `market`, cast `classic-bots` |
| Platform | Accounts, Sync Engine, Billing, Notifications, Search | season `october`, planting `waterside`, cast `overgrown-bots` |
| Brand | Website, Launch Week, Help Centre, Newsletter, Brand Kit | season `spring`, planting `orchard`, cast `sprouts` |
| Lab | Voice Notes, Offline Mode, Widgets, Importers, Translations | season `october`, planting `meadow`, cast `potlings` |

**The groups are a future field (proposal L22 "project groups").** Crewhub-loops has no level above projects
today. The demo sends it in the shape the world would like loops to offer: `groupId` on `ProjectOut`, the list as
`LoopsSnapshot.groups` and `listProjectGroups()` (`GET /api/project-groups`). Every such line in the code is marked
`FUTURE (proposal L22)`. No other scenario sends a group, and `groupId` is absent from their streams.

**The looks are not loops data.** They are Studio's town document seed (`DemoScenario.townZones`): one zone entry
per group id with style options and a cast. A new Studio town starts from it at revision 0; a person's own changes
are stored and win over the seed from then on.

Studio tells no single story. Every project has eight tickets (two done, one in review, two in progress, one
planned, two in the backlog) and gets a progress line about every 45 seconds. What it is built to exercise:

- **A person is needed somewhere all loop long.** Five reviews wait on Nicky at the start and four tickets wait on
  a person. Sixteen projects take turns with the watchdog: a `stalled` episode with a nudge, an `attention`
  episode, or a question that waits on a person, each closed after about two and a half minutes and repeated every
  six and a half. A test checks that at least two groups need a person in every minute up to 14:00.
- **The postman keeps walking:** more than forty deliveries per loop (comments, planned tickets, new tickets,
  nudges, releases).
- **The truck:** Sync Engine releases 2.4.0 (created 4:10, publish asked 6:02, published 6:34), Pocket Garden gets
  a draft 1.3.0 (11:20), and Website (9:40) and Voice Notes (13:05) archive their Done column.
- A worker of Trail Maps is `blocked` on a permission prompt from 7:10 to 9:15.

### The stress fixtures

`?stress=1` (dev builds only) is unchanged: 12 buildings and 100 agents. `?stress=20` is the region: 20 buildings
and 200 agents (20 leads, 4 rovers, 176 workers) in four groups of five, with the same future `groupId`. Neither
tells a story; they exist to load the renderer.
