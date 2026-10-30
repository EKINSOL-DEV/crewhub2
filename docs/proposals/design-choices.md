# Design choices for Nicky (rounds 41 to 48, 2026-10-30)

**How this relates to [open-questions.md](open-questions.md):** those are the fifteen merge decisions (pairing, health,
the answer branches); these are smaller product choices the reviews of rounds 41 to 48 wrote down and left alone:
words on screen, where a card sits, what the host does in an odd case. Rounds 41 to 47 left none; all thirty come from
round 48. Every quote and line below was checked against the code at `d150cf4`.

**How to answer:** one line per id, in the same short form as the open questions, for example `T1: as recommended`,
`W4: keep` or `S1: waits`. A whole block in one line works too: `wording block: as recommended`
(the fourteen choices marked *wording*, gathered at the end), or `T: as recommended` for a group. **Nothing changes
until you answer:** each choice names what stays if you say nothing, which is always the world as it is today.

**The groups:** [first visit and tour](#first-visit-and-tour-t) (T, 9), [words on screen](#words-on-screen-w) (W, 12),
[the live road](#the-live-road-l) (L, 2), [the host's behaviour](#the-hosts-behaviour-h) (H, 2),
[the storyline](#the-storyline-s) (S, 4), and one area the five did not fit, [editing the town](#editing-the-town-e)
(E, 1). **The cost** of a choice names the files, the tests and the pixel sets that would change. The demo pixel set
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

### T5. The town's framing on a phone (r48-polish C10)

**Today.** At 375 px the town sits low, with an empty band under the chat chips.
**Options.** `frame`: the town is framed in the space between the chips and the playback bar. `keep`.
**Recommended:** `frame`.
**Cost:** the camera's portrait fit in `apps/world/src/world/TownScene.ts` (the portrait margins from `:221`). The demo
pixel set's 375 px town pictures move, light and dark, so it is a deliberate picture change with before-and-after
pictures.
**If you say nothing:** the phone's town stays framed low.
**Answer:** `T5: frame / keep`

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

### T7. The focus ring round the whole screen (r48-polish C12)

**Today.** When the stage has the keyboard focus (after the jump list's Enter), a focus ring runs round the whole
screen. Right for a keyboard user; in a screenshot it looks like a frame.
**Options.** `keep`, and take the website's pictures without keyboard focus (click the scene first). `hide`: no ring
on the stage.
**Recommended:** `keep`.
**Cost:** none for `keep`; `hide` is one rule in `world.css` and takes a visible focus away from keyboard users.
**If you say nothing:** kept.
**Answer:** `T7: keep / hide`

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

### W2. "Lit:" on a plate (r48-polish C2) *wording*

**Today.** An agent's plate lists each alert as "Lit: CR-23 waiting on Nicky" (`apps/world/src/components/WorldCanvas.tsx:1017`,
the lead's in the demo). "Lit" means the alert lamp on the desk is on for that ticket; a first visitor cannot know it.
**Options.** `waiting`: "Waiting: CR-23 on Nicky". `alert`: "Alert: CR-23 waiting on Nicky". `keep`.
**Recommended:** `alert` or `waiting` (the review named both).
**Cost:** `WorldCanvas.tsx:1017` (for `waiting`, the alert's own words from `packages/world-model/src/reducer.ts:287`
too). No test pins "Lit"; no pixel set (labels are hidden in it).
**If you say nothing:** "Lit:".
**Answer:** `W2: waiting / alert / keep`

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

### W5. "2 props joins the catalogue" (r48-model W1) *wording*

**Today.** The town's change lines say "2 props joins the catalogue: …" and "2 props leaves the catalogue: …"
(`packages/world-model/src/townChanges.ts:92-93`), while the plots line above says "buildings move". The test pins only
the singular (`packages/world-model/test/townChanges.test.ts:32`).
**Options.** `plural`: "1 prop joins", "2 props join" (and "leave"). `keep`.
**Recommended:** `plural`.
**Cost:** `townChanges.ts:92-93`, a plural case in `townChanges.test.ts`. No pixel set.
**If you say nothing:** "2 props joins".
**Answer:** `W5: plural / keep`

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

### W7. "tonight" in Settings (r48-ui F1) *wording*

**Today.** Settings › Town says "The only style tonight; buildings follow the town style unless their plot names
another." (`apps/world/src/components/TownSettings.tsx:108`). "Tonight" is a build note in a visitor's Settings.
**Options.** `drop`: "The only style for now; …" or "The only style; …". `keep`.
**Recommended:** `drop` (this page's; the review named the word only).
**Cost:** `TownSettings.tsx:108`. No test; no pixel set.
**If you say nothing:** "tonight".
**Answer:** `W7: drop / keep`

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

### W10. The line of a card that could not be drawn (r48-unknown U5) *wording*

**Today (built in round 48).** When an agent card fails to render, its frame shows the agent's name, the close button
and "This card could not be drawn. The text view still says where Postman is and what it is doing."
(`apps/world/src/components/AgentCard.tsx:145`).
**Options.** `as-built`. `<words>`.
**Recommended:** `as-built`.
**Cost:** for other words, `AgentCard.tsx:145` and the regress `demo` group's check of the failed card. No pixel set.
**If you say nothing:** as built.
**Answer:** `W10: as-built / <words>`

### W11. A label layer that fails shows nothing (r48-unknown U5)

**Today (built in round 48).** If the scene's label layer throws while it renders, it shows nothing (one
`console.warn`) until the view changes to another building or the town; the scene stays.
**Options.** `nothing`: as built (a line in its place would cover the scene). `line`: one small line where the labels
were.
**Recommended:** `nothing`.
**Cost:** for `line`, the `OverlayBoundary` fallback round the label layer in `WorldCanvas.tsx` and a regress check.
**If you say nothing:** nothing is shown.
**Answer:** `W11: nothing / line`

### W12. The "Where is …?" answer keeps talking (r48-ui F4)

**Today.** The answer under "Where is …?" is `aria-live="polite"` (`apps/world/src/components/WhereForm.tsx:46`), so a
screen reader hears it again whenever its words change: an agent walks, the names nearby change. Its comment says that
is meant; with the text view open in a live world it talks often.
**Options.** `keep`. `on-choice`: the answer is announced when a name is chosen; its text still updates silently.
**Recommended:** `on-choice` (this page's; the review asked).
**Cost:** `WhereForm.tsx`. No test reads the announcement; no pixel set.
**If you say nothing:** it keeps announcing.
**Answer:** `W12: keep / on-choice`

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

## The storyline (S)

### S1. cl-lead's status line at 15:36 (r48-cl88 C1) *wording*

**Today.** In the small team, cl-lead posts "Notes ready for 0.9.0." on the release at 15:25
(`packages/demo/src/script.ts:380`), and its lane line at 15:36 still says "CL-88: release notes for 0.9.0" (`:350`).
**Options.** `waits`: "CL-88: 0.9.0 waits for Nicky". `keep`.
**Recommended:** `waits`.
**Cost:** `script.ts:350`. No test pins it; no pixel set (it seeks to 2:00).
**If you say nothing:** the old line.
**Answer:** `S1: waits / keep`

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

### S3. "stuck since the merge" (r48-demo-fake N2) *wording*

**Today.** In the small team at 12:56, Nicky writes to g-man "Please restart cr-dev-2; it has been stuck since the
merge." (`packages/demo/src/script.ts:328`). cr-dev-2's lane says done at 4:30 and idle from 6:00, so a visitor who
opens its card sees idle, not stuck.
**Options.** `idle`: "… it has sat idle since the merge." `keep`: Nicky's own impression.
**Recommended:** `idle`.
**Cost:** `script.ts:328`. No test pins it; no pixel set.
**If you say nothing:** "stuck".
**Answer:** `S3: idle / keep`

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

## Editing the town (E)

### E1. Escape in a zone's name field (r48-ui F5)

**Today.** Renaming a zone has no Escape: Enter or leaving the field always writes the draft
(`apps/world/src/components/ZonePanel.tsx:151-155`).
**Options.** `escape`: Escape drops the draft and keeps the old name. `keep`.
**Recommended:** `escape` (this page's; the review named the gap).
**Cost:** `ZonePanel.tsx`. No test reads the field; no pixel set.
**If you say nothing:** leaving the field writes the draft.
**Answer:** `E1: escape / keep`

## The wording block

Fourteen choices change words only, nothing else: **T3, W1, W2, W3, W4, W5, W6, W7, W8, W9, W10, S1, S2, S3.**
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
- **The rest of F16** (r48-review, README wording) and **F11** (`answers-replay`): docs and tool work for a later
  round, not product choices.
- **The soak rule's readings** (rounds 45 and 47n): the measuring tool's rule; the Lead's report says it needs no
  decision from Nicky.
- **The tour's 1.5 s beat** (open question 5) and the other fifteen merge decisions: they are in
  [open-questions.md](open-questions.md).
- **Rounds 41 to 47:** their reports leave no product choice for Nicky; what they left is tool and test work.
