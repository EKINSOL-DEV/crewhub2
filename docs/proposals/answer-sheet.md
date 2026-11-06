# The answer sheet (round 69, 2026-11-06)

One page for every decision that waits on you, one row each, drawn from the three pages that hold them:
[open-questions.md](open-questions.md) (15 questions), [design-choices.md](design-choices.md) (50 headings, two of them new
tonight) and [walkthrough-r64.md](walkthrough-r64.md) (the walk findings). Each row has the id, the question in one line, the
options in the answer's own form, the **recommended** option (the source page's own, never a new one), what stays if you say
nothing, and the branch that is ready, with its short sha as of tonight. Nothing here changes until you answer; the three
pages hold the reasons, and [merge-plan.md](merge-plan.md) says how the answer branches land.

## The three shortest ways to answer

1. **`all recommended`**: every row takes its recommended option. Three rows recommend two options and keep a word for you:
   question 1 (`tab` if the cookie's threat is in scope, else `cookie+expiry`), T4 (`lift` or `end`) and W2 (`alert` or
   `waiting`); `all recommended, 1: tab, T4: end, W2: alert` settles them.
2. **`walkthrough: all`**: every prepared walk branch merges. That is a fast-forward of `feat/world-demo` to
   `sugg/all-r65-on-head` (`f65f4cb8` tonight: `feat/world-demo@0dee42ed` plus the 40 prepared branches, every tip inside it),
   the build four walkers walked in rounds 67 and 68. The walk ids that are not prepared (a design choice holds them, or
   nothing is built) stay as they are unless you answer them one by one.
3. **One line per row**, in the form the row's third column shows: `3: less`, `W7: drop`, `w3-1: do it`, `w6-13: as it is`,
   `journey 4: as suggested`, `wording block: as recommended`, `T: as recommended`.

## Where questions 1, 3 and 8 land in the merge plan

The merge plan's §1 table ("Your answers, your row, and what happens") is keyed on these three. The recommended answers are
`3: less` and `8: say`, with question 1 either `tab` or `cookie+expiry`:

- **`1: tab`, `3: less`, `8: say`**: the table's last row, "**one merge**, the same three files (D, E, F); rehearsed, the
  command does it", the command `node tools/answers-replay.mjs feat/world-demo tab q3 q8 [q11] [q14] [q15] --check`.
- **`1: cookie+expiry`, `3: less`, `8: say`**: the third row, "**one merge**, one file (`apps/host/src/host.ts`, A) and a
  one-line test fix (B); rehearsed, the command does it", the command `… cookie+expiry q3 [q8] [q11] [q14] [q15] --check`.

The other three branch answers (`11: show`, `14: cap`, `15: cap`) merge cleanly in any row. The plan's table of ports by
head ends at `feat/world-demo@e3da2c1` (round 61); `feat/world-demo` is 80 commits on from it tonight (rounds 62 to 68:
mutation tests, the walks, their fixes and docs), and the plan has not been replayed on a head since, so the ports named on
its last row are the ones to pass until crewy replays on `0dee42ed`.

## Open questions (open-questions.md, 15)

Branches checked tonight with `git rev-parse`; local and origin agree.

| Id | The question | Answer form | Recommended | If you say nothing | Ready branch |
| --- | --- | --- | --- | --- | --- |
| 1 | Pairing: keep the cookie, or a bearer per tab? | `1: tab / cookie+expiry / cookie` | `tab` if that threat is in scope; otherwise `cookie+expiry` | `cookie`: the branch stays unmerged; the threat neither accepted in writing nor closed | `tab`: `task/r27-tab-pairing` `de2969e1`; `cookie+expiry`: `task/q1-cookie-expiry` `67d6970a`; `cookie`: none needed |
| 2 | How many days an unused pairing lives | `2: 30 / <days> / never` | `30` | 30 days when question 1 brings an expiry (`tab` or `cookie+expiry`); with `cookie` there is none | rides on question 1's branch; another number is one setting (`CREWHUB_WORLD_PAIRING_IDLE_DAYS`) |
| 3 | What health says before a browser is paired | `3: less / as-is` | `less` | `as-is`: everything, as today | `task/q3-health-less` `dbb5a41e` |
| 4 | Keep the dev-origin route? | `4: keep / remove` | `keep` | `keep` | none (a code removal if `remove`) |
| 5 | The tour's first card 1.5 s after the town stands | `5: 1.5 / <seconds>` | `1.5` | 1.5 s | none |
| 6 | Should build mode wait for the host's town? | `6: wait / at-once` | `at-once` | `at-once` | none |
| 7 | Connect and Pair screens over the scene, or in its place | `7: over / replace` | `replace` | `replace` | none |
| 8 | Offline editing in two tabs of one browser | `8: support / say / as-is` | `say` | `as-is` | `say`: `task/q8-offline-say` `2fb1847f` (`support` is not built) |
| 9 | The chat's road 2: one poller per tab | `9: accept / one-tab` | `accept` | `accept` | none |
| 10 | Should the stream carry the host's chat word? | `10: stream / re-read` | `re-read` | `re-read` | none |
| 11 | Say "since this page opened" on Recent answers | `11: show / as-is` | `show` | `as-is` | `show`: `task/q11-recent-since` `2c0bd7f7` |
| 12 | The Connection panel's Chat section below the fold | `12: top / below` | `below` | `below` | none |
| 13 | Retire `task/r19-viewer-switch` | `13: retire / merge` | `retire` | the branch stays as it is, unmerged | `merge`: `task/r19-viewer-switch` `f0a1e98d` (a no-op merge; `retire` deletes it) |
| 14 | A cap on the host's parallel reads of agent messages | `14: cap / <number> / as-is` | `cap` | `as-is`: a burst of hundreds keeps losing bubbles (the branch stays unmerged) | `cap`: `task/q14-dm-read-cap` `f8fa725c`; `<number>` is that branch with one constant changed |
| 15 | A size cap on an upstream body from loops | `15: cap / <size> / as-is` | `cap` at 4 MB | `as-is` | `cap`: `task/q15-body-cap` `c83b27c9`; `<size>` is that branch with `UPSTREAM_BODY_LIMIT` changed |

The questions page and the merge plan name the same seven branches at the same heads (`de2969e`, `67d6970`, `dbb5a41`,
`2fb1847`, `2c0bd7f`, `f8fa725`, `c83b27c`), and those are the tips tonight.
