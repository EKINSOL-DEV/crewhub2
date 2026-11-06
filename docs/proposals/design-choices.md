# Design choices for Nicky (rounds 41 to 69, 2026-11-06)

**One page for every decision, one row each:** [answer-sheet.md](answer-sheet.md) (round 69).

**How this relates to [open-questions.md](open-questions.md):** those are the fifteen merge decisions (pairing, health,
the answer branches); these are smaller product choices the reviews of rounds 41 to 51 wrote down and left alone:
words on screen, where a card sits, what the host does in an odd case. Rounds 41 to 47 left none; thirty come from
round 48 (checked against the code at `d150cf4`) and nine from round 50's reviews of the packages and of
accessibility (K, X, W13 and W14, checked at `5126318`), two from round 51's review of the host and the tools
(H3 and P1, checked at `86bfbf6`), X5, the last of round 50's accessibility review, written up in round 52, E2
from round 53's review of the page's state (checked at `402b618`), P2, W15 and W16 from round 54 (checked at
`35a3ebf`), P3 from round 55's look at round 54's mutation runs (checked at `cc23d62`), L3 from round 64's walk
w2-3, written up in round 66 (checked at `ab476f3`), and W17 and N1 from round 64's walks w1-13 and w4-20, written up in
round 69 (checked at `0dee42e`).

**Prepared branches (round 72):** each heading ends with its branch, `dc/<id>` (the recommended option built exactly as the
heading describes it, off `feat/world-demo@2d22df8a`, never merged by itself), or says why none is prepared. `all recommended`
(or a block or a group) is then one merge of `dc/all-r72`, `2d22df8a` plus every prepared branch; the answer sheet's top names it.

**How to answer:** one line per id, in the same short form as the open questions, for example `T1: as recommended`,
`W4: keep` or `S1: waits`. A whole block in one line works too: `wording block: as recommended`
(the nineteen choices marked *wording*, gathered at the end), or `T: as recommended` for a group. **Nothing changes
until you answer:** each choice names what stays if you say nothing, which is always the world as it is today.

**The groups:** [first visit and tour](#first-visit-and-tour-t) (T, 9), [words on screen](#words-on-screen-w) (W, 12),
[the live road](#the-live-road-l) (L, 3), [the host's behaviour](#the-hosts-behaviour-h) (H, 3),
[the storyline](#the-storyline-s) (S, 4), [editing the town](#editing-the-town-e) (E, 2), and from round 50
[the figures](#the-figures-k) (K, 3) and [accessibility](#accessibility-x) (X, 5); words on screen gained W13 and W14;
from round 51 the host gained H3, and [the tools](#the-tools-p) (P, 3) is new; round 53 added E2, round 54 P2,
W15 and W16, round 55 P3, round 66 L3, and round 69 W17 and [the labels](#the-labels-n) (N, 1). **The cost** of a choice names the files, the tests and the pixel sets that would change. The demo pixel set
(`tools/pixcheck.mjs`) pictures the town, the town hall, a building and its rooms at 1440 and 375 px, light and dark,
with the label layer hidden and the tour off; so plates, labels, sheets and the tour never move it.

## First visit and tour (T)

### T1. The tour card over the playback bar (r48-polish C6)

**Today.** On a desktop, steps 1 and 3 ring the whole town, a target as tall as the screen, so the card sits at the
bottom centre over the speed buttons and the clock (`placeStep`, `apps/world/src/state/tour.ts:185-186`); step 2's card
covers Launch & Marketing's pin. The repo's own picture shows it: [tour.jpg](../images/tour.jpg) (the card over the
playback bar's right half).
**Options.** `bottom-left`: a screen-tall target puts the card at the bottom left, clear of the centred playback bar.
`keep`.
**Recommended:** `bottom-left`.
**Cost:** `placeStep` and its cases in `apps/world/test/tour.test.ts`; `docs/images/tour.jpg` would be retaken. No
pixel set (the tour is off in them).
**If you say nothing:** the card stays at the bottom centre.
**Answer:** `T1: bottom-left / keep`
**Prepared:** `dc/T1` `<sha>` (round 72).

### T2. The focus after the tour (r48-polish C8)

**Today.** When the tour opened with nothing focused (a first visit), its end puts the focus on the "?" button, its
fallback (`fallback = ".help-menu button"`, `apps/world/src/components/Tour.tsx:40`, used at `:61`). A mouse visitor
sees a focus ring on a button they never touched.
**Options.** `stage`: the focus goes to the stage (the town); the next Tab still reaches the header and nothing is
ringed. `help`: as it is (right for a keyboard user, the round-20 choice).
**Recommended:** `stage`.
**Cost:** the fallback in `Tour.tsx` (or the `fallback` prop in `App.tsx:899`). The regress `tour` group checks that
Escape returns the focus to Settings when Settings opened the tour; that path keeps its `returnTo` and does not change.
No pixel set.
**If you say nothing:** the "?" button keeps the ring.
**Answer:** `T2: stage / help`
**Prepared:** `dc/T2` `<sha>` (round 72).

### T3. The name a screen reader hears for the stage (r48-polish C7) *wording*

**Today.** Steps 1 and 3 say "Highlighted on the screen: CrewHub World." (`Tour.tsx:109` reads the target's own name,
the stage's `aria-label="CrewHub World"`, `apps/world/src/App.tsx:843`). That is the app's name, and also the name of
the first project in the demo. The step's own name, `targetName: "the town"` (`tour.ts:30`), is clearer.
**Options.** `town`: for the stage, the tour says the step's own name ("the town"; step 3's "the town, where the
figures stand"). `keep`.
**Recommended:** `town`.
**Cost:** one condition in `Tour.tsx:109`. The regress `tour` group reads these words (step 2's check of the jump list
button's name stays). No pixel set.
**If you say nothing:** a screen reader hears "CrewHub World".
**Answer:** `T3: town / keep`
**Prepared:** `dc/T3` `<sha>` (round 72). Walk finding w4-3 is not ended by it: `town` is written for steps 1 and 3 (the stage); step 4's dock is not in the option as worded (the answer sheet's note).

### T4. The chat dock's button over the open sheets (r48-polish C9)

**Today.** With Settings or the text view open, the chat dock's round button stays over the sheet's bottom right
corner, over its last lines.
**Options.** `lift`: the sheet stands above the dock while it is open. `end`: the sheet's scroll area ends above the
dock. `keep`: the dock is always reachable, as meant.
**Recommended:** `lift` or `end` (the review gave both; `end` keeps the dock reachable too).
**Cost:** the layering in `apps/world/src/styles/world.css` (the dock's rules from `:1006`). No test; no pixel set
(the sheets are closed in it).
**If you say nothing:** the button stays over the sheets.
**Answer:** `T4: lift / end / keep`
**Prepared:** `dc/T4-lift` `<sha>` for `lift` and `dc/T4-end` `<sha>` for `end` (round 72): one branch per option, both cheap; your answer picks one.

### T5. The town's framing on a phone (r48-polish C10)

**Today.** At 375 px the town sits low, with an empty band under the chat chips.
**Options.** `frame`: the town is framed in the space between the chips and the playback bar. `keep`.
**Recommended:** `frame`.
**Cost:** the camera's portrait fit in `apps/world/src/world/TownScene.ts` (the portrait margins from `:221`). The demo
pixel set's 375 px town pictures move, light and dark, so it is a deliberate picture change with before-and-after
pictures.
**If you say nothing:** the phone's town stays framed low.
**Answer:** `T5: frame / keep`
**Prepared:** `dc/T5` `<sha>` (round 72).

### T6. The phone header's Demo chip (r48-polish C11)

**Today.** At 375 px the Demo chip is an icon only: the narrow-screen rules hide `.demo-word`
(`apps/world/src/styles/world.css:918-922`, "the demo chip keeps its icon"). A first visitor on a phone sees no word
"Demo" in the header; only the chat chip says "Demo: replies are scripted".
**Options.** `word`: the chip keeps "Demo" and the brand's second line goes instead ("CrewHub World" wraps to two lines
there). `keep`.
**Recommended:** `word`.
**Cost:** `world.css`'s narrow-screen rules. Every 375 px picture of the demo pixel set (the header is in each), light
and dark.
**If you say nothing:** the icon alone.
**Answer:** `T6: word / keep`
**Prepared:** `dc/T6` `<sha>` (round 72).

### T7. The focus ring round the whole screen (r48-polish C12)

**Today.** When the stage has the keyboard focus (after the jump list's Enter), a focus ring runs round the whole
screen. Right for a keyboard user; in a screenshot it looks like a frame.
**Options.** `keep`, and take the website's pictures without keyboard focus (click the scene first). `hide`: no ring
on the stage.
**Recommended:** `keep`.
**Cost:** none for `keep`; `hide` is one rule in `world.css` and takes a visible focus away from keyboard users.
**If you say nothing:** kept.
**Answer:** `T7: keep / hide`
**Not prepared:** `keep` is today's build; nothing to merge (round 72).

### T8. The host's address in the demo's Settings (r48-polish C4)

**Today.** Settings › Source shows "Host: http://127.0.0.1:5387/world-api" in the demo too
(`apps/world/src/components/SourceSettings.tsx:47`, `"world.source.hostUrl": "Host: {url}"`,
`apps/world/src/i18n/en.ts:51`; the port is the page's own). Useful when connecting, noise for a demo visitor.
**Options.** `answered`: the line shows only once a host has answered. `disclosure`: the line sits under a disclosure.
`keep`.
**Recommended:** `answered`.
**Cost:** `SourceSettings.tsx`. No test pins it; no pixel set.
**If you say nothing:** the line stays.
**Answer:** `T8: answered / disclosure / keep`
**Prepared:** `dc/T8` `<sha>` (round 72).

### T9. The long Connect screen on a phone (r48-ui F3)

**Today.** At 375 px the Connect screen is about 970 px tall: the three steps, then the paragraph for an older
crewhub-loops ("On an older crewhub-loops without that card (today's Mac app): Settings › Agents › New external bot …",
`apps/world/src/i18n/en.ts:152`), so the key field is below the first screenful. The desktop picture is
[connect.png](../images/connect.png).
**Options.** `disclosure`: the older-loops paragraph sits behind a disclosure. `keep`.
**Recommended:** `disclosure` (the review asked for it as a question).
**Cost:** `apps/world/src/components/ConnectPage.tsx` and the paragraph's key in `en.ts`; the `tools/connectshots.mjs`
pictures of that screen move; `docs/images/connect.png` would be retaken. No demo pixel set.
**If you say nothing:** the paragraph stays open.
**Answer:** `T9: disclosure / keep`
**Prepared:** `dc/T9` `<sha>` (round 72).

## Words on screen (W)

### W1. The text view's snapshot time (r48-polish C1) *wording*

**Today.** "Team snapshot from 2026-10-29T21:02:48.000Z, 11 s old." (`packages/world-model/src/describe.ts:103`, the
time as loops sent it). A screen reader reads it out character by character.
**Options.** `clock`: "Team snapshot from 21:02:48, 11 s old." (the time of day; the date only when it is not today).
`keep`: the exact record.
**Recommended:** `clock`.
**Cost:** `describe.ts:103`, and `packages/world-model/src/director.ts:355` ("stale since …") for the same form; no
test pins the line today, so one is added. No pixel set.
**If you say nothing:** the ISO time stays.
**Answer:** `W1: clock / keep`
**Prepared:** `dc/W1` `<sha>` (round 72).

### W2. "Lit:" on a plate (r48-polish C2) *wording*

**Today.** An agent's plate lists each alert as "Lit: CR-23 waiting on Nicky" (`apps/world/src/components/WorldCanvas.tsx:1017`,
the lead's in the demo). "Lit" means the alert lamp on the desk is on for that ticket; a first visitor cannot know it.
**Options.** `waiting`: "Waiting: CR-23 on Nicky". `alert`: "Alert: CR-23 waiting on Nicky". `keep`.
**Recommended:** `alert` or `waiting` (the review named both).
**Cost:** `WorldCanvas.tsx:1017` (for `waiting`, the alert's own words from `packages/world-model/src/reducer.ts:287`
too). No test pins "Lit"; no pixel set (labels are hidden in it).
**If you say nothing:** "Lit:".
**Answer:** `W2: waiting / alert / keep`
**Prepared:** `dc/W2-alert` `<sha>` for `alert` (round 72). **Not prepared:** `waiting`: it needs two decisions this page does not make. The alert's own words (`reducer.ts`) also reach the card's attention chip, the figure's caption, the text view's "is lit:" line and the director's immovable reason, which greps the alert for `waiting` (`director.ts`), so an agent whose waiting ticket sits on a rack would become movable unless that rule changes too; and the plate prefixes every alert alike, so "Waiting: CR-24 stalled" would be false for a stall alert.

### W3. The demo note on every plate (r48-polish C3) *wording*

**Today.** In the demo every agent plate and object card ends with "Demo: there is no crewhub-loops web app to open"
(`DemoNote`, `WorldCanvas.tsx:1020,1100`, the words at `:1107`). It explains why a ticket key is not a link, but on a
plate with no link it reads as an error. The agent card already says it as a tooltip on its ticket keys
(`AgentCard.tsx:187,231`).
**Options.** `cards`: keep the note only where a key would be a link in live mode (the object card and the agent
card's tooltip), and drop it from the agent plates. `keep`.
**Recommended:** `cards`.
**Cost:** `WorldCanvas.tsx`. No test; no pixel set.
**If you say nothing:** the note on every plate.
**Answer:** `W3: cards / keep`
**Prepared:** `dc/W3` `<sha>` (round 72).

### W4. "Needs a person: 3 waiting on a person." (r48-polish C5) *wording*

**Today.** A project's row in the jump list leads with "Needs a person: 3 waiting on a person." (`lead`,
`apps/world/src/world/wayfinding.ts:213`), and a district's sentence ends the same way (`summaryWords`, `:186`), which
the district's label and the text view read. The phrase says it twice.
**Options.** `once`: "3 waiting on a person." with the warning icon carrying "needs a person" (the icon's own
screen-reader words already say "Needs a person", `JumpList.tsx:122`). `keep`.
**Recommended:** `once`.
**Cost:** `wayfinding.ts:186,213`; `apps/world/test/wayfinding.test.ts:110`. The district plate's "Needs a person: …"
(`WorldCanvas.tsx:629`) and the breadcrumb chip (`App.tsx:1385`) keep their form, so the regress `demo` group's
beacon check (`/Needs a person/`) still holds. No pixel set.
**If you say nothing:** said twice.
**Answer:** `W4: once / keep`
**Prepared:** `dc/W4` `<sha>` (round 72).

### W5. "2 props joins the catalogue" (r48-model W1) *wording*

**Today.** The town's change lines say "2 props joins the catalogue: …" and "2 props leaves the catalogue: …"
(`packages/world-model/src/townChanges.ts:92-93`), while the plots line above says "buildings move". The test pins only
the singular (`packages/world-model/test/townChanges.test.ts:32`).
**Options.** `plural`: "1 prop joins", "2 props join" (and "leave"). `keep`.
**Recommended:** `plural`.
**Cost:** `townChanges.ts:92-93`, a plural case in `townChanges.test.ts`. No pixel set.
**If you say nothing:** "2 props joins".
**Answer:** `W5: plural / keep`
**Prepared:** `dc/W5` `<sha>` (round 72).

### W6. "the lobby keeps the count" (r48-model W2) *wording*

**Today.** "5 tickets archived from Dispatch; the truck took them away and the lobby keeps the count."
(`packages/world-model/src/describe.ts:183`). The count is the archives since the page's last snapshot; a reload or a
fresh snapshot sets it to 0, so the lobby does not keep it.
**Options.** `drop`: "5 tickets archived from Dispatch; the truck took them away." (the count stays, the claim
goes). `keep`.
**Recommended:** `drop` (this page's; the review asked only that the words match the count).
**Cost:** `describe.ts:183-184`; `packages/world-model/test/halls.test.ts:101,115`; the same phrase in
`apps/world/src/world/buildingView.ts` and `docs/LOOPS_INTEGRATION_PLAN.md`. No pixel set.
**If you say nothing:** the lobby "keeps the count".
**Answer:** `W6: drop / keep`
**Prepared:** `dc/W6` `<sha>` (round 72).

### W7. "tonight" in Settings (r48-ui F1) *wording*

**Today.** Settings › Town says "The only style tonight; buildings follow the town style unless their plot names
another." (`apps/world/src/components/TownSettings.tsx:108`). "Tonight" is a build note in a visitor's Settings.
**Options.** `drop`: "The only style for now; …" or "The only style; …". `keep`.
**Recommended:** `drop` (this page's; the review named the word only).
**Cost:** `TownSettings.tsx:108`. No test; no pixel set.
**If you say nothing:** "tonight".
**Answer:** `W7: drop / keep`
**Prepared:** `dc/W7` `<sha>` (round 72).

### W8. The "Director model" field (r48-ui F2) *wording*

**Today.** Settings shows a read-only field "Director model" with `claude-haiku-4-5-20251001` and the hint "Read-only.
Cheap models only, no escalation. The demo never calls it." (`apps/world/src/components/PresenceSettings.tsx:95`,
`DIRECTOR_MODEL`, `packages/world-model/src/presence.ts:32`). No road of the world calls a model; the scripted director
calls none.
**Options.** `none`: the field says "none; the scripted director calls no model". `keep`.
**Recommended:** `none` (this page's; the review gave both).
**Cost:** `PresenceSettings.tsx:95`; `presence.ts:32` and `docs/LOOPS_INTEGRATION_PLAN.md` if the constant goes. No
pixel set.
**If you say nothing:** the model's name stays.
**Answer:** `W8: none / keep`
**Prepared:** `dc/W8` `<sha>` (round 72).

### W9. The words for a ticket status newer than this build (r48-unknown M7) *wording*

**Today (built in round 48).** The text view says `CL-1 "Ticket CL-1": task as a folder, status "triage" (new to this
world, kept with the backlog).` (`packages/world-model/src/describe.ts:332`); the card and the object plate say
`triage (new to this world)` with the backlog's chip (`apps/world/src/world/agentCard/words.ts:39`).
**Options.** `as-built`. `<words>`: your own.
**Recommended:** `as-built`.
**Cost:** for other words, `describe.ts:332`, `words.ts:39`, `apps/world/test/agentCard.test.ts:302-313`,
`packages/world-model/test/unknownStatus.test.ts:60`. No pixel set.
**If you say nothing:** as built.
**Answer:** `W9: as-built / <words>`
**Not prepared:** `as-built` is today's build; nothing to merge (round 72).

### W10. The line of a card that could not be drawn (r48-unknown U5) *wording*

**Today (built in round 48).** When an agent card fails to render, its frame shows the agent's name, the close button
and "This card could not be drawn. The text view still says where Postman is and what it is doing."
(`apps/world/src/components/AgentCard.tsx:145`).
**Options.** `as-built`. `<words>`.
**Recommended:** `as-built`.
**Cost:** for other words, `AgentCard.tsx:145` and the regress `demo` group's check of the failed card. No pixel set.
**If you say nothing:** as built.
**Answer:** `W10: as-built / <words>`
**Not prepared:** `as-built` is today's build; nothing to merge (round 72).

### W11. A label layer that fails shows nothing (r48-unknown U5)

**Today (built in round 48).** If the scene's label layer throws while it renders, it shows nothing (one
`console.warn`) until the view changes to another building or the town; the scene stays.
**Options.** `nothing`: as built (a line in its place would cover the scene). `line`: one small line where the labels
were.
**Recommended:** `nothing`.
**Cost:** for `line`, the `OverlayBoundary` fallback round the label layer in `WorldCanvas.tsx` and a regress check.
**If you say nothing:** nothing is shown.
**Answer:** `W11: nothing / line`
**Not prepared:** `nothing` is today's build; nothing to merge (round 72).

### W12. The "Where is …?" answer keeps talking (r48-ui F4)

**Today.** The answer under "Where is …?" is `aria-live="polite"` (`apps/world/src/components/WhereForm.tsx:46`), so a
screen reader hears it again whenever its words change: an agent walks, the names nearby change. Its comment says that
is meant; with the text view open in a live world it talks often.
**Options.** `keep`. `on-choice`: the answer is announced when a name is chosen; its text still updates silently.
**Recommended:** `on-choice` (this page's; the review asked).
**Cost:** `WhereForm.tsx`. No test reads the announcement; no pixel set.
**If you say nothing:** it keeps announcing.
**Answer:** `W12: keep / on-choice`
**Prepared:** `dc/W12` `<sha>` (round 72).

### W13. A name that left "Where is …?" (round 50, r48-ui U6) *wording*

**Today (built in round 50).** When the name a person chose in "Where is …?" leaves the world (a person's visit ends, a
worker's session goes), the form keeps it and says "Nicky is no longer in the world."; the select shows it as
"Nicky (no longer in the world)" (`apps/world/src/state/whereChoice.ts:24,35`). Before round 50 the form switched to
another agent by itself.
**Options.** `as-built`. `<words>`.
**Recommended:** `as-built`.
**Cost:** for other words, `whereChoice.ts:24,35` and `apps/world/test/whereChoice.test.ts`. No pixel set.
**If you say nothing:** as built.
**Answer:** `W13: as-built / <words>`
**Not prepared:** `as-built` is today's build; nothing to merge (round 72).

### W14. Copy that cannot copy on the Pair screen (round 50, r48-ui N1) *wording*

**Today (built in round 50).** When the browser has no clipboard or refuses, the Pair screen's Copy button says
"Select the command and copy it" (`apps/world/src/i18n/en.ts:117`, `world.pair.copyFailed`). Before round 50 nothing
happened.
**Options.** `as-built`. `<words>`.
**Recommended:** `as-built`.
**Cost:** for other words, `en.ts:117`; `apps/world/test/copyFlash.test.ts` reads the state, not the words. No pixel set.
**If you say nothing:** as built.
**Answer:** `W14: as-built / <words>`
**Not prepared:** `as-built` is today's build; nothing to merge (round 72).

### W15. Which bot the host's own words send people to make (round 54, r54-review) *wording*

**Today.** The README and the Connect screen lead with the viewer key: crewhub-loops' **Settings › Agents › Connect
CrewHub World**, the bot that also shows the chat bubbles. But the host's own words name only the older road, "Settings
> Agents > New external bot", whose key shows no bubbles: the reason a rejected key gives in the panel and in health
(`apps/host/src/keyCheck.ts:18`, `MAKE_A_BOT`, used by four reasons) and the doctor's "no key yet" fix
(`apps/host/src/doctor.ts:179`).
**Options.** `viewer-first`: those words name the viewer card first, and "on an older crewhub-loops, Settings > Agents >
New external bot" second. `keep`.
**Recommended:** `viewer-first` (the reviewer's: the host should send people where the README does).
**Cost:** `keyCheck.ts` and `doctor.ts`; their tests (`keyCheck.test.ts`, `doctor.test.ts`) match some of these words
and change with them. Touches `apps/host/src`, so the replays run. No pixel set.
**If you say nothing:** the host's words send people to "New external bot".
**Answer:** `W15: viewer-first / keep`
**Prepared:** `dc/W15` `<sha>` (round 72). Walk finding w2-8 is not ended by it: W15 changes which bot the host's words name; one sentence per status (403 and 401) is not among its options (the answer sheet's note).

### W16. "Not a control" and loops' own chat (round 54, r54-review) *wording*

**Today.** The introduction says "Not a control. Nothing in the world starts, stops, wakes or steers an agent."
(`docs/INTRODUCTION.md:21`). In the Chat panel, loops' own chat is framed, and a signed-in person can type to an agent
there; the frame is loops, not the world.
**Options.** `say-the-frame`: add "except loops' own chat, framed in the Chat panel, where you type as yourself".
`keep`: the frame is loops, so the sentence stands.
**Recommended:** `say-the-frame` (a reader who types in the panel should not find the sentence wrong).
**Cost:** one sentence in `INTRODUCTION.md`. No test, no pixel set.
**If you say nothing:** as it is.
**Answer:** `W16: say-the-frame / keep`
**Prepared:** `dc/W16` `<sha>` (round 72).

### W17. An archived building's two ticket lines (round 69, walkthrough w1-13) *wording*

**Today.** The text view's section for a boarded-up building says "Tickets: 2 backlog, 1 planned, 0 in progress, 0 review,
1 done" and four lines later "Administration: Backlog 0, Planning 0, Review 0, Done 0", "The floor: quiet" (the walker,
w1-13). The first line is loops' own count of the project's tickets, which an archived building keeps (`counts`,
`packages/world-model/src/reducer.ts`, `archivedBuilding`); the second counts the cards on the racks (`hallSummary`,
`packages/world-model/src/describe.ts:232`), and a closed building holds none: the project's archiving took them, and a
ticket read after it puts none back (`projection.ts:661`). Both lines are true, and nothing says why they differ. The same
hall sentence is the room focus status line ("Zoomed to Administration: Backlog 0 …", `apps/world/src/world/roomWords.ts:23`).
**Options.** `why`: both lines stay, and for a boarded-up building the Administration line says instead "Administration:
the racks are boarded up; the tickets are archived with the project". `tickets`: the Tickets line stays and a boarded-up
building gets no hall lines (Administration, The floor, Lead's office). `halls`: the hall lines stay and a boarded-up
building gets no Tickets line. `keep`.
**Recommended:** `why`: both lines are true, and the new sentence says the one thing the walker could not know, that the
racks are empty because the archive took the tickets; dropping either line hides a fact.
**Cost:** one branch on `building.archived` in `hallSummary` (`describe.ts`), which `roomWords.ts` shares, so the status
line follows; a case in `packages/world-model/test/halls.test.ts` and `apps/world/test/roomWords.test.ts`. No pixel set.
**If you say nothing:** the two lines as they are.
**Answer:** `W17: why / tickets / halls / keep`
**Prepared:** `dc/W17` `<sha>` (round 72). It ends walk finding w1-13: both lines stay true and the new sentence says why they differ.

## The live road (L)

### L1. "Loops down" for a host that is fine with loops (r48-live L4)

**Today.** Every 503 from the host that does not say `unauthorized` turns the chip to "Loops down"
(`packages/loops-client/src/hostSource.ts:464-466,513-515`). Two of them are not loops: the 65th tab on one host
(`too_many_tabs`, "This host holds 64 tabs on its stream already; close one", `apps/host/src/host.ts:871`) and the
host's own failure to assemble a snapshot (`snapshot_failed`, `host.ts:855`). The page keeps asking and is right again
once the cause goes.
**Options.** `own-words`: the chip says "This host has too many tabs open; close one" for the first, and "The world's
host could not read crewhub-loops: …" with the host's reason for the second. `keep`.
**Recommended:** `own-words` (the review's words; which state each maps to is the developer's).
**Cost:** `hostSource.ts` (the two 503 paths), the chip's words in `apps/world/src/i18n/en.ts` and
`components/ConnectionChip.tsx`; `packages/loops-client/test/hostSource.test.ts` gains the two cases (today it covers
`loops_down` and `unauthorized` only); the regress `live` group's "Loops down" checks stay. No pixel set.
**If you say nothing:** "Loops down".
**Answer:** `L1: own-words / keep`
**Prepared:** `dc/L1` `<sha>` (round 72). Walk finding w2-5 is not ended by it: L1 words two 503s the host sends; a host that does not answer at all is not among its options (the answer sheet's note).

### L2. Road 2 waits for the browser to be online (r48-live Q1)

**Today.** The page's own chat road (road 2) only ever asks a crewhub-loops on this computer, but asks nothing while
the browser says it is offline (`apps/world/src/state/pageChat.ts:148,167`). With Wi-Fi off, the world and loops both
run on 127.0.0.1 and the town is live, yet no chat bubbles come until a network is back. Round 29 (Low 9) chose
"offline: nothing is asked".
**Options.** `ignore`: road 2 ignores the browser's online flag, since a loopback ask needs no network. `keep`.
**Recommended:** `ignore`.
**Cost:** `pageChat.ts:148,167`; the offline cases in `apps/world/test/pageChat.test.ts` turn round. No pixel set.
**If you say nothing:** offline, road 2 asks nothing.
**Answer:** `L2: ignore / keep`
**Prepared:** `dc/L2` `<sha>` (round 72).

### L3. The chip says Live while the team snapshot is stale (round 66, walkthrough w2-3)

**Today.** Two clocks. The chip's Stale is 40 s of silence on the stream (`packages/loops-client/src/hostSource.ts`,
`staleMs`), and the host's heartbeat every 15 s keeps it Live. The team snapshot's stale is 300 s
(`packages/world-model/src/freshness.ts`, `STALE_AFTER_S`) and goes by the stamp of the team probe's last upload, not by
the newest event. So the walker's screen could say Live, "Last event 1 h ago" and "every agent's status shows as
unknown" at once. The fake's clock that made that screen is fixed (round 64); the chip's half stays for a real loops
whose probe stopped while its stream lives.
**The walk's suggestion, keyed on the newest event's age:** with 40 s a team quiet for a minute reads Stale, with 300 s
one quiet for five minutes does, all evening, saying "Nothing has arrived for a while" while host and loops are fine. No
option below does that.
**Options.**
- `snapshot`: the threshold is the snapshot's 300 s, and a quiet but healthy team stays Live, because its probe still
  uploads about every 30 s. The chip also says Stale when a snapshot with a stamp is older than 300 s, with a hint of its
  own ("The team snapshot is older than 5 minutes: every agent's status shows as unknown"), and the stream is not
  reopened for it. A loops with no probe at all (an empty stamp) stays Live: it never had a snapshot, and the text view
  says so already.
- `own-word`: Stale stays the stream's. A new word beside Live says the newest event is older than 300 s. Nothing it
  says is false, but it shows on every quiet stretch and does not say the statuses are unknown.
- `keep`: the chip says only whether the stream is alive.

**Recommended:** `snapshot`: one signal for the chip, the panel's Now row, the text view and the lane chips, and a quiet
team is not called Stale. Two limits. That a real loops' stamp moves on an upload with no change comes from
[the integration plan](../LOOPS_INTEGRATION_PLAN.md) and [the gap analysis](../LOOPS_GAP_ANALYSIS.md), and has not been
measured; check it first, because if it does not move this option has the suggestion's fault, the slice stops and L3
comes back to you. And a probe's clock more than
5 minutes off the page's would read Stale, as the lane chips already do (gap L10).
**Cost:** a day's slice. `snapshot`: one rule in `apps/world/src/App.tsx`, where the connection reaches the chip, the
panel, the text view and the spoken line; the hint in `apps/world/src/i18n/en.ts` and `components/ConnectionChip.tsx`; a
way for the fake to stop its team stamp and a regress `live` row; the Stale row of [LOOPS_SETUP](../LOOPS_SETUP.md), whose
remedy (restart the host) is wrong for a stopped probe. `own-word`: `hostSource.ts` keeps the newest event's stamp; the
word in `en.ts`, the chip and `world.css`; a regress `live` row. No pixel set: the demo has no connection chip.
**If you say nothing:** the chip as it is.
**Answer:** `L3: snapshot / own-word / keep`
**Not prepared:** its precondition needs a real crewhub-loops, measured first (that a real loops' stamp moves on an upload with no change), never here (round 72).

## The host's behaviour (H)

### H1. The host makes a folder it was pointed at private (r48-review F17)

**Today.** The host sets the folder `CREWHUB_WORLD_CONFIG_DIR` names to 0700, whether it made it or not, at every start
and every key or archive save (`apps/host/src/keyStore.ts:21`, `worldDb.ts:199`, `main.ts:202`).
`CREWHUB_WORLD_CONFIG_DIR=~` would make the home folder 0700. The README's table says "(0700; the files 0600)" but not
that an existing folder is changed (`apps/host/README.md:139`).
**Options.** `warn`: the host tightens only a folder it made itself, and says once in the log (and `doctor` warns) when
an existing folder is looser than 0700. `tighten`: as it is, said in the README.
**Recommended:** `warn`.
**Cost:** the three `chmodSync` calls; host tests for a made and an existing folder; the README row. No pixel set.
**If you say nothing:** any named folder becomes 0700.
**Answer:** `H1: warn / tighten`
**Prepared:** `dc/H1` `<sha>` (round 72).

### H2. `npm run world` beside a running `npm run host` (r48-review F18)

**Today.** `npm run world` finds a development host (`npm run host`, which serves no built world) on the same port,
says "a host already runs on 5180; opened the browser on a new link" (`apps/host/src/main.ts:176`) and opens the
browser, which lands on `{"error":"not_found"}` (`apps/host/src/host.ts:1157`). Both are the README's roads on the
default port.
**Options.** `refuse`: the run file says whether the host serves the world; `world` then opens nothing, says "a
development host (npm run host) runs on 5180 and serves no built world: stop it (Ctrl+C in its terminal), or open your
Vite page (npm run dev)" and exits 1. `take-over`: `world` stops the dev host and starts its own. `keep`.
**Recommended:** `refuse` (a host someone started is not ended by another command).
**Cost:** `main.ts` (the run file and `mintFromRunning`, `:109-183`), which has no test seam today; a host test of the
run file's new field. No pixel set.
**If you say nothing:** the JSON error page.
**Answer:** `H2: refuse / take-over / keep`
**Prepared:** `dc/H2` `<sha>` (round 72).

### H3. "Forget this key" on a key from the old default key file (round 51, r51-review H2)

**Today.** When the host's key is rejected, the Connection panel offers Forget for every key but one set by
`CREWHUB_WORLD_KEY_FILE` (`apps/world/src/components/ConnectionPanel.tsx:135`), so also for a key read from the old
default file `~/.config/crewhub-loops/secrets/agent-crewhub-world.key` (`apps/host/src/config.ts:24`). It asks "Forget
the stored key? The host drops it and the world asks for a key again." (`apps/world/src/i18n/en.ts:237`) and the host
drops only its own stored copy (`apps/host/src/host.ts:961-968`): it never deletes a file outside its folder. The page
then shows the Connect screen, but at the next `npm run world` the same rejected key is read from the default file
again (`config.ts:94-108`), with the same rejected screen.
**Options.** `stored-only`: the panel offers Forget for a stored key only, as the Connect page already does
(`ConnectPage.tsx:210`), and for a default-file key says where it comes from: "This key comes from <file>. Remove that
file, or paste a new key." `host-says`: Forget stays, and the host answers the forget of a default-file key with that
same reason, which the panel shows. `keep`.
**Recommended:** `stored-only` (one condition; the panel already words the `CREWHUB_WORLD_KEY_FILE` case this way).
**Cost:** `ConnectionPanel.tsx:135` and one new line in `en.ts`; a component test of the three sources. No pixel set
(the panel is in no set).
**If you say nothing:** Forget on a default-file key comes back at the next start.
**Answer:** `H3: stored-only / host-says / keep`
**Prepared:** `dc/H3` `<sha>` (round 72).

## The storyline (S)

### S1. cl-lead's status line at 15:36 (r48-cl88 C1) *wording*

**Today.** In the small team, cl-lead posts "Notes ready for 0.9.0." on the release at 15:25
(`packages/demo/src/script.ts:380`), and its lane line at 15:36 still says "CL-88: release notes for 0.9.0" (`:350`).
**Options.** `waits`: "CL-88: 0.9.0 waits for Nicky". `keep`.
**Recommended:** `waits`.
**Cost:** `script.ts:350`. No test pins it; no pixel set (it seeks to 2:00).
**If you say nothing:** the old line.
**Answer:** `S1: waits / keep`
**Prepared:** `dc/S1` `<sha>` (round 72).

### S2. "Brand and Lab are the quiet ones" (r48-demo-fake D2, second half) *wording*

**Today.** In Studio, g-man answers "Where am I needed right now?" at 2:58 with "Four reviews wait on you, and four
tickets wait on an answer. Brand and Lab are the quiet ones." (`packages/demo/src/scenarios/studio.ts:355`; the count
was fixed in round 48). At that minute every group has two tickets waiting on a person, and the watchdog's open
episodes are Apps 3, Brand 2, Lab 2, Platform 1, so the second sentence holds on neither measure.
**Options.** `drop`: "Four reviews wait on you, and four tickets wait on an answer." `<words>`: a sentence that names
what makes a group quiet.
**Recommended:** `drop`.
**Cost:** `studio.ts:355`. No test pins it; no pixel set.
**If you say nothing:** the sentence stays.
**Answer:** `S2: drop / <words>`
**Prepared:** `dc/S2` `<sha>` (round 72).

### S3. "stuck since the merge" (r48-demo-fake N2) *wording*

**Today.** In the small team at 12:56, Nicky writes to g-man "Please restart cr-dev-2; it has been stuck since the
merge." (`packages/demo/src/script.ts:328`). cr-dev-2's lane says done at 4:30 and idle from 6:00, so a visitor who
opens its card sees idle, not stuck.
**Options.** `idle`: "… it has sat idle since the merge." `keep`: Nicky's own impression.
**Recommended:** `idle`.
**Cost:** `script.ts:328`. No test pins it; no pixel set.
**If you say nothing:** "stuck".
**Answer:** `S3: idle / keep`
**Prepared:** `dc/S3` `<sha>` (round 72).

### S4. The demo's rooms after a seek back (r48-model M4)

**Today.** A role room, once an agent of that role has been seen, stays for the page's life
(`memory.roleRooms`, `packages/world-model/src/rooms.ts:55`). After a seek back in the demo, or at a new loop, rooms
that appear only later in the story are already there, empty ("no worker agents active", `rooms.ts:26`), before
anybody of that role has come.
**Options.** `forget`: a new snapshot (a seek, a new loop) forgets the role rooms, so they come again as the story
brings them. `keep`: a room once seen stays.
**Recommended:** `forget` in the demo (this page's: the review left it open; a seek is a new start). In live mode a
new snapshot keeps them, since there is no story to replay.
**Cost:** `packages/world-model/src/memory.ts` and `rooms.ts` (with M4's pruning, for a later round), a model test of a
seek back. The demo pixel set seeks forward from the start to 2:00, so it should not move; run it.
**If you say nothing:** the rooms stay after a seek back.
**Answer:** `S4: forget / keep`
**Prepared:** `dc/S4` `<sha>` (round 72).

## Editing the town (E)

### E1. Escape in a zone's name field (r48-ui F5)

**Today.** Renaming a zone has no Escape: Enter or leaving the field always writes the draft
(`apps/world/src/components/ZonePanel.tsx:151-155`).
**Options.** `escape`: Escape drops the draft and keeps the old name. `keep`.
**Recommended:** `escape` (this page's; the review named the gap).
**Cost:** `ZonePanel.tsx`. No test reads the field; no pixel set.
**If you say nothing:** leaving the field writes the draft.
**Answer:** `E1: escape / keep`
**Prepared:** `dc/E1` `<sha>` (round 72).

### E2. The demo town in two tabs (round 53, r53-review S1)

**Today.** In the demo (no host), the town is kept in this browser's IndexedDB, and each tab keeps its own history and
numbers its own revisions (`apps/world/src/state/townStore.ts:134-297`). Tabs never hear each other. With build mode
used in two tabs of the same demo town, the later write wins: tab A saves revision 6, tab B (still at 5) saves its own
6 over it, and A's edit is gone after a reload, with nothing said. A tab left open on an older revision can do it
without a person, when a new project gets its lot. Live mode is not affected: the host keeps the town and refuses a
stale write (409).
**Options.** `say`: one line where the Settings card already says where the town is kept ("Build in one tab at a
time; another tab's edits are not seen here"). `sync`: tabs keep in step (a `BroadcastChannel` per town that tells the
other tabs to reload the history after a write). `keep`.
**Recommended:** `say` (the review's: the demo town is a demo; `sync` is the fix if people build in two tabs).
**Cost:** `say`: one line in the Settings card and its copy test; no pixel set (sheets are not in it). `sync`:
`townStore.ts` and a node test with two stores; no pixel set.
**If you say nothing:** the later write wins, unsaid.
**Answer:** `E2: say / sync / keep`
**Prepared:** `dc/E2` `<sha>` (round 72).

## The figures (K)

From round 50's read-only review of the engine, the styles and the casts.

### K1. A cast made for a newer world: refused whole, or drawn with what this world knows?

**Today.** The cast validators refuse any key they do not know: an activity in `poses`, `motions` or `looks`, a role in
`colorways.roles` or `parts[].roles`, a perch key (`packages/world-cast/src/validate.ts:101-103,126,198,221,255`). A
cast written for a later world (a new activity, a new role) is not registered at all; its towns draw classic-bots, and
the text view says "No cast named … is installed; … stands in." (`apps/world/src/world/castText.ts:46`).
**Options.** `refuse`: as it is (the format number would change for such a cast). `lenient`: warn once and ignore the
activities, roles and perch poses this world does not know, as round 48 made the live snapshot's enums lenient; unknown
*fields* stay errors, as in the prop format.
**Recommended:** `lenient`, for those three enums only.
**Cost:** `validate.ts` (a warnings list beside the errors) and `apps/world/src/world/castRegistry.ts` (warn once);
tests in `packages/world-cast`. No pixel set.
**If you say nothing:** a cast from a newer world is refused, and classic-bots stands in.
**Answer:** `K1: lenient / refuse`
**Prepared:** `dc/K1` `<sha>` (round 72).

### K2. Walking at 8x and 16x: at story speed, or calmer?

**Today.** The engine takes at most 0.1 s of simulation per tick (`packages/world-engine/src/navSim.ts:320`), and the
walks tick once per frame with the frame's time times the speed (`apps/world/src/world/walks.ts:145`). At 60 fps the
figures walk at about 75 % of story speed at 8x and 37 % at 16x, and slower on a slow device; at 16x a figure may still
be walking when the story has moved on. The scene's comment means them to keep up ("faster with it").
**Options.** `story`: story speed at every playback speed (sub-steps of 0.1 s at the caller; the figures dash at 16x).
`even`: keep a slowdown, the same on every device (a cap per wall second instead of per frame). `keep`.
**Recommended:** `story`.
**Cost:** `walks.ts` (at most 8 sub-steps a frame at 16x) and a test that N frames at 16x walk as far as 16N frames at
1x. The demo pixel set at speed and the regress `walk` group run at night.
**If you say nothing:** today's frame-rate-dependent slowdown stays.
**Answer:** `K2: story / even / keep`
**Prepared:** `dc/K2` `<sha>` (round 72).

### K3. A cast that could not be loaded, on screen (round 50, r50-packages C1)

**Today.** A cast package that fails validation is refused with a console warning; since round 50 the registry keeps
the reasons and a contract test fails on it. On screen, a town that asks for it says the same as for a cast that is not
there: "No cast named … is installed; … stands in." (`castText.ts:46`).
**Options.** `say`: the text view says "Cast sprouts could not be loaded: <first reason>; classic-bots stands in."
`keep`.
**Recommended:** `say` (this page's; the review named the gap).
**Cost:** `castText.ts` and the registry's `refused()`; a test in `apps/world/test`. No pixel set. Held with round 50's
cast branch (`task/r50-casts-held`, `9ebd022c`, a branch of this Mac's repository only, not on origin).
**If you say nothing:** "No cast named … is installed".
**Answer:** `K3: say / keep`
**Not prepared:** held with `task/r50-casts-held` `9ebd022c`, a branch of this Mac only, not on origin (round 72).

## Accessibility (X)

From round 50's read-only review of the CSS and the accessibility paths. The certain fixes of that review (the tour
spoken, the forced-colours focus, arrow keys inside a card, the rule label's contrast) are not choices and are not here.

### X1. Which agent answers are spoken

**Today.** Nothing is spoken when an agent answers: the bubble, the chat mark and the Recent answers row are seen only
(the page's one live region is `apps/world/src/App.tsx:839-841`).
**Options.** `own`: a reply to the person's own message is spoken once, cut to about 120 characters. `all`: every new
agent line. `none`.
**Recommended:** `own` (`all` talks over everything in a busy town).
**Cost:** a pure function in `apps/world/src/state/` and its node test, one effect in `App.tsx`, a regress `chat` check.
No pixel set.
**If you say nothing:** nothing is spoken.
**Answer:** `X1: own / all / none`
**Not prepared:** `own` needs a signal the page does not have on the live roads: the page receives agent lines only (the host turns an agent's `dm.created` into a line and nothing of the person's messages; road 2 polls the same way; the Chat panel frames loops' own chat, whose sends the page cannot see), so "a reply to the person's own message" is definable in the demo alone, and which thread counts as the person's is a decision this page does not make (round 72, d4).

### X2. The text view and the Chat panel over the toolbar on a desktop

**Today.** Both sheets start at the top right and cover the right toolbar, the chat chip and the camera toolbar
(`apps/world/src/styles/world.css:396-401,2302-2308`), whose buttons stay in the Tab order under them.
**Options.** `inert`: the covered corners are `inert` while a sheet is open; the picture is unchanged. `below`: the
sheets start under the header, so the toolbar stays usable. `keep`.
**Recommended:** `inert`.
**Cost:** `inert` is `App.tsx` only. `below` changes `world.css` and the pictures with a sheet open (in no set).
**If you say nothing:** the covered buttons stay tabbable.
**Answer:** `X2: inert / below / keep`
**Prepared:** `dc/X2` `<sha>` (round 72). Walk findings w2-2 and w3-7 are not ended by it: `inert` makes the covered corners inert; one sheet at a time, or side by side, is not among X2's options, so the stacking stays (the answer sheet's note).

### X3. The faded labels

**Today.** A label pushed far from its anchor, or a room sign over a figure, is at `opacity: 0.32` until the pointer or
the focus is on it (`world.css:168-180`): its text is then 1.96:1 (light) and 2.67:1 (dark) on its plate. `D` shows
every label at full strength, and the text view lists everything.
**Options.** `keep`: quiet by design, and the README's accessibility lines say that `D` shows every label. `0.7`: the
text 5.76:1 and 6.98:1. `0.75`: the muted text too passes 4.5:1.
**Recommended:** `keep`, with the README line.
**Cost:** `0.7` or `0.75` is one value, and every labelled picture with faded labels moves (`pixcheck --labels`).
**If you say nothing:** 0.32, and no README line.
**Answer:** `X3: keep / 0.7 / 0.75`
**Not prepared:** `keep` is today's build; nothing to merge (round 72).

### X4. The header at 320 px (with T6)

**Today.** At 320 px the brand row needs about 130 to 138 px of its corner's 84 px, so it runs into the right toolbar
(`world.css:121-131,903-906`; by reading, no picture taken).
**Options.** `drop-word`: under 360 px the brand keeps its mark and loses "CrewHub World". `wrap-tools`: the right
corner wraps to two rows. `keep`.
**Recommended:** `drop-word`; with T6 `word`, the "Demo" word fits beside the mark.
**Cost:** one `world.css` rule, and a 320 px picture to confirm (in no set).
**If you say nothing:** the overlap stays.
**Answer:** `X4: drop-word / wrap-tools / keep`
**Prepared:** `dc/X4` `<sha>` (round 72).

### X5. The canvas's name: the whole key guide on every focus (round 50, r50-a11y N4)

**Today.** The town's canvas is named by its key guide, about 60 words, read in full each time the focus lands on it:
"The town. Arrow keys move between buildings, Enter goes inside. … Slash opens the jump list."
(`apps/world/src/world/TownScene.ts:512-515`). The stage around it has its own name, which is T3.
**Options.** `short`: the name is "The town", and the guide moves, unchanged, into a visually hidden paragraph that
the canvas points to with `aria-describedby`. Screen readers then say "The town, application" on focus, and the
guide after a pause or on request (NVDA+Tab, VoiceOver's hint). `keep`.
**Recommended:** `short`, with the name fixed (not following the place, which would rename the canvas on every move).
**Cost:** `TownScene.ts` (the scene, so a night round with the `walk` and `rooms` regress groups); one node test that
reads the short name and the `aria-describedby`; a screen-reader check by hand. No pixel set.
**If you say nothing:** the 60 words on every focus.
**Answer:** `X5: short / keep`
**Prepared:** `dc/X5` `<sha>` (round 72).

## The tools (P)

### P1. `tools/perf.mjs`'s exit code after a failed scenario (round 51, r51-review T3)

**Today.** `perf.mjs` measures one scenario after another. A scenario that fails prints `<name> FAILED: <reason>` and
the run goes on (`tools/perf.mjs:320-325`), and the run ends with exit 0 whatever failed. The page a
failed scenario leaves running is a separate fix (the cleanup half of r51-review's T3), not a choice; only the exit
code is.
**Options.** `fail`: a run with a FAILED line exits 1, so a script or CI that runs it sees the failure. `keep`: exit
0, as a measurement and not a check; the FAILED line is the signal.
**Recommended:** `fail` (the tools that print `n/n` already exit 1 below full marks).
**Cost:** one line (`process.exitCode = 1` in the catch) and a line in `tools/README.md`. No test can reach it
without a browser. No pixel set.
**If you say nothing:** exit 0.
**Answer:** `P1: fail / keep`
**Prepared:** `dc/P1` `<sha>` (round 72).

### P2. The copied loops files: catch an edit to a copy's body on CI too (round 54, r54-ci; r53-review CI5)

**Today.** Five chat files are verbatim copies of crewhub-loops files. `npm run check:copy` checks each copy's own half
everywhere, CI included: it is there, with its header line, naming its source (round 53). The comparison of a copy's
body with its source runs only where a crewhub-loops checkout sits beside this repository, so on CI an edit to a copy's
body passes as "skipped". A re-copy is done by hand ([DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md), its source and sync
rule). Four of the five copies (`Bubbles.tsx`, `queries.ts`, `bubbles.css`, `primitives/Menu.tsx`, all of `a1bed0f`)
are behind crewhub-loops by 7 to 21 commits; `useMessageViewport.ts` is current.
**Options.** `sync`: one command (`npm run copy:sync -- <crewhub-loops commit>`) copies the five files from a
crewhub-loops checkout at a commit, writes their header lines and a hash of each body beside its entry, and the check
compares the hashes everywhere. `hash`: the hashes and the check only; whoever re-copies by hand updates the hashes too
(CI turns red until they do). `keep`.
**Recommended:** `sync` (nothing to remember, and the copies are due for a re-copy anyway).
**Cost:** `sync`: about 80 lines in `scripts/bubbles-copy.ts` with tests, two sentences in `DESIGN_SYSTEM.md`. `hash`:
about 20 lines and a test. Neither touches `apps/`; no pixel set.
**If you say nothing:** a copy's body is checked only where a crewhub-loops checkout is.
**Answer:** `P2: sync / hash / keep`
**Not prepared:** `sugg/p2-recopy` is its partial (the dock's two files re-copied by hand); the check itself is not built (round 72).

### P3. A test that the clock decides, once, with a wide margin (round 55; r54-hosttests' survivor `host.ts:319`)

**Today.** The host's tests never let the clock decide a working test: `apps/host/test/wait.ts` waits for a state and
fails only after a generous ceiling ("the ceiling bounds a broken test's run, it never decides a working one"). Round
54's mutation run found the one place this leaves open. The host passes a shortened read timeout (`readTimeoutMs`,
`host.ts:319`) to its loops client only for tests; `main.ts` never sets it, so the product always waits loops' 10 s
(`READ_TIMEOUT_MS`, `apps/host/src/loops.ts:42`). If that line dropped the option, the one test that sets it
(`keyStates.test.ts`, "a timeout is down", 1 s) would still pass, only 9 s slower, under the 15 s ceiling.
**Options.** `race`: allow one named exception to the rule: a test where a 300 ms timeout must win against a stub that
answers after 5 s (a 16x margin), with a comment in `wait.ts` naming it. `seam`: give the loops client an optional
timer (a few lines in `loops.ts`, the default the real one), so a test decides the timeout with no clock. `keep`: the
option is test-only and the product never uses it, so the gap cannot reach a person; leave it.
**Recommended:** `keep`. A product seam or an exception to a rule that has kept the suite steady under load buys
nothing a person sees.
**Cost:** `race`: one test and two lines in `wait.ts`. `seam`: about 10 lines in `loops.ts` and one test. No pixel set.
**If you say nothing:** `keep`.
**Answer:** `P3: race / seam / keep`
**Not prepared:** `keep` is today's build; nothing to merge (round 72).

## The labels (N)

### N1. Fewer labels in a short window (round 69, walkthrough w4-20)

**Today.** A phone held sideways (750 x 342) inside a building with Details on: "the labels pile up in a staircase and the
building's plate lies over the playback bar" (the walker, w4-20; [the picture](../images/walkthrough-r64/w4-20-landscape-labels.png)).
The label rules know a narrow screen, not a short one: `compact` is `(max-width: 599px)`
(`apps/world/src/components/WorldCanvas.tsx:647`), so sideways at 750 px nothing is compact. The building's plate inside is
expanded, its counts and its lead row (`:314`); every figure in a shown room carries its full plate, not a pill (`:733-735`);
every rack says its count (`:713`); and with Details on every room is shown (`:674`), every object's name tag with it. The
layout then moves what overlaps upwards (`apps/world/src/world/labelLayout.ts`), which in 342 px is a staircase. Upright on
the same phone the compact rules thin all of this.
**Options.** `compact`: a short window (under 480 px tall) counts as compact for the labels, as a narrow one does: the plate
inside shows its title line only, figures carry pills, rack counts and name tags show for the revealed room or the picked
figure, and Details means what it means upright. `tags`: only the Details layer thins in a short window: rack counts and
object name tags show on hover, focus or tap, while the plate and the figures' full plates stay. `keep`.
**Recommended:** `compact`: it is the same phone, turned, and the rules that keep its labels apart upright already exist;
one media rule reuses them.
**Cost:** `compact`: the `COMPACT` rule in `WorldCanvas.tsx` gains `(max-height: 479px)`, and everything `useCompact` feeds
follows, the agent card's placement too (`:386`), so one look at the card sideways; a regress `walk` row on the iPhone
profile sideways. No pixel set (the demo set is 1440 x 900 and 375 px upright). `tags`: the `shows` and `near` conditions
in `Interior`, and the same `walk` row.
**If you say nothing:** the staircase sideways.
**Answer:** `N1: compact / tags / keep`
**Prepared:** `dc/N1` `<sha>` (round 72). It ends walk finding w4-20.

## The wording block

Nineteen choices change words only, nothing else: **T3, W1, W2, W3, W4, W5, W6, W7, W8, W9, W10, W13, W14, W15, W16, W17,
S1, S2, S3.**
`wording block: as recommended` takes the recommended answer for each; name one to keep it out
(`wording block: as recommended, but W2: keep`).

## Left out, and why

- **How a ticket with a status newer than this build looks** (r48-ui F6): decided by r48-unknown's M7, merged in
  `7c96628` (drawn in the storage room with the backlog's chip and icon); only its words are left (W9).
- **Studio's "Five reviews wait on you"** (r48-demo-fake D2, first half): fixed in round 48; `studio.ts:355` says four.
- **The tour's chat step, the scenario menu under the breadcrumb, Settings › Roles at hyphens** (r48-polish #1, #3,
  #4, #11): fixed in round 48 (`ce980c1`).
- **Labels touching** (r48-polish #8, #15): noted by the pass as label layout, not a choice.
- **"Where is …?" switching agent by itself** (r48-ui U6): a bug with a suggested fix, for a later round.
- **The rest of F16** (r48-review, README wording): fixed in round 52 (`6d9bb4e`). **F11** (`answers-replay`): tool
  work for a later round, not a product choice.
- **The soak rule's readings** (rounds 45 and 47n): the measuring tool's rule; the Lead's report says it needs no
  decision from Nicky.
- **The tour's 1.5 s beat** (open question 5) and the other fourteen merge decisions: they are in
  [open-questions.md](open-questions.md).
- **Rounds 41 to 47:** their reports leave no product choice for Nicky; what they left is tool and test work.
