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
   the same page code as the builds four walkers walked in rounds 67 and 68 (`9daea890`, `46c04f06`; since then tests and
   docs only). The walk ids that are not prepared (a design choice holds them, or
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
port stands for which branch (`--use`). Its last row is `0dee42ed` with `sugg/all-r65-on-head@f65f4cb8` (added tonight);
the six ports on it, the same since `e3da2c1` (round 61), all merge clean onto `0dee42ed` tonight (checked by rd1 and by
sh, `git merge-tree`), so they are the ones to pass to the replay on today's head. Both replays ran with those six ports and passed `npm run check` on `feat/world-demo@29c514ed` in
round 65 (`tab` 1841 tests, `cookie+expiry` 1838), and `feat/world-demo` has changed only docs since (`git diff --name-only
29c514ed 0dee42ed`); on tonight's `sugg/all-r65-on-head` (`f65f4cb8`, which contains `0dee42ed`) they passed again in round 68
(`tab` 1946, `cookie+expiry` 1943). The rows below name the branch (yours) and its port (the one to merge).

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

## Design choices (design-choices.md, 50: 48 as of round 66, and W17 and N1 from round 69)

Every "if you say nothing" is the world as it is today, in the page's own words. No design choice has a branch ready; K3
names a held one. *w* marks the nineteen wording choices: `wording block: as recommended` takes them all at once (W2 then
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
| W17 *w* | An archived building's two ticket lines (walk finding w1-13; new in round 69) | `W17: why / tickets / halls / keep` | `why` | the two lines as they are | none |
| N1 | Fewer labels in a short window (walk finding w4-20; new in round 69) | `N1: compact / tags / keep` | `compact` | the staircase sideways | none |

## Walk findings (walkthrough-r64.md)

One row per id in the six journeys and the "Findings an answer branch already covers" section. The eleven findings in the
page's "Fixed this round" table are done and have no row; the section "What the walks added to the open design choices"
adds no id of its own. **Prepared** means a `sugg/<id>` branch is ready: `do it` merges it, `as it is` leaves it; every
prepared branch's tip tonight is inside `sugg/all-r65-on-head` (`f65f4cb8`), so `walkthrough: all` is the 40 `do it` rows
at once, and `journey N: as suggested` is one journey's. Where a design choice holds a finding, the row points there and
takes that choice's recommendation; answer the choice, not the id. Where nothing is built and no choice holds it, the
recommendation is `as it is` *(Lead, round 69)* with the page's reason. For any id, `<id>: <your words>` is the third
answer, as the page says. A sha is the branch's tip tonight (`git rev-parse`; local and origin agree).

| Id | The finding | Answer form | Recommended | If you say nothing | Ready branch |
| --- | --- | --- | --- | --- | --- |
| w1-11 / w4-8 | A click or tap on a figure's name pill zooms the room instead of opening its card | `w1-11: do it / as it is` | `do it` (finished in round 67: the town's pills now take the click or tap too) | the pill lets the click through | `sugg/w1-11` `130f8896` |
| w1-12 | Three Details labels lead with "RULE", a build-mode word | `w1-12: do it / as it is` | `do it` | the RULE labels | `sugg/w1-12` `ed66836a` |
| w1-13 | An archived building's text says its ticket counts twice, once as all zero | `W17: why / tickets / halls / keep` (design choice W17, new in round 69) | W17's `why` | the two lines | none |
| w1-14 | The tour's last card covers the breadcrumb bar | `w1-14: do it / as it is` | `do it` | the card over the bar | `sugg/w1-14` `ef784275` |
| w1-15 | A building sign has no hover state | `w1-15: do it / as it is` | `do it` | hover changes the pointer only | `sugg/w1-15` `b8b3a8d3` |
| w1-16 | With Details on, label pairs touch | `w1-16: as it is / <your words>` | `as it is` *(Lead, round 69)*: the write-up has no suggestion for it; the label layout's known gap | the labels touch | none |
| w1-17 | In walk mode the "You" tag is gone once the figure is through the door | `w1-17: do it / as it is` | `do it` (on the base the tag was hidden for about half a second at the door, not for good) | the tag is hidden about half a second at the door | `sugg/w1-17` `dc2c31d4` |
| w1-18 | "loop 0" in the playback bar reads as a code on first start | `w1-18: do it / as it is` | `do it` (the count shows once the script has looped) | "loop 0" from the start | `sugg/w1-18` `300b53ff` |
| w1-19 | The fresh install's plot says "Create a project in crewhub-loops" in letters a few pixels high | `w1-19: do it / as it is` | `do it` | the small board | `sugg/w1-19` `a5683647` |
| w2-1 | With a dialog open over the tour, Escape closes the tour, not the dialog | `w2-1: do it / as it is` | `do it` | Escape closes the tour | `sugg/w2-1` `b4e49da9` |
| w2-2 / w3-7 | Two sheets open at once stack at the same corner, the lower one cut to slivers | `X2: inert / below / keep` (design choice X2's family) | X2's `inert`. The sources differ in reach: X2's options make the covered corners inert or move the sheets under the header; the walk's suggestion (one sheet at a time, or side by side) is not among them, so `X2: inert` does not end the stacking | two sheets stack | none |
| w2-3 (the page's half) | The chip says Live while every event that arrives is old | `L3: snapshot / own-word / keep` (design choice L3) | L3's `snapshot` | the chip keys on arrivals | none |
| w2-4 | The panel's crewhub-loops row breaks the variable name mid-word | `w2-4: do it / as it is` | `do it` | the broken word | `sugg/w2-4` `954fa5e3` |
| w2-5 | A host restart shows as "Stale", then Live, with no word that the host was gone | `L1: own-words / keep` (the mirror of design choice L1) | L1's `own-words`. The sources differ in reach: L1 words two 503s the host sends; a host that does not answer at all is not among L1's options, so `L1: own-words` does not build this state | "Stale" on a host restart | none |
| w2-6 | Two red console lines at every Live start when the world's origin is not set on loops | `w2-6: as it is` | `as it is` *(Lead, round 69)*: its LOOPS_SETUP note is already merged (round 65, `29c514ed`); the browser's CORS line itself cannot be avoided | the two lines, and the note | none needed |
| w2-7 | "I opened the link" pressed before any link was opened says nothing | `w2-7: do it / as it is` | `do it` | the button looks dead | `sugg/w2-7` `4e2c482d` |
| w2-8 | A key with too few rights is refused with 401's cause and "(401 or 403)" on screen | `W15: viewer-first / keep` (design choice W15's family) | W15's `viewer-first`. The sources differ in reach: W15 changes which bot the host's words name; one sentence per status (403 and 401) is not among its options | the one sentence for both | none |
| w3-1 | An answer that comes while the camera is elsewhere shows nothing for its 12 s | `w3-1: do it / as it is` | `do it` | no count on the chip | `sugg/w3-1` `65712011` |
| w3-2 | A bubble over a figure in the town carries no name | `w3-2: do it / as it is` | `do it` | the bubble without a name | `sugg/w3-2` `7db276f7` |
| w3-4 | The bubble's 12 s start when the page sees the line, not when the person gets there | `w3-4: do it / as it is` | `do it`, with the branch's departures: live, the mark stands until the chat is opened or the agent's next answer; a pin's breathing ring and touch area stay on the pin (narrower by about 80 px at 375 and 1440); the 2 px between pin and mark on a phone does nothing; and round 67's v1-1 fix (a mark clicked after the bubble shows the bubble again for 12 s, `cb2342dc`, inside the tip) | the mark goes with the bubble | `sugg/w3-4` `b10a6e14` |
| w3-5 | "About this chat" says "chat head" and "dock" | `w3-5: do it / as it is` | `do it` | the old sentence | `sugg/w3-5` `a75d4aa3` |
| w3-6 | With loops frozen the chip went Live again on a reopened stream | `w3-6: as it is` | `as it is` *(Lead, round 69)*: already fixed and merged (round 65, `5ad0a52c`) | the fix, on the head | none needed |
| w4-2 | The tour, the card, the build sheet and walk mode speak of clicks and keys to a thumb | `w4-2: do it / as it is` | `do it` (in the four places the finding names; a few spoken key hints elsewhere stay) | click and key words on a phone | `sugg/w4-2` `5a34de14` |
| w4-3 | The tour's step 4 reads the dock's every button run together to a screen reader | `T3: town / keep` (design choice T3's family) | T3's `town`. The sources differ in reach: T3's `town` is written for steps 1 and 3 (the stage); step 4's dock is not in its option as worded | the buttons run together | none |
| w4-6 | A tapped sign keeps a red focus ring on a touch device | `w4-6: do it / as it is` | `do it` | the ring after a tap | `sugg/w4-6` `18d73d8d` |
| w4-9 | The card's Answers section sends a phone to "the chat dock (bottom right)" | `w4-9: do it / as it is` | `do it` | the desktop words | `sugg/w4-9` `6f44cd18` |
| w4-10 | The playback slider is 88 px wide on a phone | `w4-10: do it / as it is` | `do it` (upright only; held sideways the four buttons stay) | the short slider | `sugg/w4-10` `f14b5b0c` |
| w4-11 | The jump to the postman frames it at the screen's left edge | `w4-11: do it / as it is` | `do it` (the camera also goes with the figure for 6 s, since the postman walks on while it lands) | the figure at the edge | `sugg/w4-11` `e75b9873` |
| w4-12 | Settings › Town's paired selects cut their words at 390 px | `w4-12: do it / as it is` | `do it` | the cut words | `sugg/w4-12` `42163bb8` |
| w4-18 | Inside a building the build sheet covers the lower 45 % of the screen | `w4-18: do it / as it is` | `do it` (the first way, a shorter sheet; the lower floor is still partly under it) | the tall sheet | `sugg/w4-18` `8f2ef238` |
| w4-20 | Sideways inside a building the labels pile up in a staircase | `N1: compact / tags / keep` (design choice N1, new in round 69) | N1's `compact` | the pile-up | none |
| w4-21 | The Chat panel's two small rows are 18 and 20 px tall | `w4-21: do it / as it is` | `do it` (real 40 px rows, not a pad) | the small rows | `sugg/w4-21` `97a3dde3` |
| w4-22 | The Chat panel says nothing when loops is down | `w4-22: do it / as it is` | `do it` | the panel keeps "Sign in …" | `sugg/w4-22` `f388d8da` |
| w5-6 | The camera keys say nothing to a screen reader | `w5-6: do it / as it is` | `do it` | silent keys | `sugg/w5-6` `3a724a4c` |
| w5-9 | The chat dock's message box drops keystrokes that come fast (a verbatim crewhub-loops copy) | `w5-9: do it / as it is` | *being prepared tonight (C, dk); the Lead fills in its final state before the merge.* `do it` also merges a change to the copy rule: `check:copy` learns the branch's one declared patch on the loops copy, and `loops-dock-input.md` (dk writes it tonight on `task/r69-dock-doc`; a link once it is merged) names it, with the patch for crewhub-loops | every other fast character is lost | `sugg/w5-9`, tonight (C) |
| w5-10 | In the dock's message box Enter adds a newline and only Send sends (a loops copy) | `w5-10: do it / as it is` | *being prepared tonight (C, dk); the Lead fills in its final state before the merge.* `do it` also merges the same change to the copy rule as w5-9, and `loops-dock-input.md` (dk writes it tonight on `task/r69-dock-doc`; a link once it is merged) names it | Enter breaks the line | `sugg/w5-10`, tonight (C) |
| w5-11 | A card opened by Enter on the stage says nothing to a screen reader | `w5-11: do it / as it is` | `do it` | silence | `sugg/w5-11` `11cf9e72` |
| w5-15 | The key hints are read as part of a control's name | `w5-15: do it / as it is` | `do it` | "Town Esc" | `sugg/w5-15` `b4601966` |
| w5-16 | The Help menu reads descriptions as names and the scenario picker reads its tick | `w5-16: do it / as it is` | `do it` (the tick's half only; the name's half is a crewhub-loops copy) | both read | `sugg/w5-16` `af7abe8e` |
| w5-17 | The live Chat chip comes last in the Tab order | `w5-17: do it / as it is` | `do it` | stop 23 of 23 | `sugg/w5-17` `faf777df` |
| w5-18 | Choosing a scenario reloads the page with nothing focused and no warning in the picker | `w5-18: do it / as it is` | `do it` | the silent reload | `sugg/w5-18` `cf809e89` |
| w5-22 | After a connect, a screen reader hears the check start and never its end | `w5-22: do it / as it is` | `do it` (in the runs seen, a shorter sentence, "Connected: Live.", where the base already spoke; the silent run was not reproduced; the node test is the guard if it comes back) | "Connection: Live. Events arrive as they happen." | `sugg/w5-22` `55bcee1a` |
| w5-23 | At loops' return two polite lines come 21 ms apart | `w5-23: as it is / <your words>` | `as it is` *(Lead, round 69)*: the write-up has no suggestion for it (none needed; a longer catch-up would make the first one true) | both lines | none |
| w5-25 | A malformed key's reason is not said to a screen reader | `w5-25: as it is` | `as it is` *(Lead, round 69)*: already fixed and merged (round 65, `cef76e67`) | the fix, on the head | none needed |
| w6-2 | A refused placement says its reason twice | `w6-2: do it / as it is` | `do it` | twice | `sugg/w6-2` `8d0d6aa6` |
| w6-3 | The sheet keeps "Placed Oak bench … It is selected" after the selection is gone | `w6-3: do it / as it is` | `do it` | the stale message | `sugg/w6-3` `20f30431` |
| w6-4 | A refused drag names no prop and no verb | `w6-4: do it / as it is` | `do it` | "Can't: …" | `sugg/w6-4` `c35dfe75` |
| w6-5 | "Old town", "No zone (the town's own district)" and "No zone (buildings without a zone)" are one thing under three names | `w6-5: do it / as it is` | `do it` ("Old town" everywhere) | three names | `sugg/w6-5` `09d87826` |
| w6-6 | "Add a zone" and "Remove this zone" say nothing | `w6-6: do it / as it is` | `do it`, with round 67's v4-1 fix inside the tip (`9b1bbc2e`: the zone line belongs to the revision its edit made, so a later edit clears it) | silence | `sugg/w6-6` `f5d86cee` |
| w6-7 | Escape with build mode and the text view both open closes build mode behind the text view | `w6-7: do it / as it is` | `do it` | the wrong layer closes | `sugg/w6-7` `dde0f414` |
| w6-10 | Two revision numbers for one town | `w6-10: do it / as it is` | `do it` (one number, the host's record) | two numbers | `sugg/w6-10` `7ae61238` |
| w6-12 | Another browser's undo changes the town without a word | `w6-12: do it / as it is` | `do it` | silence | `sugg/w6-12` `56d30d15` |
| w6-13 / w6-15 | The Region's build sheet is a 3 500 px scroll and the cards are drawn under it | `w6-13: do it / as it is` | `do it` (the building picker, and the scene framed beside the open sheet; what stays cut: below 900 px wide Studio's Brand and Lab cards still reach under the sheet, Apps and Lab overlap at most sizes, and the small team's Launch & Marketing sign below 800 px; the town is smaller for it, 0.91 where it was 0.98 at 1280 x 720) | the long sheet, the cards under it | `sugg/w6-13` `fbc0bdc3` |
| w6-14 | "Show free plots" in the Region draws 56 badges in a pile | `w6-14: do it / as it is` | `do it` | the pile | `sugg/w6-14` `0d2a289b` |
| w6-11 / w4-16 | The pairing is a session cookie, while the Pair screen says it stays across host restarts | `1: tab / cookie+expiry / cookie` (question 1 covers it) | question 1's recommendation. With `tab` or `cookie+expiry` the Pair screen's sentence should then say when the pairing holds; the page does not say that either branch does it, so that is a line to write after the merge | the cookie and the sentence as they are | question 1's branches and ports |

Forty rows say `do it` for a prepared branch; eight point at a design choice or a question (w1-13, w2-2 / w3-7, w2-3,
w2-5, w2-8, w4-3, w4-20, w6-11 / w4-16); two wait on tonight's part C (w5-9, w5-10); five are `as it is` by the Lead's
round 69 rule (w1-16 and w5-23 with no suggestion; w2-6, w3-6 and w5-25 already merged in round 65). Round 67's two new findings (v1-1, v4-1) are
fixed inside `sugg/w3-4` and `sugg/w6-6` and need no row.
