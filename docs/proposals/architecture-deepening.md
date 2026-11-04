# Deepening the world's modules: the programme (from round 59d, 2026-11-04)

Nicky asked (4 November) to carry out every candidate of crewy's architecture review of `feat/world-demo` at
`bf69fbe`. This page is the programme's one page: the order, the owner of each candidate, what each does to Nicky's
seven answer branches, and where each stands. The Lead keeps it current on every merge.

The candidates, in full, are crewy's review (C1 to C9). In short: each one turns a **shallow** spread of code into a
**deep module**, one with a small **interface** over a large **implementation**, so that a fact lives in one place
(**locality**) and one test surface pins it (**leverage**). A **seam** is where a module can be swapped. One
**adapter** behind a seam is a hypothetical seam; two make it a real one.

## Rules

1. **Behaviour does not change.** These are deepenings, not features. Every existing test stays green. A test that
   moves or is replaced names, in its commit, the fact it still covers. New tests go through the new module's
   interface: the interface is the test surface.
2. **Nicky's seven answer branches are never edited, rebased or merged** by the programme. After each deepening, every
   answer branch must still merge cleanly. If one cannot, a **port** stands in for it:
   - a branch `port/<answer-branch>@<deepening head>` carrying the same behaviour change on top of the deepening, with
     its own tests green;
   - proved by the answer replay (`tools/answers-replay.mjs`) run against the port;
   - recorded in [the merge plan](merge-plan.md): which port stands for which answer branch on which head.

   A deepening merges only when every answer branch merges cleanly or has a green port. Where it costs little, a
   deepening is shaped so that the answer branches still merge cleanly.
3. **Host-side candidates** are proved with node tests and may merge by day. **Page-side candidates** wait on held
   branches for a night's browser proof: the regress groups without `real`, `a11y.mjs`, and `pixcheck`, whose pictures
   are expected identical.
4. **The safe merge order, every time:**
   1. `--no-ff` in the merge worktree;
   2. `npm run check`;
   3. `git merge-tree` with the seven answer branches, or their ports;
   4. both replays.

   Only then does `feat/world-demo` move. Nothing is pushed by the developers or the Lead.
5. **The vocabulary** above is used exactly, in commits, docs and reports.

## Order and owners

The host chain runs in a fixed order, because each candidate builds on the last. C4 and C5 are slices of C1's
connection module, and C7 defines the wire that C1's module writes. The page chain is ordered by leverage: C3's
runtimes are the base that C2, C6 and C9 lean on.

| # | Candidate | Side | Owner | Branch | When |
| --- | --- | --- | --- | --- | --- |
| 1 | **C4** the viewer key's chat path, one module; one set of DM readers in loops-client | host | arch-host (Fable 5.1) | `task/r59-c4-chat-path` | 59d, day |
| 2 | **C5** the archive memory, one module (file store or this-run adapter) | host | arch-host | `task/r59-c5-archive-memory` | 59d, day |
| 3 | **C1** the connection lifecycle split from the HTTP routes | host | arch-host | `task/r59-c1-connection` | from 59 (night) |
| 4 | **C7** the host-to-page wire format, defined once | host | arch-host | `task/r59-c7-wire` | after C1 |
| 5 | **C3** the world runtimes built from config; one-caller extractions folded back | page, held | arch-page (Opus 5.5) | `task/r59-c3-runtimes` | 59d, held for 59 |
| 6 | **C6** one host-health module in the page | page, held | arch-page | `task/r59-c6-host-health` | 59d, held |
| 7 | **C8** one module for an agent's appearance | page, held | arch-page | `task/r59-c8-appearance` | 59d or 59, held |
| 8 | **C2** the world view's navigation, one module | page, held | to be named (59) | `task/r5x-c2-navigation` | after C3 |
| 9 | **C9** a chat seam with a demo and a live adapter | page, held | to be named | `task/r5x-c9-chat-seam` | last, after C2, C3 and C6 |

If the Fable developer reaches its usage limit, an Opus developer finishes its branch. No credits are bought.

## What each candidate does to the answer branches

The table is an estimate from the answer branches' diffs on `bf69fbe`; it is replaced by the outcome when each
deepening merges. "Clean" means `git merge-tree` is clean.

| Candidate | Files it reshapes | Answer branches that edit the same files | Expected |
| --- | --- | --- | --- |
| **C4** | `host.ts` (chat path, relink, internal listener, close), `chatLine.ts`, loops-client `pageChat.ts`, `validate.ts` | **q14** (`dmReads.ts`, `chatLine.ts` import and the DM reads in `host.ts`), r27, q1, q3 (other parts of `createHost`) | **q14 likely needs a port**: it caps the very DM reads C4 moves. The others are clean if C4 leaves their regions of `createHost` in place |
| **C5** | `host.ts` (archive judging, `onArchive`), `stream.ts`, `snapshot.ts`, `archiveStore.ts`, `doctor.ts` | q15 (`stream.ts`, `loops.ts`), q3 (`doctor.ts`, `checkout.ts`) | clean if `stream.ts`'s body-cap hunks and `doctor.ts`'s health lines are left in place; a q15 port is possible |
| **C1** | `host.ts` throughout (`createHost`, `HostOptions`), `stream.ts`, the host tests | **r27, q1, q3, q14, q15**: every host answer branch edits `createHost` and `HostOptions` | **ports likely for most host answers**; the largest answer-branch cost of the programme |
| **C7** | `stream.ts`, loops-client `hostSource.ts`, `allowList.ts`, `HostHealth`, the stubs | r27 (`allowList.ts`, `hostSource.ts`), q1 (`hostSource.ts`), **q3** (`HostHealth`, `hostSource.ts`), q15 (`stream.ts`) | **q3 likely needs a port** (it changes `HostHealth`, which C7 defines once); r27 possibly |
| **C3** | `state/world.ts`, `state/town.ts`, `state/director.ts`, the one-caller extractions and their tests | r27 (`main.tsx`, `state/pairing.ts`), q11 (`state/chatRoad.ts`) | clean |
| **C6** | `main.tsx`, `App.tsx`, `ConnectPage.tsx`, `ConnectionPanel.tsx`, `FirstSnapshot.tsx`, `state/health.ts`, `state/connect.ts`, `pageChat.ts` | **r27** (`main.tsx`, `ConnectPage`, `ConnectionPanel`), q1 (`ConnectPage`, `ConnectionPanel`), q8 (`ConnectionPanel`), q3 (`hostPort.ts`) | **r27 likely needs a port**; q1 and q8 possibly |
| **C8** | `figureState.ts`, `roomDressing.ts`, `WorldCanvas.tsx`, `townLayout.ts`, `wayfinding.ts`, the agent card, world-model `describe.ts` | none | clean |
| **C2** | `App.tsx` (view state, Escape chain), `WorldCanvas.tsx` props, `TownScene.ts` | none directly | clean |
| **C9** | `App.tsx` chat parts, `state/chat.ts`, `chatApi.ts`, `world.ts`, `pageChat.ts` | q11 (`chatRoad.ts`, `recentAnswers.ts`) | clean if `chatRoad.ts` stays a reader |

**The held branch `task/r58d-state-medium`** (`3ed90cf1`: `routeMessage`, `buildSteps`, `directorReach`) adds three
more one-caller extractions, the shallow kind that C3 folds back in. The Lead's recommendation is not to merge it.
C3's runtime tests cover its facts through the runtime's interface instead; the demo DM read-back is the first of them.

## Where it stands

| Candidate | Branch head | State | Answer branches | Merge |
| --- | --- | --- | --- | --- |
| C4 | | in progress (59d) | | |
| C5 | | waits on C4 | | |
| C1 | | waits on C5 | | |
| C7 | | waits on C1 | | |
| C3 | | in progress (59d), held | | |
| C6 | | waits on C3, held | | |
| C8 | | waits on C6, held | | |
| C2 | | not started | | |
| C9 | | not started | | |
