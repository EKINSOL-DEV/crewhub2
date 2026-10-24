# Merging Nicky's answers: the rehearsed plan (round 37, 2026-10-24)

Seven answer branches wait on [the open questions](open-questions.md). This page says, for every set of answers Nicky
can give, in which order the branches merge into `feat/world-demo` and what has to be done by hand. Every hand merge
below was rehearsed once on a throwaway checkout of the base `e55ef42` with `npm run check` green on the result, and
is written so it can be redone without thinking. **Nicky needs §1 only**, and only the first two columns of its table
to find the row; crewy and the Lead use the rest (§2 the evidence, §3 each hand merge exactly, §4 the check and the
replay).

The branches, at the heads this plan was made on (the branches are read only; the plan is redone when one moves):

| Question | Answer | Branch | Head |
| --- | --- | --- | --- |
| 1 (and 2) | `tab` | `task/r27-tab-pairing` | `c497a5d` |
| 1 (and 2) | `cookie+expiry` | `task/q1-cookie-expiry` | `67d6970` |
| 1 | `cookie` | no branch | |
| 3 | `less` | `task/q3-health-less` | `dbb5a41` |
| 8 | `say` | `task/q8-offline-say` | `72e1504` |
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
| `tab` | `as-is` | `as-is` | nothing to merge; two paragraphs of `docs/LOOPS_SETUP.md` put back after (C); the command does it | `… tab [q11] [q14] [q15] --check` |
| `tab` | `less` | `as-is` | **one merge**, three files (`apps/host/README.md`, `apps/world/hostPort.ts`, `apps/host/test/pairing.test.ts`: D, E, F), then C; rehearsed, the command does it | `… tab q3 [q11] [q14] [q15] --check` |
| `tab` | `as-is` | `say` | **one merge**, one file (`docs/LOOPS_SETUP.md`, G, which does C); rehearsed, the command does it | `… tab q8 [q11] [q14] [q15] --check` |
| `tab` | `less` | `say` | **one merge**, four files (D, E, F, G); rehearsed, the command does it | `… tab q3 q8 [q11] [q14] [q15] --check` |

So the worst case is one hand merge of four files, all rehearsed and replayed by the command; most answer sets need
none. The letters A to G point at §3, where each resolution is written out for crewy.

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

- **Pairwise.** `git merge-tree --write-tree` of each branch against `e55ef42` is clean for all seven. Of the 21 pairs
  of branches, 17 are clean. The four that conflict: `r27-tab-pairing` × `q1-cookie-expiry` (11 files; the two answers
  to one question, never merged together), `r27-tab-pairing` × `q3-health-less` (3 files), `r27-tab-pairing` ×
  `q8-offline-say` (1 file), `q1-cookie-expiry` × `q3-health-less` (1 file). Every pair involving q11, q14 or q15 is
  clean.
- **The chains, rehearsed** (detached checkouts of `e55ef42`, nothing kept on a branch):
  - q3, q8, q11, q14, q15 in that order: five clean merges; `npm run check` 1070 of 1070 tests, 61 documents.
  - the five, then `r27-tab-pairing`: the four-file hand merge (D, E, F, G); check 1075 of 1075, 62 documents (the
    branch brings `pairing-per-tab.md`).
  - the five, then `q1-cookie-expiry`: the one-file hand merge (A) and the test fix (B); check 1075 of 1075.
  - q11, q14, q15, then `r27-tab-pairing`: clean, then the restore (C); check 1070 of 1070.
- **A semantic check, not only a textual one.** Two clean textual merges were red until a line was fixed: B (q1 adds a
  health field that a q3 test pins), and the round-34 guard fuzz on `r27-tab-pairing` (already fixed on that branch in
  round 36, `c497a5d`). The restore C exists because `r27-tab-pairing` drops two paragraphs of `LOOPS_SETUP.md` that have
  nothing to do with pairing; `git merge-tree` calls that clean. Nothing else surfaced: the typecheck, every unit test,
  the doc links, the design and copy guards and the build pass on each rehearsed chain.

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

### C. `docs/LOOPS_SETUP.md`: the two paragraphs r27-tab-pairing drops (always, with `tab`)

When round 27 rewrote "Pair this browser" into "Pair this tab", the branch removed, with the cookie paragraph, the two
paragraphs that follow it and are not about pairing: "The source setting is `auto` by default…" and "Zones: every live
project sits in the default zone…" (the town kept by the host, the undo history, the restore, the one-time copy).
`git merge-tree` calls a deletion clean, so nothing warns. **After merging `r27-tab-pairing`, put both paragraphs back
from the base, right after r27's bearer paragraph** ("In development the world runs on the Vite origin, which proxies
`/world-api`…"), as a commit of their own. When q8 is in, G does this inside the merge, with q8's sentence. The branch
itself should get this fix when it is next touched; this round it is read only.

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

### G. `docs/LOOPS_SETUP.md` (r27-tab-pairing after q8-offline-say)

One block. q8's side holds the cookie paragraph, then the two paragraphs of C with q8's sentence in the second ("one tab
at a time: two tabs of one browser would mix that one local history…"); r27's side is its three-line bearer paragraph
alone. **Take r27's bearer paragraph, a blank line, then q8's side from "The source setting is `auto`" to the end of the
block.** The cookie paragraph goes (r27 replaces it), q8's sentence stays, and C is done.

## 4. Checking the result, and the replay

After the merges: `npm run check` on the head (the counts above are what to expect at these branch heads), and, before
a push, the full browser regress at night (`node tools/regress.mjs --port <your Vite> --host-port <a port of your own>`,
all ten groups; the `connect` group walks every pairing screen, the `live` group pairs through the one-time link). A red
check after a clean textual merge is the plan's own warning: look for a test that pins what another branch changed, as
B did.

The replay is in the repository: `node tools/answers-replay.mjs <base> <tab|cookie+expiry|cookie> [q3] [q8] [q11] [q14]
[q15] [--check]`. Start it from a checkout that has the file (it reads itself once, at start; the base can be any
commit, with or without it). It runs in the current worktree on a detached checkout of the base, merges in the order above, replays
the hand merges A, D, E, F and G from rules kept as data in the script (each a rule on the two sides' content), does B
and C as follow-ups, prints the result's sha and, with `--check`, runs `npm run check` on it (the log lands under
`tools/out/`). It touches no branch and never pushes; the result is a detached commit to look at, or to fast-forward
`feat/world-demo` to by hand once Nicky has answered and the night's regress is green. Re-run it on every new head of
`feat/world-demo`: a conflict it does not know, or a side whose content is not what a rule expects, stops it with the
file named and the merge left open, which is the sign that a resolution needs a fresh look. The rules' pure parts are
unit-tested in `scripts/test/answersReplay.test.ts`.
