# Open questions for Nicky (rounds 30 to 35, 2026-10-24)

**How to answer:** one line per number, in the form shown after each question (for example `3: less`), to crewy or in
a note; a number you skip keeps its default. **Nothing changes until you answer:** every question below names what the
world keeps if you say nothing. Where an answer is already built, the question names its branch: that answer is one merge away. Fifteen questions (14 and 15 came from the round-34 fuzz, added in round 35); the ones a later round answered are listed at the end with why, after a short list of what is known and accepted.

## 1. Pairing: the cookie, or a bearer per tab (rounds 26 and 27)

**What.** Today your browser stays paired by a cookie. Your browser sends that cookie to any other local program it
visits on this Mac (cookies ignore ports), and it never expires. On a Mac that is yours alone, a program running as you
can read the key file anyway; the risk is other users' processes and local tools that log request headers. Is that a
risk to close?

**The prepared answer** is `task/r27-tab-pairing` (never merged; its note is `docs/proposals/pairing-per-tab.md` on that
branch): the link's token in the URL fragment, a bearer per tab in `sessionStorage`, no cookie at all, a new tab paired
by the open tabs in about 0.3 s, and an idle expiry. Its one price: the last tab closed with no tab restore means a new
link (one command).

**Options.** `tab`: merge the branch (per-tab bearer, 30-day idle expiry). `cookie+expiry`: keep the cookie and add only
the expiry. `cookie`: keep it as it is and write in the README's "Pairing" section that this threat is accepted as the
Mac's own boundary.

**Recommendation** (rounds 26 and 27): `tab` if that threat is in scope; otherwise `cookie+expiry`.
**Default:** `cookie` (the branch stays unmerged; the threat is neither accepted in writing nor closed).
**Answer:** `1: tab / cookie+expiry / cookie`
**One merge away:** `tab` is the branch `task/r27-tab-pairing`; `cookie+expiry` is `task/q1-cookie-expiry` (with question 2's 30 days); `cookie` needs no branch.

## 2. How long an unused pairing lives (round 26, with question 1)

**What.** With either road of question 1 that has an expiry, a pairing unused for N days is refused and asks for a new
link; the window slides with every use. The branch's default is 30 days (`CREWHUB_WORLD_PAIRING_IDLE_DAYS`; 0 is never).
**Recommendation:** 30. **Default:** 30 days when question 1 brings an expiry (`tab` or `cookie+expiry`); with `cookie` there is none.
**Answer:** `2: 30 / <days> / never`
**One merge away:** the expiry rides on question 1's branch; another number is one setting (`CREWHUB_WORLD_PAIRING_IDLE_DAYS`).

## 3. What health says before pairing (round 26)

**What.** Before a browser is paired, the host's health answer already names the bot, the stream's position, loops'
version, the checkout and the trusted dev origins. Any local program of any user can read it (a web page cannot); it
reveals, it changes nothing. `less` keeps only the states and the two fields the dev server's probe needs.
**Options.** `less`: as above. `as-is`: everything, as today.
**Recommendation (the Lead, round 30):** `less`: the spec of the smooth connection already says that before pairing
health shows the states and nothing else, and the dev probe keeps what it needs. **Default:** `as-is`.
**Answer:** `3: less / as-is`
**One merge away:** `less` is the branch `task/q3-health-less`.

## 4. The dev-origin route, now that the switch has landed (round 26)

**What.** The dev server beside a host works with no setup: the dev server tells the host its own address through a
small route, proving it is the same user (since round 26). The older way is one command each time
(`npm run host -- open --origin …`), and needs no route. The question was parked until the viewer-key switch landed; it
has (round 28).
**Options.** `keep`: the route stays. `remove`: the route goes; the dev server beside a host then needs that command, or
one env setting, each time.
**Recommendation (the Lead, round 30):** `keep`: it works with no setup and proves the same user since round 26;
removing it brings back a command or an env for every `npm run dev`. **Default:** `keep`.
**Answer:** `4: keep / remove`

## 5. The tour's first card comes 1.5 s after the town stands (rounds 21 and 22)

**What.** The first-run tour starts on a timer of 1.5 s after the town is dressed, a deliberate beat, not work. On a
phone at 4x the town stands at 1.3 s and the card at 1.95 s; on a desktop at 1.6 s. The phone pass said shortening it
is a design call.
**Options.** `1.5`: as it is. `<seconds>`: another beat (0 is at once).
**Recommendation (the Lead, round 30):** `1.5`: a deliberate beat that lets the town be seen first, and no one has
reported it as slow. **Default:** 1.5 s.
**Answer:** `5: 1.5 / <seconds>`

## 6. Should build mode wait until the host's town has loaded? (round 27)

**What.** On a live page build mode opens at once, on the browser's copy of the town, while the host's town may still
be on its way. Since round 27 an edit made on a town the host has since replaced is a conflict said plainly, never the
stale town written over the host's, so no work is lost. What remains is the moment itself: the review proposed a Build
button disabled with "reading the host's town…" until the host's revision is known.
**Options.** `wait`: that disabled button. `at-once`: as it is.
**Recommendation (the Lead, round 30):** `at-once`: since round 27 no edit is lost and a conflict is said plainly; a
disabled Build button is friction on every live load. **Default:** `at-once`.
**Answer:** `6: wait / at-once`

## 7. The Connect and Pair screens over the scene, or in its place (round 27)

**What.** Today a Connect or Pair screen replaces the scene. When a paired tab must pair again, the town is laid out
again from the home camera afterwards, and a person inside a building sees the flight repeated: a judder, not an error.
A screen standing over a kept scene would keep the camera and the layout; the cost is a scene running behind a screen.
**Options.** `over`: the screen over the scene. `replace`: as it is.
**Recommendation (the Lead, round 30):** `replace`: the judder comes only on a re-pair, which is rare; a scene behind
a screen costs on every screen. **Default:** `replace`.
**Answer:** `7: over / replace`

## 8. Offline editing in two tabs of one browser (round 27)

**What.** While the host is away, two tabs of the same browser both edit the town on one shared local history, and the
records interleave; on reload the mixed chain is skipped with a note. With the host up this cannot happen: the host's
history rules. Nothing says today that offline editing is per tab.
**Options.** `support`: the tabs tell each other and reload the shared history.
`say`: the rule "one tab edits while the host is away", written where the offline note shows. `as-is`.
**Recommendation (the Lead, round 30):** `say`: one sentence where the offline note shows; the case is rare and
support is real work for little. **Default:** `as-is`.
**Answer:** `8: support / say / as-is`
**One merge away:** `say` is the branch `task/q8-offline-say` (`support` is not built).

## 9. The chat's road 2: one poller per tab (round 29)

**What.** Where the page reads your own chat itself (road 2: crewhub-loops on this Mac, pointed at the page), every
open world tab asks loops every 5 s while shown and once a minute while hidden. Two or three tabs ask two or three times
for the same conversation. Road 1 (the host's viewer key) is one stream for every tab.
**Options.** `accept`: as it is (the hidden-tab rule already does most of the saving). `one-tab`: only one tab asks, for
all of them.
**Recommendation (the Lead, round 30):** `accept`: hidden tabs already poll once a minute, and a lock adds a moving
part. **Default:** `accept`.
**Answer:** `9: accept / one-tab`

## 10. Should the stream itself carry the host's chat word? (round 29, half answered)

**What.** The page learns which chat road to take from one read of the host's health. Since round 29 the host says
"unknown" until it knows, and the page reads again when the stream comes alive or the key's word changes, so a stale read
no longer sends it down the wrong road. What remains: the live stream could carry the word itself, so the road would
follow the stream and never a read.
**Options.** `stream`: the status carries it. `re-read`: as it is.
**Recommendation (the Lead, round 30):** `re-read`: round 29 closed the real hole; a stream-carried word saves one
GET at moments that are rare. **Default:** `re-read`.
**Answer:** `10: stream / re-read`

## 11. Say "since this page opened" on Recent answers (round 29)

**What.** Both chat roads read nothing from before the page opened, so an answer that landed while no world page was
open is not in Recent answers, which can read as a bug. The list already says "The last 10 answers this page saw …
while the page is open and nothing longer", but behind "About this chat" and in the text view, not on the block.
**Options.** `show`: the words on the block itself (its heading or its empty line). `as-is`.
**Recommendation (the Lead, round 30):** `show`: one short line on the block prevents a missed answer from reading
as a bug, and it is cheap. **Default:** `as-is`.
**Answer:** `11: show / as-is`
**One merge away:** `show` is the branch `task/q11-recent-since`.

## 12. The Connection panel's Chat section is below the fold (round 29)

**What.** At 900 px the panel's Chat section (which road reads the chat, and what to do) sits under the facts list, so
it needs a scroll. Moving it above the list is a two-line change, but then the rows people open the panel for (State,
Key, Stream, Cursor, Town, Zones) sit under a six-line story, and the panel scrolls either way.
**Options.** `top`: the Chat section first. `below`: as it is.
**Recommendation** (r29-copy): `below`. **Default:** `below`.
**Answer:** `12: top / below`

## 13. Retire `task/r19-viewer-switch` (round 28)

**What.** Round 28 carried the switch's whole removal onto `feat/world-demo` as one patch and went further; the branch
merged with that head is tree-identical to `feat/world-demo` (zero lines of difference). Merging it would add a commit
and no content.
**Options.** `retire`: delete the branch (after the PR lands, or now). `merge`: merge it as a no-op, for history's sake
(ready: check and regress green on it).
**Recommendation** (round 28): `retire`. **Default:** the branch stays as it is, unmerged.
**Answer:** `13: retire / merge`

## 14. A cap on the host's parallel reads of agent messages (rounds 34 and 35)

**What.** On the chat's road 1, every agent message on the key's stream is one read from loops, started the moment the
event comes. A burst of hundreds in one instant opened hundreds of connections at once; past the Mac's listen limit (128)
the rest failed and those bubbles were lost, silently. A real loops has never produced such a burst; the round-34 fuzz
did (440 at once).

**The prepared answer** is `task/q14-dm-read-cap`: at most eight reads at a time, the rest of a burst waiting their turn
in the stream's order, nothing dropped. Eight stays well under the limit beside the host's other reads, and is what a
browser allows one origin. A read loops did not refuse (no answer, a 5xx, a 429) is tried once more after 250 ms; a 4xx
is loops' word and final, as before. What is still lost is counted in one log line at most every 5 s, where before it
was lost without a word. The cost: the last bubble of a burst comes later, not never (440 messages: 0.4 s against a
loops on this Mac, a few seconds against one 50 ms away). The round-34 test now sends its 440 in one instant and every
one arrives.

**Options.** `cap`: merge the branch (eight, one retry). `<number>`: another cap, one constant. `as-is`: no cap; a
burst of hundreds keeps losing bubbles.
**Recommendation** (r3-polish, round 35): `cap`. **Default:** `as-is` (the branch stays unmerged).
**Answer:** `14: cap / <number> / as-is`
**One merge away:** `cap` is the branch `task/q14-dm-read-cap`.

## 15. A size cap on an upstream body (rounds 34 and 35)

**What.** Everything the host reads from loops (ticket pages, projects, the snapshot's lists, chat messages, the key
check's answer) is read whole into memory with no size limit, then parsed or passed on to the browser. The host caps what
it accepts itself at 4 MB (a town document); nothing caps what comes back from loops. Loops is a local process on this
Mac, so a body of gigabytes would mean a broken loops, or something else answering at loops' address; the host would
hold it all in memory before it could say no. The round-34 fuzz noted it and changed nothing.

**The prepared answer** is `task/q15-body-cap` (round 36, never merged): every body from loops is read through a
counting reader and stopped at 4 MB, never held whole; a `Content-Length` past it is refused before a byte is read.
The relay then answers the browser 502 `upstream_too_large`, and the page treats it as any failed read (the ticket keeps
its last known facts; no screen changes). The host's own reads see no body, as they do a body that is not JSON today
(a snapshot read fails as `loops_down`, a chat message makes no bubble), with one log line that never holds the body or
the key. A stream line past the cap is dropped and the stream goes on from the next line. Seven unit tests; it merges
cleanly onto `feat/world-demo` and with every other answer branch.

**Options.** `cap`: that branch, at 4 MB (the same number as the town's inbound limit; a loops page is 50 pages of 50
tickets, far under it). `<size>`: another cap. `as-is`: loops is trusted as a local process; a reviewer reads this
line.
**Recommendation** (r3-polish, round 35): `cap` at 4 MB, when a round has room: it is a small change, and the host
already refuses its own inbound bodies at that size. **Default:** `as-is`.
**Answer:** `15: cap / <size> / as-is`
**One merge away:** `cap` is the branch `task/q15-body-cap`; `<size>` is that branch with one constant changed (`UPSTREAM_BODY_LIMIT`); `as-is` needs no branch.

## Known and accepted

Not questions: behaviours the round-34 fuzz looked at and left as they are, said here so a reviewer is not surprised.

- A heartbeat's `seq` is loops' own word on its position and is trusted when it is a seq (a non-negative safe integer;
  anything else is refused since round 34). A loops that claimed a position far ahead would drop the events up to it
  until the next tail read, which recovers; a loops that lies about its own log is not in the threat model.
- `constructor` and `prototype` are accepted as own keys in the town document's two maps whose names a person spells
  (`styleOptions`, `assignments`), with a string under each: harmless, they are read with `Object.keys` and by key as
  own values; `__proto__` and every other prototype name never pass the pattern. Neither deserves a question: the
  first is a trust the stream rests on anyway, the second has no effect.

## Answered since, and dropped from this page

- **Stale heals itself** (round 27, Q2): answered by r27-statefix F3. At stale the source reopens the stream at the
  cursor by itself, and at once when the tab becomes visible; no reload needed.
- **The flat five minutes before road 2 asks again** (round 29, Q3): answered by r29-road2fix Low 9. An unreachable
  loops is asked again with a back-off from 5 s up to 5 minutes; the flat 5 minutes stays only for "origin not set",
  where the browser's console line is the reason.
- **Whose unread count the card shows** (rounds 24 and 25): answered in round 28. Loops main lets a viewer key read
  only the chat of the admin who made it, and never says who; every word says "the chat of the person who made the key"
  and the count is "in the key maker's view".
- **The tab-pairing branch, merge it or not** and **the pairing's expiry**: not dropped, folded into questions 1 and 2,
  since they are one decision.

**Not a question, a loose end:** one stray access key on the loops main instance (8293) from round 29's walk, held by
nobody, waits for your cleanup (request 25); nobody revokes anything.
