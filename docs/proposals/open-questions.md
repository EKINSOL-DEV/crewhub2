# Open questions for Nicky (rounds 30 to 35, 2026-10-24)

**How to answer:** one line per number, in the form shown after each question (for example `3: less`), to crewy or in
a note; a number you skip keeps its default. **Nothing changes until you answer:** every question below names what the
world keeps if you say nothing. Where an answer is already built, the question names its branch: that answer is one merge away. Fifteen questions (14 and 15 came from the round-34 fuzz, added in round 35); the ones a later round answered are listed at the end with why, after a short list of what is known and accepted.

## 1. Pairing: the cookie, or a bearer per tab (rounds 26 and 27)

**What.** The browser's pairing is a cookie today, and cookies ignore ports: any other local program your browser
visits on `127.0.0.1` receives it, and the cookie never expires. The question behind it is whether "another local
program on this Mac that your browser visits" is inside the threat model. On a single-user Mac a same-user program can
read the key file anyway, so this is about other users' processes and local tools that log request headers.

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
**Recommendation:** 30. **Default:** 30 if question 1 brings an expiry; none if it does not.
**Answer:** `2: 30 / <days> / never`
**One merge away:** the expiry rides on question 1's branch; another number is one setting (`CREWHUB_WORLD_PAIRING_IDLE_DAYS`).

## 3. What health says before pairing (round 26)

**What.** Before a browser is paired, `GET /world-api/health` says the states, as designed, and also the bot's name,
the stream's cursor, loops' version, the checkout id and the trusted dev origins. Any local process of any user can
read it (a web page cannot). It is reconnaissance only. The reviewer's shape: keep the fields the dev server's probe
needs (`loops`, `checkout`, an empty `keyName`) and blank the rest until paired.
**Options.** `less`: that shape. `as-is`.
**Recommendation (the Lead, round 30):** `less`: the spec of the smooth connection already says that before pairing
health shows the states and nothing else, and the dev probe keeps what it needs. **Default:** `as-is`.
**Answer:** `3: less / as-is`
**One merge away:** `less` is the branch `task/q3-health-less`.

## 4. The dev-origin route, now that the switch has landed (round 26)

**What.** `npm run dev` beside `npm run host` works with no setup because Vite tells the host its origin
(`POST /world-api/dev-origin`, round 23; since round 26 it proves the same user with the host's 0600 run-file secret).
The older way, `npm run host -- open --origin http://127.0.0.1:5173`, proves the same user too and needs no route. The
question was asked for after the viewer-key switch; the switch is on `feat/world-demo` since round 28, so it is live.
**Options.** `keep`: the route stays. `remove`: the route goes and `npm run dev` beside a host needs the `open --origin`
command or `CREWHUB_WORLD_ALLOWED_ORIGINS` once.
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
**Options.** `support`: the tabs tell each other (a storage event or a BroadcastChannel) and reload the local history.
`say`: the rule "one tab edits while the host is away", written where the offline note shows. `as-is`.
**Recommendation (the Lead, round 30):** `say`: one sentence where the offline note shows; the case is rare and
support is real work for little. **Default:** `as-is`.
**Answer:** `8: support / say / as-is`
**One merge away:** `say` is the branch `task/q8-offline-say` (`support` is not built).

## 9. The chat's road 2: one poller per tab (round 29)

**What.** Where the page reads your own chat itself (road 2: crewhub-loops on this computer with `CHL_WORLD_ORIGIN` set
to the page's origin), each open world tab polls loops every 5 s while shown and once a minute while hidden. Two or
three tabs are two or three pollers of the same conversation. Road 1 (the host's viewer key) is one stream for every tab.
**Options.** `accept`: as it is (the hidden-tab rule already does most of the saving). `one-tab`: only one tab polls, by
a BroadcastChannel lock.
**Recommendation (the Lead, round 30):** `accept`: hidden tabs already poll once a minute, and a lock adds a moving
part. **Default:** `accept`.
**Answer:** `9: accept / one-tab`

## 10. Should the stream itself carry the host's chat word? (round 29, half answered)

**What.** The page picks the chat's road from the host's health. Since round 29 the host says "unknown" until it knows,
and the page re-reads health when the stream goes live or the key's word changes, so a stale read no longer sends the
page down the wrong road. What remains: the stream's `status` message could carry the chat word itself, so the road
follows the stream and never a read.
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

**What.** On the chat's road 1 every agent `dm.created` on the key's stream is one read of the message by id with the
key, and the host made each read on its own connection the moment the event came. A burst of hundreds in one instant
(the round-34 fuzz emitted 440) opened hundreds of connections to loops at once; past a listen backlog (128 on macOS)
the surplus connects failed and those bubbles were lost, silently. A real loops does not answer a person with hundreds
of agent messages in one instant, so nobody has seen it; the fuzz did.

**The prepared answer** is `task/q14-dm-read-cap`: a gate of eight reads in flight (`DM_READ_LIMIT` in
`apps/host/src/dmReads.ts`), the rest of a burst waiting their turn in the stream's order, nothing dropped. Eight is
well under the backlog even with the snapshot's six reads, the threads' refresh and a health probe beside it, and it is
what a browser allows one origin. Its cost: the last bubble of a burst comes later, not never: 440 messages are 55
round trips, 0.4 s against a loops that answers in 4 ms (measured in the test), a few seconds against one 50 ms away.
A read loops did not refuse (a 5xx, a 429, no answer) is tried once more after 250 ms; a 4xx is loops' word and final,
as before; what is lost after the retry is counted in one log line at most every 5 s, where before it was lost
without a word. The round-34 test now emits its 440 in one instant and every one arrives.

**Options.** `cap`: merge the branch (eight, one retry). `<number>`: another cap, one constant. `as-is`: no cap; a
burst of hundreds keeps losing bubbles.
**Recommendation** (r3-polish, round 35): `cap`. **Default:** `as-is` (the branch stays unmerged).
**Answer:** `14: cap / <number> / as-is`
**One merge away:** `cap` is the branch `task/q14-dm-read-cap`.

## 15. A size cap on an upstream body (rounds 34 and 35)

**What.** Everything the host reads from loops (a relayed ticket page, a project, the snapshot's lists, a chat message,
the key check's answer) is read whole into memory with no limit on its size, then parsed or passed on to the browser;
the host's own inbound limit is 4 MB on a town (`TOWN_BODY_LIMIT`), but nothing on what comes back from loops. Loops is
a local process on this Mac, so a body of gigabytes would mean a loops that is broken, or something else answering at
loops' URL (a proxy page, another local program on that port); the host would then hold it all in memory before it
could say no. The round-34 fuzz noted it (a 1 MB body is read whole and passed on) and changed nothing.

**No branch yet.** One would read every upstream body through a counting reader in `apps/host/src/transport.ts` and
stop at the cap: the relay answers the browser 502 `upstream_too_large` with the size and the cap, the host's own
reads see a body of null and one log line (a snapshot skips that project as it skips one that answers 404), and the
stream's line buffer gets the same cap for a line that never ends. Tests: the stub answering a body one byte past the
cap on each road.

**Options.** `cap`: that branch, at 4 MB (the same number as the town's inbound limit; a loops page is 50 pages of 50
tickets, far under it). `<size>`: another cap. `as-is`: loops is trusted as a local process; a reviewer reads this
line.
**Recommendation** (r3-polish, round 35): `cap` at 4 MB, when a round has room: it is a small change, and the host
already refuses its own inbound bodies at that size. **Default:** `as-is`.
**Answer:** `15: cap / <size> / as-is`

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
