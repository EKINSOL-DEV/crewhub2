# A mutation harness for the host's start-up files (round 55 proposal)

**For a day round.** Round 54's mutation runs (scratch copies, one mutant at a time, covered lines only) left six
files out: `apps/host/src/config.ts`, `main.ts`, `doctor.ts`, `discovery.ts`, `checkout.ts` and
`packages/loops-fake/src/main.ts`. A mutant there can pick a real port, a real folder or a real process: the ports
8091, 8000 and 9443 (the Mac app), 8291 to 8293 (the development crewhub-loops), 8391 (a running fake), 5180 (somebody's
`npm run world`), the folders `~/.config/crewhub-world` and `~/.config/crewhub-loops` (Nicky's), the Mac app's data
folder, and the real `TMPDIR`, where every running host keeps its run file with its mint secret. This page lists every
such road per file (read at `cc23d62`), the guard that closes them all, how that guard was proved in round 55 against
planted roads, and the order a day round runs the mutants in. **No mutant of these files was run in round 55.**

## 1. What guards a test run today

[`scripts/no-app-reach.mjs`](../../scripts/no-app-reach.mjs) is preloaded into every test process and, through
`NODE_OPTIONS`, into every node child. It is a deny list of the roads known in round 35, as it stood at `cc23d62`.
**Since then** (round 55, `task/r55-guard`) it also refuses a connect to 8291 to 8293, 8391, 5180 and 5173, and a
listen on 8091, 8000, 9443, 8291 to 8293, 8391 and 5180: the table's TCP and listen rows below are history for those
ports. **Round 56** (`task/r56-guard-home`) closed two more: the folders are refused under the user's own home
(`os.userInfo().homedir`) as well as `$HOME`, and a real host's run file (`crewhub-world-host-<1024 to 32767>.json`, below both ephemeral ranges since round 56b: Linux's port 0 lands at 32768)
directly in the real `TMPDIR` is refused, also in a child that moves its `TMPDIR` (the first process hands the real one
down). A child given an explicit env without that hand-down *and* a moved `TMPDIR` still guards only its own. The rest
of the table still holds:

| Road | Refused by no-app-reach | Not refused |
| --- | --- | --- |
| TCP connect | 8091, 8000, 9443 | **8291 to 8293, 8391, 5180, 5173**, any other port, any non-loopback host |
| Unix connect | under the app's data folder, `~/.config/crewhub-world`, `~/.config/crewhub-loops` | **the development loops' socket** (`~/crewhub-loops-dev/run/api.sock`, `tools/loops-dev.sh`) |
| listen | nothing | **any port** (5180, 8391) |
| fs | those three folders, a relative `settings.json` or `run/api.sock` | **the real `TMPDIR`** (run files), the rest of the home folder, `createReadStream`/`createWriteStream`, `cp`, `mkdtemp`, `watch` |
| node:sqlite | nothing (it opens its file natively, past `node:fs`) | **`world.db` anywhere**; today three guarded `fs` calls happen to come first in `openWorldDb` |
| processes | nothing | **`open <link>`** (main's `openBrowser`), any `spawn`/`exec`, `process.kill` of any pid |
| UDP | nothing | any |

It also computes its folders from `os.homedir()`, which follows `$HOME`: a harness that moves `HOME` to a scratch
folder moves the guard's folders with it, and the real ones are no longer guarded by it. And a test that spawns a
child with an `env` of its own and no `NODE_OPTIONS` leaves the child unguarded (`mainStart.test.ts` passes
`NODE_OPTIONS` on; nothing makes the next test do so).

## 2. The roads, per file

Each line is a road a single mutant (one operator or one literal changed) opens, in a test that covers the line.
"Guarded" is no-app-reach's answer today.

### `apps/host/src/config.ts`: high risk (its literals are the real defaults, and every host test imports it)

| Line | Mutant | Road | Guarded |
| --- | --- | --- | --- |
| 14, 179 | `portText === ""` flipped, or the port text dropped | every host takes 5180 (`DEFAULT_PORT`): listens on somebody's `npm run world` port | no |
| 18, 55 | `text === ""` flipped in `configDirOf` | every caller that named `CREWHUB_WORLD_CONFIG_DIR` gets `~/.config/crewhub-world`: the stored key, `archived.json`, `world.db`, `pairing-secret` written there | fs yes, sqlite no |
| 16, 192 | `appDataText === ""` flipped | the discovery reads the Mac app's `settings.json` and connects to its `run/api.sock` | yes |
| 22 to 24, 104 to 107 | the key order in `loadKey` | the old default key file under `~/.config/crewhub-loops/secrets` is read | yes |
| 13 | `DEFAULT_LOOPS_URL` | 8091 named for the sign-in link and the discovery's fallback | connect yes |
| 49 | `expandHome` | `~` is `os.homedir()`: the real home unless `HOME` is moved | partly |
| 80 | `worldEnv`'s pairing file | `pairing-secret` written into the config folder of line 55 | fs yes |

### `apps/host/src/main.ts`: high risk (the one file that composes every road), run only as a child

Its tests (`mainStart.test.ts`, two) spawn `node src/main.ts` with an env of their own: a temp config folder, a key
file, loops at `127.0.0.1:1`, pairing off, port 0. The env has no `HOME` and no `TMPDIR`, so in the child
`os.homedir()` is the real home (getpwuid) and `os.tmpdir()` is `/tmp`.

| Line | Mutant | Road | Guarded |
| --- | --- | --- | --- |
| 58, 88 | the command parse (`world`/`open` instead of serve) | `mintFromRunning`: reads the run file of the port and asks that host for a pairing link with its mint secret (line 120) | no |
| 141 to 151, 176, 284 | `--no-open` ignored, or `world` taken | **`open <link>`**: Nicky's browser opens a pairing link | no |
| 185, 296 | `checkBuild`'s verdict | `buildWorld` spawns vite in the repository root and writes `apps/world/dist` | no (inside a scratch copy it is the copy's) |
| 201, 202 | `mkdirSync`/`chmodSync` of the config folder | with config.ts line 55, Nicky's folder is made 0700 | yes |
| 210 | `removeLeftoverSession` | deletes a file in the config folder | yes |
| 217 | `openWorldDb` | `world.db` in the config folder, natively | fs calls first; sqlite no |
| 232 | the port | listens on 5180 with config.ts line 179 | no |
| 264 | `writeRunFile(host.port)` | `$TMPDIR/crewhub-world-host-<port>.json`: with port 5180 and the real `TMPDIR`, the running host's run file is overwritten and `npm run world` can no longer reach it | no |

### `apps/host/src/doctor.ts`: medium risk (it reads and connects, it never writes)

| Line | Mutant | Road | Guarded |
| --- | --- | --- | --- |
| 125 | `io.probePort ?? probePortState` drops the injected probe | twelve `runDoctor` calls in `doctor.test.ts` (lines 128 to 202) name no port, so the doctor connects to **127.0.0.1:5180** and reads `GET /world-api/health` of the running host | no |
| 123, 124 | the injected `health`/`client` dropped | a real `GET /api/health` and the key's reads against the test's target (a stub); with config.ts line 13, 8091 | 8091 yes |
| 121, 122 | the injected `statFile`/`readFile` dropped | the key files of `keyFilesOf`: the test's folder, and the old default under `~/.config/crewhub-loops` | yes |
| 170 | `io.keyFiles ??` dropped | the stored key in the real config folder (with config.ts line 55) | yes |

### `apps/host/src/discovery.ts`: high risk (its test data names the development loops' port)

| Line | Mutant | Road | Guarded |
| --- | --- | --- | --- |
| 128 | `input.answers ?? loopsAnswers` drops the injected probe | `discovery.test.ts:56` feeds a `settings.json` with `{"port": 8291}`: a real **`GET http://127.0.0.1:8291/api/health`** against the development crewhub-loops, and a connect to `/data/run/api.sock` | **no** |
| 47 to 52 | `appPortOf`'s range or fallback | 8091 for any settings | yes |
| 69, 70 | the injected disk dropped | `statSync`/`readFileSync` of `/data/…` (absent: harmless), or of the app's folder with config.ts line 192 | yes |
| 181 to 183, 205 | the retry timer not cleared on `stop` | probes keep going every `intervalMs` after the test (and against 8291 with line 128) | no |

### `apps/host/src/checkout.ts`: low risk (no port literal; the caller's port only)

| Line | Mutant | Road | Guarded |
| --- | --- | --- | --- |
| 70 | the default `secret` (`readRunFile(port)`) | reads the run file of the port in the test process's **real `TMPDIR`**; a mutant cannot change the port, which is the test's own | no |
| 44, 75 | the URL | loopback only; `http://127.0.0.1:${port}` with the caller's port | no |
| 20 | `realpathSync(root)` | a read of the repository root | n/a |

### `packages/loops-fake/src/main.ts`: medium-high risk (listen and a key file)

| Line | Mutant | Road | Guarded |
| --- | --- | --- | --- |
| 17 to 23 | `option`'s `index === -1` flipped | `--port` and `--scenario` both read as unset: `mainScenario.test.ts`'s unknown scenario is no longer refused and the fake **listens on 8391** (`FAKE_DEFAULT_PORT`) | no |
| 27, 28 | `!portVerdict.ok` | a refused port taken (but the test passes `--port 0`) | no |
| 32 | the scenario check flipped | the fake starts, on the test's port 0 | n/a |
| 14, 48 to 52 | the key file | `tools/out/loops-fake.key` relative to the source: in the worktree it is the key a running fake and its host share; in a scratch copy it is the copy's | no |

### Every file: the inherited environment

`main.ts` and `loops-fake`'s `main.ts` read `process.env`, and a test's child inherits the shell's: a mutation run started
from a shell with `CREWHUB_WORLD_LOOPS_URL`, `CREWHUB_WORLD_CONFIG_DIR` or `HOME` set by an earlier step reaches what
those name. The harness starts every run from an empty environment.

## 3. The guard: a fence of three layers

no-app-reach names what may not be reached; the fence names what may, so a road nobody has listed yet is closed too.
It does not replace no-app-reach (the tests keep preloading it): it wraps the whole run.

1. **The environment.** Every run starts from `env -i`. `HOME`, `TMPDIR`, `XDG_CONFIG_HOME`/`DATA`/`STATE`/`CACHE`,
   `CREWHUB_WORLD_CONFIG_DIR` and `CREWHUB_WORLD_LOOPS_APP_DATA` name folders under one fence root; `PATH` is node's
   bin and `/usr/bin:/bin`; nothing of the shell's `CREWHUB_*` comes in. This alone moves every default (`os.homedir()`,
   `os.tmpdir()`, the config folder) off the real ones, but a mutant that ignores the env, or a child spawned without
   `HOME` (getpwuid then answers the real home), still reaches them: hence 2 and 3.
2. **A JS preload** (`fence.mjs`, appendix B), in every node process through `NODE_OPTIONS`:
   - TCP connect only to loopback on port 1 (the closed port the tests use) or 49152 to 65535 (macOS's ephemeral range,
     where every `listen(0)` lands); a Unix connect only under the root;
   - listen only on port 0 or that range, or a Unix socket under the root;
   - `node:fs` (every form, streams, `cp`, `mkdtemp`, `watch`) and `node:sqlite`: writes only under the root, checked
     on the real path of the nearest existing parent, so a symlink out of the root is followed; no read under the real
     home (from getpwuid, not `$HOME`) or `/private/var/folders` (every `TMPDIR`), except node's own folder and
     `node_modules` (read only);
   - `child_process`: node only, never a shell, and the fence's env forced onto the child (a test that hands a child
     `env: {}` still gets `HOME`, `TMPDIR` and `NODE_OPTIONS` of the fence); `process.kill` only the process itself and
     its own children; `dgram` refused.
   A refusal throws `fence: refused …`, appends a line to `<root>/fence.log` and sets the exit code to 1, so a refusal
   the code under test swallows (a discovery probe that reports "down") still fails the run.
3. **The kernel** (`make-profile.mjs`, appendix A): `sandbox-exec -f <profile>`, which every child inherits and none can
   leave. The same rules, enforced by macOS whatever the JS does (native code, a module loaded before the preload):
   - writes only under the root, `/dev/null` and the tty;
   - no read under the real home or `/private/var/folders`, except node and `node_modules`;
   - outbound TCP and UDP only to `localhost:1` and each of the 16 384 ephemeral ports (one allow rule per port), a Unix
     socket only under the root;
   - bind: a deny list of the named ports (5173, 5180, 8000, 8091, 8291 to 8293, 8391, 9443, and the proof's decoys
     5389 and 5390), because one profile holds one 16k range and not two (a second one fails with `sandbox_apply:
     Invalid argument`); the JS layer keeps bind to port 0 and the range;
   - exec only the node binary; signals only within the same sandbox (another process is not even visible: `ESRCH`).

The kernel layer is what makes the guard **provable**: it does not depend on every road going through a function the
preload patched. The JS layer is what makes a refusal **loud**: under the kernel alone a refused connect is an `EPERM`
the code may swallow, and the test may still pass.

**One condition:** the root must have a short path. A Unix socket path is at most 104 bytes on macOS, and the host's
socket tests make theirs under `os.tmpdir()`; under a root as deep as a session scratchpad the seven Unix socket tests
fail with their own "socket path too long" (round 55 saw exactly that). A root such as `/private/tmp/chwf-<n>` keeps
them green.

## 4. How the guard is proved

Before any mutant, and again whenever the fence changes:

1. **The planted roads.** `planted.mjs <road>` makes one attempt, of the shape a mutant would make, against a
   **decoy** of the proof, never the real thing:
   - a TCP listener on 5389 and a Unix socket, both outside the root, that record every connection;
   - bind on 5390;
   - folders outside the root;
   - the decoy's own pid.

   The roads: `tcp-127`, `tcp-localhost`, `fetch`, `unix`, `listen`, `write`, `write-symlink`, `read-home`, `read-tmp`,
   `sqlite`, `exec`, `exec-shell`, `child-env`, `kill`, `udp` and `home-moved`, sixteen in all. Each probe swallows its
   error, as a host's discovery does.
   - `read-home` reads the worktree's `package.json` (under the real home) in place of `~/.config/crewhub-world/loops-key`.
   - `read-tmp` lists the real `TMPDIR`, without opening a file.
   - `home-moved` checks that `HOME`, `TMPDIR` and the two host folders name the root, and that a
     `CREWHUB_WORLD_LOOPS_URL` set in the outer shell did not come in.
2. **Four ways:**
   - **control**: no fence. Each road must reach its decoy, or the probe proves nothing.
   - **kernel only**
   - **JS only**
   - **both**

   A road counts as reached when the probe says so **or** the decoy saw it: a line in its hits log, or a file in the
   run's own out folder. A fresh out folder is used per run.
3. **What must hold:** control reaches every road; each layer alone refuses every road it covers; both refuse all;
   the decoys' logs and out folders stay empty under the fence; the JS layer's refusals exit 1.
4. **The real ports and folders** are never probed: they are refused by the same rule as the decoys (the decoy port is
   outside the ephemeral range like 8091 and 8291; the decoy folder is outside the root like `~/.config`). The rule's
   inputs are listed in the profile itself (`grep -c 'localhost:\(5173\|5180\|8000\|8091\|829[123]\|8391\|9443\)"' fence.sb` counts 0 allow rules; without the closing quote it would count `localhost:51800` and its kin).
5. **The baseline:** the unmutated suites of the covered tests pass inside the fence, with `fence.log` empty. A
   refusal on unmutated code is a road the fence must allow (or a test that reaches too far), and is settled before
   any mutant runs.

### Round 55's proof (04:19 to 04:22, macOS, Node 24.21.0)

| Mode | Roads | Reached | Refused | Refusals that exit 1 |
| --- | --- | --- | --- | --- |
| control (no fence) | 16 | 16 | 0 | n/a |
| kernel only | 16 | 0 | 16 | 0 (an `EPERM` the probe swallows: quiet, but nothing reached) |
| JS only | 16 | 0 | 16 | 14 |
| both | 16 | 0 | 16 | 14 |

The totals are computed from the run's table. The two JS refusals without exit 1 in the probe's own process:
- `child-env`: the refusal happens in the child, which exits 1, and the parent sees a status of 1;
- `home-moved`: the clean env, not a refusal.

Under the fence the decoys saw nothing: no line in the hits log and no file in any out folder. In the control,
`fetch` shows why the decoy's evidence counts. The probe reported an error (`UND_ERR_SOCKET`: the decoy closes without
an HTTP answer), yet the decoy logged the connection.

**The baseline** (unmutated `cc23d62`, both layers, no-app-reach preloaded as `npm test` does):

| Suite | Passed | Note |
| --- | --- | --- |
| the six files' own tests | 36/36 host, 7/7 loops-fake | `fence.log` empty |
| loops-fake | 40/40 | |
| loops-client | 112/112 | |
| host | 209/216 | The 7 failures are the Unix socket tests' own "socket path too long" under a 150-byte root (section 3), not refusals: `fence.log` was empty. |

A first version of the JS layer refused every read outside the root. `config.test.ts` stats a path that does not exist
(`/nowhere/at/all.sock`), so reads are now refused only under the real home and `/private/var/folders`.

## 5. The run, for a day round

- **Where:** a scratch copy of the commit under a short fence root (`git archive <commit> | tar -x`, `node_modules`
  linked to the worktree's, `@crewhub/*` to the copy's own packages), the profile made for that root and the worktree's
  `node_modules`, `FENCE_READ` set to the same.
- **Command per mutant:** `run-fenced.sh <root> <copy>/apps/host node --import ../../scripts/no-app-reach.mjs --test
  --test-timeout=120000 <covering tests>`, the same as `npm test` but with `node` directly: npm's `#!/usr/bin/env node`
  is an exec the profile refuses.
- **After each mutant:** `fence.log` is read and emptied. A refusal **kills the mutant** (the test run failed) and is
  reported as a road the mutant opened, with its line, so the table says both "killed" and "reached for X".
- **Covering tests:**

  | File | Tests to run per mutant |
  | --- | --- |
  | `config.ts` | the whole host suite (every host test imports it) |
  | `main.ts` | `mainStart.test.ts` |
  | `doctor.ts` | `doctor.test.ts` |
  | `discovery.ts` | `discovery.test.ts`, and the host suite for the lines `createHost` calls |
  | `checkout.ts` | `checkout.test.ts`, `devOrigin.test.ts` |
  | `loops-fake/src/main.ts` | `mainScenario.test.ts` |
- **Order, safest first:** `checkout.ts`, `doctor.ts`, `discovery.ts`, `loops-fake/src/main.ts`, `config.ts`, `main.ts`.
- **Timeouts:** a mutant that listens on 8391 or keeps the discovery's timer alive hangs until the test's own
  timeout. Give each run its own `timeout` (60 s) and count a timeout as killed.
- **Never:** the worktree itself (the fake's key file is `tools/out/loops-fake.key` relative to the source), a root
  under the real home, or a run without the kernel layer.

## 5b. Roads outside the tests (round 56's sweep; all six done in round 57d)

Round 56 read every test, tool and script for a socket, fetch or listen that could reach a named port (8091, 8000,
9443, 5180, 5173, 8291 to 8293, 8391) when run as written. In the tests only the two guard tests did, and round 56 moved
them onto decoys; the socket tests' `loopsUrl` is now a closed port. Left for a day round:
1. **`tools/regress.mjs`:** `real` and connect's real half opt-in only (`--real`), the default groups the eight that use
   fakes and stubs; `loopsEnvFile` reads only `--loops-env`, with no search of the main checkout or `~/Documents/GitHub`.
   *Done in round 57d, `task/r57d-tool-defaults`, merged as `39f883d`: the default is the nine groups without `real` (eight
   was a miscount), the opt-in is `real` named in `--groups`, `real` without
   `--loops-env` is refused; `tools/lib/regressArgs.ts`. Round 58d: `--real` is accepted as the same opt-in (it adds
   `real` to the groups chosen), one word with the other tools' `--real`.*
2. **`tools/timeworld.mjs`:** `--fake <port>` or an explicit `--loops-env` required, with no search.
   *Done in round 57d, `task/r57d-tool-defaults`, merged as `39f883d`: neither or both refused before anything starts;
   `tools/lib/timeworldArgs.ts`.*
3. **`tools/loops-seed.mjs` and `tools/lib/seed.ts`:** `--url` required, no 8291 default.
   *Done in round 57d, `task/r57d-tool-defaults`, merged as `39f883d`: `DEFAULT_URL` gone, `checkUrl` refuses a missing `--url`.*
4. **One named-port list, shared** by `toolGuard.ownPort`, `pixcheck.mjs`, `tools/lib/live.mjs` and `road2proof.mjs`: a
   tool's own ports may be none of them, and a `--loops-url` to 8291 to 8293 only with the same opt-in as item 1.
   *Done in round 57d, `task/r57d-port-list`, merged as `554a068`: `scripts/named-ports.mjs` is the one list, read by the
   test preload (`no-app-reach.mjs`) and `tools/lib/toolGuard.ts`; `ownPort` refuses all nine as a tool's own port
   (`pixcheck`'s `--head-port` too), and `ownLoopsUrl` takes 8291 to 8293 only with `{ real: true }`, which `road2proof`,
   `lib/live.mjs` (`perf`, `memory`, `profile`) give from their own `--real` flag and `regress` from `real` in `--groups` or, since round 58d, its own `--real`.*
5. **`tools/README.md`:** examples with a port of one's own, not `--port 5173`.
   *Done in round 57d, `task/r57d-tool-defaults`, merged as `39f883d`: every example on 5385/5386, the opt-ins and refusals described.*
6. **The host tests' helpers:** a shared `testHost()` that refuses to build a host without a target or an app data
   folder with a `settings.json`, so a forgotten `discovery` is a test error, not a probe of 8091 left to the guard.
   *Done in round 57d: `apps/host/test/testHost.ts` (`task/r57d-test-host`, merged as `1d06304`), and 42 of the 55
   hosts built through it (`task/r57d-test-host-sweep`, `717e9b0`; none was unaimed). A lint allows `createHost(` only
   in the files `CREATE_HOST_ALLOWED` names: four whose calls an answer branch changes, and two an answer branch adds.*

## 6. Limits

- **macOS only.** `sandbox-exec` is deprecated by Apple but present and working (round 55 ran it on Darwin 27). On
  Linux the same layer is `bwrap` or `unshare -n` with a network namespace (then no port can be reached but the
  namespace's own), and a read-only bind of the home.
- **The profile is `allow default` with denials**, so what it does not name is allowed: Mach services (a program could
  ask LaunchServices to open a URL without an exec), shared memory, IOKit. No code in these six files does any of
  that, and node's standard library cannot without a native addon.
- **Bind on another port** outside the named list and the ephemeral range is refused by the JS layer only.
- **Worker threads** get the preload only if they inherit `execArgv`; none of the six files uses one.
- **The JS layer can be bypassed** by code that holds a reference taken before the preload, or by a native addon.
  The kernel layer cannot.

## 7. What it costs

- **Built in round 55:** about an hour, in a scratchpad.
  - The profile generator is about 60 lines, the preload about 190 and the runner about 25.
  - The planted roads and their prover are about 180 lines.
- **For a day round:** put the fence under `scripts/mutation-fence/` with its proof as a test that runs only on
  macOS, then run the six files.

## Appendix: the fence as built in round 55

As run in round 55 from a scratchpad; a day round moves them under `scripts/mutation-fence/`.

### A. `make-profile.mjs`: the kernel layer: writes the sandbox-exec profile for one root

```js
/* The kernel half of the mutation fence: a sandbox-exec profile (macOS SBPL) for one fence root.
 *   node make-profile.mjs <root> <read-only dir>... > fence.sb
 * Every process under it (and every child: the sandbox is inherited, it cannot be left) may:
 *   - write only under <root> (and /dev/null, /dev/tty*);
 *   - read nothing under the real home or /private/var/folders (every TMPDIR) except the read-only dirs given (node, node_modules);
 *   - connect over TCP only to localhost on port 1 (a closed port the tests use) or 49152-65535 (macOS's ephemeral
 *     range, where every port-0 listener lands), and over Unix sockets only under <root> (and mDNSResponder);
 *   - bind none of the named ports (the real ones and the decoy 5390: a profile holds one 16k range, not two, so bind is
 *     a deny list and the JS fence keeps bind to port 0 and the ephemeral range), and Unix sockets only under <root>;
 *   - exec only the node binary; signal only processes in the same sandbox.
 * An SBPL rule given later wins over an earlier one, so each block is "deny all, then allow the few". */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [root, ...readOnly] = process.argv.slice(2).map((p) => fs.realpathSync(p));
if (root === undefined) throw new Error("usage: make-profile.mjs <root> <read-only dir>...");
const realHome = fs.realpathSync(os.userInfo().homedir); // getpwuid, not $HOME: the fence must not follow a moved HOME
const realTmp = "/private/var/folders"; // every user's TMPDIR: the real one keeps the hosts' run files (mint secrets)
const node = fs.realpathSync(process.execPath);
const q = (s) => JSON.stringify(s);
const ancestors = (p) => {
  const out = [];
  for (let dir = path.dirname(p); dir !== path.dirname(dir); dir = path.dirname(dir)) out.push(dir);
  return out;
};
/** The ports somebody's real process holds tonight (README, briefs, memory), and 5389/5390, the decoys of the proof. */
export const NAMED_PORTS = [5173, 5180, 8000, 8091, 8291, 8292, 8293, 8391, 9443, 5389, 5390];
const ephemeral = [];
for (let port = 49152; port <= 65535; port += 1) ephemeral.push(port);

const lines = [
  "(version 1)",
  "(allow default)",
  ";; files: write only under the root",
  "(deny file-write*)",
  `(allow file-write* (subpath ${q(root)}) (literal "/dev/null") (regex #"^/dev/tty") (regex #"^/dev/fd/"))`,
  ";; files: nothing under the real home or the real TMPDIR, but node and node_modules (read only) and the stat of their parents",
  `(deny file-read* (subpath ${q(realHome)}) (subpath ${q(realTmp)}))`,
  `(allow file-read* ${readOnly.map((d) => `(subpath ${q(d)})`).join(" ")} (subpath ${q(path.dirname(path.dirname(node)))}))`,
  `(allow file-read-metadata ${[...new Set([...readOnly, node].flatMap(ancestors))].map((d) => `(literal ${q(d)})`).join(" ")})`,
  ";; network out: loopback port 1 and the ephemeral range, Unix sockets under the root",
  "(deny network-outbound)",
  `(allow network-outbound (remote ip "localhost:1"))`,
  ...ephemeral.map((port) => `(allow network-outbound (remote ip "localhost:${port}"))`),
  `(allow network-outbound (remote unix-socket (subpath ${q(root)})) (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))`,
  ";; network bind: never a named port; Unix sockets only under the root",
  ...NAMED_PORTS.map((port) => `(deny network-bind (local ip "*:${port}"))`),
  "(deny network-bind (local unix-socket))",
  `(allow network-bind (local unix-socket (subpath ${q(root)})))`,
  ";; processes: exec node only, signal only this sandbox",
  "(deny process-exec)",
  `(allow process-exec (literal ${q(node)}))`,
  "(deny signal)",
  "(allow signal (target same-sandbox))",
];
process.stdout.write(lines.join("\n") + "\n");
```

### B. `fence.mjs`: the JS layer: the preload

```js
/* The JS half of the mutation fence (preloaded by run-fenced.sh through NODE_OPTIONS, so in every node child too).
 * no-app-reach.mjs refuses a list of known roads (three ports, three folders); this refuses everything outside an
 * allow list, so a road nobody listed is refused as well:
 *   - TCP connect: loopback only, port 1 or 49152-65535 (the ephemeral range); Unix connect: under FENCE_ROOT;
 *   - listen: port 0 or the ephemeral range on loopback, a Unix socket under FENCE_ROOT;
 *   - fs and node:sqlite: write under FENCE_ROOT only (the real path of the nearest existing parent, so a symlink out
 *     is followed); no read under the real home or /private/var/folders (every TMPDIR) but FENCE_ROOT, node's own
 *     folder and FENCE_READ (':'-separated: node_modules);
 *   - child_process: node only, with the fence's own env forced onto the child; process.kill: self and own children;
 *   - dgram: refused.
 * A refusal throws "fence: …", appends a line to <FENCE_ROOT>/fence.log and makes the process exit 1, so a refusal the
 * code under test swallows still fails the run. The kernel half (make-profile.mjs) holds even if this file is bypassed. */
import childProcess from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const MARK = Symbol.for("crewhub-world.fence");
const ROOT = process.env.FENCE_ROOT ?? "";
if (globalThis[MARK] === undefined && ROOT !== "") {
  globalThis[MARK] = { refusals: 0 };
  const realRoot = fs.realpathSync(ROOT);
  const nodeHome = path.dirname(path.dirname(fs.realpathSync(process.execPath)));
  const readRoots = [realRoot, nodeHome, ...(process.env.FENCE_READ ?? "").split(":").filter((d) => d !== "").map((d) => fs.realpathSync(d))];
  const closed = [fs.realpathSync(os.userInfo().homedir), "/private/var/folders"]; // getpwuid: a moved HOME is not followed
  const under = (p, dir) => p === dir || p.startsWith(dir + path.sep);
  const appendFile = fs.appendFileSync;
  const realpath = fs.realpathSync.native;
  const exists = fs.existsSync;

  /** The real path of `p`, or of its nearest existing parent joined with the rest (a file about to be made). */
  const resolved = (p) => {
    let dir = path.resolve(p);
    const rest = [];
    for (;;) {
      try {
        return path.join(realpath(dir), ...rest.reverse());
      } catch {
        if (dir === path.dirname(dir)) return path.resolve(p);
        rest.push(path.basename(dir));
        dir = path.dirname(dir);
      }
    }
  };
  const asPath = (input) => {
    if (input instanceof URL) return input.protocol === "file:" ? input.pathname : null;
    if (Buffer.isBuffer(input)) return input.toString("utf8");
    return typeof input === "string" ? input : null;
  };
  const refuse = (what) => {
    globalThis[MARK].refusals += 1;
    try {
      appendFile(path.join(realRoot, "fence.log"), `${process.pid} REFUSED ${what}\n`);
    } catch {
      // the log is a convenience; the exit code is the signal
    }
    process.exitCode = 1;
    process.stderr.write(`fence: refused ${what}\n`);
    return new Error(`fence: refused ${what}`);
  };
  /** Why a path may not be used for this access, or null. `write` decides between the root alone and the read roots. */
  const pathRefusal = (input, write) => {
    const p = asPath(input);
    if (p === null || p === "/dev/null") return null;
    const real = resolved(p);
    if (write) return under(real, realRoot) ? null : `write ${real}`;
    // A read is refused under the real home and every temp folder (the real TMPDIR keeps the hosts' run files), unless
    // it is in a read root; elsewhere (/etc, a path that does not exist) it is harmless.
    if (readRoots.some((dir) => under(real, dir))) return null;
    return closed.some((dir) => under(real, dir)) ? `read ${real}` : null;
  };

  // fs: every call that takes a path. Writes (and opens with a write flag) only under the root.
  const reads = ["readFile", "stat", "lstat", "access", "readdir", "realpath", "opendir", "readlink", "exists", "statfs", "watch", "watchFile", "createReadStream", "openAsBlob"];
  const writes = ["writeFile", "appendFile", "mkdir", "mkdtemp", "rm", "rmdir", "unlink", "chmod", "lchmod", "chown", "lchown", "truncate", "utimes", "lutimes", "createWriteStream"];
  const pairs = ["rename", "copyFile", "cp", "link", "symlink"];
  const writeFlag = (flags) => typeof flags === "number" ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT)) !== 0 : typeof flags === "string" && /[wa+]/.test(flags);
  const wrap = (owner, name, check, style) => {
    const original = owner[name];
    if (typeof original !== "function" || original[MARK]) return;
    const wrapped = function fenced(...args) {
      const reason = check(args);
      if (reason === null) return original.apply(this, args);
      const error = refuse(`fs.${name} ${reason}`);
      if (style === "promise") return Promise.reject(error);
      const callback = style === "callback" ? args.findLast((a) => typeof a === "function") : undefined;
      if (callback === undefined) throw error;
      process.nextTick(() => callback(error));
      return undefined;
    };
    Object.assign(wrapped, original);
    Object.defineProperty(wrapped, "name", { value: original.name });
    wrapped[MARK] = true;
    owner[name] = wrapped;
  };
  const forms = (name, check) => {
    wrap(fs, `${name}Sync`, check, "sync");
    wrap(fs, name, check, name.startsWith("create") || name === "watch" || name === "watchFile" || name === "openAsBlob" ? "sync" : "callback");
    wrap(fs.promises, name, check, "promise");
  };
  for (const name of reads) forms(name, (a) => pathRefusal(a[0], false));
  for (const name of writes) forms(name, (a) => pathRefusal(a[0], true));
  for (const name of pairs) forms(name, (a) => pathRefusal(a[0], name !== "rename") ?? pathRefusal(a[1], true));
  forms("open", (a) => pathRefusal(a[0], writeFlag(a[1])));
  wrap(fs, "existsSync", (a) => pathRefusal(a[0], false), "sync");

  // node:sqlite opens its file natively, past node:fs: the constructor is checked as a write.
  const require = createRequire(import.meta.url);
  const sqlite = require("node:sqlite");
  const Database = sqlite.DatabaseSync;
  sqlite.DatabaseSync = class FencedDatabaseSync extends Database {
    constructor(file, ...rest) {
      const reason = typeof file === "string" && file !== ":memory:" ? pathRefusal(file, true) : null;
      if (reason !== null) throw refuse(`sqlite ${reason}`);
      super(file, ...rest);
    }
  };

  // net: connect and listen.
  const loopback = (host) => host === undefined || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "::ffff:127.0.0.1";
  const portOk = (port, listening) => (listening && port === 0) || port === 1 || (port >= 49152 && port <= 65535);
  const target = (args) => {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (typeof first === "object" && first !== null) return typeof first.path === "string" ? { path: first.path } : { port: Number(first.port ?? 0), host: first.host };
    if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) return { port: Number(first), host: typeof args[1] === "string" ? args[1] : undefined };
    if (typeof first === "string") return { path: first };
    return { port: 0, host: undefined };
  };
  const netRefusal = (args, listening) => {
    const t = target(args);
    if (t.path !== undefined) return pathRefusal(t.path, true) === null ? null : `${listening ? "listen" : "connect"} unix ${t.path}`;
    if (!loopback(t.host) || !portOk(t.port, listening)) return `${listening ? "listen" : "connect"} tcp ${t.host ?? "(any)"}:${t.port}`;
    return null;
  };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function fencedConnect(...args) {
    const reason = netRefusal(args, false);
    if (reason !== null) throw refuse(reason);
    return connect.apply(this, args);
  };
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function fencedListen(...args) {
    const reason = netRefusal(args, true);
    if (reason !== null) throw refuse(reason);
    return listen.apply(this, args);
  };
  dgram.createSocket = () => {
    throw refuse("dgram socket");
  };

  // Processes: node only, and the fence's env on the child whatever env the caller gave.
  const fenceEnv = Object.fromEntries(["HOME", "TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "CREWHUB_WORLD_CONFIG_DIR", "CREWHUB_WORLD_LOOPS_APP_DATA", "FENCE_ROOT", "FENCE_READ"].map((k) => [k, process.env[k] ?? ""]));
  const self = new URL(import.meta.url).pathname;
  // NODE_OPTIONS as it is at the spawn (no-app-reach adds itself after this file loaded), with this file always in it.
  const nodeOptions = () => {
    const now = process.env.NODE_OPTIONS ?? "";
    return now.includes(self) ? now : `--import ${self} ${now}`.trim();
  };
  const children = new Set();
  const isNode = (command) => typeof command === "string" && (command === process.execPath || command === "node" || (exists(command) && realpath(command) === realpath(process.execPath)));
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "fork", "exec", "execSync"]) {
    const original = childProcess[name];
    childProcess[name] = function fencedProcess(command, ...rest) {
      const shell = name === "exec" || name === "execSync";
      const file = name === "fork" ? process.execPath : command;
      if (shell || !isNode(file)) throw refuse(`${name} ${String(command).slice(0, 80)}`);
      const args = Array.isArray(rest[0]) ? rest.shift() : [];
      const options = typeof rest[0] === "object" && rest[0] !== null ? rest.shift() : {};
      if (options.shell) throw refuse(`${name} with a shell`);
      const env = { ...(options.env ?? process.env), ...fenceEnv, NODE_OPTIONS: nodeOptions() };
      const child = original.call(this, command, args, { ...options, env }, ...rest);
      if (child?.pid !== undefined) children.add(child.pid);
      return child;
    };
  }
  const kill = process.kill;
  process.kill = function fencedKill(pid, signal) {
    if (pid !== process.pid && !children.has(pid)) throw refuse(`kill ${pid}`);
    return kill.call(this, pid, signal);
  };
  syncBuiltinESMExports();
  process.on("exit", () => {
    if (globalThis[MARK].refusals > 0 && process.exitCode === 0) process.exitCode = 1;
  });
}
```

### C. `run-fenced.sh`: the runner: the clean env, the preload and the profile together

```sh
#!/usr/bin/env bash
# run-fenced.sh <root> <cwd> <command...>: runs a command inside the mutation fence.
#   1. a clean environment (env -i): HOME, TMPDIR, XDG_* and the host's folders all under <root>, no inherited
#      CREWHUB_* or loops URL, PATH = node's bin and /usr/bin:/bin only;
#   2. the JS fence preloaded into every node process (NODE_OPTIONS; FENCE_ROOT names the root);
#   3. the kernel fence: sandbox-exec with $FENCE_PROFILE (default fence.sb beside this script; make-profile.mjs for
#      the same root), inherited by every child.
# FENCE_NO_JS=1 leaves out layer 2 (to prove layer 3 alone); FENCE_NO_KERNEL=1 leaves out layer 3.
set -u
ROOT=$(cd "$1" && pwd -P); CWD=$2; shift 2
HERE=$(cd "$(dirname "$0")" && pwd -P)
NODE_BIN=$HOME/.nvm/versions/node/v24.21.0/bin
mkdir -p "$ROOT/home" "$ROOT/tmp" "$ROOT/cfg" "$ROOT/appdata" "$ROOT/xdg/config" "$ROOT/xdg/data" "$ROOT/xdg/state" "$ROOT/xdg/cache"
OPTS=""
[ "${FENCE_NO_JS:-}" = "1" ] || OPTS="--import $HERE/fence.mjs"
SANDBOX=(sandbox-exec -f "${FENCE_PROFILE:-$HERE/fence.sb}")
[ "${FENCE_NO_KERNEL:-}" = "1" ] && SANDBOX=()
cd "$CWD" || exit 2
exec env -i \
  HOME="$ROOT/home" TMPDIR="$ROOT/tmp/" USER="${USER:-nobody}" LANG=en_US.UTF-8 \
  XDG_CONFIG_HOME="$ROOT/xdg/config" XDG_DATA_HOME="$ROOT/xdg/data" XDG_STATE_HOME="$ROOT/xdg/state" XDG_CACHE_HOME="$ROOT/xdg/cache" \
  CREWHUB_WORLD_CONFIG_DIR="$ROOT/cfg" CREWHUB_WORLD_LOOPS_APP_DATA="$ROOT/appdata" \
  PATH="$NODE_BIN:/usr/bin:/bin" NODE_OPTIONS="$OPTS" FENCE_ROOT="$ROOT" FENCE_READ="${FENCE_READ:-}" \
  ${SANDBOX[@]+"${SANDBOX[@]}"} "$@"
```
