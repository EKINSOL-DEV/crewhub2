# Reviewing pull request #28: a reader's guide

`feat/world-demo` into `main`. Measured at `a3e5a22` against `main` (`3a66363`) with `git diff --stat
origin/main...a3e5a22` and `--numstat` per path on 2026-10-23: **828 files, +157,727 −3,661**, in 1,183 commits
(668 without the merges). 780 files are new, 39 existing files change, 9 are deleted (the first scene's five
files under `apps/world/src/world`, `packages/protocol`, `apps/bridge/README.md`). This page says what you can skip,
in which order to read the rest and what to look for there, how to run it, and what is not in the PR. Start with
[the introduction](INTRODUCTION.md) if you have never seen the world; this page assumes it.

## 1. What you can skip: 267 files, 51,351 lines

| What | Files | Lines | Why, and what checks it instead |
| --- | --- | --- | --- |
| The model JSON, `packages/style-greenhouse/models/` | 171 | 38,606 | Baked part models of the Greenhouse style, written by tools; loaded by `src/models.ts` and pinned by the style's tests (`packages/style-greenhouse/test`) and the pixel proof (`tools/pixcheck.mjs`) |
| The casts' JSON, `packages/cast-*/{cast,figure,person}.json` | 12 | 1,143 | The four figure sets as data; validated by `packages/world-cast/src/validate.ts` (`figure.test.ts`, `castContract.test.ts`, `castBoundary.test.ts`) |
| The demo's props, `packages/demo/src/props/*.json` | 3 | 609 | Prop documents in the `crewhub-prop/1` format; `npm run prop:validate` and `packages/demo/test/props.test.ts` |
| The prop-builder's examples, evals and format reference, `skills/prop-builder/{evals,references}/` | 46 | 6,231 | The skill's data and its scored runs; the same validator |
| Test fixtures in JSON (15 recorded crewhub-loops answers in `packages/loops-client/test/fixtures`, two baked scene fixtures) | 17 | 2,814 | Inputs of tests, never shipped |
| `package-lock.json` | 1 | +313 −93 | `npm ci` is the proof; the intent is the 22 lines of `package.json` (the workspaces, the check chain, `playwright-core` as the one new root dev dependency) |
| `docs/images/` | 16 | 3.3 MB, binary | The introduction's pictures |
| The night report, `docs/reports/2026-10-01-world-demo-night.md` | 1 | 1,635 | History, round by round |

What is left: **561 files, +106,376**: 352 source files (+74,935), 184 test files (+24,101) and 25 documents
(+7,340). The merge rehearsal of 2026-10-23 counted 423 files and +84,915 with a narrower cut (the model JSON and the
tests taken out, nothing else); both figures are from the same diff.

## 2. A reading order by area

The times assume a careful read at about 300 lines an hour for source and a skim of the tests at three times that
pace; "the risky parts alone" is the files named under each area at the careful pace. Nobody needs the first column.
Which one-line bugs in the risky parts the tests are known to catch is measured in §5.

| Area | Source files / lines | Test files / lines | A careful read | The risky parts alone |
| --- | --- | --- | --- | --- |
| 1. The host | 15 / 3,098 | 20 / 2,033 | about 12 h | 1,641 lines, 5 to 6 h |
| 2. The relay and the allow-list | 23 / 5,893 | 25 / 3,824 | about 24 h (less: 1,900 of it are type and validator declarations) | 1,581 lines, 5 h |
| 3. The chat roads | 24 / 2,037 | 13 / 1,286 | about 8 h | 866 lines, 3 h |
| 4. The world state and the town store | 91 / 17,620 | 56 / 7,500 | about 67 h, 47 h without the demo's content | 2,611 lines, 9 h |
| 5. The scene | 118 / 30,354 | 66 / 9,029 | about 110 h | a 600-line road, 2 h |
| 6. The UI kit's use | 40 / 7,590 (2,701 of it CSS) | checked by the passes | about 16 h without the CSS | 630 lines, 2 h |
| 7. Tools and regress | 41 / 8,343 | 4 / 429 | about 28 h | 560 lines, 2 h |
| 8. The documents | 25 / 7,340 | | about 7 h at a reading pace | the first four, 1.5 h |
| All | 377 / 82,275 | 184 / 24,101 | about 270 h | about 30 h, four days |

Areas 1 to 4 are where a mistake costs something (a key, a cookie, a town); 5 to 8 are where a regression hides.

### 2.1 The host: `apps/host`, the program and its gates

- **Entry files.** `apps/host/src/main.ts` (the commands: `host`, `world`, `doctor`, `open`), `config.ts` (the
  environment, one table), `host.ts` (1,290 lines: every route, the Host and Origin guards, the pairing gate, the
  write gate, the host's word on its key and on the chat), `pairing.ts`, `devOrigin.ts` with `checkout.ts` and
  `runFile.ts`, `doctor.ts`, `build.ts`. The README beside them is the reference (308 lines).
- **What it does.** A Node 24 program with no dependency beyond Node, on `127.0.0.1:5180`. It holds the one
  crewhub-loops key, answers the browser under `/world-api`, and in production serves the built page.
- **The risky parts.** *Pairing:* the cookie `crewhub_world_pair` is `HttpOnly; SameSite=Strict; Path=/` on
  `127.0.0.1`, host-only, so every loopback port the paired browser visits receives it (the security review of
  round 26, its one open finding; open question 1, with the per-tab answer prepared on a branch, section 4); any valid
  cookie of that name pairs, a junk one beside it cannot lock the browser out (round 26, F2); no expiry (question 2).
  *The origin guard:* `Host` must be `127.0.0.1:<port>` or `localhost:<port>` (421); an `Origin`, when present, must
  be the host's own, one from `CREWHUB_WORLD_ALLOWED_ORIGINS` or one this checkout's dev server registered (403);
  every write needs `application/json` and `OPTIONS` is 405 on every route, so no cross-origin page can write; HTML
  carries `frame-ancestors 'self'`, every answer `nosniff` (round 26, F6). *The dev origin:* `POST
  /world-api/dev-origin` lets `npm run dev` register its origin; since round 26 the caller proves the same user with
  the secret of the host's 0600 run file, plus the checkout id; at most 8 a run (question 4). *The key:* read once,
  kept in memory, never logged, never in a body, scrubbed from loops' error text; stored 0600 in a 0700 folder.
  *Unpaired health* says the states and, today, the bot's name, the cursor and loops' version (question 3).
- **Pinned by.** `apps/host/test/pairing.test.ts` (309 lines), `guard.test.ts`, `devOrigin.test.ts`,
  `runFile.test.ts`, `static.test.ts`, `keyStates.test.ts`, `connect.test.ts`, `e2e.test.ts`, `key.test.ts` (every
  response grepped for the key); the regress groups `connect` (25 checks, every Connect screen in order) and `ops`
  (8, loops stopped, the key revoked, loops upgraded under the host).

### 2.2 The relay and the allow-list: what reaches crewhub-loops, and what the browser gets back

- **Entry files.** `apps/host/src/allowList.ts` (the one list, both directions), `transport.ts` (TCP or the Unix
  socket, the same headers, no redirect followed), `loops.ts`, `keyCheck.ts`, `discovery.ts` (finds the Mac app,
  read only), `snapshot.ts`, `stream.ts`; on the browser's side `packages/loops-client/src/hostSource.ts` (the one
  file in the browser that may fetch, and only its own host), `validate.ts` and `types.ts` (loops' shapes),
  `source.ts` (the `WorldSource` seam); `packages/loops-fake/src/fake.ts`, the test double that speaks loops' routes.
- **What it does.** GET-only reads of crewhub-loops under an allow-list, one upstream event stream shared by every
  tab with a ring buffer of 2,000 envelopes, the snapshot assembled from loops' lists. The browser takes a snapshot,
  then events by `seq`, and re-snapshots on a `reset`.
- **The risky parts.** The allow-list (paths are normalised before matching, queries rebuilt from named parameters,
  a segment with a slash is 404; the host never sends anything but a safe method). The stream's cursor rules
  (`from=tail` before every connection, the sealed cursor or `after=<seq>`, never both; the three `reset` reasons).
  The key's state: only a definite 401 or 403 from a loops whose health answers makes it `rejected`; a loops that is
  down is never a verdict on the key. The browser's stale handling: a stream that stays open and silent reconnects at
  the cursor by itself (the state review of round 27, F3). The fake must say what loops says
  ([LOOPS_REAL_VS_FAKE.md](LOOPS_REAL_VS_FAKE.md) lists where the real one differed).
- **Pinned by.** `allowList.test.ts`, `stream.test.ts`, `unixsock.test.ts`, `snapshot.test.ts`, `discovery.test.ts`,
  `loopsVersion.test.ts`; `packages/loops-client/test/hostSource.test.ts`, `validate.test.ts` (against the 15
  recorded answers), `hostConnect.test.ts`, `hostConnection.test.ts`; the fake's own tests; the regress groups `live`
  (26, over the fake and a host the tool starts), `real` (13, against a real development crewhub-loops), `ops` (8).

### 2.3 The chat roads

- **Entry files.** `apps/world/src/state/chatRoad.ts` (the road is one value, `key`, `page` or `none`, and every
  sentence the panels say), `packages/loops-client/src/pageChat.ts` (road 2's client), `apps/world/src/state/pageChat.ts`
  (its runner), `said.ts` (the bubbles and the Recent answers list); road 1 is `readsChat` and `relink` in
  `apps/host/src/host.ts` with `chatLine.ts`; road A is `components/ChatPanel.tsx`; `scripts/bubbles-copy.ts` keeps
  the copy in one place (`npm run check:copy`).
- **What it does.** Road A frames crewhub-loops' own web app in the Chat panel. Road 1: the host's viewer key reads
  only the chat of the person who made the key, and a `chat` message on the stream becomes a bubble. Road 2: where
  loops has `CHL_WORLD_ORIGIN` set to the page's origin, the page itself reads the signed-in person's own chat with
  the session cookie, GET only, four routes, nothing through the host.
- **The risky parts.** *Road 2's request shape:* the init is frozen as `{ method: "GET", credentials: "include" }`,
  no header of ours on any path, so no preflight ever (the review of round 29 verified the two fetch sites); the ids
  are checked before anything is sent; the verdicts (`on`, `signed-out`, `origin-not-set`, `unreachable`, `chat-off`,
  `remote`) and their words. *The host's word:* health says `session: key`, `unknown` while it cannot know, nothing
  when it knows the key reads no chat; a key unchecked at start and accepted on the stream later is asked then (round
  29, High 1); the page re-reads health when the stream goes live or the key word changes (Medium 2). *The frame:*
  `sandbox="allow-same-origin allow-scripts"`, another origin, so it cannot reach the world. A message id is shown
  once (round 29, Low 6). The poll runs every 5 s shown, 60 s hidden, per open page (question 9).
- **Pinned by.** `apps/world/test/pageChat.test.ts` (362 lines), `chatRoad.test.ts`, `said.test.ts`,
  `recentAnswers.test.ts`, `chatPanel.test.ts`; `packages/loops-client/test/pageChat.test.ts` (the header names,
  against a real loopback server); `apps/host/test/chatKey.test.ts`; `scripts/scan-model-calls.ts` (fetch is allowed
  in two browser files and nowhere else); the regress groups `chat` (22, both roads over the fakes) and `live` (26);
  `tools/road2proof.mjs` records a browser's requests on road 2.

### 2.4 The world state and the town store

- **Entry files.** `apps/world/src/main.tsx` (the gate: the source decision before anything loads), `state/world.ts`
  (the one seam between data and presentation), `state/source.ts`, `packages/world-model/src/projection.ts`
  (`SourceMessage`s in, `Facts` out, idempotent by `seq`), `reducer.ts`, `model.ts`, `townDocument.ts` (the format
  `crewhub-town/1` and its limits), `history.ts` (the pure undo), `state/townStore.ts` (IndexedDB),
  `state/hostTown.ts` (the host's town over it), `apps/host/src/worldDb.ts` (`node:sqlite`, migrations, backups, the
  host's own validation), `App.tsx` (1,353 lines of wiring), and the demo as the other source: `packages/demo/src/source.ts`
  and `script.ts`. Sizes: the world model 28 files, 6,077 lines; the browser's state 29 files, 3,106; the demo 21
  files, 6,001 (its content included).
- **What it does.** Everything the scene shows comes through the world model from one of two sources, the scripted
  demo or the live host, and the text view describes the same model. The town document (zones, layout, props) is the
  browser's in the demo and the host's in live mode, with one undo history.
- **The risky parts.** *The town store's revisions:* every write carries the revision it is based on; another
  browser's write in between is a 409 with the host's document, never an overwrite; a person's edit remembers the
  picture it was made on and is kept out when the host's town replaced that picture before it was sent (round 27, F1
  and F2); the world's own records go up as `amend`, never as an undo step (F7). *Offline:* the browser keeps editing,
  offers its town once when the host is back, never over a town the host has (question 8 adds the one-tab rule as a
  sentence). *The host's side:* the document is validated with the world model's own validator and limits (round 26,
  F7), the history is capped at 50 revisions and 8 MB, a migration copies the file to `world.db.bak-v<n>` first, a
  newer schema is refused. *The projection:* drops `seq <= cursor`, re-snapshots on a reset, coalesces refetches; a
  `town` message makes every tab refetch.
- **Pinned by.** `apps/world/test/hostTown.test.ts` (545 lines, the review's proofs inverted), `townStore.test.ts`,
  `settlementUndo.test.ts`; `apps/host/test/town.test.ts`, `worldDb.test.ts`; `packages/world-model/test/townDocument.test.ts`,
  `history.test.ts`, `projection.test.ts`, `reducer.test.ts`, `loopsDrift.test.ts`, `noModelCalls.test.ts`;
  `packages/demo/test/loops-shapes.test.ts` (the demo speaks loops' shapes); the regress groups `town` (9: two
  browsers see one town, a host restart keeps it, a restore is previewed) and `demo` (38).

### 2.5 The scene

- **Entry files.** `apps/world/src/components/WorldCanvas.tsx` (1,064), then `world/TownScene.ts` (2,711, renders on
  demand) and `buildingView.ts` (1,821) with the dressings; `walks.ts` and `navigation.ts` with the engine's `nav.ts`
  and `navSim.ts` (the grid, doors, pathfinding); `objectLayer.ts` and `propLayer.ts`; `packages/style-greenhouse/src/index.ts`
  (the style manifest), `packages/world-cast/src/runtime.ts` (figures as data). Sizes: `apps/world/src/world` 73 files,
  18,638 lines; the engine 7 files, 2,141; the style 19 files, 5,445 plus `style.json`; the cast seam 7 files, 1,785.
- **What it does.** Three.js over the world model's contract and nothing else: one plot per building, three rooms,
  tickets as objects, figures that walk. Labels are HTML placed over their anchors each drawn frame.
- **The risky parts.** None that touch a key or a person's data. What can go wrong hides from a diff: a pixel moves.
  The cuts since round 15 (Object3D, the phone pass, figures as data, the entry built ahead) were each proved
  pixel-identical with `tools/pixcheck.mjs` and the parity tests; the heap and frame budgets are in
  [COST_POLICY.md](COST_POLICY.md). The one input from a person is a prop document (build mode's import,
  `world/propImport.ts`): the engine's `props.ts` validates it under limits.
- **Pinned by.** The parity tests (`mergeStaticParity`, `staticPartsParity`, `roomDressingParity`,
  `validateLayoutParity`), the seam tests (`castContract`, `castBoundary`, `styleBoundary`), `navigation`, `walks`,
  `wayfinding`; the engine's `nav`, `pathfinding`, `props`, `propFormat`; the style's `civicBake`, `figurePieces`; the
  regress groups `walk` (38), `rooms` (20, three of them the scene's teardown, §5), `demo` (38); the measurements `tools/perf.mjs`, `memory.mjs`.
- **The short road, 2 h:** `WorldCanvas.tsx`, the header and `dispose` of `TownScene.ts`, `propImport.ts` with the
  engine's `props.ts`; trust the parity tests and the pictures for the rest.

### 2.6 The UI kit's use

- **Entry files.** `apps/world/src/components/ConnectPage.tsx` (the key form), `ConnectionPanel.tsx`,
  `TownSettings.tsx` with `RestoreDialog.tsx`, `Tour.tsx`, `components/primitives/` (695 lines, `Menu.tsx` most of
  it), `styles/tokens.css` (crewhub-loops' tokens), `scripts/check-design-system.mjs`, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
  `styles/world.css` is 2,639 lines and is skimmed.
- **What it does.** Every 2D surface uses crewhub-loops' design system; the 3D keeps the Greenhouse style.
- **The risky parts.** The key field: component state only, `type="password"`, `autoComplete="off"`, cleared before
  the request, only the last four characters ever shown (round 26, N7). Import and Restore in Settings > Town take
  a document from a file or a backup: validated before it is adopted, and a restore is a new revision, undoable. The
  icon sprite is the one `dangerouslySetInnerHTML`, a constant. The design guard: no colour outside the tokens, dark
  parity of every token.
- **Pinned by.** `npm run check:design` (193 files, 68 dark tokens) and `check:copy`; `tools/a11y.mjs` (188 checks); the regress
  groups `walk` (38: keyboard, text view, phone width, themes, reduced motion), `connect` (25), `tour` (16); the unit
  tests `connect.test.ts`, `tour.test.ts`, `source.test.ts`.

### 2.7 Tools and regress

- **Entry files.** `.github/workflows/ci.yml` (one job: `npm ci`, `npm run check`), `package.json` (the chain: the
  Node guard, typecheck, the tests, doc links, the design and copy guards, the build), `scripts/scan-model-calls.ts`
  (the no-model-call guard), `scripts/check-node.mjs`, [tools/README.md](../tools/README.md), `tools/regress.mjs`
  (2,663 lines, the ten groups), `tools/loops-dev.sh`.
- **What it does.** CI runs the check; the browser passes, the measurements, the pixel proof and the development
  crewhub-loops are tools, run by hand with a browser and a server of your own.
- **The risky parts.** The allow-list in `scan-model-calls.ts` is the promise "no model call, and no network call
  but the host": a new entry there is a review item of its own. `loops-dev.sh` refuses the Mac app's ports (8091,
  8000, 9443) and never touches the app's data folder; `loops-seed.mjs` writes to a development loops with a key,
  never to the app. Every tool opens only `http://127.0.0.1:<the port you name>/`.
- **Pinned by.** CI; `scripts/test/` (the Node guard, the seed, the pixel and DOM diffs). The regress is not in the
  check: its last full run before this page, 2026-10-23, passed 212 of 212 checks in the ten groups.

### 2.8 The documents

Read [INTRODUCTION.md](INTRODUCTION.md) (491 lines), [LOOPS_SETUP.md](LOOPS_SETUP.md) (531),
[ARCHITECTURE.md](ARCHITECTURE.md) (343) and [proposals/open-questions.md](proposals/open-questions.md) (169) in
that order; `apps/host/README.md` beside the host. The rest is reference: the spec and its addenda
([the demo-mode spec](superpowers/specs/2026-10-01-world-demo-mode-design.md), 1,352), the
[integration plan](LOOPS_INTEGRATION_PLAN.md) (1,110), the [gap analysis](LOOPS_GAP_ANALYSIS.md) (599),
[WORLD_STYLES.md](WORLD_STYLES.md) (714), [COST_POLICY.md](COST_POLICY.md) (287), [AGENT_CARD.md](AGENT_CARD.md),
[GRID_ENGINE.md](GRID_ENGINE.md), [ROADMAP.md](ROADMAP.md). What to check is that the words match the code:
`check:docs` follows links only, and `apps/world/test/tour.test.ts` pins six phrases of the introduction.

## 3. How to run it yourself in 5 minutes

Timed by a stranger on 2026-10-23 (round 34) from a fresh worktree with no `node_modules` and no `dist`, with npm's
cache warm: `npm ci` 1 s, `npm run check` 49 s, the demo open and clicked through in the next minute, and the live
town on the screen 3 min 35 s after `npm ci` began; a cold npm cache adds the download. Where the stranger stumbled,
the words below now say what to do.

The demo, two minutes, nothing but Node 24 and npm 11 (`.nvmrc`; an older Node stops at once with the reason):

```sh
npm ci
npm run dev                      # http://127.0.0.1:5173, the demo; or: npm run build && npm run preview (4173)
npm run check                    # typecheck, 996 tests, doc links, the design and copy guards, the build: under a minute
```

On a shared machine, prefix `npm run dev` with `CREWHUB_WORLD_PORT=<a free port>`: the dev server proxies `/world-api`
to the host on 5180 by default, which may be somebody else's (it refuses a host from another checkout and says so;
with nothing on the port the page runs the demo). `npm run dev` takes no port of its own: it is Vite's 5173, or the
next free one.

Click a building, press T for the text view, B for build mode, and the "?" button in the toolbar (Help > Show the
introduction) for the tour.

Live mode, three minutes more. With `Crewhub.app` open on this Mac, `npm run world` alone is the road (the first
section of [LOOPS_SETUP.md](LOOPS_SETUP.md)). Against a development crewhub-loops you already run (its section 7
starts one from a checkout on 8291 with `tools/loops-dev.sh`), with a key file on disk or without one:

```sh
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8291 CREWHUB_WORLD_PORT=5181 CREWHUB_WORLD_KEY_FILE=~/path/to/the.key npm run world
CREWHUB_WORLD_LOOPS_URL=http://127.0.0.1:8291 CREWHUB_WORLD_PORT=5181 npm run world          # no key file: paste one
```

`npm run world` opens your browser on a one-time pairing link (`-- --no-open` prints the link instead, for a browser
of your choice; `npm run host -- open --no-open` prints a fresh one for a host that already runs). With a key file the
town stands at once (the stranger's clock: the world up 731 ms after the host started); without one the page shows
Connect: make the viewer key in that loops (Settings > Agents > Connect CrewHub World) and paste it once. `npm run
host -- doctor`, with the same environment in front of it, says which step failed, one line each (12 checks). Road 2,
the page reading your own chat where that loops has `CHL_WORLD_ORIGIN` set: start the host on the port that origin
names (`CREWHUB_WORLD_PORT=<that port>`) and sign in to loops in the same browser; signed out, the Connection panel's
Chat section says so and names both ways. With no loops at hand, section 0 of the same document runs the fake in
three commands (`npm run loops:fake -- --port 8391`, the host with its two env lines, `npm run dev`, then
`?source=live`). A regress group of your own: `node tools/regress.mjs --port <your Vite port> --groups demo`
([tools/README.md](../tools/README.md)).

## 4. What is deliberately not here

- **The answers to the open questions.** Five branches, each one commit from this PR's head, none merged: nothing
  changes until Nicky answers ([the page](proposals/open-questions.md)). `task/q1-cookie-expiry` (question 1,
  `cookie+expiry`, with question 2's 30 days), `task/r27-tab-pairing` (question 1, `tab`: a per-tab bearer instead
  of the cookie; its note `docs/proposals/pairing-per-tab.md` lives on that branch), `task/q3-health-less` (question
  3), `task/q8-offline-say` (question 8), `task/q11-recent-since` (question 11).
- **`task/r19-viewer-switch`.** Tree-identical to this branch since round 28; question 13 asks to retire it.
- **The loops side.** crewhub-loops' branch `world/viewer-key` carried the proposals; loops main has since landed
  the viewer key (#959, its chat read narrowed to the key's maker, #964), the "Connect CrewHub World" card, the deep
  link, the framing allowance and the world's origin (#968, `CHL_WORLD_ORIGIN`). None of that is in this repository.
  The Mac app at `4cdcd383` is older than loops main: on it the world runs on a plain external bot's key behind the
  host's GET-only list, with no bubbles.
- **The real director** (the `crewhub-world` CLI, the watcher, the `world-director` lane): not built. No model call
  exists in the PR; `scan-model-calls.ts` is the proof, run in every check.
- **Project groups** (loops' L22): zones live in the town document per installation, not in crewhub-loops.
- **Merging concurrent town edits**: the second writer gets a 409 and the host's town, never a merge.
- **The tools' output** (`tools/out/`, git-ignored: pictures, logs, measurements), the round reports and briefs
  that steered the work, and the PR body itself.
- **One line changes at merge time:** the tour's "Read the introduction" link names `feat/world-demo`
  (`apps/world/src/state/tour.ts`); the PR body asks for `main` once the document lives there.

## 5. What the tests are known to catch

Measured in round 33 (2026-10-23) on `9a765f0`. Three developers who had not written the code made one-line
mutations of the risky parts named in §2, each the shape a real bug would take: 64 distinct mutations, two of
them picked by two developers on their own. Each mutation was applied alone and never committed. The covering unit
tests ran first, then the one regress group of that road if the units let it live. **40 were caught by the tests
that already stood. 23 got past every test** and now each has a test that fails with the mutation and passes
without it. **One is equivalent**: no behaviour differs, so no test can see it. Writing the teardown checks found
one real bug, a leak in the scene's teardown, fixed in `7e5e7db`.

The pattern behind the misses was the same nearly everywhere. The code was right, but no test fed it the input
that would show the mutation: a redirect, a resent seq, a tab at the buffer's edge, keys in another order, a value
at exactly a limit. The scene's teardown had no observer at all before this round; three `rooms` checks now read
the browser's own listener table, its timers and the geometries.

Line numbers are at `9a765f0`. "Killed by" names the test file (under the package's `test/`) or the regress group,
and for a **New** test (one written for a mutation that got past the tests) its title or the regress check's words,
close enough to find it with grep. Read again on 2026-10-23 (round 34) by a developer who did not make the table:
all 64 `file:line` point to the mutated line at `9a765f0`, and every New test stands where the row says.

| Area | Mutation (before → after) | file:line | Killed by |
| --- | --- | --- | --- |
| 1 pairing | the cookie loses `HttpOnly` | `apps/host/src/pairing.ts:118` | `pairing.test.ts` |
| 1 pairing | the HMAC compares the given MAC with itself | `pairing.ts:87` | `pairing.test.ts` |
| 1 pairing | the link's single use dropped (`tokens.delete`) | `pairing.ts:71` | `pairing.test.ts` |
| 1 pairing | the link's expiry `<=` → `<` | `pairing.ts:72` | `pairing.test.ts` |
| 1 pairing | the gate skips `/town/…` (export, backups) | `apps/host/src/host.ts:1184` | **New:** `pairing.test.ts`, the town sub-routes in every route walk |
| 1 pairing | the mint route takes a request with an Origin | `host.ts:740` | `pairing.test.ts` |
| 1 Origin guard | the opaque `null` origin passes | `host.ts:756` | `guard.test.ts` |
| 1 Host guard | a request without Host passes | `host.ts:751` | **New:** `guard.test.ts`, an HTTP/1.0 request on a raw socket is 421 |
| 1 dev origin | the cap `>=` → `>` | `apps/host/src/devOrigin.ts:68` | `devOrigin.test.ts` |
| 1 dev origin | `LocalHost` not lower-cased | `devOrigin.ts:35` | `devOrigin.test.ts` |
| 1 key state | a 401 from a loops that does not answer read as a verdict | `apps/host/src/keyCheck.ts:47` | `keyStates.test.ts` and 5 more |
| 1 health | unpaired health gets the details | `host.ts:702` | `connect.test.ts` and 10 more |
| 2 the key | the key scrub off | `apps/host/src/loops.ts:54` | `key.test.ts`, `unixsock.test.ts` |
| 2 transport | `redirect: "error"` → `"follow"` | `apps/host/src/transport.ts:75` | **New:** `transport.test.ts`, a 302 off the list is not followed over TCP or the socket |
| 2 allow-list | a query parameter `q` passed through | `apps/host/src/allowList.ts:14` | `allowList.test.ts` |
| 2 allow-list | a path segment may hold `/` | `allowList.ts:9` | `allowList.test.ts`, `archiveMemory.test.ts`, `stream.test.ts` |
| 2 allow-list | GET accepted on `/connect` | `allowList.ts:64` | `connect.test.ts` |
| 2 allow-list | the upstream gate passes any path | `allowList.ts:151` | `allowList.test.ts`, `unixsock.test.ts`, `stream.test.ts` |
| 2 stream | the stream's 401 rule inverted | `apps/host/src/stream.ts:142` | `keyStates.test.ts` |
| 2 stream | an event no longer clears the sealed cursor | `stream.ts:190` | equivalent: line 309's `sealedAt === cursor` already refuses an old token |
| 2 stream | a resent seq `<=` → `<` | `stream.ts:187` | **New:** `stream.test.ts`, an envelope loops sends again with a seq the host already applied reaches no tab a second time |
| 2 stream | the ring buffer one short | `stream.ts:192` | **New:** `stream.test.ts`, a tab at the oldest kept seq is caught up |
| 2 stream | the cursor resets whenever the tail moved | `stream.ts:304` | `stream.test.ts` |
| 2 stream | a tab ahead of the host gets no reset | `stream.ts:400` | `stream.test.ts` |
| 3 road 1 | a plain key listed in the agents asks for the threads (`viewer` not checked); found by two developers independently | `host.ts:396` | regress `chat` and `live`; **new:** `chatKey.test.ts`, two tests with the key's own agent listed |
| 3 road 1 | a 403 or 409 on the threads counts as reading | `host.ts:398` | `chatKey.test.ts` |
| 3 road 1 | a person's own message becomes a bubble; found by two developers independently | `host.ts:644` | `chatKey.test.ts` |
| 3 road 2 | `credentials: "include"` → `"same-origin"` | `packages/loops-client/src/pageChat.ts:36` | `pageChat.test.ts` |
| 3 road 2 | a header of ours at the fetch | `pageChat.ts:97` | `pageChat.test.ts` |
| 3 road 2 | the probe's second ask becomes a POST | `pageChat.ts:131` | `pageChat.test.ts` |
| 3 road 2 | the poll sends `after=` instead of the cursor | `pageChat.ts:64` | `pageChat.test.ts` (both packages) |
| 3 road 2 | a 409 not read as `chat-off` | `pageChat.ts:115` | `pageChat.test.ts` |
| 3 road 2 | `origin-not-set` and `unreachable` swapped | `pageChat.ts:118` | `pageChat.test.ts` (both packages) |
| 3 road 2 | the page probes before the host has said | `apps/world/src/state/pageChat.ts:221` | `pageChat.test.ts` |
| 3 road 2 | a loops elsewhere is asked (`remote` never) | `state/pageChat.ts:227` | `pageChat.test.ts` |
| 3 contract | the host's no read as not said | `apps/world/src/state/chatRoad.ts:37` | `chatRoad.test.ts`, `pageChat.test.ts` |
| 4 town store | a write on a stale revision accepted | `apps/host/src/worldDb.ts:288` | `worldDb.test.ts`, `town.test.ts` |
| 4 town store | an undo step that cannot be taken writes a revision | `worldDb.ts:311` | `worldDb.test.ts`, `town.test.ts` |
| 4 town store | a town PUT without Origin accepted | `host.ts:1048` | `town.test.ts` |
| 4 town store | the canonical sameness counts key order | `apps/world/src/state/hostTown.ts:109` | **New:** `hostTown.test.ts`, the same town with keys in another order is nothing new |
| 4 town store | an edit on a replaced picture kept | `hostTown.ts:350` | `hostTown.test.ts` |
| 4 town store | the echo of our own write starts a read | `hostTown.ts:419` | **New:** `hostTown.test.ts`, the host's word on our revision starts no read |
| 4 town store | every read amends the store | `hostTown.ts:128` | **New:** `hostTown.test.ts`, a read of the town already shown changes nothing |
| 4 history | redo one step past the newest | `packages/world-model/src/history.ts:27` | `history.test.ts`, `townStore.test.ts`, `worldDb.test.ts` |
| 4 projection | an envelope at the cursor applied again | `packages/world-model/src/projection.ts:200` | `projection.test.ts` |
| 4 projection | a refetch from before a snapshot lands | `projection.ts:592` | **New:** `projection.test.ts`, it never lands on the new facts |
| 4 reducer | stale at exactly 300 s | `packages/world-model/src/reducer.ts:77` | **New:** `reducer.test.ts`, fresh at 300 s, stale at 301 |
| 5 prop document | 65 parts pass | `packages/world-engine/src/props.ts:393` | `props.test.ts` |
| 5 prop document | 8 tags refused (`>=`) | `props.ts:338` | **New:** `props.test.ts`, exactly the limits pass, one past each is refused |
| 5 prop document | a 25-character tag passes | `props.ts:342` | **New:** the same test |
| 5 prop document | `approaches` not required | `props.ts:321` | **New:** `props.test.ts`, every key but provenance is required |
| 5 prop document | an approach two cells out passes | `props.ts:381` | **New:** `props.test.ts`, two cells out is refused on every side |
| 5 prop document | the ceiling checked on the floor edge | `props.ts:460` | `props.test.ts` |
| 5 prop document | a blank name passes (no trim) | `props.ts:296` | `props.test.ts` |
| 5 prop import | the placement order changed | `apps/world/src/world/propImport.ts:75` | `propFlow.test.ts` |
| 5 prop import | a second ticket's prop with the same id overwrites | `propImport.ts:52` | **New:** `propFlow.test.ts`, a second ticket whose prop carries an id already in the catalogue keeps both props |
| 5 teardown | `visibilitychange` listener left | `apps/world/src/world/TownScene.ts:2684` | **New:** regress `rooms`, (a) no scene listener twice |
| 5 teardown | the orbit controls not disposed | `TownScene.ts:2688` | **New:** `rooms` (a) and (b) |
| 5 teardown | the renderer not disposed | `TownScene.ts:2708` | **New:** `rooms` (b), the canvas keeps no listener |
| 5 teardown | the drift interval not cleared | `TownScene.ts:2703` | **New:** `rooms` (b), the interval it made is cleared |
| 5 teardown | the buildings not disposed | `TownScene.ts:2697` | **New:** `rooms` (b), every geometry it alone held is disposed |
| 5 teardown | the resize observer not disconnected | `TownScene.ts:2683` | **New:** `rooms` (b), the host no longer sizes it |
| 5 teardown | the unmount keeps the scene | `apps/world/src/components/WorldCanvas.tsx:265` | **New:** `rooms` (a), one canvas |
| 5 teardown | the walk's keydown left on window | `WorldCanvas.tsx:155` | **New:** `rooms` (c), none left after Escape |

The scene's leak: `dispose()` never released the town's last set of merged landmark pieces, so every torn-down
scene left seven merged geometries on its graphics context. That happens on each page load of the development build
(StrictMode's rehearsal mount) and after a graphics error in production. The `rooms` check (b) found it, and three
lines in `TownScene.dispose()` fix it.

Not mutated, and why: the history's 8 MB cap (seeing it needs an 8 MB history); the host's `baseRev < 0` and
format checks (the validator and the revision check refuse the same writes); `cancelAnimationFrame` in the scene's
dispose (`animate` already returns once disposed). Each developer's full table, with the one-line diffs and the
proof runs, is in the round-33 reports, outside the repository.
