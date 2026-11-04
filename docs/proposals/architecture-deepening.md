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
3. **Host-side candidates** are proved with node tests. **Page-side candidates** are also proved in the browser: the
   regress groups without `real`, `a11y.mjs`, and `pixcheck`, whose pictures are expected identical. Since 11:45 on
   4 November, both kinds merge by day.
4. **The safe merge order, every time:**
   1. `--no-ff` in the merge worktree;
   2. `npm run check`;
   3. `git merge-tree` with the seven answer branches, or their ports;
   4. both replays.

   Only then does `feat/world-demo` move. Nothing is pushed by the developers or the Lead.
5. **The vocabulary** above is used exactly, in commits, docs and reports.

## Order and owners

Rescaled at 11:45 on 4 November, when Nicky lifted the day rules and allowed up to twelve agents at once. Seven
candidates now run in parallel, each in its own worktree and each with its own port pair. One agent makes the
answer-branch ports and runs the replays. A fresh reviewer reads each deepening before it merges.

**The host chain:**
- C4 and C5 run in parallel, each owning its own region of `host.ts`.
- C1 starts only after both merge, because they are slices of its connection module.
- C7 runs in parallel from the start. It owns the wire in `stream.ts`, `hostSource.ts`, `allowList.ts` and the stubs,
  and leaves `createHost`'s body to C1.

**The page chain:** C3, C6, C8 and C2 run in parallel, each owning its own lines of `App.tsx` and `WorldCanvas.tsx`.
C9 comes last, because it shares `App.tsx` with C2 and C6. Page branches merge by day once their browser proof is
green: the regress groups without `real`, `a11y.mjs`, and `pixcheck`'s demo set, expected identical.

| Candidate | Side | Owner (model) | Branch | Starts |
| --- | --- | --- | --- | --- |
| **C4** the viewer key's chat path, one module; one set of DM readers in loops-client | host | arch-host (Fable 5.1) | `task/r59-c4-chat-path` | 59d, now |
| **C5** the archive memory, one module (file store or this-run adapter) | host | arch-c5 (Opus 5.5) | `task/r59-c5-archive-memory` | 59d, now |
| **C7** the host-to-page wire format, defined once | host | arch-c7 (Fable 5.1) | `task/r59-c7-wire` | 59d, now |
| **C1** the connection lifecycle split from the HTTP routes | host | arch-host (Fable 5.1) | `task/r59-c1-connection` | after C4 and C5 merge |
| **C3** the world runtimes built from config; one-caller extractions folded back | page | arch-page (Opus 5.5) | `task/r59-c3-runtimes` | 59d, now |
| **C6** one host-health module in the page | page | arch-c6 (Opus 5.5) | `task/r59-c6-host-health` | 59d, now |
| **C8** one module for an agent's appearance | page | arch-c8 (Opus 5.5) | `task/r59-c8-appearance` | 59d, now |
| **C2** the world view's navigation, one module | page | arch-c2 (Fable 5.1) | `task/r59-c2-navigation` | 59d, now |
| **C9** a chat seam with a demo and a live adapter | page | arch-page (Opus 5.5) | `task/r59-c9-chat-seam` | after C2 and C6 merge |
| answer-branch ports and the replays | both | arch-ports (Opus 5.5) | `port/<answer-branch>@<head>` | 59d, now |

If a Fable developer reaches its usage limit, an Opus developer finishes its branch. No credits are bought.

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

As of 12:56 on 4 November (59d). The branch head is the one reviewed or merged.


| Candidate | Branch head | State | Answer branches | Merge |
| --- | --- | --- | --- | --- |
| C4 | `58947920` | merged (reviewed: review-c4) | q14 by port `port/task/q14-dm-read-cap@5894792`; six clean | `53c46ad` |
| C5 | `b5a8b73d` | merged (reviewed: review-c5) | all clean (q14 through C4's port) | `29261f5` |
| C1 | `c83bae11` | in review (review-c1) | r27, q1, q3, q14, q15 by ports, after C7's | |
| C7 | `8a0f9c50` | reviewed (review-c7: merge); merging the head in | q15, q3, r27, q1 by ports (being carried to its new head) | |
| C3 | `e6c5a347` | merged (reviewed: review-c3; regress 139/140 with the known town console flake, a11y 188/188, pixcheck 74/74 identical) | q1 by port `port/task/q1-cookie-expiry@e6c5a34`; six clean | `e3e21f8` |
| C6 | | in progress | r27 by port; q1 import clash being avoided | |
| C8 | `d3bb76f2` | reviewed (review-c8: merge, one table row added) | all clean | |
| C2 | `2811b59` | reviewed (review-c2: merge after the Escape focus fix, re-checked) | all clean | |
| C9 | | waits on C2 and C6 | | |
