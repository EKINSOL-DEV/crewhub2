# The second architecture review (round 60, 2026-11-04)

The first review's nine candidates (`architecture-deepening.md`) are all merged. On `286a0f7`, two fresh read-only
reviewers (Fable 5.1) looked again, with the same vocabulary and method: arch2-host read the host and the packages,
arch2-page the page and the tools. Their findings are below, as they wrote them, with the headings shifted one level.
This page is the record; tonight's work is the table that follows.

## What is carried out, and what waits for Nicky

Every **Strong** candidate that changes no behaviour and needs no decision about an answer is carried out tonight,
exactly as the first nine were: a developer per candidate, a fresh reviewer, ports where needed, and the browser proof
for page changes. None of the fourteen Strong candidates needs a decision about an answer. Where one meets an answer
branch's files (H1 meets q3; H2, H3, T1 and T2 meet r27 and q1), a port carries the answer. **Worth exploring** and
**Speculative** candidates are for Nicky; nothing is done about them tonight.

**Round 61 (the night of 4 to 5 November)** carried out the **Worth exploring** list and four Speculative ones, the same
way (a developer per candidate, a fresh reviewer per branch, ports where met, the browser proof per batch):

| Candidate | Merge | Note |
| --- | --- | --- |
| W1 the loops event catalogue once | `b8ba179` | the client stops warning on three types the fake knew (up to three console lines fewer) |
| W2 the fake's GET dm routes through `createDemoApi` | `52d298a` | a test double's change: pages at 50, 403 for a non-lead, 404 for an unknown agent; `PAGE_DEFAULT`/`PAGE_MAX` stay in the fake for its other lists |
| W3 loops' wire grammar once (`loops-fake/src/wire.ts`) | `6aee8cf` | the stub's server loop untouched; the stub now refuses every non-strict `after` and honours `Last-Event-ID` (inputs no test sends) |
| W4 the world-origin contract read from `pageChat.ts` | `7607295` | the fake's three names renamed `ORIGIN_*` |
| W5 the cast contract's names in `names.ts` | `287b1f2` | same order and error words |
| W6 the small-part thresholds in `PROP_LIMITS` | `9f84ffa` | a parity test per shipped cast; pixels identical |
| W7 `agentCard.ts`' pieces private | `2c8f7cc` | tests through `agentCardFacts` |
| W8 the stale snapshot's words once (`freshness.ts`) | `c7d14cb` | the package half; **the page's own wordings are left** (the card holds a fourth one, so folding them would change visible sentences) |
| W9 `statusWords` and `drawn` in `status.ts` | `bece4d7` | the card's Recent line keeps loops' word for a status this build does not know |
| W10 the indexes trimmed to their callers | `473060e` (cast, greenhouse), `bbc92b9` (model, engine) | |
| W11 a desk top's height once | `8ebf0a3` | pixels identical |
| H5 the key's bot read once (`keyBot.ts`) | `4f2f1a1` | the doctor says viewer for a bot flagged viewer and reader, as keyCheck judges it |
| H6 the key's state machine in `keyHolder.ts` | `81a4203` | **the recheck timer stays in `connection.ts`**: moving it edits lines q3's and q14's ports change; a follow-up once they are decided |
| H4 loops' health read by one reader (`loopsHealth.ts`) | `e3da2c1` | `LoopsClient.health()` replaces `getPublicJson`; `readVersion` keeps its catch; q15 by a re-cut port |
| P3 the text view as one pure module (`world/textView.ts`) | `8f73080` | |
| P4 the chat's page stores as one runtime (`createChatStores`) | `1923c70` | q11's first port (one import line) |
| T3 regress's groups as files (`tools/regress/`) | `20cda0c` | r27 by a new port |
| S1, S3, S4, S5 | `e1b7494`, `b545889`, `d2e1b27`, `058e0c2` | the demo's constants; `scenarioIdOf`; the reference kit's `piece`; one `flood` |

Still for Nicky: P5 (waits on r27's answer), P6, P7, S2, S6, H7's key scrub (q15), H6's timer and the injected clock
(q3, q14, r27, q1).

| Candidate | Strength | Owner tonight | Answer branches |
| --- | --- | --- | --- |
| H1 a program's road to a running host, one module | Strong | arch-c2 (Fable): **merged `f7eb265`** | q3 `@8a1ae94` and r27 `@fd0b8b9` by ports; the wire imported by relative path so the dev config still loads on Node 22.12 |
| H2 the town's and connect's answers on the wire | Strong | arch-c7 (Fable): **merged `b0af686`** | none needed (the five ports merge cleanly) |
| H3 `snapshot.ts`'s unused options | Strong, small | arch-c5 (Opus): **merged `b9f83de`** | clean; `pending()` left alone |
| H7 seven one-line facts in two files each | Strong, small | arch-c5: **merged `d9cd1d5`** (four of seven; the key scrub waits on q15's port, two went with H1) | clean |
| P1 (packages) one playback engine for the demo and the stress fixture | Strong | arch-c8 (Opus): **merged `a384fdf`** (the demo's stream byte-identical) | clean |
| P2 (packages) the demo's unused exports | Strong, minutes | arch-c8: **merged `fd39490`** | clean |
| P3 (packages) the seed tool's second named-port list | Strong, ten lines | arch-c7: **merged `82ddd65`** (the Mac app's folder now spelled once, the host's config included) | clean |
| P4 (packages) greenhouse's code keys written twice | Strong | arch-c8: **merged `3f65eda`** (pixels identical) | clean |
| P5 (packages) `WorldSimulation`'s one production use | Strong | arch-host (Fable): **merged `b814ee8`** | clean |
| P6 (packages) place words in five files | Strong | arch-c8: **merged `b758d10`** | clean |
| P1 (page) the viewer's browser-kept settings | Strong | arch-page (Opus): **merged `a0ddd3d`**; `source.ts` left out, its blocked-storage bug fixed separately (`a16e103`) | clean |
| P2 (page) the page's overlays | Strong | arch-page: **merged `1c207c9`** (review-c2's decision kept) | clean |
| T1 (tools) a tool's rig | Strong | arch-host (Fable), from arch-c6: **merged `4c43f15`** (`lib/rig.mjs`; the free-port rule its first proof showed) | r27 by port `@ccbf0ed` (one port for T1 and T2) |
| T2 (tools) a tool's page | Strong | arch-host: **merged `0b3f4ae`** (`lib/page.mjs`; perf's phone at scale 1 stays no touch device; `openPage` refuses Playwright's own keys; pixcheck kept out for pixel identity) | r27 by port `@ccbf0ed` |

The page's P1 and P2 and the packages' P1 to P6 share letters across the two areas; in branch names they are
`r60-pg-p1` and `r60-pg-p2` for the page and `r60-pk-p1` to `r60-pk-p6` for the packages.

## The host and the packages (arch2-host)

Read at `286a0f7` (feat/world-demo, PR #28), read-only. Area: `apps/host`, `packages/loops-client`, `loops-fake`,
`demo`, `world-model`, `world-engine`, `world-cast`, the four casts, `style-greenhouse`, `world-style`, `scripts/`.
Method and vocabulary as crewy's first review: module, interface, implementation, depth, seam, adapter, leverage,
locality; the deletion test; the interface is the test surface; one adapter is a hypothetical seam, two a real one.
Items 1 to 7 of the programme's "Left for later" are not re-proposed (the injected clock, `heard(envelope)`, the
snapshot's one archive option, saving under the judged target, `Upstream.observe`, the flat timings, the overlays).

**The answer branches, as they stand on `286a0f7`** (checked with `git merge-tree --write-tree 286a0f7 <branch>`):
`task/q8-offline-say` and `task/q11-recent-since` clean; the five ports that stand for the others clean:
`port/task/r27-tab-pairing@e5f79a9`, `port/task/q1-cookie-expiry@e5f79a9`, `port/task/q3-health-less@f2276db`,
`port/task/q14-dm-read-cap@f2276db`, `port/task/q15-body-cap@f2276db`. The older ports (`@f336f0c`, `@e6c5a34`,
`@5894792`) conflict and are superseded. Where a candidate below meets a port's files, the files named are from
`git diff 286a0f7 <port>` (two-dot: what the port really changes on top of the head).

### Candidates, Strong first

#### H1. A program's road to a running host, one module (Strong)

**Where:** `apps/host/src/checkout.ts:31-52` (`HostAnswer`, `answerFromHealth`, `probeCheckout`) and `:54-91`
(`tellOutcome`, `tellDevOrigin`); `apps/host/src/doctor.ts:40,78-101` (`PortState`, `probePortState`) and
`:263-281` (the `port` check reading `h.connection as { discovery?: …; key?: …; stream?: …; archived?: … }` by
hand); `apps/host/src/main.ts:104-121` (`mintFromRunning`); `apps/host/src/runFile.ts:20-34` (`readRunFile`);
`packages/loops-client/src/hostWire.ts:318-340` (`readHostHealth`), `:230-270` (`readConnection`).

**What is shallow today.** Four functions in three files are "a program on this machine asks the host on port N":
`probeCheckout` (health, 1.5 s), `probePortState` (a socket connect, then health, 1.5 s), `tellDevOrigin`
(dev-origin with the run file's secret) and `mintFromRunning` (pair-mint with the run file's secret). Each fetches
by hand and each reads the answer by hand:
- the health answer is read three ways: `answerFromHealth` (`checkout.ts:35-41`: `["ok","down","unauthorized"].includes(loops)`,
  `typeof keyName === "string"`, and the checkout regex `/^[0-9a-f]{6,64}$/`), `probePortState` (`doctor.ts:97`:
  `typeof body.loops === "string"`), and the doctor's `port` branch (`doctor.ts:268-269`, nested `as` casts). The
  wire already has the one reader, `readHostHealth` + `readConnection` (`hostWire.ts:318-340`), with the same
  checkout regex at `:334` and the same "is a host" rule at `:323-324`; neither Node caller uses it.
- `mintFromRunning` (`main.ts:107-114`) parses the run file by hand (`JSON.parse(text).mintSecret ?? ""`) while
  `readRunFile` (`runFile.ts:20-34`) is the run file's reader and `tellDevOrigin` already uses it (`checkout.ts:70`).
- `checkout.test.ts:41-46` pins `answerFromHealth`'s hand rule, `doctor.test.ts` fakes `probePort`, `devOrigin.test.ts`
  fakes `tellDevOrigin`'s secret, `runFile.test.ts` pins `readRunFile`: four test surfaces for one fact ("what a port
  answers a program").

**The deepening.** One module, `apps/host/src/runningHost.ts` (or inside `checkout.ts`, renamed): the interface
`probe(port, timeoutMs) → {kind: "silent"} | {kind: "not-a-host"} | {kind: "host", health: HostHealth}` built on
`readHostHealth`; `mint(port, origin)` and `tellOrigin(port, origin, checkout)` both through `readRunFile`;
`portState(port)` for the doctor as `probe` plus the socket pre-check. `answerFromHealth` becomes a two-line
projection of `HostHealth` (`checkout`, `keyName`), kept by name for `apps/world/hostPort.ts`; the doctor's `port`
branch reads `health.connection.key.state` typed. Folds in: the three hand fetches, the hand JSON of the run file,
the two hand health readers. Tests: `checkout.test.ts`'s `answerFromHealth` rows become rows of the module's `probe`
over a hand server (the hostWire reader is already pinned by `wire.test.ts`); `doctor.test.ts` injects the module's
`probe` instead of `probePort`; `devOrigin.test.ts` and `mainStart.test.ts` unchanged in what they prove.

**Behaviour:** none changes. The same routes, the same 1.5 s, the same words; `readHostHealth` accepts what
`answerFromHealth` accepts (both need `loops` one of three words and `keyName` a string) and drops the same
non-hex checkout.

**Answer branches:** meets `port/task/q3-health-less@f2276db` squarely: that port edits `checkout.ts:31-45`
(`HostAnswer` gains `keyState`, read by hand from `connection.key.state`), `doctor.ts:270-275` and
`apps/world/hostPort.ts:65-80`. With this module q3's hunk becomes one line (`keyState: health.connection?.key.state
?? null`), but the port must be re-made on the new head. No decision about an answer is needed; it is a port cost.
Do it when q3's port can be re-cut in the same session (its source hunk is 15 lines).

**Cost:** half a day; node tests only, no browser proof (nothing the page renders changes; `hostPort.ts` keeps its
`HostAnswer`).

#### H2. The town's and connect's answers defined once on the wire (Strong; C7's second half)

**Where:** `apps/host/src/host.ts:406-445` (`connect`: `{ok, connection}`, `{error: "no_loops"|"loops_down"|
"key_rejected", reason|message}`), `:455-579` (`town`: nine answer shapes, lines 458-459, 464-465, 474, 483, 493,
502-503, 518, 565, 578); `packages/loops-client/src/hostSource.ts:552-628` (`HostAnswer {status, body: unknown}`,
`connectHost`, `forgetHostKey`, `readHostTown`, `writeHostTown`, `readHostTownBackups`, `readHostTownBackup`,
`hostRequest`); `packages/loops-client/src/hostWire.ts` (readers for health and the stream only);
`tools/lib/connectStub.mjs:160`; `packages/loops-client/test/hostConnect.test.ts:54-56`.

**What is shallow today.** C7 defined the health and the stream once; the two local writes and the town's six
reads still cross the wire as `unknown`. The host writes nine town shapes and three connect shapes by hand; the page
reads them by hand at seven sites (`apps/world/src/state/hostTown.ts:114, 175, 254-255, 278, 382-383, 401`,
`components/TownSettings.tsx:53, 82`, `state/connect.ts:143-151`); the stubs write their own: the Connect stub's
refusal is `{error: "rejected"}` (`connectStub.mjs:160`), the hand server in `hostConnect.test.ts:54` writes
`{error: "rejected"}` too, and the real host writes `{error: "key_rejected"}` (`host.ts:438`). Nothing reads the
word, so nothing noticed; `wire.test.ts` cannot pin it because no reader exists. The town's `reason: "no_world_db"`
on a 200 (`host.ts:458`) is read at `hostTown.ts:189` as a string compare; `canUndo`/`canRedo` are read in two
places with two casts.

**The deepening.** In `hostWire.ts`, beside `readHostHealth`: the types `TownRead` (installation, rev, updatedAt,
document, canUndo, canRedo, reason), `TownWritten` (rev, document, canUndo, canRedo, changed), `TownConflict`,
`TownBackups`, `TownBackup`, `ConnectAnswer` (`ok` with the connection, or `error` + `reason`/`message`), each with a
strict reader (`readTownRead(status, body)`, …) and, as `HostHealthSent` does, a `Sent` type the host writes. The
host's `town()` and `connect()` build those types (the `sendJson` lines stay, the literals get a type). The six
`hostSource.ts` helpers keep their names and `HostAnswer` for the page's sake (r27, below) but the page's seven
hand-cast sites move onto the readers (page side; the page reviewer owns those lines). `wire.test.ts` adds: the real
host's town GET/PUT/409/backups and connect POST/DELETE answers round-trip through the readers; the Connect stub's
connect refusal reads as a `ConnectAnswer` (which makes the stub's and the host's `error` word one). Tests that move:
`hostConnect.test.ts`'s body assertions onto `readConnectAnswer`; `hostTown.test.ts` (page) keeps its transport fake
but feeds typed answers.

**Behaviour:** none, if the host keeps every field it writes today (the `Sent` types say so) and the readers are
lenient where the page is lenient now (`rev` a number, `document` unknown or null). The one word that would change,
the stub's `error: "rejected"`, is read by nobody; align the stub to `key_rejected` and say so.

**Answer branches:** `port/task/r27-tab-pairing@e5f79a9` edits `hostSource.ts:57-75, 155-159, 281-284, 608-614`
(`bearerHeaders()` into every fetch, `hostRequest` included) and `hostWire.ts:47-52, 215-222, 336-343` (the `/pair`
route, `pairingIdleDays` on health); `port/task/q1-cookie-expiry@e5f79a9` edits `hostWire.ts:215-222, 336-343`.
Shape the deepening so it adds new readers below `readHostHealth` and leaves `hostRequest` and the health reader
untouched: then both ports merge clean (their hunks are elsewhere in the files). `apps/host/src/host.ts`: r27 edits
the pair route and health (`:30, 83-90, 221-230, 255-300, 637-700`), q1 the gate and health (`:30, 83-90, 214-222,
255-262, 659-700`); the town route (`:455-579`) and connect (`:406-445`) are touched by neither. Clean if the literals
only gain types.

**Cost:** one day, node tests; the page's seven sites change but render nothing differently, so the regress `town`
and `connect` groups suffice as the browser proof (no pixcheck).

#### H3. `snapshot.ts`'s interface carries options nobody passes (Strong, small)

**Where:** `apps/host/src/snapshot.ts:293-312` (`SnapshotOptions.onLog`, `onRead`, `concurrency`), `:280-283`
(`archivedSlugsFromEvents`), the six `throw new SnapshotError("unauthorized", …)` at `:100, 124, 137, 167, 231, 248`;
`apps/host/src/worldDb.ts:136, 288-291` (`putTown`); `apps/host/src/pairing.ts:38-39, 91-94` (`pending()`);
`apps/host/src/discovery.ts:144, 172, 200` (`lookedFor`).

**What is shallow today** (every claim by `git grep` over `apps packages tools scripts`):
- `onLog`, `onRead` and `concurrency` on `SnapshotOptions` have **no caller at all**, not even a test (the first
  review's `snapshotConcurrency` was dropped by review-c1, its inner knob stayed). The snapshot's cap is
  `DEFAULT_CONCURRENCY` always.
- `archivedSlugsFromEvents` has one caller, `test/archivedProjects.test.ts:33`, beside `readArchivedSlugsFromEvents`
  which it wraps: "the callers from before the archive memory" are gone.
- `WorldDb.putTown` is called by `test/worldDb.test.ts` and `test/town.test.ts:228` only; the host calls `applyTown`
  (`host.ts:555`). `Pairing.pending()` is documented "(tests)" and called from `pairing.test.ts:298-300` only.
  `Discovery.lookedFor` is called from `discovery.test.ts:85` only; the doctor derives the same text itself
  (`doctor.ts:148`).
- Inside `snapshot.ts` the rule "401/403 is `unauthorized`, any other non-200 is `loops_down`" is written six times
  across `must`, `featured`, `readProjects`, `readArchivedSlugsFromEvents`, `readTicketActivity`, `readPages`.

**The deepening.** Delete the three options and the wrapper; make the `Reader` (`snapshot.ts:81-94`) judge once
(`reader.getJson` returns the status, a `reader.must` throws the one `SnapshotError`), so the six throws fold into it;
move `putTown`'s rows in `worldDb.test.ts` onto `applyTown({kind: "commit"})` (same facts: create, conflict, rev) and
drop `putTown`; `pending()` and `lookedFor` either go (their tests assert through `mintToken`/`redeem` and the log
line instead) or are marked test-only in one word. Tests: `archivedProjects.test.ts:33` calls
`readArchivedSlugsFromEvents(...).slugs`.

**Behaviour:** none. **Answer branches:** `port/task/q15-body-cap@f2276db` edits `loops.ts`, `stream.ts`,
`discovery.ts:12, 98-99`, `connection.ts`, `host.ts`; not `snapshot.ts`, `worldDb.ts`, `pairing.ts`. r27 and q1 edit
`pairing.ts` throughout (the cookie's stamp, `check`, `idleMs`): leave `pending()` alone until they land, or accept
a one-line re-port. **Cost:** two hours; node tests.

#### H4. loops' health read by one reader (Worth exploring)

**Where:** `apps/host/src/discovery.ts:84-113` (`LoopsHealth`, `loopsHealth`, `loopsAnswers`: a fresh keyless
transport per call, 1.5 s); `apps/host/src/stream.ts:222-233` (`readVersion`: `client.getPublicJson("/api/health")`,
the read timeout); `apps/host/src/loops.ts:25-29, 76-85` (`getPublicJson`, one caller: `stream.ts:225`);
`apps/host/src/connection.ts:275, 339, 584` (`loopsAnswers` as the `healthy` probe); `apps/host/src/keyCheck.ts:16,44`
(`HealthProbe` injected); `apps/host/src/doctor.ts:50, 124, 161` (`io.health` → `loopsHealth`).

**What is shallow today.** One route, `GET /api/health` keyless, is read by two implementations that parse the
same `{ok, version}`: the discovery's `loopsHealth` and the client's `getPublicJson`. The discovery's probes read
the version and throw it away (`loopsAnswers` keeps `ok` only), then the stream reads it again on every open
(`stream.ts:327`). `getPublicJson` is a method on the production `LoopsClient` interface with exactly one caller.
Two test fakes carry it for nothing (`fuzzStream.test.ts:104`, `upstreamStop.test.ts:31`).

**The deepening.** `loopsHealth(target, timeoutMs)` stays the one reader, in `discovery.ts` or a `loopsHealth.ts`
of its own; `LoopsClient` gains `health(): Promise<LoopsHealth | null>` (the keyless transport it already has) and
loses `getPublicJson`; the upstream's `readVersion` calls it. The connection's `healthy` closures stay. Later, not
now: one health read per link could feed both the verdict and the version (that changes how many probes a link
makes, which the "at most one probe a minute" rule and `connection.test.ts:210` count, so it is a separate, behaviour-
touching step).

**Behaviour:** none in this slice (same routes, same timeouts, same number of reads). **Answer branches:**
`port/task/q15-body-cap@f2276db` edits `loops.ts:4-7, 18-30, 44-55, 57-107` (the cap in `get`, `getJson`,
`getPublicJson`) and `discovery.ts:98-99` (the cap in `loopsHealth`): a direct meeting. Do it only with q15 decided,
or re-cut q15's port (its `loops.ts` hunk is 34 lines). **Cost:** two hours.

#### H5. The key's principal, read once from `GET /api/agents` (Worth exploring, small)

**Where:** `apps/host/src/chatPath.ts:76-86` (`ask`: `agents.find(a => a.id === keyName)`, `viewer === true`);
`apps/host/src/doctor.ts:226-240` (the `agents` line: `self.reader`, `self.viewer`, `self.external`, `self.role`);
`apps/host/src/keyCheck.ts:57-62` (the principal from `GET /api/auth/me`: `kind`, `role`).

**What is shallow today.** "What kind of bot is the key's principal" is answered from the agents list in two
places with two field readings: the chat path asks only `viewer`; the doctor asks `reader`, `viewer`, `external`,
`role` and writes the sentence. A loops that renames or adds a flag (round 12's `viewer` was such an addition) is
fixed in two files; the chat path's reading has its test (`chatPath.test.ts`), the doctor's sentence has
`doctor.test.ts`, and nothing pins that the two agree on which entry is "the key's own".

**The deepening.** `apps/host/src/keyBot.ts`: `readKeyBot(agentsBody, keyName) → {kind: "viewer" | "reader" |
"external" | "lane" | "unknown", id}` with the doctor's sentence as `keyBotWords(bot)`; `chatPath.ask` asks
`readKeyBot(...).kind === "viewer"`, the doctor prints `keyBotWords`. One table-driven test pins the five kinds;
`chatPath.test.ts`'s "a plain external bot's key reads no chat" row stays as is (it goes through `check()`).

**Behaviour:** none. **Answer branches:** `port/task/q14-dm-read-cap@f2276db` edits `chatPath.ts:19-22, 40-50,
122-162` (the gate on `readLine`), not `ask` (`:76-86`): clean if `ask` alone changes. **Cost:** two hours.

#### H6. The key's verdicts, written in one place inside the connection (Worth exploring)

**Where:** `apps/host/src/connection.ts:148-156` (`KeyHolder`), `:262-287` (`clearRecheck`, `scheduleRecheck`,
`recheck`), `:340-363` (the check's verdict: four writes to `mine.state`/`mine.reason`), `:392-423` (the stream's
second opinion: two more writes and the unlink), `:574-605` (`setKey`, `forgetKey`); the unlink sequence twice
(`:322-330` and `:403-413`: `link = null; chat.dispose(); unsubscribe every tab; await upstream.stop(); attach every
tab`); the "still mine" guard four times (`:272, 280, 346, 366`).

**What is shallow today.** C1 made the connection deep (twelve methods over 665 lines) and `connection.test.ts`
drives the key's states through it. Inside, the key's state machine (unchecked → checking → ok | rejected |
unchecked; rejected → recheck timer → checking; ok → stream 401 → rejected; stream ok → ok; any → setKey/forgetKey)
is not one thing: its transitions are six scattered writes with the log line and the step line beside each, and the
recheck timer is a separate pair of lets. The unlink is copied once. This is an implementation matter, not a seam:
one adapter, one caller. It is listed because the next slice that touches the key (the clock of "left for later"
item 1, q1's idle expiry does not, q14's gate does not) will meet all six sites.

**The deepening.** A `keyHolder.ts` module: `createKeyHolder({log, recheckMs, onRecheck})` with
`verdict(from: "check" | "stream", v: KeyVerdict | "unauthorized" | "ok")`, `state()`, `reason()`, `recheckAt()`,
`set(key, name, source)`, `forget()`, `dispose()`; the recheck timer inside it; the connection's six writes become
six calls, and `unlink()` one function. Tests: the rows of `connection.test.ts:92-240` that are about the key's word
(`:92, 115, 132, 155, 184, 210`) can stay through the connection (they prove the integration) while a
`keyHolder.test.ts` pins the transition table with no stub and no timers but a mocked clock.

**Behaviour:** none. **Answer branches:** `port/task/q14-dm-read-cap@f2276db` edits `connection.ts:16-20, 70-78,
234-266, 680-684` (the dm gate), `port/task/q15-body-cap@f2276db` edits `connection.ts` (15 lines: the cap into
`clientFor`), `port/task/q3-health-less@f2276db` edits `connection.ts` (11 lines, in `state()`). A key-holder module
reshapes `:262-287` and `:340-423`, which none of the three touch; `relink`'s client construction (`:200, 338`) is
where q15's hunk sits. Likely clean; check with `merge-tree` before merging. **Cost:** a day, node tests.

#### H7. Seven one-line facts that live in two files each (Strong, small; the locality sweep)

Each is one fact with two spellings; none is a seam. Together they are an hour's fold and worth one commit:
- the key's shape `/^chl_[A-Za-z0-9_-]{8,200}$/`: `host.ts:131` and `doctor.ts:59` (and a looser
  `/^chl_[A-Za-z0-9_-]{20,}$/` in `tools/lib/seed.ts:43`, outside this area); one `KEY_SHAPE` in `config.ts` beside
  `loadKey`;
- the key scrub `text.split(key).join("[redacted]")`: `connection.ts:202` and `loops.ts:54`; the connection's works
  without a link, so keep it and have the client take a `scrub` or the connection use `link?.client.scrub`;
- the run file read: `main.ts:107-114` versus `runFile.ts:20-34` (also in H1);
- "an http(s) origin from text": `config.ts:142-150` (`resolveLoopsWebUrl`), `config.ts:209-219` (`publicUrl`),
  `config.ts:187` (`loopsUrl`, a regex only), `main.ts:92` (`--origin`); one `httpOrigin(text, name)` in `config.ts`;
- the roads' text "`<via> <target>`": `discovery.ts:172` (`lookedFor`) and `doctor.ts:148`;
- "a slug that is a path segment, sorted, unique": `archiveStore.ts:45` (`normaliseSlugs`) is the one place, good;
  but `archiveMemory.ts:119-125` re-filters with `isSegment` before calling `remember`, which filters again;
- the JSON content-type test `/^application\/json\b/i`: `host.ts:419` (connect), `host.ts:534` (town),
  `devOrigin.ts:60`; and the "Origin required" refusal `host.ts:407-410` and `:529-533` with two sentences.

**Behaviour:** none. **Answer branches:** `host.ts:131` and `:407-419` are not in any port's hunks; `config.ts` is
edited by r27 (`:7` lines) and q1 (`:168-171, 206-213, 227`: `pairingIdleDays`), both away from `:142-150, 187,
209-219`; `main.ts` is edited by r27 and q1 (2 lines each). Mostly clean; check. **Cost:** an hour.

### The packages (three fresh readers under me, every Strong claim re-checked by me with grep or diff)

#### P1. One playback engine behind the scripted demo and the stress fixture (Strong)

**Where:** `packages/demo/src/source.ts:133-143, 217-273`; `packages/demo/src/stress.ts:335-343, 402-459`.

**What is shallow today.** "Play a timeline on an injected scheduler" is written twice. `diff -b` of
`source.ts:217-273` against `stress.ts:402-459` (checked) differs only in: the constant name (`MAX_WALL_STEP_MS` vs the
literal `5 * SECOND`), the `setSpeed` guard (`source.ts:233` throws on a speed outside 0/1/4/16, `stress.ts:415` does
not), the seek clamp spelled inline (`stress.ts:421` vs `clampPosition`, `source.ts:117`) and `listeners.size > 0`
vs `!listeners.size`. The tick, the `playback` object (`durationMs`, `positionMs`, `speed`, `setSpeed`, `seek`,
`loop`, `onChange`), `start` with its interval, `listeners`/`changeListeners`/`send`/`changed`: the same ~45 lines
in both.

**The deepening.** `packages/demo/src/player.ts`: `createPlayer({scheduler, durationMs, epochMs, rebuild(to),
advance(target), snapshot()}) → {playback, start, now, position}`. Two adapters, a real seam: the scripted timeline
(entries, heartbeats, carried chat; `source.ts`) and the PRNG stepper (`stress.ts`). The loop reset (`loop++`,
`rebuild(0)`, send the snapshot) folds in; the seq offset per reset stays per adapter (`source.ts:151` vs
`stress.ts:376`). Tests that move onto the player: `timeline.test.ts:72, 87`, `seek.test.ts:23, 35, 50`,
`stress.test.ts:41`.

**Behaviour:** none if the `setSpeed` guard stays with the demo adapter (the page passes 0/1/4/16 only).
**Answer branches:** none touch `packages/demo`. **Cost:** half a day to a day; node tests; the demo's envelopes are
byte-pinned by `timeline.test.ts`, so no browser proof beyond the regress `demo` group.

#### P2. The demo's index exports six things nobody imports (Strong, minutes)

**Where:** `packages/demo/src/index.ts:8, 13, 14, 15`. **Evidence (checked):** zero callers anywhere in `apps packages
tools scripts`, tests included, for `DEMO_CONTENT` (`index.ts:15`, a namespace export of all of `content.ts`),
`buildScript`, `PROBE_SILENCE`, `DEMO_EPOCH_MS`, `DEMO_PROPS`, `propComment`. Test-only, and the tests import the
source files directly, never the index: `QUICK_DEBOUNCE_MS`, `QUICK_MIN_GAP_MS`, `movementSignals`, `scriptPlan`
(`director.test.ts:6`), `STRESS_AGENTS`, `STRESS_BUILDINGS` (`stress.test.ts:7`), `PERSON_DONE_GAP_MS`
(`storyline.test.ts:7`), `laneOf`. **Also on the interface:** `DirectorFeed.stampsHeld()` (`director.ts:81-82`,
"test-facing"), two test callers; it proves the round-45 memory bound and has no production reading, so it stays but
is named here. **The deepening:** drop the six; keep the test-only seven off the index. **Behaviour:** none.
**Answer branches:** none. **Cost:** minutes.

#### P3. The seed tool holds a second named-port list (Strong, ten lines)

**Where:** `tools/lib/seed.ts:19` (`REFUSED_PORTS = [8091, 8000, 9443]`, the words at `:38`);
`scripts/named-ports.mjs:5-8` ("nothing else holds a copy"); `tools/lib/toolGuard.ts:17` imports the list, `seed.ts`
does not (checked). The Mac app's folder name is likewise spelled in `scripts/no-app-reach.mjs:62, 76`,
`tools/lib/toolGuard.ts:20` and `tools/loops-dev.sh:28`; the tools' rule cannot import `no-app-reach.mjs` because
importing it installs the guard (`:257`). **The deepening:** `seed.ts` imports `APP_PORTS` from `named-ports.mjs`
(keeps its own URL rules); the app-data parts become a plain sibling module with no imports, read by
`no-app-reach.mjs` and `toolGuard.ts` (the shell script stays). Tests `scripts/test/loops-seed.test.ts:46-48` and
`toolGuard.test.ts` move onto the shared list. **Behaviour:** none. **Answer branches:** `tools/` is outside my area;
r27's port edits `tools/lib/live.mjs`, `world.mjs`, `regress.mjs`, not `seed.ts` or `toolGuard.ts`. **Cost:** ten lines.

#### P4. Greenhouse's code keys are one list written twice, with nothing between them (Strong)

**Where:** `packages/style-greenhouse/src/keys.ts:6-101` (`CODE_KEYS`, 94 names) and `src/index.ts:192-375`
(the `#code` switch: 87 `case` labels plus the `emblem.` prefix at `:195`, which together cover the 94; checked by
set difference). `test/models.test.ts:30` pins `coveredKeys == data ∪ CODE_KEYS`; nothing pins `CODE_KEYS == what
#code draws`. A key added to one and not the other draws the registry's placeholder silently.

**The deepening.** One table in a new module (`keys.ts` is pure and must stay free of three.js): `CODE:
Record<CodeKey, (kit, o, ctx) => Object3D>`, `CODE_KEYS = Object.keys(CODE)`, `#code` a lookup; the `emblem.*`
family and the four `furniture.rack-*` (`index.ts:323-326`) are entries. The interface becomes the test surface: "every
code key draws a non-null object" is then one test; `models.test.ts` keeps reading `CODE_KEYS`.
**Behaviour:** none if every case keeps its drawer. **Answer branches:** none touch `style-greenhouse`. **Cost:**
moderate (a 180-line switch becomes a table); page-side proof: pixcheck's demo set, expected identical.

#### P5. `WorldSimulation` is a second simulation whose only production use is the placement check (Strong)

**Where:** `packages/world-engine/src/index.ts:295-470` (`WorldSimulation`), `navSim.ts:100-919`
(`NavSimulation`). Callers (checked): every production constructor passes `[]` actors and calls `placement` only:
`apps/world/src/world/placements.ts:166, 235, 254` and `packages/world-model/src/catalogue.ts:170`. `route`, `tick`,
`position`, `snapshot`, `reservations`, `place` are called from `world-engine/test/world.test.ts:133-279` and the
README only; the one mover in production is `NavSimulation` (`apps/world/src/world/navigation.ts:339-340`,
`walks.ts:145`). The speed and tick cap are written twice: `index.ts:364-366` (`0.1`, `2.8` as literals) and
`navSim.ts:58-59` (named). `sameCell` (`index.ts:44`) has no caller anywhere; `navSim.ts:97` re-declares it.
`findFreeCell` (`catalogue.ts:160-180`) has one caller, `world-model/test/townDocument.test.ts:178`;
`placements.ts:232-247` (`freeCellIn`) is the same scan from the other corner, `freeSpots` (`:251-266`) a third.

**The deepening.** One placement module in the engine: `placementRules(layout, defs) → {check(prop): Placement;
freeCells(propId, rotation, order): Cell[]}`, holding `validateLayout`, the occupancy and the flood
(`index.ts:388-426`) once. `WorldSimulation.placement`/`place` call it, or the class retires (the Lead's call: its
movement tests, `world.test.ts:133-185, 249-279`, either move onto `NavSimulation`, whose `nav.test.ts:94-163`
already pins reservations and segments, or go with the class). The three page wrappers and `catalogue.findFreeCell`
fold in. Tests: `world.test.ts:186-231` (placement) move onto the module.
**Behaviour:** none: the same checks in the same order, the same reason strings. **Answer branches:** none touch
`world-engine`, `catalogue.ts` or `placements.ts`. **Cost:** small to medium; the engine half is node-only; folding
the page wrappers is a page change (build mode draws placements) and needs regress `build` and pixcheck, expected
identical.

#### P6. Place words are said by hand in five files although `halls.ts` is their module (Strong)

**Where:** the module, `packages/world-model/src/halls.ts:95-127` (`placeWords`, `roomPlaceWords`, `roomSign`,
`rackWords`). The copies (checked): `describe.ts:144` and `where.ts:69` the identical `rooms === "classic" ? "the
lobby" : "Administration"`; `describe.ts:170-172` (`doneWord`: "Dispatch"/"Done") vs `where.ts:132` ("Dispatch"/"the
Done rack"); `describe.ts:301-303` a wrapper that only renames halls' `placeWords`; `describe.ts:158-159, 203-206`;
`describeTown.ts:25-31` its own wording of a placement's room; `where.ts:28-37` strips the preposition off
`roomPlaceWords` and re-derives it with `startsWith("on ")`; `director.ts:253-259` (`HALL_TAG_WORDS`) re-spells
`${RACK_NAMES[k]} rack` (= `halls.rackWords`) and `:272` "at the huddle table" vs `halls.ts:105`;
`director.ts:67-78` a private copy of `ROOM_KINDS` (`townDocument.ts:24-35`).

**The deepening.** `halls.ts` gains the missing reads (`doneWord`, the mailbox place, `placePhrase(kind, rooms) →
{preposition, place}`), exports `ROOM_KINDS` once; describe, where, describeTown and director say places only
through it; the `describe.ts:301` wrapper folds. Tests: `halls.test.ts` (fifteen place-word pins) is the surface;
`person.test.ts`, `where.test.ts`, `director.test.ts` keep their sentences as regression.
**Behaviour:** identical strings. **Answer branches:** none. **Cost:** low; node only (the page's one caller,
`WorldCanvas.tsx:996 doneWord`, keeps its interface). Does not touch `townLayout.laneWords` (left for later, item 8).

### Worth exploring

#### W1. The loops event-type catalogue lives twice and has drifted (Worth exploring; Strong but for one console line)
`packages/loops-fake/src/fake.ts:131-144` (`EVENT_TYPES`, 68 names) vs `packages/loops-client/src/validate.ts:815-846`
(`KNOWN_EVENT_TYPES` = `WORLD_EVENT_TYPES` of `types.ts:708-746` plus 28 names, 65 in all); both cite
`contracts/events.py` at 4cdcd383. Checked: `agent_action.ambiguous`, `agent_action.expired`, `agent-action.updated`
are in the fake only (`fake.ts:134, 153`); the client would warn once on them (`validate.ts:858-860`). Deepening:
`types.ts` exports the full catalogue and `ADMIN_EVENT_TYPES`; `validate.ts` builds `KNOWN_EVENT_TYPES` from it; the
fake imports both. Tests: `fake.test.ts:177` and the client's unknown-type test. Behaviour: one console line fewer on
those three types (why it is not Strong); say so. Cost: an hour. No answer branch.

#### W2. The fake's chat routes vs `createDemoApi`: one reader, two transports
`packages/demo/src/api.ts:102-170` and `packages/loops-fake/src/fake.ts:577-591, 672` both answer `GET /api/dm/threads`,
`/api/dm/threads/{agent}/messages` and `/api/agents` over the same `DemoSource`, with the path matcher
(`api.ts:107` = `fake.ts:518-519`), an error class (`api.ts:49-57` / `fake.ts:181-191`), the error envelope
(`api.ts:60-63` / `fake.ts:783`) and `PAGE_DEFAULT`/`PAGE_MAX` written twice; and they drift (the api pages newest-last
with `before` and 403s a non-lead, the fake returns every message with `nextCursor: null`). Deepening: the fake delegates
its GET dm routes to `createDemoApi(source).handle(...)` (its `keyReadsChat` gate stays), which gives `DemoApi` two
adapters (the dock, `apps/world/src/api/client.ts:29-40`, and the fake's HTTP). Behaviour: the fake's messages route
would page at 50 and 403 a non-lead; nothing visible with today's short threads, but a change in principle. Cost: half
a day. No answer branch.

#### W3. `loopsStub.ts` and the fake write loops' wire grammar twice
`apps/host/test/loopsStub.ts` vs `packages/loops-fake/src/fake.ts`: bearer-and-cookie `ambiguous_auth` (stub `:194-196` /
fake `:434-448`), the error body (`:124` / `:783`), `cursor` xor `after` 400 (`:219, 246` / `:502`), `from=tail`
(`:226` / `:683`), the honest `lastSeq` (`:241` / `:690`), 429 with `Retry-After` (`:254-259` / `:700-702`), 410
(`:223, 250, 253` / `:484`), the heartbeat line (`:315-320` / `:402`), health's two faces, the viewer-key bot. Content
differs by design (canned vs the demo; 27 host test files use the stub's `routes`/`pages`/`emit`/`onRequest`/`outage`).
Deepening, with care: only the pure pieces into a `loops-fake/src/wire.ts` (resume parsing, the error envelope, the
heartbeat line, the 429 answer); the stub imports them (host tests already import `@crewhub/loops-fake`,
`e2e.test.ts:13`); never the server loop (the timing-proof tests hang on `onRequest` and the stub's own moments, see
the memory on timing-proof tests). Behaviour: none. Cost: a day, mostly re-running the host suite. q14's port edits
`loopsStub.ts` (+15): meet it last.

#### W4. The world-origin contract re-typed in the fake, under names loops-client uses for other facts
`fake.ts:92-94` (`WORLD_ROUTES` regexes, `WORLD_EVENT_TYPES`, `WORLD_EVENTS_LIMIT`) restate `pageChat.ts:30-32`
(`PAGE_CHAT_EVENT_TYPES`, `PAGE_CHAT_EVENTS_LIMIT`), `pageChat.ts:37` (`AGENT`) and `dm.ts:17` (`MESSAGE_ID`; a third
copy `api.ts:47`). Name collision: loops-client's `WORLD_ROUTES` (`hostWire.ts`, used by `allowList.ts:8`) and
`WORLD_EVENT_TYPES` (`types.ts:708`) mean other things. Deepening: `pageChat.ts` exports `isAgentName`; the fake imports
the two constants and the shapes and renames its three to `ORIGIN_*`; `worldOrigin.test.ts:10` moves. Behaviour: none.
Cost: an hour. r27's port adds `pairingBearer.ts` and edits `pageChat.test.ts`, not `pageChat.ts`.

#### W5. The contract's name lists are only half in `names.ts` (world-cast)
`world-cast/src/names.ts:1-2` says the lists live apart for the validator and the contract test, yet the nine motion
channels live three times (`index.ts:352` type, `validate.ts:10`, `runtime.ts:39`, whose order is behaviour at
`runtime.ts:291`), the waves twice plus a switch (`index.ts:360`, `validate.ts:9`, `figure.ts:18`), the two reserved
colour names in `index.ts:244-245`, `referenceKit.ts:12`, `figureKit.ts:11`; `IDLE_STATE` (`index.ts:50`) re-spelled at
`runtime.ts:312`. Deepening: `names.ts` gains `MOTION_CHANNELS`, `MOTION_WAVES`, `RESERVED_COLORS`; `index.ts` derives
the types as it does for `CastRole`. Behaviour: none (same order, same error words). Cost: small, node only.

#### W6. The small-part thresholds live in both figure kits, two packages apart
`style-greenhouse/src/parts.ts:15-17` (`PLAIN_BEVEL 0.012`, `SMALL_SPHERE 0.05`, `SMALL_CYLINDER 0.04`) and
`world-cast/src/referenceKit.ts:58, 62, 68` as literals; the default corner radius read from `PROP_LIMITS` at
`parts.ts:26` and written `?? 0.04` at `referenceKit.ts:57`. Why it matters: the contract's budget
(`apps/world/test/castContract.test.ts:48-50`) has leverage only while the reference kit's triangle counts match the
style's, and nothing pins that parity. Deepening: `PROP_LIMITS` (`world-engine/src/props.ts:41-65`) gains the three;
both kits read them; one parity test per shipped cast (`measureFigure` under `referenceKit` = under `figureKit(Kit)`).
Behaviour: none. Cost: small.

#### W7. `agentCard.ts` exports six pieces; only `agentCardFacts` has a caller
`world-model/src/index.ts:33`; `agentCard.ts:184, 191, 249, 291, 304, 329`. Outside the package only `agentCardFacts`
is used (two page files); `RECENT_LIMIT` appears in a comment only. `agentCard.test.ts:4, 87-97, 160-165, 186-202`
calls the pieces directly: the test surface is the pieces, not the interface. Deepening: the pieces go private; the
tests go through `agentCardFacts` on the world `helpers.ts` builds. Behaviour: none. Cost: low.

#### W8. The stale snapshot is computed once but worded in three package files
The rule once (`reducer.ts:43, 70-78`); the words three times: `appearance.ts:94-107`, `describe.ts:82-88`,
`director.ts:350-356` (and `model.ts:56`'s comment repeats 300 s). On the page `lane.tsx:12` and
`agentCard/sections/now.ts:36` say "older than 5 minutes" as prose and `WorldCanvas.tsx:544` builds a `Freshness` by
hand. Deepening: a `freshness.ts` owning `STALE_AFTER_S`, `freshnessOf` and `freshnessWords(f) → {short, sentence}`;
`freshnessOf` leaves the index (no outside caller). Behaviour: identical sentences per surface. Cost: low; the page
lines are C6/C8 ground and optional.

#### W9. Ticket status words and the drawn/new pair (world-model)
`status.ts:11-18` (`drawnStatus`, `newStatusWord`), called identically at `objects.ts:146-147` and
`agentCard.ts:277-278`; `describe.ts:23-29` (`STATUS_WORDS`), `41-47`, `307`; `agentCard.ts:334` says a status by
`.replace("_", " ")`; the page keeps its own tables (`agentCard/words.ts:35`, `townLayout.ts:86`, `WorldCanvas.tsx:777`).
Deepening: `status.ts` gains `statusWords(status)` and `drawn(status) → {status, newStatus}`. Behaviour: none.
Cost: low.

#### W10. world-cast and style-greenhouse carry exports with no caller
`world-cast/src/index.ts:458` re-exports `hashKey`, `figureEyes`, `perchFor`, `perchPlacement` (no caller outside
`world-cast/src`); `figureColor` and `wave` have `figure.test.ts` only; `GREENHOUSE_STYLE_ID`
(`style-greenhouse/src/index.ts:455`) zero callers; `apps/world/test/castRoomPlan.test.ts:3` imports world-cast by
relative path. And the model's index: of world-model's 126 value exports, 52 have no production caller outside the
package and 47 have exactly one file; only 5 of the 52 are used by tests outside the package (`HISTORY_LIMIT`,
`jsonBlocks`, `movedAgents`, `richJsonBlocks`, `ROOM_KINDS`); world-engine: 31 exports, 14 with no outside caller
(the reader's count; I spot-checked `sameCell` and `findFreeCell`). Deepening: trim the indexes to what `apps/*`,
`demo` and other packages import; tests in-package already read the source files. Behaviour: none. Cost: an hour each.

#### W11. A desk top's height is said three times (style-greenhouse)
`style.json:9, 18, 29` (`workSurfaces`: 0.565, 0.635, 0.532), `keys.ts:105-106, 113` (`SURFACES`), `keys.ts:147-148`
(`screenGlow(0.565…)`, `screenGlow(0.635…)`). Deepening: `index.ts` composes the tops once (the manifest's height where
`workSurfaces` has the key, `SURFACES` for the rest), `screenGlow` reads `SURFACES`; do not add `workSurfaces`' other
keys to `userData.surface` (`apps/world/src/world/workSurface.ts:15` falls back to the bounding box for those).
Behaviour: none (equal numbers). Cost: small.

### Speculative (short)

- **S1.** The demo person, session and status list as literals: `DEMO_PERSON` (`store.ts:428`) but `"nicky"` at
  `store.ts:314, 332`, `stress.ts:104`, `fake.ts:251`; `DEMO_SESSION` (`content.ts:21`) but `"ekinsol"` at `lanes.ts:83`,
  `scenarios/fresh.ts:30`, `one.ts:13`, `studio.ts:196`; the five statuses at `store.ts:44`, `stress.ts:75`,
  `loopsStub.ts:373` while `TICKET_STATUSES` exists (`fake.ts:817` uses it). Minutes.
- **S2.** `withKeyBot` (`loops-fake/src/lanes.ts:17-44`) builds the key's bot only when the demo does not list it; every
  scenario lists `crewhub-world` and no caller passes another name, so the row is built in `lanes.test.ts` only.
- **S3.** The strict scenario-id check twice (`loops-fake/src/main.ts:30-35`, `tools/loops-seed.mjs:84`) because
  `parseScenarioId` (`scenarios.ts:94-96`) defaults silently: a `scenarioIdOf(text): ScenarioId | null`.
- **S4.** `FigureKit.piece` optional for the reference kit only (`world-cast/src/index.ts:256`, `runtime.ts:149-153`
  `pieceOfMesh` stands in): give the reference kit `piece`, drop the stand-in.
- **S5.** Three breadth-first fills in the engine (`index.ts:193-225`, `nav.ts:388-415`, `navSim.ts:683-716`; a fourth
  in `roomDressing.ts:328-345`): one `flood(grid, blocked, origin, visit)` in N,E,S,W order keeps all three identical;
  the deletion test is borderline (each costs its caller ~25 lines).
- **S6.** `host.ts`'s `town()` route (`:455-579`) as a pure verdict beside `worldDb.ts`, the way `devOriginVerdict`
  is: nine answer shapes and four `JSON.parse` try/catches of the stored document would read as one table. Not a
  seam (one caller, one adapter); worth it only together with H2.

### Looked at, not a candidate

- **`connection.ts` as a module (C1):** twelve methods over 665 lines, `connection.test.ts` drives the key's states
  through it; deep. H6 is its one inner spread.
- **`chatPath.ts` (C4), `archiveMemory.ts` + `archiveStore.ts` (C5):** small interfaces, one timer each, the file
  adapter real; both already carry q14's and the memory's facts. Deep.
- **`hostWire.ts` (C7):** one table, strict readers, `wire.test.ts` over the real host and the stubs. H2 is what it
  did not cover (the local writes and the town), not a flaw in it.
- **`transport.ts`:** two adapters (tcp, unix) behind one `request`, both put through the allow-list; a real seam.
- **`discovery.ts`:** pure roads, injected disk and probe, one `Discovery` with `start`/`refresh`/`stop`; deep.
  `lookedFor` is test-only (H3).
- **`pairing.ts`:** pure state, no HTTP; r27 and q1 both reshape it: leave it to them.
- **`keyCheck.ts`:** one verdict, one injected probe; the reason texts are one place. Deep.
- **`worldDb.ts`:** one `applyTown` over the model's `history.ts` (a real seam: the page's `townStore.ts` is the other
  adapter); `putTown` is test-only (H3).
- **`doctor.ts`:** by design it repeats the connection's first link without the stream; its duplicates are H1 and H5.
- **`build.ts`, `steps.ts`, `runFile.ts`, `devOrigin.ts`, `checkout.ts`'s `checkoutId`, `nodeVersion.ts`:** pure
  decisions with the IO injected; `nodeVersion.ts` reads the one rule in `scripts/check-node.mjs`. Fine.
- **`allowList.ts`:** re-exports the wire's table so one file says everything the host answers and asks; the loops
  reads list is its own. Fine.
- **loops-client `source.ts` (`WorldSource`):** two adapters (demo, host), a real seam. `validate.ts` strict and
  `dm.ts` lenient on purpose, documented in `dm.ts:1-10`; `validateDmThreadsResponse`/`validateDmMessagesResponse`
  are used by the demo's and the client's tests only, as the comment says. Fine.
- **`hostSource.ts`'s `HostSourceTuning` (C7):** the test seam is a second argument now; the production
  `HostSourceOptions` carries no test knob. Fine.
- **loops-fake's knobs** (`visibility`, `bufferSize`, `emptyTeam`, `streamMaxMs`, `lastVisibleSeq`, `sessionsOpen`,
  `setWorldOrigin`): each has a caller in a test or a tool; a test double's interface is the test surface.
- **demo `lanes.ts`, `logFacts` use (`store.ts:995-1000`):** one source for demo, fake and host. Good.
- **world-model `reducer` / `projection` / `model`:** projection owns event → facts, reducer facts + memory → model,
  `model.ts` types only; two deep modules with one entry each. **`townDocument` / `townChanges` / `history`:** distinct
  jobs; `history.ts` has two real adapters. **`appearance.ts` (C8):** the one source of agent words; the overlap left is
  P6/W9. **`props.ts` vs `propRequests`/`ruleProps`:** one validator, two callers. **nav / navSim / index:** one
  pathfinder (`index.ts:128-191`), nav plans over doors, navSim moves; P5 is the one leftover.
- **The four casts behind one contract:** `apps/world` reads a cast only through `CastFactory`
  (`castRegistry.ts:4-18`), `castBoundary.test.ts` pins it; the three 9-line indexes are the minimal adapter;
  sprouts' 43 lines are the contract's own `extend` hook doing what data cannot. Keep.
- **style-greenhouse's interface:** two exports, one caller (`apps/world/src/world/style.ts:3`),
  `styleBoundary.test.ts` pins it. `parts.ts` vs `partsNode.ts`: one reader and one holder, not two adapters.
  `keys`/`kit`/`figureKit`/`referenceKit`: tables, the material store and two `FigureKit` adapters chosen at
  `castRegistry.ts:216`; a real seam, with W5/W6 the leaks across it.
- **world-cast `validate.ts` `parts()` vs world-engine `validatePropModel`:** same six fields, different limits on
  purpose; folding would change what validates.
- **scripts:** `named-ports.mjs` is read by `no-app-reach.mjs:59` and `toolGuard.ts:17` as it claims (P3 is the
  one copy); `check-node.mjs` the only Node rule; `scan-model-calls`, `bubbles-copy`, `check-design-system`,
  `check-docs`, `prop-validate`: one rule each with its own test.

### Order, if asked

Tonight-safe (node only, no port's files): H3, H7 (minus `pending()`), P1, P2, P3, P6, W5, W7, W9, W10. Needs a
port re-cut: H1 (q3), H4 (q15), H2 (r27 and q1 only if `hostRequest` or the health reader moves: shape it so they do
not). Needs the browser proof: P4 (pixcheck), P5's page half (regress `build`, pixcheck). For Nicky: none needs a
decision about an answer; H1 and H4 are port costs, not decisions.

## The page and the tools (arch2-page)

Read-only review of `feat/world-demo` at `286a0f7` in the `crewhub2-task-review` worktree. Area: `apps/world` and
`tools/` (with `tools/lib`, `regress.mjs`, `pixcheck.mjs`, `a11y.mjs`). Vocabulary and method as the first review's:
module, interface, implementation, depth, seam, adapter, leverage, locality; the deletion test; the interface is the
test surface; one adapter is a hypothetical seam, two a real one. Nothing in this worktree was changed; nothing ran.

Answer branches checked with `git diff --stat $(git merge-base 286a0f7 <branch>) <branch>` for the seven, and for the
ports found by name (`port/task/r27-tab-pairing@f336f0c`, `port/task/q1-cookie-expiry@f336f0c`,
`port/task/q3-health-less@f336f0c`, `port/task/q14-dm-read-cap@f2276db`, `port/task/q15-body-cap@f336f0c`). In my
area only three answers touch files at all: **r27** (`main.tsx`, `ConnectPage.tsx`, `ConnectionPanel.tsx`,
`PairPage.tsx`, `en.ts`, `state/pairing.ts`, `hostPort.ts`, `vite.config.ts`, and in tools `regress.mjs`, `a11y.mjs`,
`connectshots.mjs`, `timeworld.mjs`, `lib/live.mjs`, `lib/world.mjs`), **q1** (`ConnectPage.tsx`,
`ConnectionPanel.tsx`, `PairPage.tsx`, `en.ts`, `state/pairing.ts`), **q3** (`hostPort.ts`), **q8**
(`ConnectionPanel.tsx`, `world/zoneText.ts`), **q11** (`RecentAnswers.tsx`, `state/chatRoad.ts`,
`state/recentAnswers.ts`, `world.css`; merges clean on `286a0f7`). q14 and q15 are host-only.

Seven candidates, four Strong. Fewer real ones over many weak ones; the Looked-at list says what I passed over.

---

### P1. The viewer's browser-kept settings as one module (Strong)

**Where.** Nine modules of one shape: `state/details.ts` (51 lines), `fps.ts` (50), `cast.ts` (37), `quality.ts`
(44), `styleOptions.ts` (52), `ambient.ts` (43), `daynight.ts` (55), `oldQuarter.ts` (46), `buildingPlan.ts` (75):
453 lines. The same shape without the store in `roleOverrides.ts` (22-44), `tour.ts` (86-104 `readTourDone`,
`writeTourDone`), `source.ts` (124-139 `readSourceSetting`, `writeSourceSetting`), `director.ts` (101-117 `#load`,
`#save`) and `chat.ts` (77-95 `loadPins`, `savePins`).

**What is shallow today.** Each module repeats: a `KEY`; a `type Storage = Pick<globalThis.Storage, ...>`; a
`local()` that reads `globalThis.localStorage` inside a `try` ("reading `localStorage` itself can throw"); `readX` with
a try/catch and a default; `writeX` with a try/catch; `let current`, `const listeners = new Set`; `setX` (write +
notify); `useX` built on `useSyncExternalStore` with an **inline subscribe arrow**. The one fact worth pinning,
"storage may throw (a private window): the choice then lasts for this page only", is spelt out in nine comments and
tested in four places (`details.test.ts:5`, `fps.test.ts:6`, `daynight.test.ts:25`, `roleOverrides.test.ts:5`) and
in none of the other five. Three parse rules (`quality` a choice list, `styleOptions` a flat string object,
`roleOverrides` known roles) are the only real differences; everything else is the copy. The inline subscribe arrow
is the churn `state/media.ts` (round 30) names in its own header: `useSyncExternalStore` re-subscribes whenever its
subscribe function changes identity, and `WorldCanvas` calls `useQuality`, `useCast`, `useStyleOptions`,
`useDayNight`, `useFps` and `useBuildingPlan` on every render, which is every reduction under load.

**The deepening.** One module, `state/setting.ts`: `createSetting<T>({ key, parse, format, fallback, storage? })`
answering `{ read(), write(v), set(v), now(), use() }` with one stable subscribe per setting; `parse` and `format`
are the only things a setting brings (`"on"`/`"off"` for the booleans, the choice list for `quality`, JSON for
`styleOptions` and `roleOverrides`, `null` as "remove" for `cast`). The nine files become nine declarations of two to
eight lines each; `daynight` keeps its mode-dependent default as a `fallback(mode)`; `buildingPlan` keeps its
`?rooms=` override in front of the read; `tour`, `source`, the director's presence settings and the dock's pins are
the same module without a store (`read`/`write` only). The storage keys stay exactly as they are: the tools set them
(`tools/lib/world.mjs` `castChoice`, `perf.mjs` quality and fps). Tests: the four "survives storage that throws"
tests move onto `createSetting` as one table-driven test over every declared setting (one fact, one test surface);
the parse rules keep their own tests (`roleOverrides.test.ts`, the `quality` choice list, `parseStyleOptions`).

**Behaviour.** None: the same keys, the same defaults, the same values. The one invisible change is that the stores
stop re-subscribing on every render (a stable subscribe), which is the mechanism round 30 fixed for media queries;
pixels identical.

**Answer branches.** None of the seven and none of the ports touch any of these files. Clean.

**Cost.** Small: a 60-line module, nine files rewritten to declarations, four tests folded into one. Node-provable;
the page proof is formal (regress `walk` covers Settings, pixcheck's demo set reads the stored cast and quality).

---

### T1. One module for a tool's rig: a host over a loops, served or behind Vite, paired (Strong)

**Where.** `tools/lib/live.mjs` 52-118 (`startLive`: fake or `--loops-url`, `createHost` served or behind Vite,
`pair(page)`, `close`) is used by `perf.mjs`, `memory.mjs`, `profile.mjs`. `tools/regress.mjs` builds the same rig
by hand nine times: the `live` group 926-960 (fake, loops-web stub, host, pairing, `openLive`), `chat` three times
(1231-1246, 1422-1432, 1491-1501), `town` 1583-1620 and again for the prop fixture 1816-1837, `ops` 1880-1902, the
`connect` group's real half 2273-2333 (discovery through a folder, a key store, pairing on, a restart with the stored
key) and `real` 2743-2744 and 2852 (the unix-socket host). `tools/lib/connectStub.mjs` 40-50 (`ensureInner`) and
`tools/road2proof.mjs` 77-81 are the tenth and eleventh copies.

**What is shallow today.** The same decisions are spelt out at each site: the dynamic imports of `createLoopsFake`
and `createHost` by `pathToFileURL`; the served-or-behind-Vite rule
`served ? { ...opts, staticDir: dist } : { ...opts, port: hostPort, allowedOrigins: [origin] }` (seven times); the
dist-freshness rule in three spellings (`regress.mjs` 157-165 with `checkBuild`, `live.mjs` 86-87 `--preview`,
`road2proof.mjs` 62-63); the host's test timings `retryMs {100,500}, reconnectMs {100,300}, heartbeatMs 1000`
(seven times, by hand); `pairing: "off"` or a `mintPairLink` step (`regress.mjs` 979-985, 1105, 1615-1618,
1836-1838, 2288; `live.mjs` 109-112); the host log captured as an array (five spellings: `() => undefined`,
`lines2.push`, `hostLog.push`, `createHostLog`); `noteLoops` to register the loops origin for the closing checks. The
proof that this is shallow is r27's port: its tools hunks change **every** pairing step one by one (`pairedTab` at
five places in `regress.mjs` plus `live.mjs` plus `connectshots.mjs`), because the step has no home.

**The deepening.** `tools/lib/rig.mjs`: `startRig({ loops: { fake: {...} } | { url, key, keyName }, host: {...},
serve: { dist } | { origin, hostPort }, pairing: "off" | "on" | { secretFile }, log? })` answering
`{ loops, web, host, origin, base, pair(page), restart(hostPatch), close() }`, with the dist rule and the test
timings inside it and `noteLoops` as a hook. Two adapters of the loops side (the in-process fake; a real loops by URL
and key file) and two of the serving side (the host serves `dist`; the host behind a Vite origin): both real seams
today, just unnamed. `startLive` becomes `startRig` plus the command-line reading; `connectStub`'s inner host and
`road2proof`'s two hosts call it; each regress group calls it with its differences only (the ops group's key store,
the town group's `worldDb` and `pairingSecret`, the real half's discovery folder). Tests: a node test under
`scripts/test` starts a rig on port 0 over the fake and pins the served/behind-Vite rule, the pairing step and the
close order (today pinned by nothing but the regress run); `connectStub.test.ts` stays as it is.

**Behaviour.** None in the page; in the tools the same hosts with the same options. The regress log's INFO lines
would come from one place and read the same.

**Answer branches.** Meets **r27** in `tools/regress.mjs`, `tools/lib/live.mjs` and (by import) `tools/lib/world.mjs`.
r27's hunks are exactly the pairing step at every copy; after the rig they are one hunk in `rig.mjs`'s `pair()`. The
port for r27 will need redoing on this head anyway (see "Noted in passing"); this deepening makes that port smaller,
not larger. No decision about an answer is needed. q1, q3, q8, q11, q14, q15: clean.

**Cost.** Medium: one 150-line module, eleven call sites, one node test. Proof: a full regress run (every group) and
`memory.mjs`/`perf.mjs` once each with `--source live`; no pictures change (pixcheck does not start a host).

---

### T2. One module for a tool's page: the context, the viewport, the theme, the watch, the wait (Strong)

**Where.** The viewport rule `width <= 480 ? { viewport: { width, height: 812 }, isMobile, hasTouch } : { viewport:
{ width, height: 900 } }` is copied verbatim in `a11y.mjs:51`, `connectshots.mjs:41`, `liveshots.mjs:44`,
`lib/shots.mjs:8`, and in a variant in `pixcheck.mjs:172`. `browser.newContext({ viewport: { width: 1440, height:
900 }, colorScheme: "light" })` stands 13 times in `regress.mjs` (plus the phone form 4 times), each followed by
`newPage()` and `watch(pg, origin, problems, tag)`; `regress.mjs` has its own `open()` at 188-194 (with the CPU
throttle) and still writes the pair by hand in the `live`, `chat`, `town`, `ops` and `connect` groups. Each tool has
its own open-and-wait: `lib/shots.mjs` 30-40 (store the cast, watch, goto, `dressed`, settle), `perf.mjs` 95-125
(store quality/fps/cast, a long-task observer, pair, goto, wait for `world:town-dressed` and `__worldPerfWindow`),
`a11y.mjs` 53-59 (reduced motion), `tourshots.mjs` 25-31, `castshots.mjs`, `liveshots.mjs`. The page's locators are
copied too: `screen()` and `chipState/until` are written in `regress.mjs` twice (946-955 in `live`, 2037-2050 in
`connect`) and in `a11y.mjs` 63-64; `text()`, `trail`, `levels`, `labels`, `drawn` live in `regress.mjs` 239-277 and
nowhere a second tool can reach.

**What is shallow today.** `lib/world.mjs` already owns `launch`, `watch`, `store`, `dressed`, `seek`, `speed`,
`worldUrl`: the pieces exist, the composition does not, so every tool re-assembles them and the viewport rule has
five homes. A tool that wants "a phone page in the dark theme, watched, dressed" writes six lines; r27's port touches
`connectshots.mjs`'s copy of those lines and `a11y.mjs`'s screen words.

**The deepening.** `tools/lib/page.mjs` (a new file, not an append to `world.mjs`, so r27's `pairedTab`/`hostGet`
hunk at the end of `world.mjs` stays untouched): `openPage(browser, { origin, width, theme, reducedMotion?, dpr?,
store?, cpuThrottle?, problems, tag, pair? })` answering the page with its context, and `waitFor(page, "load" |
"dressed" | "perf")`; beside it the page's locators as one table (`screen`, `chip`, `untilChip`, `textView`, `trail`,
`levels`, `labels`, `drawn`, `announced`). Every tool's `open()` becomes one call; `regress.mjs`'s 17 contexts and the
two copies of `screen/until` fold in. Tests: `scripts/test/worldWatch.test.ts` already pins `watch`; a node test pins
the viewport rule and the option mapping (the pure part), the rest is the tools running.

**Behaviour.** None: the same contexts, the same waits.

**Answer branches.** Meets **r27** in `a11y.mjs` (one line: the screen words table; keep that table in `a11y.mjs`
until r27 lands, or move it last), `connectshots.mjs` (its bearer handling is in the loop body, not in the open), and
`regress.mjs` (the pairing lines, which T1 absorbs). With `page.mjs` as a new file and `world.mjs` untouched, r27's
`world.mjs` hunk merges clean; the `regress.mjs` adjacency is the usual merge-tree check. Others clean.

**Cost.** Small to medium: one 120-line module, ten tools edited mechanically. Proof: regress all groups, a11y,
pixcheck once (its two pages go through `openPage` too: pictures must be identical, and they will be, same viewport
and DPR).

---

### P2. The page's overlays as one module (Strong, with one recorded decision to respect)

**Where.** `App.tsx`: seven overlay states at 119-133 (`textOpen`, `settingsOpen`, `connectionOpen`, `tourOpen`,
`jumpOpen`, `chat`, `editing`) with three focus-return refs (`returnFocus` 147, `chatReturn` 133, `tourReturn` 126);
open/close pairs at 300-307 (jump), 317-320 and 350-353 (settings), 326-339 (chat), 342-349 (text), 355-363 (tour),
376-383 (connection), 145 and 423-425 and 657-669 (the prop editor); the focus-in effects 384-389; build mode's own
return 364-374; the card's return to the scene 276-282; the Escape order written by hand in the window key handler
400-472 (tour, jump, chat, connection, settings, build, then the view's chain); `dialogOpen` listed again at 556 for
the tour. The dialogs themselves handle Escape a second time inside (`JumpList.tsx:50`, `Tour.tsx:90`,
`RestoreDialog.tsx:46`, `Menu.tsx:141`), so two handlers can see one key.

**What is shallow today.** The overlay stack is not a value; it is seven booleans and three refs whose agreement is
kept by hand in four places (open, close, Escape, `dialogOpen`). Four overlays (jump, settings, text, connection)
**share one return slot** (`returnFocus`): opening Settings, then the jump list with Ctrl+K from inside it, overwrites
the return point with an element of the Settings sheet; closing both leaves the focus on the body, not on the Settings
button. That is a latent fact nothing pins. The view module (C2) receives `open: { text, build }` as flags from this
spread (470) and asks `close: "text" | "build"` back (274-275): the Left-for-later list's item 7 records the decision
that the page's dialogs keep their DOM focus returns.

**The deepening.** `state/overlays.ts`, pure: `Overlays = { open: readonly OverlayKind[] (innermost last), returnTo:
ReadonlyMap<OverlayKind, Opener | null> }` with `Opener` an opaque type (the adapter stores the element); intents
`open(kind, opener)`, `close(kind)`, `escape()`; answers `{ next, focus: Opener | null, closed: OverlayKind | null }`;
derivations `anyOpen`, `flagsForView` (`{ text, build }`). The Escape order is one list in the module. `App.tsx` keeps
one `useOverlays()` adapter that captures `document.activeElement` as the opener and focuses on close: the dialogs
keep their DOM focus returns, as decided. The window key handler asks the module first and the view second, as now.
Tests under node: the Escape order; each close returns to its opener; the tour's return to the Settings button when
Settings opened it; "Settings, then the jump list, then Escape twice" pinned **to today's single-slot outcome** (the
module keeps one slot for the four that share it, so behaviour is unchanged); fixing that to a true stack is a
one-line change and a decision for Nicky, recorded in the test's name.

**Behaviour.** None, with the single-slot rule kept on purpose. The a11y tool's focus checks (Escape closes the panel
and the focus is back on the chip; the canvas has the focus after the card closes) are the browser pins.

**Answer branches.** None of the seven or the ports touch `App.tsx`. Clean.

**Cost.** Medium: a 120-line module, `App.tsx` loses about 90 lines, a node test of a dozen cases. Browser proof:
a11y (the focus checks) and regress `walk`, `demo`, `tour`, `chat` (Escape chains); pixcheck identical (nothing drawn
changes). **Note for the Lead:** the brief says round 60's developers are on Left-for-later items 1 to 7, and item 7
is these overlays. No branch for it is visible (`task/r60-a1-archive-option`, `a2-ear-observe`, `a4-town-store`,
`a7-town-flake` are the four). If someone is on item 7, this candidate is its continuation and should be shaped with
them, not beside them.

---

### P3. The text view's lines and sections as one pure module (Worth exploring)

**Where.** `App.tsx` 200-229: the `textLines` memo composes seven producers (`describeWorld` or `text`, `saidLines`,
`describeCasts`, `describeZones`, `describePlan`, `describeTownDocument`) plus two sentences built inline (the live
page's "The town document is …" line with its own lower-casing of `townKeepingWords`, and `storageNote`). `App.tsx`
1029-1128 `TextView`: the section grouping (`owned`, `placed`, `before`, `after`, 1032-1040) and the block rendering.

**What is shallow today.** The order of the text view (Town first, every building's sections under its district, then
casts, zones, the plan, the town document) is a fact of the page pinned only by the regress's `text()` reads; the
composition and one wording rule live inside a React memo with a thirteen-entry dependency list.

**The deepening.** `world/textView.ts`: `textViewLines(facts) → TextLine[]` (facts: model, text, civic, rooms, cast,
town doc and catalogue, rules, invalid, plan, said, now) and `textViewSections(lines, districts) → { before,
districts: [{ district, buildings: [{ building, sections }] }], after }`; `TextView` renders the structure, `App`
calls one function in its memo. Tests under node: the order; the live town-document line; a building with two
sections lands under its district; nothing is lost between lines and sections (a count).

**Behaviour.** None. **Answer branches.** None touch `App.tsx`. Clean. **Cost.** Small; proof a11y (the text view's
tree) and regress `walk`/`rooms`/`chat` text checks; pixcheck unaffected.

---

### P4. The chat's four page stores owned by one runtime (Worth exploring; C9's residue)

**Where.** `state/said.ts` 35-40 and 104-111 (`clearSaid`, "a new source, the tests"), `state/threads.ts` 11-24,
`state/chatRoadStore.ts` 9-24, `state/pageChat.ts` 47-63 (`publishPageChat`/`getPageChat`, a module store beside the
pure runner). The writers are already injected: `world.ts` 65-75 outlets, `runtimes.ts` 52 and 110-115, `chat.ts`
`DemoChatConfig.said`.

**What is shallow today.** Four module-level singletons, each with its own listener set and a `clearX` for the tests
(`said.test.ts`, `recentAnswers.test.ts`, `soak.test.ts`, `threads.test.ts` call them at every start). The chat seam
(C9) takes a writer but the stores stay global, so two runtimes in one process (a test, a future second world) share
them.

**The deepening.** `createChatStores({ now, schedule })` answering `{ said, recent, threads, probe, page, subscribe }`
with one subscribe and the same reads; `runtimes.ts` makes the page's one and the hooks read it; `chat.ts`'s adapters
and `world.ts`'s outlets take it. Tests build their own instance; the four `clearX` go. Hook names (`useSaid`,
`useRecentAnswers`, `useChatThreads`, `useChatRoad`) stay.

**Behaviour.** None. **Answer branches.** q11 edits `recentAnswers.ts`, `chatRoad.ts` and `RecentAnswers.tsx`, none of
the four stores; clean if the hook names stay. **Cost.** Small to medium; proof regress `chat` and a11y.

---

### P5. The page's start as one module (Worth exploring; waits on r27's answer)

**Where.** `main.tsx` 17-75 (`decided`, `Gate`, `snapshotAhead`, `world`), `state/source.ts` 163-187 (two module
slots: the decision and the snapshot read ahead, handed over by `setSourceDecision`/`sourceDecision` and
`setFirstSnapshot`/`takeFirstSnapshot`), `state/page.ts` 100-106 (`pageConfig` read once), `state/health.ts` 240-245
(the page's instance seeded from `sourceDecision()`), `runtimes.ts` 37-45.

**What is shallow today.** The decision travels from `main.tsx` to the runtimes through three module-level slots with
an ordering rule in comments ("by then main.tsx has recorded the gate's decision"); C3 left "one page factory reads
location/env once" at `pageConfig()` plus these slots.

**The deepening.** `state/pageStart.ts`: `startPage({ search, pathname, dev, storage, probe, prefetch, clock }) →
{ decision, config, firstSnapshot, screen }`, pure in its inputs; `main.tsx` calls it and renders; `health`,
`runtimes` and `page` take the config instead of reading slots. `page.test.ts` and `source.test.ts` move onto it.

**Behaviour.** None. **Answer branches.** Meets **r27** squarely: its `main.tsx` hunk rewrites `decided()` around
`pairedDecision`/`pairingPlan`, which is exactly the start this module would own, and **q1** adds to `pairing.ts`.
The shape of the start depends on the answer to question 1: for Nicky, not tonight. **Cost.** Medium.

---

### T3. regress.mjs's groups as files over the rig (Worth exploring; after T1 and T2)

**Where.** `tools/regress.mjs`, 2955 lines: the shared helpers 169-330, then ten `group()` bodies of 100 to 700 lines
each, all closing over `browser`, `ok`, `info`, `shot`, `problems`, `noteLoops`.

**What is shallow today.** `--groups` already selects, but a group cannot be read, run or deleted on its own: the
deletion test fails for the file, not for the groups. With T1 (the rig) and T2 (the page and its locators) the
closures a group needs are an interface of three values: `{ rig, page, check }`.

**The deepening.** `tools/regress/<group>.mjs`, each `export async function run({ rig, page, check, out })`; the
runner keeps the command line, the plan, the closing checks and the log. A pure move.

**Behaviour.** None. **Answer branches.** Meets r27 (its regress hunks sit in five groups) and is best done after
r27's port is redone on this head, or as part of it. **Cost.** Medium to large as lines moved, small as thought;
proof is a full regress run.

---

### Speculative

**P6. Walk mode out of `TownScene`.** `TownScene.ts` 2138-2340 (`#walk` with thirteen fields at 2212-2236,
`#beginWalk`, `#endWalk`, `#walkStep`, `walkInput`, `walkLook`, `visitor`) plus `WorldCanvas.tsx` 95-161
(`WalkControls`) over the pure `visitor.ts`. A `WalkMode` module owning the visitor, its figure, the camera pose and
the input, ticked by the scene, would let the walk's camera and door-crossing rules be driven under node; today only
regress `rooms`/`walk` pins them. Pixel proof is heavy (walking frames are not in pixcheck's set, so a new set would be
needed) and C2 moved the walk's state last round: not tonight.

**P7. The labels' visibility rules.** `WorldCanvas.tsx` `Interior` 667-677 (`revealed`, `shows`, `picked`, the
compact rule), `TownSign`'s expansion rule 310-318, `AgentLabel`'s `full`/`pill` inputs 729-742. A pure
`labelRules.ts` (which signs, pills and tags show for a view, Details, a phone and a selection) would be the test
surface for what regress's `labels()` counts pin today. Small and clean of the answer branches, but the labels jitter
by text anyway and C8 just reshaped the appearance; worth a look after P2.

---

### Looked at, not a candidate

- `state/health.ts` (C6), `state/view.ts` (C2), `state/chat.ts` (C9), `state/world.ts`/`town.ts`/`director.ts`
  (C3): deep now, each one interface with a node test surface; `runtimes.ts` is the wiring and the right size.
- `state/hostTown.ts` and `townStore.ts`: a real seam with two adapters (the browser's IndexedDB store, the host's)
  and 987 lines of tests over the interface; round 60's `a4-town-store` is on its one open fact.
- `state/pageChat.ts` runner and `state/connect.ts`: pure, tested, no spread (the store beside the runner is P4).
- `components/ConnectPage.tsx` 90-127: three parallel ternary chains on `screen` (title, icon, spoken lead) that a
  table would hold once; small, and r27 and q1 both edit this file: not worth a port.
- `ConnectionPanel.tsx`, `FirstSnapshot.tsx`, `ConnectionChip.tsx`, `SourceSettings.tsx`: thin over the health module.
- `WorldCanvas.tsx` props (15 after C2) and `useAgentCard` (389-437, six store reads): the card's facts come from the
  registry; the hook is the page's composition, no second caller.
- The page's dev-window surface (`__town` `TownScene.ts:560`, `__worldPerf` `FpsOverlay.tsx:30-46`, `__worldStores`
  `soak.ts:52-54`, `__frameStats` `WorldCanvas.tsx:1066`): four names, each set by the module that knows the value;
  a registry would add a layer for nothing.
- `tools/lib/toolGuard.ts`, `regressArgs.ts`, `timeworldArgs.ts`, `probeRefusal.ts`, `verdict.mjs`, `chatSoak.mjs`,
  `pixdiff.ts`, `domdiff.ts`, `heap.mjs`: pure, each with a `scripts/test` test; this is the tools' deep half.
- `tools/lib/connectStub.mjs` and `loopsWebStub.mjs`: since C7 the stub reads the wire's route table
  (`hostWire.ts`); its inner host is T1's.
- `pixcheck.mjs`'s build cache and `vite preview` pair: its own thing, one caller, pure diff already in a lib.
- `i18n` (`translate` beside `useT`): two readers of one table by design (node-loadable words).

### Noted in passing (outside my area, for the Lead)

- The r27 port by name on this head is not among the branches: the newest is `port/task/r27-tab-pairing@f336f0c`
  (C7's head, before C6), and its `ConnectPage.tsx` hunk still names `onHealth`, `probeHost` and `CONNECT_POLL_MS`,
  which C6 removed. The programme page says r27 and q1 stand by ports `@780d645`; no branch of that name exists in
  this repository's refs. Worth a check before tonight's merges.
  *(Lead, 15:25: the port standing for r27 on `286a0f7` is `port/task/r27-tab-pairing@e5f79a9`, on origin; the
  `@780d645` ports were superseded by it and deleted with crewy's word at 15:12. Nothing to fix.)*
