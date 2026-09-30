# Demo content and storyline

Everything here is fiction, played by `@crewhub/demo` in the browser. It has exactly
the shapes crewhub-loops serves (`docs/integrators/` at loops commit `a1bed0f`), so
the world cannot tell it from a live host. Every surface that shows it labels it
as demo. The data lives in `src/content.ts`; the storyline lives in
`src/script.ts`.

## People and agents

| Id | Kind | Role | Notes |
|---|---|---|---|
| `nicky` | person | admin | Plans, reviews and closes tickets; DMs `g-man`. |
| `sam` | person | member | Comments, asks for the broken sign, unarchives MK-5. |
| `g-man` | agent | lead | `isCrewhubLead: true`, the main agent; answers the DM. Leads no project. |
| `cr-lead` | agent | lead | Leads CR. |
| `cl-lead` | agent | lead | Leads CL **and** OPS: one real avatar, one proxy. |
| `marky` | agent | lead | Leads MK. It has no `-lead` name, so no worker maps to it. |
| `analyst` | agent | lead | Holds in-progress tickets in CL (CL-40) and MK (MK-12): it works in two buildings. |
| `ux-lead` | agent | lead | Works in MK through MK-9; a delivery to it ends `unroutable`. |
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
| 6:10–6:54 | `cr-lead` posts a progress line on CR-24, and the watchdog closes the stall (`activity`). CL-80 goes back to review, waiting on Nicky. The fern prop comment is posted and the fern moves to review. |
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
