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

The other three branch answers (`11: show`, `14: cap`, `15: cap`) merge cleanly in any row. **The ports.** Since round 59
the answer branches themselves no longer merge clean onto the head (tonight, by `git merge-tree` on `0dee42ed`: every one
conflicts but `task/q8-offline-say`); a port per branch carries the same change on the head, and the plan's §4 says which
port stands for which branch (`--use`). Its table ends at `feat/world-demo@e3da2c1` (round 61); the six ports on that row
all merge clean onto `0dee42ed` tonight (checked by rd1 and by sh, `git merge-tree`), so they are the ones to pass to the
replay on today's head. The full replay with `npm run check` has not been run on a head after `e3da2c1`; the plan is redone
when crewy replays on `0dee42ed`. The rows below name the branch (yours) and its port (the one to merge).

## Open questions (open-questions.md, 15)

Branches and ports checked tonight with `git rev-parse`; local and origin agree. A port's sha is the tip to merge on today's
head; the branch's sha is the answer as the questions page and the merge plan name it.

| Id | The question | Answer form | Recommended | If you say nothing | Ready branch |
| --- | --- | --- | --- | --- | --- |
| 1 | Pairing: keep the cookie, or a bearer per tab? | `1: tab / cookie+expiry / cookie` | `tab` if that threat is in scope; otherwise `cookie+expiry` | `cookie`: the branch stays unmerged; the threat neither accepted in writing nor closed | `tab`: `task/r27-tab-pairing` `de2969e1`, on today's head its port `port/task/r27-tab-pairing@50c712c` `8e9584d5`; `cookie+expiry`: `task/q1-cookie-expiry` `67d6970a`, port `port/task/q1-cookie-expiry@e5f79a9` `7d66a9bd`; `cookie`: none needed |
| 2 | How many days an unused pairing lives | `2: 30 / <days> / never` | `30` | 30 days when question 1 brings an expiry (`tab` or `cookie+expiry`); with `cookie` there is none | rides on question 1's branch; another number is one setting (`CREWHUB_WORLD_PAIRING_IDLE_DAYS`) |
| 3 | What health says before a browser is paired | `3: less / as-is` | `less` | `as-is`: everything, as today | `task/q3-health-less` `dbb5a41e`, port `port/task/q3-health-less@8a1ae94` `1aa9fe44` |
| 4 | Keep the dev-origin route? | `4: keep / remove` | `keep` | `keep` | none (a code removal if `remove`) |
| 5 | The tour's first card 1.5 s after the town stands | `5: 1.5 / <seconds>` | `1.5` | 1.5 s | none |
| 6 | Should build mode wait for the host's town? | `6: wait / at-once` | `at-once` | `at-once` | none |
| 7 | Connect and Pair screens over the scene, or in its place | `7: over / replace` | `replace` | `replace` | none |
| 8 | Offline editing in two tabs of one browser | `8: support / say / as-is` | `say` | `as-is` | `say`: `task/q8-offline-say` `2fb1847f`, merges clean as itself (`support` is not built) |
| 9 | The chat's road 2: one poller per tab | `9: accept / one-tab` | `accept` | `accept` | none |
| 10 | Should the stream carry the host's chat word? | `10: stream / re-read` | `re-read` | `re-read` | none |
| 11 | Say "since this page opened" on Recent answers | `11: show / as-is` | `show` | `as-is` | `show`: `task/q11-recent-since` `2c0bd7f7`, port `port/task/q11-recent-since@a2faadd` `a031c277` |
| 12 | The Connection panel's Chat section below the fold | `12: top / below` | `below` | `below` | none |
| 13 | Retire `task/r19-viewer-switch` | `13: retire / merge` | `retire` | the branch stays as it is, unmerged | `merge`: `task/r19-viewer-switch` `f0a1e98d` (a no-op merge; `retire` deletes it) |
| 14 | A cap on the host's parallel reads of agent messages | `14: cap / <number> / as-is` | `cap` | `as-is`: a burst of hundreds keeps losing bubbles (the branch stays unmerged) | `cap`: `task/q14-dm-read-cap` `f8fa725c`, port `port/task/q14-dm-read-cap@f2276db` `bf71781c`; `<number>` is that branch with one constant changed |
| 15 | A size cap on an upstream body from loops | `15: cap / <size> / as-is` | `cap` at 4 MB | `as-is` | `cap`: `task/q15-body-cap` `c83b27c9`, port `port/task/q15-body-cap@2aad37d` `d3dd9eb0`; `<size>` is that branch with `UPSTREAM_BODY_LIMIT` changed |

The questions page and the merge plan name the same seven branches at the same heads (`de2969e`, `67d6970`, `dbb5a41`,
`2fb1847`, `2c0bd7f`, `f8fa725`, `c83b27c`), and those are the tips tonight. Question 13's `merge` is still a no-op: the
branch merged with `0dee42ed` is tree-identical to it (rd1, round 69).

## Design choices (design-choices.md, 48 as of round 66, plus the two below from part B)

Every "if you say nothing" is the world as it is today, in the page's own words. No design choice has a branch ready; K3
names a held one. *w* marks the eighteen wording choices: `wording block: as recommended` takes them all at once (W2 then
still needs a word: `alert` or `waiting`). A group answers at once too: `T: as recommended`.

| Id | The choice | Answer form | Recommended | If you say nothing | Ready branch |
| --- | --- | --- | --- | --- | --- |
| T1 | The tour card over the playback bar | `T1: bottom-left / keep` | `bottom-left` | the card stays at the bottom centre | none |
| T2 | The focus after the tour | `T2: stage / help` | `stage` | the "?" button keeps the ring | none |
| T3 *w* | The name a screen reader hears for the stage | `T3: town / keep` | `town` | a screen reader hears "CrewHub World" | none |
| T4 | The chat dock's button over the open sheets | `T4: lift / end / keep` | `lift` or `end` (the review gave both; `end` keeps the dock reachable too) | the button stays over the sheets | none |
| T5 | The town's framing on a phone | `T5: frame / keep` | `frame` | the phone's town stays framed low | none |
| T6 | The phone header's Demo chip | `T6: word / keep` | `word` | the icon alone | none |
| T7 | The focus ring round the whole screen | `T7: keep / hide` | `keep` | kept | none |
| T8 | The host's address in the demo's Settings | `T8: answered / disclosure / keep` | `answered` | the line stays | none |
| T9 | The long Connect screen on a phone | `T9: disclosure / keep` | `disclosure` | the paragraph stays open | none |
| W1 *w* | The text view's snapshot time | `W1: clock / keep` | `clock` | the ISO time stays | none |
| W2 *w* | "Lit:" on a plate | `W2: waiting / alert / keep` | `alert` or `waiting` (the review named both) | "Lit:" | none |
| W3 *w* | The demo note on every plate | `W3: cards / keep` | `cards` | the note on every plate | none |
| W4 *w* | "Needs a person: 3 waiting on a person." | `W4: once / keep` | `once` | said twice | none |
| W5 *w* | "2 props joins the catalogue" | `W5: plural / keep` | `plural` | "2 props joins" | none |
| W6 *w* | "the lobby keeps the count" | `W6: drop / keep` | `drop` | the lobby "keeps the count" | none |
| W7 *w* | "tonight" in Settings | `W7: drop / keep` | `drop` | "tonight" | none |
| W8 *w* | The "Director model" field | `W8: none / keep` | `none` | the model's name stays | none |
| W9 *w* | The words for a ticket status newer than this build | `W9: as-built / <words>` | `as-built` | as built | none |
| W10 *w* | The line of a card that could not be drawn | `W10: as-built / <words>` | `as-built` | as built | none |
| W11 | A label layer that fails shows nothing | `W11: nothing / line` | `nothing` | nothing is shown | none |
| W12 | The "Where is …?" answer keeps talking | `W12: keep / on-choice` | `on-choice` | it keeps announcing | none |
| W13 *w* | A name that left "Where is …?" | `W13: as-built / <words>` | `as-built` | as built | none |
| W14 *w* | Copy that cannot copy on the Pair screen | `W14: as-built / <words>` | `as-built` | as built | none |
| W15 *w* | Which bot the host's own words send people to make | `W15: viewer-first / keep` | `viewer-first` | the host's words send people to "New external bot" | none |
| W16 *w* | "Not a control" and loops' own chat | `W16: say-the-frame / keep` | `say-the-frame` | as it is | none |
| L1 | "Loops down" for a host that is fine with loops | `L1: own-words / keep` | `own-words` | "Loops down" | none |
| L2 | Road 2 waits for the browser to be online | `L2: ignore / keep` | `ignore` | offline, road 2 asks nothing | none |
| L3 | The chip says Live while the team snapshot is stale (walk finding w2-3) | `L3: snapshot / own-word / keep` | `snapshot` (two limits: measure first that a real loops' stamp moves on an upload with no change, else L3 comes back; a probe clock more than 5 min off reads Stale) | the chip as it is | none (a day's slice) |
| H1 | The host makes a folder it was pointed at private | `H1: warn / tighten` | `warn` | any named folder becomes 0700 | none |
| H2 | `npm run world` beside a running `npm run host` | `H2: refuse / take-over / keep` | `refuse` | the JSON error page | none |
| H3 | "Forget this key" on a key from the old default key file | `H3: stored-only / host-says / keep` | `stored-only` | Forget on a default-file key comes back at the next start | none |
| S1 *w* | cl-lead's status line at 15:36 | `S1: waits / keep` | `waits` | the old line | none |
| S2 *w* | "Brand and Lab are the quiet ones" | `S2: drop / <words>` | `drop` | the sentence stays | none |
| S3 *w* | "stuck since the merge" | `S3: idle / keep` | `idle` | "stuck" | none |
| S4 | The demo's rooms after a seek back | `S4: forget / keep` | `forget` in the demo (live mode keeps them) | the rooms stay after a seek back | none |
| E1 | Escape in a zone's name field | `E1: escape / keep` | `escape` | leaving the field writes the draft | none |
| E2 | The demo town in two tabs | `E2: say / sync / keep` | `say` | the later write wins, unsaid | none |
| K1 | A cast made for a newer world: refused whole, or drawn with what this world knows? | `K1: lenient / refuse` | `lenient`, for those three enums only | a cast from a newer world is refused, and classic-bots stands in | none |
| K2 | Walking at 8x and 16x: at story speed, or calmer? | `K2: story / even / keep` | `story` | today's frame-rate-dependent slowdown stays | none |
| K3 | A cast that could not be loaded, on screen | `K3: say / keep` | `say` | "No cast named … is installed" | none ready; held with `task/r50-casts-held` `9ebd022c`, a branch of this Mac only, not on origin |
| X1 | Which agent answers are spoken | `X1: own / all / none` | `own` | nothing is spoken | none |
| X2 | The text view and the Chat panel over the toolbar on a desktop | `X2: inert / below / keep` | `inert` | the covered buttons stay tabbable | none |
| X3 | The faded labels | `X3: keep / 0.7 / 0.75` | `keep`, with the README line | 0.32, and no README line | none |
| X4 | The header at 320 px (with T6) | `X4: drop-word / wrap-tools / keep` | `drop-word` | the overlap stays | none |
| X5 | The canvas's name: the whole key guide on every focus | `X5: short / keep` | `short`, with the name fixed | the 60 words on every focus | none |
| P1 | `tools/perf.mjs`'s exit code after a failed scenario | `P1: fail / keep` | `fail` | exit 0 | none |
| P2 | The copied loops files: catch an edit to a copy's body on CI too | `P2: sync / hash / keep` | `sync` | a copy's body is checked only where a crewhub-loops checkout is | none. w5-9 and w5-10 (the walkthrough table), if `do it`, change this same check in another way: it learns one declared patch per copy; a `sync` would have to carry that patch |
| P3 | A test that the clock decides, once, with a wide margin | `P3: race / seam / keep` | `keep` | `keep` | none |

The two choices made tonight from walk findings w1-13 and w4-20 (part B of round 69) follow here once written.
