# Roadmap

Milestones are deliberately small. They are not commitments to dates or estimates.
The direction changed on 2026-09-30: [ADR 0005](decisions/0005-crewhub-world-on-loops.md)
and [the integration plan](LOOPS_INTEGRATION_PLAN.md) replace M5 to M7 (runtime
adapters) with the phases below. The town, rooms and growth of M2 to M4 continue in phases 3 to 5.

## M0 — Bootstrap (merged)

Included: preserved desktop archive, clean workspace, runnable browser fixture,
mock session contract, English instructions and design documents, type checking,
documentation link checking, build, and CI definition.

Exit: `npm ci` and `npm run check` pass; the fixture runs in a browser; the archive
points to the original commit; the change is reviewable without rewriting history.
Report CI separately from local checks. Creating a workflow is not a passing CI run.

## M1 — One excellent room (merged; visual direction accepted; the room itself was later replaced by the town)

The Greenhouse implements one room, three procedural characters, four deterministic
scenarios, selection/focus, activity inspection, keyboard and touch controls,
reduced motion, and graphics fallback. It also establishes the requested grid
foundation: rectangular footprints, rotation, placement, pathfinding, movement
reservations, and semantic snapshots. Three.js is the only rendering engine.

The user reviewed the room positively and accepted its visual direction. A
reference-based design-system kit was replaced by the crewhub-loops
[design system](DESIGN_SYSTEM.md), which now provides light/dark tokens and
primitives for the 2D UI. The 3D scene keeps its own materials; visual review of the
migrated room is pending. Automated checks pass;
the cloud agent's browser preview was blocked, so technical browser/device and
performance verification remains outstanding. See [ROOM_REVIEW.md](ROOM_REVIEW.md).

Exit: cohesive visual direction, useful behavior, browser inspection, interaction
recording where available, documented performance, and zero model calls. The user
can evaluate the look and feel before feature expansion. Do not keep the bootstrap
page's appearance as a constraint.

## M2 — Shared town and session model

Introduce towns, rooms, workstations, slots, character identities, canonical runtime
sessions, and source bindings. Replace fixed crew counts and index-based session
lookups with a dynamic projection. Keep The Greenhouse's current art and working
demo. Start with mock Herdr, Claude Code, and Codex observations.

Exit: source order, removal, reconnect, and pane replacement cannot confuse session
identity. Verified duplicate observations become one character. Zero, one, three,
and eight agents work without hard-coded scene or panel assumptions.

## M3 — Growing rooms and persistence

Parameterize room geometry and camera bounds. Allocate usable slots, reserve growth
modules, and preserve a fixed room origin. Implement atomic expansion, local saved
layouts, undo, validated import/export, and migration of the current room JSON.

Exit: growth keeps furniture, actors, doors, and routes valid without moving old
cells. Invalid or blocked expansion leaves the previous revision intact. Session
inactivity does not automatically shrink the room.

## M4 — A convincing mock town

Add town plots and paths, room summaries, town/room/character camera scopes, and
detail-level switching. Integrate the user's design system when available. The
model and engine work can proceed with provisional controls until then.

Exit: three rooms with different capacities are clear and pleasant to navigate;
only one detailed interior is active initially. Exercise a 12-room, 100-session
oversight fixture and record device, frame-time, memory, and accessibility evidence.

## The loops phases

The phases of plan section 10, built first in demo mode: a scripted in-browser source
with the shapes crewhub-loops serves, no network, no account and no model call
([the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md)). Since
2026-10-07 the same world runs live through the host, and since 2026-10-21 against the
real crewhub-loops ("The host" below). A status says "built in demo mode", "live" when
the real data drives that part through the same reducer, or "not built"; the parts of a
phase that need the host's world database, the chat or the director are named where
they are not built.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1. First light | `packages/loops-client`, `WorldSource`, the demo source, one building per project, navigation, hidden text view | Built in demo mode (2026-10-01); live since 2026-10-07 (against the fake) and against crewhub-loops `4cdcd383` since 2026-10-21 |
| 2. Chat bubbles | The loops chat mirrored verbatim, backed by an in-browser demo chat API | Built in demo mode (2026-10-01). Live since round 12 (2026-10-21): the Chat panel frames loops' own web app (the chip, and "Chat with <name>" on a lead's card, since loops chats with leads only, round 13), and an agent's answer shows as a speech bubble over its figure, with a chat mark over its building from the town (round 14) and a Recent answers list (round 16; the panel in one glance, rounds 17 and 18). The bubbles come through the host: on the key road without a sign-in where loops lets the world's key read the chat (the viewer key, proven on 8292), on today's Mac app after a sign-in in the Connection panel (the session road, which `task/r19-viewer-switch` removes once loops merges the viewer key). The demo's dock feeds the same bubbles, mark and list |
| 3. Buildings | Rooms by role, tickets as objects in rooms, the ticket drone, postures and captions, the `WorldStyle` seam | Built in demo mode (2026-10-01); live from the same model, with the real lane facts on the card, a person carrying work into Done and closed buildings (2026-10-21); since round 7 a quiet ticket gathers dust and a clock tag, and an automation's run pins a card on the building's board, in the demo and live alike. The world database's first slice (round 20) keeps the live town in the host |
| 4. Town and dynamic pathfinding | Doors, town paths, heap A*, wait budget, detail levels, stress fixture | Built in demo mode (2026-10-01); live from the same model |
| 5. Build mode: layout and props | Local town document with undo and export/import, prop catalogue, the `crewhub-prop/1` format and the `prop-builder` skill | Built in demo mode (2026-10-01); live mode keeps its own town document in the browser, per crewhub-loops installation (round 11). Since round 20 the world database keeps it in the host for every paired browser |
| 6. Director and awareness | A scripted intent feed through the validated intent list, `where`, the settings block, the no-model-call guard | Built in demo mode (2026-10-01); `where` works live; the scripted feed in live mode built 2026-10-21 (round 11): its own opt-in, off by default, plans from the live facts, "scripted" on every intent and in the text view. Not built: the real director |

Walk mode (2026-10-07, built in demo mode): the person walks a visitor figure through the town and into buildings over
the navigation world, with a follow camera ("Walk mode" in
[the night report](reports/2026-10-01-world-demo-night.md)).

A person in the world (2026-10-21, spec addendum "a person in the world, and closed buildings", part 1): a
`ticket.moved` into Done by a user is a person's act in loops, so the world shows a person: a plain figure of the
building's cast comes in by the front door, carries the package from its rack or desk to the Done rack and leaves. The
model records the visit (`Building.visits`, one person per building, a queue of three, the rest land at once; the
celebration follows the landing), the text view and `where` tell it, a click says who and what. Under reduced motion
the package lands at once. Part 2, closed buildings, is built as well (round 2, below). Since round 3 of the same night
the person looks like a person: each cast brings a person figure of its own (`person.json`, "The person" in
[WORLD_STYLES.md](WORLD_STYLES.md)), clearly no agent; the walk-mode visitor is the same figure; a cast without one falls
back to its plain worker. Round 4: carrying looks like carrying, a motion may be limited to `carrying` (true or false), and the
persons' arms hold the package steady while the legs walk.

## The host

Built on 2026-10-07 and brought to the Mac app on 2026-10-21 (plan section 10, "Phase 1 as built" and "Phase 1
against the Mac app"; the runbook is [LOOPS_SETUP.md](LOOPS_SETUP.md)): `apps/host` reads crewhub-loops with one
agent key over loopback TCP (the Mac app's `127.0.0.1:8091`) or over the app's Unix socket
(`CREWHUB_WORLD_LOOPS_SOCKET`, explicit only), keeps one event stream, serves `/world-api` as SSE
with pairing and the static bundle, and `createHostSource` is the live `WorldSource`. The key is an external bot's
(CL-314), lead-grade; the host's `GET`-only allow-list keeps the world read-only until crewhub-loops has a viewer key
(L1). Since the round of 2026-10-21 ("a smooth connection") the host finds the app by itself (its socket or port from
its data folder, read only), starts without a key, takes one pasted in the world's Connect screen
(`POST /world-api/connect`, checked with loops, stored 0600 in `~/.config/crewhub-world`), reports the states in
`health.connection`, and `npm run world` is the one command; `npm run host -- doctor` is the terminal view.

Closed buildings (2026-10-21, round 2): an archived project is a closed building, boarded up with its lights off, a
Closed sign that carries the archive date, no packages and no agents; the sign, the click and the text view say
since when and by whom, and it can still be entered. `project.archived` plays a short closing (the lights go out,
the boards come down), `project.restored` the reverse; reduced motion cuts. The host learns archived projects
from the event log (`GET /api/events?types=project.archived,project.restored`, paged) and reads each with
`GET /api/projects/{slug}`, since an agent key may not list them (L16). Round 3 (hostcare): the host remembers the
slugs it learnt in `~/.config/crewhub-world/archived.json`, so a loops that will not read its log from the start
still shows its closed buildings on the next start (the Connection panel says where the list came from); and a
rejected key is never confused with loops being down (only a confirmed 401/403 rejects; a rejected stored key is
kept, with Forget).

Round 3 (2026-10-21, the same night): `npm run world` starts the host and opens the browser first and builds the
world beside them when the build is missing or stale (a "Building the world…" page hands over by itself); the
terminal prints a step list with times; the snapshot is assembled under a read cap and timed; health answers within
a second and says how far the first snapshot is, which the page shows ("Reading 12 projects from crewhub-loops…");
the pairing secret is kept in the host's folder, so a host restart keeps every paired browser, and an unpaired tab
shows "Pair this browser" instead of a Stale chip; the doctor never asks for a restart the host does not need; the
host's own principal is hidden as the observer; the demo scripts its own lanes and the agent card opens on any
figure, in the town hall and at the post office too. Measured with `tools/timeworld.mjs` against the development
loops: the dressed town about 1.1 s after `npm run world` warm and about 2.4 s cold. Rehearsed from a fresh clone by
a developer following the runbook: about 90 s hands on, including the loops dialog; the measure was two minutes.
Nicky's first run against the app itself came in round 11 (2026-10-21, 18:50): loops found through the app's socket,
the key ok, the stream ok, three projects in fifteen reads.

Rounds 4 to 6 (2026-10-21, until late morning): the morning was rehearsed from a fresh clone three more times, the
sixth holding every timing (the Connect screen's first paint in about 70 ms, the paste to the Live chip in 0.83 s, a
host restart with the kept secret back at Live in 1.3 s, a tab whose host restarted without its secret back 1.3 s after
the new link, where it took 5.4 s before round 5); "the world is up" is printed once, timed from the host's start; the
doctor and the step list read as a person reads; the live town's chat corner is one chip, "Chat: in the crewhub-loops
app", which opens the loops web in a new tab. The `connect` group of the regress pass walks every Connect screen
against a stub and the road against the development loops. The first paint was cut structurally, each cut measured
before and after with the town the same to the pixel (round 4: no Suspense on the road to the town, the snapshot read
ahead, the world's chunks preloaded, three.js in its own chunk; round 5: `mergeStatic` writes every vertex once, the
navigation graph and the walkers follow the first drawn frame, the Greenhouse models are validated on first use;
round 6: the director's graph is built on first use, the scene's graph starts empty), the numbers in
[COST_POLICY.md](COST_POLICY.md) and the order of the first frame in [ARCHITECTURE.md](ARCHITECTURE.md);
`tools/profile.mjs` keeps the profiler. Labels stack on a phone instead of piling up, a person's pill climbs over the
rack tags, a tag glides instead of hopping, a need pin says its count once, a waiting tag says "waits on <name>".

Round 12 (2026-10-21, chat with the agents, road B option 2): the host can sign in to crewhub-loops as the person,
once, from the Connection panel's Chat section (off by default), keep only the session cookie (0600, beside the key),
read the chat as that person under its own allow-list (the dm reads and the `dm.*` stream, never a send or anything
else) and show an agent's answer as a speech bubble over its figure (12 s; a tap opens the Chat panel); honest states
(signed in as, expired, signed out), Forget the session. Tested with the stub, the fake (which learnt login and the dm
routes) and a regress check over the fake; the real sign-in on 8291 was done by crewy (request 15: sign-in and
Forget pass, the bubble waits for dispatch to be opened). The key road: where loops lets the world's key read the
chat (the viewer key on 8292), no session is needed and the bubbles come over the key's own stream (`session: key`).

Round 7 (2026-10-21, the live operations road): three things done to crewhub-loops under a running host, each with
its honest screen and a regress check that needs nobody (`tools/regress.mjs --groups ops`, over the fake): loops
stopped and started (the Loops down chip over the last known town, the panel's "down; the host retries", Live again
without a reload with the cursor going on), the key revoked while Live (the rejected screen over the live tab with
loops' reason, the kept key and Forget; a new key pasted brings the town back by itself, stored by the host) and loops
upgraded, a different `/api/health` `version` (health's `loopsCommitBefore`, the panel's "it was 0.1.0 when this host
started", the host's log line). The `real` group checks what the development loops can show without being stopped:
its version in health and in the panel. Rehearsed on 8291 with crewy stopping and starting it and revoking the key at
named times (request 9); a version change on 8291 is not possible (the package version is baked into its uv
environment), so that road is the fake's and the stub's. The same round made demo and live look alike: the world's
own key is the demo's observer too (hidden, as on an install), a CI bot stands in the lodge as other external bots
stand in the town hall, the agent card draws above the corner chips, and the differences that remain are by design
(the demo's playback bar, the chip and chat corner, lanes and a team snapshot the development loops lacks, colours
and milestones the seed may not write).

Rounds 8 and 9 (2026-10-21, midday and early afternoon): a rejected key waits instead of retrying its stream every
30 s; the host asks loops about the kept key every five minutes after a keyless health probe, so a bot re-enabled in
loops comes back by itself, and the screen and the panel say when the next check is. An accessibility pass over the
night's UI: a connection change over the town is said once, the Connect screens and the panel no longer read a
ticking clock, Keep returns the focus, pills and tags say in words what a colour showed, the failed card has its dark
contrast back, new-tab links say so, chips are 40 px on a phone; `tools/a11y.mjs` asks a headless browser for all of
it. The demo's person makes their Done moves from one table, at least 100 s apart in a building, and Studio keeps a
closed building that opens and closes again. The snapshot carries what only loops' event log holds (the open quiet
stretches and the latest automation runs, bounded to open tickets; a `system` row never ends a stretch), so a fresh
tab, a seek and a reconnect show the dust and the cards; and the dust is a grey veil in the style's colours with a
few motes before the package, so a quiet package reads as quiet at the hall's zoom. The facade colour at town level
was Nicky's to decide (two mocks on a branch that is never merged); he chose the soft wall tint, built fresh in round 15.

Rounds 10 to 19 (2026-10-21 afternoon to 2026-10-22 morning): a seventh and an eighth fresh-clone rehearsal (rounds 10
and 18, every timing held; the key pasted to Live in about half a second); Nicky's own run against his Crewhub.app
(round 11), the same round making zones live (the town document per installation, by hand in build mode) and the
scripted director live behind its own opt-in; the chat (rounds 12 to 18: the Chat panel framing loops' own web app, the
leads-only Chat button, the bubbles proven on the real loops with a chat mark from the town, one story per road, Recent
answers, the panel in one glance); Nicky's ten decisions answered and built (round 15: the test timeout merged, the
third person in "Where is …?", the viewer-key switch prepared, fsevents' install scripts denied and vite 8.3.4, the
Greenhouse models' Object3D cut pixel-identical, the soft wall tint, the bot name kept, dispatch opened on 8292); the
tooling made safe on a shared Mac (round 16: a stale `apps/world/dist` refused by the regress pass, `vite preview` never
proxying to 5180 by default; round 17: `npm run dev` naming its host port and refusing another checkout's host); the
introduction `docs/INTRODUCTION.md` (round 12, current in round 18); and the switch to the viewer key (round 19, `task/r19-viewer-switch`, merged once crewhub-loops main carried
`world/viewer-key`: the session road is gone, the key road is the one road). The night report tells each round.

## Open

Everything below is planned and not built, in progress, or waits on crewhub-loops. Each item needs crewhub-loops
running.

- **World database.** First slice built on 2026-10-22 (round 20, spec addendum "the world database, first
  slice"): the host keeps the live town document per crewhub-loops installation in `world.db` (Node 24's
  `node:sqlite`, migrations with a backup copy, an export), every paired browser shares it, the browser's
  IndexedDB is the demo's store and the live fallback. Open: merging concurrent edits, more than the town in it.
- **The viewer-key switch.** The chat is built (rounds 12 to 18; phase 2 above); what remains is the key. The loops
  branch `world/viewer-key` is on origin (crewhub-loops), 15 commits on `4cdcd383` under `cl-lead`'s review: the
  **viewer key** (L1: an external bot flag that may read exactly the host's read list, the stream and the chat the
  owner sees, and write nothing; until it lands the world runs on a lead-grade key behind the host's `GET`-only
  allow-list), the **"Connect CrewHub World" card** in Settings > Agents that makes the viewer bot and shows its key
  once with the world's address, the deep link `?chat=<agent id>` and the framing allowance for loopback origins, with
  three proposal pages and a review page under `docs/proposals/` there. The world's side is written: the Connect screen
  and the Key row say what a viewer key changes (round 15), and `task/r19-viewer-switch` (round 19, merged once crewhub-loops main
  carried the branch) dropped the session road and says plainly, on a loops whose key cannot read the chat, why there
  are no bubbles (a viewer key, by the card). What remains open here is loops' side only: the branch in loops main. A chat of the world's own in the world's page (phase 2 as first planned, which
  needed CORS, L8) is not pursued: the Chat panel frames loops' own chat instead. The other proposals of plan section 9
  (L2 to L8) stand as written.
- **Real director.** The `crewhub-world` CLI, the watcher and the `world-director`
  lane, off by default, capped and measured. No model call exists today. The middle road without a
  model, the demo's scripted feed in live mode, off by default and labelled scripted on every intent
  and in the text view, was built in round 11 (2026-10-21) as the spec addendum of round 7
  recommended; it acts only on the world's own figures and is not the director this item names.
- **Project groups (L22).** Zones stay in each browser's town document until
  crewhub-loops has a level above projects ([gap analysis](LOOPS_GAP_ANALYSIS.md), section 5.8). The
  spec addendum of round 7 lists the roads: wait for loops, or the host's world database keeps the
  zones per installation so every paired browser shares them; per browser until one of the two exists.
  The per-browser road is built (2026-10-21, round 11): a live town's zones are made by hand in build
  mode as in the demo, the live town document is kept per crewhub-loops installation, and the text
  view, the Connection panel and build mode say so. The second road, the host's world database keeping
  the zones per installation so every paired browser shares them, is built too (2026-10-22, round 20,
  the world database's first slice).

Nicky's ten decisions of the night document were answered and built in round 15 (2026-10-22): `--test-timeout=120000`
in `npm test`, so a hung test fails by name, is merged (`77e4dff`, after the Node 24 preflight); "Where is …?" answers
in the third person; the viewer-key switch is prepared and the end of the chat sign-in written; fsevents' install
scripts are denied and vite is 8.3.4; the bot name stays `crewhub-world`; dispatch is open on 8292. What waits now is
not Nicky's: `cl-lead`'s review of `world/viewer-key` in crewhub-loops, then the switch's merge. The Greenhouse models'
Object3D count, the last first-paint cut, is built (round 15, Nicky's decision 7): a data model is one node holding its
parts as data, pixel-identical by construction (`docs/WORLD_STYLES.md`, "parts as data"; the numbers in
`COST_POLICY.md`).

## Later scope

Remote access, cross-device persistence, additional clients, generated models, and
autonomous coordination each need a separate scope based on the working town. Optional AI features must satisfy
[the cost policy](COST_POLICY.md). Direct Herdr, Claude Code and Codex adapters are removed, not
postponed: Herdr stays behind crewhub-loops.
