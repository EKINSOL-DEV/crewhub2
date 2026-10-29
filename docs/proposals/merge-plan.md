# Merging Nicky's answers: the rehearsed plan (rounds 37 to 48, 2026-10-24 to 30)

Seven answer branches wait on [the open questions](open-questions.md). This page says, for every set of answers Nicky
can give, in which order the branches merge into `feat/world-demo` and what has to be done by hand. Every hand merge
below was rehearsed on a throwaway checkout of the base (`e55ef42` in round 37, `a0750aa` in round 38, `c0ae5ec` in round 39, `e6c934d` in round 41, `d220f3a` in round 45, `b811561` in round 47, `f2495d2` in round 48) with `npm run check`
green on the result, and
is written so it can be redone without thinking. **Nicky needs §1 only**, and only the first three columns of its table
to find the row; crewy and the Lead use the rest (§2 the evidence, §3 each hand merge exactly, §4 the check and the
replay).

The branches, at the heads this plan was made on (the branches are read only; the plan is redone when one moves):

| Question | Answer | Branch | Head |
| --- | --- | --- | --- |
| 1 (and 2) | `tab` | `task/r27-tab-pairing` | `de2969e` |
| 1 (and 2) | `cookie+expiry` | `task/q1-cookie-expiry` | `67d6970` |
| 1 | `cookie` | no branch | |
| 3 | `less` | `task/q3-health-less` | `dbb5a41` |
| 8 | `say` | `task/q8-offline-say` | `2fb1847` |
| 11 | `show` | `task/q11-recent-since` | `2c0bd7f` |
| 14 | `cap` | `task/q14-dm-read-cap` | `f8fa725` |
| 15 | `cap` | `task/q15-body-cap` | `c83b27c` |

## 1. Your answers, your row, and what happens

**Your answers are all crewy needs.** Send the answer lines the questions page asks for (`1: tab`, `3: less`, `8: say`,
…); crewy merges from them with this page, and nothing below is yours to do. The table is here so you can see, from
your own words, what your answers cost: nothing by hand in most rows, one rehearsed merge in the others.

**Find your row with three answers**: question 1, question 3 and question 8. The other three answers that bring a
branch (`11: show`, `14: cap`, `15: cap`) never need a hand: each merges cleanly with everything in any order, so say
yes or no to each and your row stays the same. Every other question (2, 4 to 7, 9, 10, 12, 13) changes a setting or a
decision, never a merge. An answer that is not in the table (`8: support`, `14: <number>`, `15: <size>`, `2: <days>`)
is explained under it.

**If you want to see the result yourself:** the last column is one command, run in a clean checkout of this
repository. It merges on a detached copy (no branch is touched, nothing is pushed), prints the sha of the result, and
with `--check` runs the full unit check on it. Add `q11`, `q14` or `q15` where you said `11: show`, `14: cap` or
`15: cap`; the words in brackets are those optional ones.

| `1:` | `3:` | `8:` | By hand | The command (`node tools/answers-replay.mjs feat/world-demo …`) |
| --- | --- | --- | --- | --- |
| `cookie` | any | any | nothing | `… cookie [q3] [q8] [q11] [q14] [q15] --check` |
| `cookie+expiry` | `as-is` | any | nothing | `… cookie+expiry [q8] [q11] [q14] [q15] --check` |
| `cookie+expiry` | `less` | any | **one merge**, one file (`apps/host/src/host.ts`, A) and a one-line test fix (B); rehearsed, the command does it | `… cookie+expiry q3 [q8] [q11] [q14] [q15] --check` |
| `tab` | `as-is` | `as-is` | nothing | `… tab [q11] [q14] [q15] --check` |
| `tab` | `less` | `as-is` | **one merge**, three files (`apps/host/README.md`, `apps/world/hostPort.ts`, `apps/host/test/pairing.test.ts`: D, E, F); rehearsed, the command does it | `… tab q3 [q11] [q14] [q15] --check` |
| `tab` | `as-is` | `say` | nothing | `… tab q8 [q11] [q14] [q15] --check` |
| `tab` | `less` | `say` | **one merge**, the same three files (D, E, F); rehearsed, the command does it | `… tab q3 q8 [q11] [q14] [q15] --check` |

So the worst case is one hand merge of three files, rehearsed and replayed by the command; most answer sets need
none. After every `tab` merge the command also checks that two paragraphs of `docs/LOOPS_SETUP.md` are there (C)
and stops if they are not. The letters point at §3, where each resolution is written out for crewy.

**Answers the table does not spell out:**

- `8: support` is not built: for the merge it counts as `8: as-is` (nothing merges), and crewy notes that a round has
  to build it.
- `14: <number>` and `15: <size>` are the `cap` branch with one constant changed afterwards: for the merge, read the
  row as `14: cap` or `15: cap`, and tell crewy the number.
- `2: <days>` or `2: never` is one setting on question 1's branch (`CREWHUB_WORLD_PAIRING_IDLE_DAYS`), no merge of its
  own; `2:` matters only with `1: tab` or `1: cookie+expiry`.
- `1: cookie` merges neither branch of question 1; the row's command still merges whatever else you said yes to.

**For crewy, the one rule behind the table:** merge the yes-branches among questions 3, 8, 11, 14 and 15 first, in that
order, then question 1's branch last; every hand merge then happens in that last step, once, in the files named above.

## 2. The evidence

- **Pairwise** (`git merge-tree --write-tree`, the heads in the table above, on `a0750aa`): each branch merges clean
  onto the base. Of the 21 pairs of branches, 18 are clean. The three that conflict: `r27-tab-pairing` ×
  `q1-cookie-expiry` (11 files; the two answers to one question, never merged together), `r27-tab-pairing` ×
  `q3-health-less` (3 files: `apps/host/README.md`, `apps/host/test/pairing.test.ts`, `apps/world/hostPort.ts`),
  `q1-cookie-expiry` × `q3-health-less` (1 file: `apps/host/src/host.ts`). Every pair involving q8, q11, q14 or q15 is
  clean: `r27-tab-pairing` × `q8-offline-say` conflicted until round 38, when the branch got back the two
  `LOOPS_SETUP.md` paragraphs it had dropped (C, G below).
- **The `tab` rows, replayed on `a0750aa`** with `tools/answers-replay.mjs` (round 38, each with q11, q14 and q15 too,
  which change nothing by hand):

| Set | Result | Rules that ran | `npm run check` |
| --- | --- | --- | --- |
| `tab`, q11, q14, q15 | `5de0cad` | none (every merge clean; C: the paragraphs are there) | |
| `tab`, q3, q11, q14, q15 | `922f08c` | D, E, F in one hand merge; C | |
| `tab`, q8, q11, q14, q15 | `a8aac39` | none (q8 merges clean with r27 now); C | |
| `tab`, q3, q8, q11, q14, q15 | `0267f16` | D, E, F in one hand merge; C | **1084 / 1084**, green |

- **The full browser regress, round 38's night** (`tools/regress.mjs`, every group, against the dev loops; each run
  behind its own Vite and host port and with its own `CREWHUB_WORLD_CONFIG_DIR`): on the base `d5a5bf9`, **197 / 197**;
  on the replay of the heaviest set (`tab`, q3, q8, q11, q14, q15), in a detached worktree of its own, result `d7cae91`
  (the same tree as the daytime replay `1721cc4`), `npm run check` 1083 / 1083 and the regress **198 / 198**. The one
  check more is `r27-tab-pairing`'s own, in the `chat` group: none of the page's asks on road 2 carries the tab's
  pairing header. Nothing of the replay was pushed; its result is a commit on no branch.
- **The heaviest set held up as well as the head, round 39's night.** Each run had its own ports and its own
  `CREWHUB_WORLD_CONFIG_DIR`.
  - **A 330-minute soak** of the replay `d7cae91`, live against the dev loops with the seed moving work and a second
    tab paired from its sibling: heap after GC +0.08 MB an hour (round 27 on the head of its day: 0.24), DOM nodes
    287 throughout, listeners flat, the host process's memory 44 to 65 MB and 4 to 7 sockets from minute 30 on, 65
    reconnects (two per 10 minutes, loops' 300 s stream end, as round 27). Nothing grows. Road 1's chat was not soaked:
    that loops is older than the viewer key.
  - **Two findings against answer branches, both fixed on the branch** (one commit each, no rebase):
    - `task/q8-offline-say` → `2fb1847`: offline, the Connection panel said the one-tab sentence twice, in the Town
      and Zones rows (the a11y trees); it now says it once per place.
    - `task/r27-tab-pairing` → `de2969e`: every unpaired cold start, the demo included, waited 300 ms for the other
      tabs before the source was decided (348 → 649 ms to the town). The tabs are now asked only when the host says
      this tab is not paired, and a sibling's answer is followed by one more health probe.
  - **The replay with both fixes,** `tab q3 q8 q11 q14 q15` on `c0ae5ec` (D, F, E; C passes), result `e0b04e7`:
    `npm run check` 1086 / 1086, the full regress **197 / 197** (198 less the `real` group's dust check, skipped
    because the soak's seed left no quiet stretch on the loops), `tools/a11y.mjs --demo` 188 / 188 as on the head, the
    cold start 337 and 359 ms against the head's 329 and 340. The budget's other rows (bundle +0.15 %, frames, phone,
    heap at 16x) read as the head's.
- **Road 1's chat on the heaviest set, round 40's night.** One hour of the replay `e0b04e7` live against the
  in-process fake, whose key reads the chat (its own ports and `CREWHUB_WORLD_CONFIG_DIR`). The Chat panel was open on
  road 1 and a paired second tab beside it.
  - **The load:** 1 019 messages to the agents, one every 5 s plus a burst of 300 at once at minute 30. The host read
    every one of the 1 020 agent answers over road 1.
  - **The gate (`task/q14-dm-read-cap`):** during the burst the host made 312 reads, all 200, with at most 8 in flight
    and no retry. Nothing was lost. Four answers were read twice, at the three moments the fake's sealed cursor expired
    and the host re-snapshotted from the tail; the page still showed each answer once (1 020 rows for 1 020 answers).
  - **Nothing of the page's grows:** Recent answers stay at their cap of 10, the bubbles expire, the threads stay 3,
    and DOM nodes (472 to 492) and listeners (238 to 240) are flat from minute 10 on. Frame p95 was 17.9 to 18.2 ms.
  - **The heap after GC:** 24.0 → 25.2 MB from minute 10 to 60. The snapshot diff names 0.72 MB as JIT code for the
    chat's code paths and 0.14 MB as the inspector's own records. About 0.3 MB of JS objects is inside the hour's noise
    (neighbouring samples moved up to 0.8 MB). The same hour on the head was not needed: it was to run only if the
    replay grew.
- **Three hours of the same, round 41's night.** The replay `e0b04e7` ran 180 minutes on the same rig, with a burst
  of 300 at minute 90. Its own ports and `CREWHUB_WORLD_CONFIG_DIR`.
  - **The chat:** 2 303 messages sent, 2 304 answers read and each shown once, at most 8 reads in flight.
  - **The heap:** the slope did not level off (0.85 MB an hour over minutes 100 to 180). Every part of it named from
    raw snapshots is the head's, not an answer branch's. An hour on the head grew the same objects at the same pace.
  - **What grew:** the figures that are faded at the snapshot's moment (a proxy, a stale agent) and their see-through
    copies of the kit's materials. They rise and fall with the storyline, and are released when the figure un-fades.
    The rest is JIT code.
  - **One leak found and fixed on the head, not on an answer branch:** the far crowd made a batch, with a copied
    material, for every glow strength the day-night drift passed. With the potlings in the demo that was 5.4 MB a
    minute. `task/r41-crowd-materials` (`bbcf897`) was merged on `feat/world-demo` as `e6c934d`; with it the batches
    stay at 90 for an hour.
  - **The head without q14's gate:** in the same burst of 300 the host opened 300 reads at once, 172 failed, and the
    page showed 848 of 1 020 answers. With the gate, none was lost.
  - **The replay on the new base,** `tab q3 q8 q11 q14 q15` on `e6c934d` (D, F, E; C passes), result `8e544c6`:
    `npm run check` 1089 / 1089. Each answer branch still merges cleanly onto `e6c934d`.
- **Round 45's night, on the head only.** The head moved under the answers in rounds 42 to 45: the faded figures'
  shared copies, the node guards, `erasableSyntaxOnly`, round 44's three small makers (one in `apps/host/src/host.ts`,
  the archive memory on a new target), the soak tool in `tools/memory.mjs` and `tools/lib/live.mjs`.
  - **The merges:**
    - `task/r27-tab-pairing` conflicted for a moment with the soak tool in `tools/lib/live.mjs`, two new fields
      beside its `pair()`. A Lead commit on the head moved them (`d435d2b`), and no answer branch changed.
    - All seven merge cleanly onto `d220f3a`. None adds an enum, a namespace or a parameter property, so the new
      type flag passes on them.
  - **The per-cast demo hour on the head** (each cast an hour, drift on): the crowd's batches and materials and the
    JS objects are flat for all four. The heap's remaining slope of about 1 MB an hour is V8's optimised code.
  - **The replay on the new base,** `tab q3 q8 q11 q14 q15` on `d220f3a` (D, F, E; C passes), result `3e37de5`:
    `npm run check` 1110 / 1110.
- **Round 47's night, on the head only.** A fresh review of rounds 41 to 46 found two bugs that touch the answers'
  areas, fixed on the head (`b811561`):
  - **`apps/host/src/host.ts`:** a loops found again is judged by the archive file as it stands, not as it was when
    the host started (F1).
  - **`tools/lib/chatSoak.mjs` and `tools/lib/live.mjs`:** the chat soak sums question 14's lost count from its
    exact log line (F8). Before, 172 lost reads printed `lost 1`.
  - **The merges:** all seven merge cleanly onto `b811561`. `task/r27-tab-pairing`'s `pair()` in `live.mjs` stayed
    clear of the tool's changes.
  - **The replay on the new base,** `tab q3 q8 q11 q14 q15` on `b811561` (D, F, E; C passes), result `49bc427`:
    `npm run check` 1125 / 1125. No rule of the plan changed.
- **Round 48's night, on the head only.** A fresh review of `apps/host` and `tools/` fixed small host bugs in two
  passes:
  - `stream.ts`: a stopped upstream no longer opens a stream;
  - `host.ts`: a heartbeat and a timer that outlived the host;
  - `config.ts`: `~` in the pairing file;
  - `doctor.ts`: a warning no longer fails the run;
  - `snapshot.ts`: `mapLimit` stops after a rejection;
  - `main.ts`: the start messages and the signal handlers.
  - **The `q14` overlap:** the first placement of the `close()` timer line conflicted with `task/q14-dm-read-cap`. It
    was moved apart on the branch, so the plan needs no new rule.
  - **The merges:** all seven merge cleanly onto `f2495d2`.
  - **The replays, with the full check:**
    - `tab q3 q8 q11 q14 q15` on `f2495d2` (D, F, E; C passes): result `cc7f5c7`, 1140 / 1140;
    - `cookie+expiry q3 q8 q11 q14 q15` (A, then B): result `12b9164`, 1138 / 1138.

    The first pass alone, on `e4acaa7`, gave `683040d` (1133) and `830af8a` (1131).
  - **`tools/answers-replay.mjs`** now merges with plain two-sided markers whatever `merge.conflictStyle` a person's
    git sets, and refuses a diff3 base section.
- **The `cookie+expiry` and `cookie` rows, rehearsed in round 37** (detached checkouts; the five independent branches
  then the question-1 branch): the five alone on `e55ef42`, check 1070 of 1070; the five then `q1-cookie-expiry` (A,
  then B), check 1075 of 1075 on `e55ef42` and again on `761db9f` (`769434a`); the five then `r27-tab-pairing`, check
  1075 of 1075 on `e55ef42` and on `761db9f` (`a24d4fd`), when G still ran. The replay in the repository reproduced both
  `761db9f` results to the byte (`git diff --stat` empty).
- **A semantic check, not only a textual one.** Two clean textual merges were red until a line was fixed: B (q1 adds a
  health field that a q3 test pins), and the round-34 guard fuzz on `r27-tab-pairing` (fixed on that branch in round
  36, `c497a5d`). C existed because `r27-tab-pairing` dropped two paragraphs of `LOOPS_SETUP.md` that have nothing to do
  with pairing, which `git merge-tree` calls clean; since round 38 the branch carries them and C is a check. Nothing else
  surfaced: the typecheck, every unit test, the doc links, the design and copy guards and the build pass on each
  rehearsed chain.

## 3. The hand merges, exactly

Each resolution is written on the two sides' content, so the side git calls "ours" does not matter. A replay script
that does all of this mechanically is named in §4.

### A. `apps/host/src/host.ts` (q1-cookie-expiry after q3-health-less)

One block, in the `/health` case of the route switch. q3's side adds a two-line comment ("Before pairing: the states and
nothing else…") and `const isPaired = paired(req);`. q1's side is empty there, because q1 already declares
`const isPaired = verdict.state === "paired";` a few lines above the switch (its sliding idle window needs the verdict
on every route). **Keep q3's comment, drop q3's `const isPaired` line.** Why: q1's `isPaired` is the same verdict, and a
second declaration is a TypeScript error; everything q3 does with `isPaired` below (the blank name, the hidden cursor
and version, the dev origins to a paired page) then runs on q1's value.

### B. `apps/host/test/pairing.test.ts` (q1-cookie-expiry after q3-health-less; no conflict markers)

q3's test "before pairing health says the states and nothing else" pins the exact keys of health before pairing; q1
adds `pairingIdleDays` to health (always present, question 2's number for the Pair screen). The textual merge is clean
and the test is red. **Add `"pairingIdleDays"` to that list**, between `"pairing"` and `"sharedKey"`. Why: it is a
setting, not one of the facts question 3 hides (the bot's name, the cursor, loops' version, the chat word).

### C. `docs/LOOPS_SETUP.md`: the two paragraphs r27-tab-pairing once dropped (with `tab`: a check, nothing to do)

When round 27 rewrote "Pair this browser" into "Pair this tab", the branch removed, with the cookie paragraph, the two
paragraphs that follow it and are not about pairing: "The source setting is `auto` by default…" and "Zones: every live
project sits in the default zone…" (the town kept by the host, the undo history, the restore, the one-time copy).
`git merge-tree` calls a deletion clean, so nothing warned; round 37's plan put them back after every `tab` merge.
**Since round 38 the branch carries them itself** (`4fed988`, worded as on `a0750aa`, in the same place), so after
merging `task/r27-tab-pairing` there is nothing to do: the replay only checks that both paragraphs are there and
**stops, with the file named, when they are not** (that would mean the branch dropped them again, and a person looks;
it does not put them back on its own any more).

### D. `apps/host/README.md` (r27-tab-pairing after q3-health-less)

One block, the dev-origin paragraph. q3's side says to whom the dev origins are told (a program, a paired browser,
never an unpaired page with an Origin) and ends "Pairing is untouched: the page still needs its cookie."; r27's side is
the shorter older text with "bearer". **Keep q3's whole paragraph and write "bearer" for "cookie".**

### E. `apps/world/hostPort.ts` (r27-tab-pairing after q3-health-less)

One block, two definitions. q3's side: `const head = \`dev: /world-api and /pair go to the host on …\`` and
`const key = (name: string, state: string | null) => …` with its two-line comment (the name is blank before pairing, so
the line says the key's state). r27's side: `const head = \`dev: /world-api goes to the host on …\`` (no `/pair` proxy:
the token rides in the fragment) and the older `key(name)`. **Take r27's `const head` line and q3's `key` with its
comment.** The merged `hostPort.test.ts` (both branches changed it, cleanly) expects exactly these words.

### F. `apps/host/test/pairing.test.ts` (r27-tab-pairing after q3-health-less)

One block: q3's two new tests ("before pairing health says the states and nothing else", "the dev origins: in health
and its header…") followed by the old title of the link test; r27's side is only its new title for that test. q3's
tests pair with a cookie; on r27 `pair()` answers `{ paired, value, idleDays }`, where `paired` is the header object to
send (`x-world-pair`). **Keep q3's two tests, ported:** `const { cookie } = await pair(host.mintPairLink())` becomes
`const { paired: header } = …` in the health test (its own `paired` variable is the health body) and `const { paired } =
…` in the dev-origins test; `status(url, { cookie })` becomes `status(url, header)`; `read({ origin: host.url, cookie })`
becomes `read({ origin: host.url, ...paired })`; the keys list gains `"pairingIdleDays"` (r27 adds it to health as q1
does). **Then r27's title line** ("a link carries the token in the fragment and pairs once…") closes the block.

### G. `docs/LOOPS_SETUP.md` (r27-tab-pairing after q8-offline-say): retired in round 38

Until round 38 this was one block: q8's side held the cookie paragraph and the two paragraphs of C with q8's sentence
("one tab at a time…"), r27's side its bearer paragraph alone, and the resolution took r27's paragraph followed by q8's
side from "The source setting is `auto`" on. With the paragraphs back on the branch (C) the two sides no longer overlap:
q8's sentence lands in a paragraph both have, r27's bearer paragraph replaces a cookie paragraph q8 did not touch, and
`git merge-tree` of `task/r27-tab-pairing` against `task/q8-offline-say` is **clean**. The replay has no rule for this
file any more: a conflict in `docs/LOOPS_SETUP.md` is for a person.

## 4. Checking the result, and the replay

After the merges: `npm run check` on the head (the counts above are what to expect at these branch heads), and, before
a push, the full browser regress at night (`node tools/regress.mjs --port <your Vite> --host-port <a port of your own>`,
all ten groups; the `connect` group walks every pairing screen, the `live` group pairs through the one-time link). A red
check after a clean textual merge is the plan's own warning: look for a test that pins what another branch changed, as
B did.

The replay is in the repository: `node tools/answers-replay.mjs <base> <tab|cookie+expiry|cookie> [q3] [q8] [q11] [q14]
[q15] [--check]`. Start it from a checkout that has the file (it reads itself once, at start; the base can be any
commit, with or without it). It runs in the current worktree on a detached checkout of the base, merges in the order above, replays
the hand merges A, D, E and F from rules kept as data in the script (each a rule on the two sides' content; G is retired),
does B as a follow-up and the check C, prints the result's sha and, with `--check`, runs `npm run check` on it (the log lands under
`tools/out/`). It touches no branch and never pushes; the result is a detached commit to look at, or to fast-forward
`feat/world-demo` to by hand once Nicky has answered and the night's regress is green. Re-run it on every new head of
`feat/world-demo`: a conflict it does not know, or a side whose content is not what a rule expects, stops it with the
file named and the merge left open, which is the sign that a resolution needs a fresh look. The rules' pure parts are
unit-tested in `scripts/test/answersReplay.test.ts`.
