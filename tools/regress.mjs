/* regress.mjs: the browser regression pass of the integrated world, in ten groups.

   Usage:
     node tools/regress.mjs --port <port> [--groups connect,walk,demo,tour,live,town,ops,chat,rooms] --host-port <port> [--loops dev|main] [--loops-socket <path>] [--loops-app-data <dir>] [--cpu-throttle <rate>] [--tag pass] [--out <dir>] [--swiftshader]
     node tools/regress.mjs --port <port> --groups connect,real --host-port <port> --loops-env <file> [...]
     node tools/regress.mjs --port <port> --real --host-port <port> --loops-env <file> [...]   (the nine and real)

   Groups (--groups, in this order; connect first, the connection being the first priority). The default is the nine
   that use fakes and stubs; real and the connect group's real half aim at the development loops and run only when asked:
   real named in --groups, or --real (round 58d), which adds real to the groups chosen, default or given, as the other
   tools' --real opts in to the development loops. Real without --loops-env is refused before anything starts (round
   57d; lib/regressArgs.ts):
     connect the connect flow (spec addendum "a smooth connection"), 25 checks in two halves, both behind your Vite
           (started with CREWHUB_WORLD_PORT=<host-port>; apps/world/dist is never looked at here, whatever the live
           group does with it). Against the stub host of lib/connectStub.mjs, on --host-port, always: one page meets
           every screen in order (No crewhub-loops found, Pair this browser naming `npm run world`, Connect with a
           masked field, a key typed and Enter: the field empty again and the host checking, rejected with loops'
           reason, the focus back on the key field, and Forget this key, which brings Connect back, crewhub-loops not answering, then the town with the
           Live chip and no reload), the key in no DOM, storage or URL, the Connection panel's facts and Escape, the
           stub's `unpaired` state (a host that no longer knows the browser: Pair this browser over the live tab,
           and the town back by itself once paired again) and, on a second page, the Stream busy chip over the town
           (loops' 429); every screen asks the host's health every 2.5 s, not back to back (round 48). Against the REAL development loops, only when real is asked for (in --groups or by --real; the env file and the skip rules of `real`, plus
           --loops-app-data, default ~/crewhub-loops-dev, which must hold a settings.json): a keyless host the tool
           starts on --host-port with the discovery through that folder, a fresh config folder under --out (removed at
           the end), pairing on with the secret kept in <config>/pairing-secret as `npm run world` keeps it; the
           one-time link on the Vite origin lands on the Connect screen (loops found, key none); the Read only bot's key
           (LOOPS_DEV_READONLY_KEY_FILE, else the key file's name with -ro before .key; skipped with an INFO line
           without one) is refused with the words to make a bot with "Read only" off; a bogus shaped key is refused
           and the screen stays usable; the key file's key connects (Live, no reload, the key stored), the real projects
           are named, the key is nowhere; the host closed and started again with the stored key and the same secret
           file is Live again without a new link; the panel's Forget this key hands the Connect screen back and the
           stored key is gone. Under half a minute. One host at a time against that loops (4 streams per key).
     walk  40 checks along a visitor's walk through the demo (keyboard, the text view, the timeline, chat, build mode and the prop editor's focus,
           settings, the where form, reduced motion, a phone, both themes). About two minutes.
     demo  the jump list (/ opens it, a building's name, Enter lands inside; the postman's card in the town; a card that
           cannot be drawn says so in its place and the town stays, round 48), the scenario picker (the Demo chip, One
           project, back to Small team) and the Studio scenario's Region level (district cards, a beacon, a pin, a
           district, a building, the Escape chain back to the Region); and 17 checks of the new loops events (round 7):
           the storyline played to the quiet fact (the dusty package, its clock tag, the text view's line), the card an
           automation run pins on the board by the front door with its lines, the failed run's card, each waiting for
           the model's state and entering its building by slug. About 50 s.
     live  live mode against a fake crewhub-loops the tool starts itself (`packages/loops-fake`, port 0) behind a host it
           starts itself (`apps/host`): the Live chip, the chat chip's link into the loops web, the scripted director
           in live mode (round 11: its own opt-in in Settings, off with the demo's switch stored on; the text view's
           director section tagged "scripted" on every line, off and on; a quick plan over the fake's events whose
           intents read "scripted director:"; the kill switch; no non-GET request from the page while it ran),
           Loops down after the fake closes, Live again
           after a new fake on the same port, and, when the host has pairing, the pairing page without a cookie and
           the world after the one-time link. When `apps/world/dist` exists (after `npm run build`) the host serves
           it on a free port and the browser opens the host directly; otherwise the host listens on --host-port
           (required, a port of your own: never 5180, the host's default, nor the Mac app's) and the browser opens your Vite, which must have been started
           with CREWHUB_WORLD_PORT=<host-port>. A dist older than the world's sources (the host's own freshness
           check, apps/host/src/build.ts) is refused before any group runs, with both times: run `npm run build`, or
           remove the dist to run behind your Vite; the same holds for chat and ops. About a minute, most of it the
           wait for the quick plan (20 s after the fake's first ticket move).
     ops   the live operations road (round 7): a host the tool starts on --host-port over a fake it starts itself (a
           key store in a folder under --out, removed at the end), the browser on your Vite, and three things done to
           loops under the running host, each with its honest screen: (a) the fake closed and reopened on its port:
           the Loops down chip over the last known town and the panel's "down; the host retries", then Live again
           without a reload with the key still accepted and the cursor going on; (b) the fake reopened with another
           key (the host's key revoked while Live, a 401 from a loops whose health answers): the rejected screen over
           the live tab with loops' reason, the kept key and Forget, the host's key state rejected; the new key
           pasted (another bot's): the town back by itself without a reload, the new key stored, neither key anywhere,
           Settings naming the new key (round 48); (c) the fake
           reopened with another `/api/health` version (loops upgraded): Live, health's `loopsCommit` and
           `loopsCommitBefore`, the panel saying crewhub-loops was updated under the host. Needs nobody and never
           touches the development loops. About a minute.
     chat  the chat over the key (round 12; the one road since round 19, the sign-in road gone with the switch to the
           viewer key), over a fake whose viewer key reads the chat (`keyReadsChat`): no sign-in, the Connection panel's
           Chat section says a sign-in is not needed for the bubbles with no form, g-man's scripted answer (4:21 of the
           story, the fake started just before it) as a speech bubble over its figure with the first line, over the key's
           own stream, a tap to the Chat panel; the glance on the key road (round 17); then (round 14) an agent inside a
           building answering (the fake's sendDm to cr-lead): the chat mark over its building from the town (named,
           beside the pin), the text view's says line with the place and the "answered" chip, the mark entering the
           building, the bubble there wrapped to at most three lines and clear of the name label, its accessible name
           without a double full stop, the mark gone with the bubble, and the same on a phone in the dark theme; (round
           16) the Recent answers list: the text view's section listing both answers newest first after the bubbles
           went and opening the panel from a row, and the block on the phone; (round 18) the list's own explanation
           behind About this chat. Then the no chat road (round 19), over a fake whose key does not read the chat: health
           without a session, /world-api/session gone, the Connection panel's Chat section, the Chat panel's glance and
           About this chat, Recent answers' empty state and the text view's Chat line saying this crewhub-loops does not
           let the world read the chat and how to make a viewer key, no form, and an agent's answer showing no mark and
           no bubble (the page's probe of road 2 over that fake says the world's origin is not set, so the words are that
           verdict's). Then road 2 (round 28) over a fake that names the page's origin as its CHL_WORLD_ORIGIN: signed in
           at the fake's own login (the cookie in the browser context), the probe on, the road page while the host's key
           reads no chat, the Chat section's words with this page's exact origin, an agent's answer through the page's
           own poll (the mark, the bubble inside, the Recent answers row), every fetch to the fake a GET on the four
           routes with the query loops forces, no CORS line. Needs nobody. About three minutes.
     rooms the three-room building (`?rooms=three`, whatever the viewer's Buildings setting): three room signs
           (Administration, The floor, Lead's office) and a rack sign with its count, the arrow keys between the three halls, the text view naming the
           racks and the desks with a package on each, the lead's office beacon, the agent card on a figure at a desk,
           no figure moving when the walkers land after the first frame (and W or a follow in the first frame working,
           3 checks on pages of their own), and walk mode in through the front door into Administration and on to the
           floor, steered stop by stop (`walkTo`: the keys push on screen, so the wanted direction is turned through
           the camera's yaw and held in bounded bursts; --cpu-throttle 16 is the slow machine it must hold on). About 45 s.
     real  live mode against the REAL development crewhub-loops (tools/loops-dev.sh, 127.0.0.1:8291 by default; --loops main
           or CREWHUB_REGRESS_LOOPS=main picks the instance from crewhub-loops main, 8293: its folder
           ~/crewhub-loops-dev-main and its socket there, with --loops-env naming its env file; any other name the same
           way with that suffix; the connect group's real half follows the same choice): it reads
           --loops-env (required with real, and the only place it looks: no env file is searched for; LOOPS_DEV_URL and
           LOOPS_DEV_KEY_FILE, the admin lines are never read), skips cleanly with one INFO line when that loops does not answer (counted as neither pass nor fail),
           else starts its own host on --host-port against it with that key (so Vite must have been started with
           CREWHUB_WORLD_PORT=<host-port>) and checks in the browser: the chip says Live, the town shows the real
           projects by name, a building shows its real tickets, the text view names them, and when a ticket moves
           during the run (the seed tool, a person in the loops web) the building's count follows the board (a moved
           ticket flies to its rack first, so that check allows 12 s). Then, with that host closed, a second host reads
           the same loops over its Unix socket (--loops-socket, default ~/crewhub-loops-dev/run/api.sock, the
           development instance's; CREWHUB_WORLD_LOOPS_SOCKET for the host): its health says transport unix and its
           snapshot has the same projects as over TCP; skipped with an INFO line when there is no socket at that path.
           Round 7: the host's `loopsCommit` is what that loops' own health says as `version`, and the panel names it
           (what 8291 can show without being stopped; the stop/start, revoke and upgrade roads are the ops group's).
           Round 29: the chat road matches the key: a viewer key (loops main, --loops main) gives session key, the
           Connection panel's Chat section on the key road and the archived projects from loops' list; a plain external
           bot's key gives no session, the no-chat road and the archived projects from the log. Under a minute. Run it while no other host of yours is open against that loops (4 streams per key).
   --cpu-throttle <rate> slows every page's CPU that many times (the browser's own throttle): the timed checks must
   hold at 16. Besides the checks it fails on any page error, console error or request that leaves the page's own
   origin, and on a group that stops before its end.

   Output in --out (default tools/out/): <tag>-NN-<stop>.png, <tag>-results.json (every check as { name, pass,
   detail }), <tag>-problems.json (every page problem the run heard, each with its time, and the town group's host
   restarts: the record lib/closingCheck.ts judges, kept so a failed closing check can be read and replayed) and
   <tag>.log (what is printed, with each group's time as an INFO line). The last line printed is
   `regress: <passed>/<total>`; the exit code is 0 only when every check passed.

   Run it against a dev server (Vite): some checks read the scene through `window.__town`, which only dev builds set.

   Each group's checks are one file, tools/regress/<group>.mjs, `run({ pass, page, check, out })` (round 61, T3; the four
   are described above the plan below). This file is the command line, the plan, the shared helpers (a page of this run,
   the scene readers, walk mode's steering), the four objects, the closing checks and the log. */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cli, dressed, launch, problemLines } from "./lib/world.mjs";
import { openPage, readTextView as text } from "./lib/page.mjs";
import { closingCheck } from "./lib/closingCheck.ts";
import { regressPlan } from "./lib/regressArgs.ts";
import { ownPort } from "./lib/toolGuard.ts";
import { run as runWalk } from "./regress/walk.mjs";
import { run as runDemo, runEvents as runDemoEvents } from "./regress/demo.mjs";
import { run as runTour } from "./regress/tour.mjs";
import { run as runLive } from "./regress/live.mjs";
import { run as runChat } from "./regress/chat.mjs";
import { run as runTown } from "./regress/town.mjs";
import { run as runOps } from "./regress/ops.mjs";
import { run as runConnect } from "./regress/connect.mjs";
import { run as runRooms } from "./regress/rooms.mjs";
import { run as runReal } from "./regress/real.mjs";

// The known groups are lib/regressArgs.ts' GROUPS. The groups run in the order they stand in this file (walk, demo,
// tour, live, chat, town, ops, connect, rooms, real), whatever --groups lists (round 54, r54-review).
const USAGE = "node tools/regress.mjs --port <port> [--groups walk,demo,tour,live,town,ops,chat,connect,rooms (the default), or with real] [--real (adds real)] --host-port <port> [--loops dev|main] [--loops-env <file> (required with real)] [--loops-socket <path>] [--loops-app-data <dir>] [--cpu-throttle <rate>] [--tag pass] [--out <dir>] [--swiftshader]";
const opts = cli(USAGE, { options: { tag: "pass", groups: "", "host-port": "", loops: "", "loops-env": "", "loops-socket": "", "loops-app-data": "", "cpu-throttle": "1" }, flags: ["real"] });
// First thing after the command line (round 57d): the groups, and the real development loops only when real is named in
// --groups, read from --loops-env alone (lib/regressArgs.ts). A refusal stops here, before a browser, host or fake starts.
const plan = regressPlan({ groups: opts.groups, real: opts.real, loopsEnv: opts["loops-env"] });
if (!plan.ok) opts.fail(plan.reason);
const groups = plan.groups;
const cpuThrottle = Number(opts["cpu-throttle"]);
if (!(cpuThrottle >= 1)) opts.fail("--cpu-throttle <rate> must be 1 (none) or more");
// The host port every group binds behind your Vite (round 36): named, and never 5180 (the host's default, somebody's
// real npm run world) nor the Mac app's. Checked here, before a browser opens; the groups read opts["host-port"] as before.
const hostPortVerdict = ownPort(opts["host-port"], "--host-port");
if (!hostPortVerdict.ok) opts.fail(`${hostPortVerdict.reason} (the port your Vite was started with as CREWHUB_WORLD_PORT)`);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { tag, out: OUT, base: BASE, origin } = opts;
// The built world the live, chat and ops groups serve when it is there (the browser opens the host directly); without
// it they run behind your Vite. A dist older than the world's sources is refused here, before anything starts, with
// both times and the way out (apps/host/src/build.ts, the check `npm run world` makes): an old build would test an
// old world, and a build is yours to make, not this tool's (it would change your tree while a host of yours may be
// serving the dist). `distFresh` is the one-line verdict for the groups' INFO line.
const DIST = path.join(REPO, "apps", "world", "dist");
const DIST_SERVED = ["live", "chat", "ops", "town"].some((name) => groups.includes(name)) && existsSync(path.join(DIST, "index.html"));
let distFresh = "";
if (DIST_SERVED) {
  const { checkBuild, clock, describeStale } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "build.ts")).href);
  const check = checkBuild(REPO, DIST);
  if (!check.fresh) opts.fail(describeStale({ distMtimeMs: check.distMtimeMs, sources: check.sources, reason: check.reason }));
  distFresh = `apps/world/dist built ${clock(check.distMtimeMs)}, ${check.reason}`;
}
const browser = await launch(opts);
const log = [];
const results = [];
const ok = (name, cond, detail = "") => (results.push({ name, pass: !!cond, detail }), log.push(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`));
const info = (text) => log.push(`INFO ${text}`);
const problems = [];
/** The host restarts the town group makes on purpose, each as { origin, tag, from, to } (ms): see lib/closingCheck.ts. */
const restarts = [];
/** The Forgets the connect group makes in one tab on purpose, each as { tag, pageOrigin, from, to } (ms): see lib/closingCheck.ts. */
const forgets = [];

/** Runs one group when it was asked for, times it, and turns an exception in it into one FAIL instead of a dead run. */
async function group(name, run) {
  if (!groups.includes(name)) return;
  const started = Date.now();
  const first = results.length;
  try {
    await run();
  } catch (e) {
    ok(`${name} group runs to its end`, false, (e?.message ?? String(e)).split("\n")[0]);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const mine = results.slice(first);
  info(`group ${name}: ${mine.filter((r) => r.pass).length}/${mine.length} in ${seconds} s`);
}

/** A page of this run (lib/page.mjs): a light 1440 window unless `options` say a phone or a theme, watched, and with
 * --cpu-throttle its CPU slowed through the browser's own throttle (a slow machine on purpose, for the timed checks). */
const open = (options = {}) => openPage(browser, { origin, problems, cpuThrottle, ...options });
async function town(p, settle, url = BASE) {
  await p.goto(url);
  await dressed(p);
  await p.waitForTimeout(settle);
}
const shot = (p, name) => p.screenshot({ path: `${OUT}${tag}-${name}.png` });
/**
 * The loops web origins the pages of this run may ask (round 28, road 2: the page probes `GET /api/dm/threads` at the
 * origin the host names, and polls the four routes where the origin is set): every fake and every loops web stub
 * started here, and the connect stub's web. The closing checks take a GET of the four routes at one of them as road
 * 2's own ask, and the browser's CORS line for the probe at one of them as the expected refusal; nothing else.
 */
const loopsOrigins = new Set();
/** Origins known only later (the connect stub's web starts with its connected state): read when a check asks. */
const loopsOriginGetters = [];
const allLoopsOrigins = () => new Set([...loopsOrigins, ...loopsOriginGetters.map((get) => get()).filter((o) => typeof o === "string" && o !== "")]);
const noteLoops = (made) => {
  loopsOrigins.add(made.url);
  return made;
};
/** The real development loops of a run (the connect group's real half, the real group): the page's probe asks it too. */
const noteLoopsUrl = (url) => {
  try {
    loopsOrigins.add(new URL(url).origin);
  } catch {
    // not a URL: nothing to expect
  }
};
const ROAD2_ROUTES = [/^\/api\/dm\/threads$/, /^\/api\/dm\/threads\/[a-z0-9][a-z0-9-]{0,31}\/messages$/, /^\/api\/dm\/messages\/[A-Za-z0-9_-]{1,64}$/, /^\/api\/events$/];
const road2Ask = (x) => {
  try {
    const url = new URL(x.url);
    return x.method === "GET" && allLoopsOrigins().has(url.origin) && ROAD2_ROUTES.some((route) => route.test(url.pathname));
  } catch {
    return false;
  }
};
const canvas = (p) => p.locator("canvas").first();
const crumbs = async (p) => (await p.locator("header, .breadcrumb, nav").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
/** The chip in the header that says the data is scripted; since the scenario picker it is a button, "Demo: <scenario>". */
const demoChip = (p) => p.locator("header .demo-word, header .chip").filter({ hasText: /^Demo\b/ }).first();
/** The entered building's slug as the scene has it; undefined outside a dev build. */
const entered = (p) => p.evaluate(() => globalThis.__town?.view?.entered);
const walkersWalking = (p) => p.evaluate(() => [...(globalThis.__town?.walks?.walkers?.() ?? [])].filter((x) => x.walking).length).catch(() => -1);
/** Where the visitor stands in walk mode (`__town.visitor`: room id, world x and z, building, the camera's yaw), or null outside it. */
const visitor = (p) => p.evaluate(() => globalThis.__town?.visitor ?? null).catch(() => null);
/** The visitor's stroll in world units a second (apps/world/src/world/visitor.ts WALK_SPEED). */
const WALK_SPEED = 2.6;
/**
 * Walk mode: steers the visitor to `stop` (a room id of the navigation grid and a cell of it) until it stands within
 * `within` of the cell's centre (default 0.35, inside the cell) or `seconds` pass, and answers where it stands then.
 * The arrow keys push on screen, and the follow camera stands at a yaw (45 degrees at the start: Up alone is
 * north-west, Up+Right is north), so the wanted world direction is turned back into screen axes with the yaw the page
 * reports, and the keys that cover each axis are held. Each burst is bounded by the distance left on its shortest axis
 * (never more than 100 ms), then every key is released before the position is read again: an iteration's latency
 * under load cannot carry the visitor past a cell, which is what used to leave it beside a door instead of in it.
 * A stop in another room is reached through its door only when the straight line goes through that door, so a walk
 * is a list of stops: the door cell, then the first cell beyond it.
 */
async function walkTo(p, stop, seconds, within = 0.35) {
  const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  const deadline = Date.now() + seconds * 1000;
  let at = null;
  while (Date.now() < deadline) {
    at = await p
      .evaluate((stop) => {
        const t = globalThis.__town;
        const v = t?.visitor;
        if (!v || !t?.walks?.nav?.toWorld) return null;
        const w = t.walks.nav.toWorld(stop);
        return { room: v.room, building: v.building, x: v.x, z: v.z, yaw: v.yaw, crossing: v.crossing, dx: w.x - v.x, dz: w.z - v.z };
      }, stop)
      .catch(() => null);
    if (!at) break;
    if (at.room === stop.room && Math.hypot(at.dx, at.dz) < within) break;
    // Through a door the visitor glides by itself: wait for it, the keys do nothing meanwhile.
    if (at.crossing) {
      await p.waitForTimeout(50);
      continue;
    }
    // The remaining way as the screen sees it: the inverse of worldDirection (visitor.ts) for the camera's yaw.
    const sin = Math.sin(at.yaw ?? 0);
    const cos = Math.cos(at.yaw ?? 0);
    const right = cos * at.dx - sin * at.dz;
    const forward = -sin * at.dx - cos * at.dz;
    const wanted = [];
    if (Math.abs(right) > 0.1) wanted.push(right > 0 ? "ArrowRight" : "ArrowLeft");
    if (Math.abs(forward) > 0.1) wanted.push(forward > 0 ? "ArrowUp" : "ArrowDown");
    if (wanted.length === 0) break;
    // Hold for the time the shortest wanted axis needs at a stroll, at most 100 ms, then let go and look again.
    const shortest = Math.min(...[Math.abs(right), Math.abs(forward)].filter((d) => d > 0.1));
    const burst = Math.max(20, Math.min(100, (shortest / WALK_SPEED) * 1000));
    for (const key of wanted) await p.keyboard.down(key);
    await p.waitForTimeout(burst);
    for (const key of wanted) await p.keyboard.up(key);
  }
  for (const key of KEYS) await p.keyboard.up(key).catch(() => {});
  return at;
}

/**
 * What a group gets (tools/regress/<group>.mjs, `run({ pass, page, check, out })`; round 61, T3). `pass` is this run's
 * rig and plan: the browser, the command line, the plan, the dist verdict, the origins the pages may ask, the problems
 * heard, the town group's restarts and the connect group's Forgets (the closing checks' records), and the loops helpers
 * of the real halves. `page` opens a page of this run and reads the scene through it. `check` records one check
 * (PASS/FAIL), an INFO line or a bare line of the log. `out` is the output folder, this run's tag and a screenshot there.
 */
const pass = { browser, opts, plan, groups, origin, base: BASE, repo: REPO, dist: DIST, distServed: DIST_SERVED, distFresh, problems, restarts, forgets, loopsOriginGetters, noteLoops, noteLoopsUrl, road2Routes: ROAD2_ROUTES, loopsEnvFile, loopsSocketPath, loopsAppData, readEnvFile, isUnixSocket, waitForMove };
const page = { open, town, canvas, crumbs, demoChip, entered, walkersWalking, visitor, walkTo };
const note = (line) => log.push(line);
const check = { ok, info, note };
const out = { dir: OUT, tag, shot };
const context = { pass, page, check, out };
// The groups, in the fixed order they ran in when they stood in this file (round 54): a group runs only when the plan names it.
const PLAN = [
  ["walk", runWalk],
  ["demo", runDemoEvents],
  ["demo", runDemo],
  ["tour", runTour],
  ["live", runLive],
  ["chat", runChat],
  ["town", runTown],
  ["ops", runOps],
  ["connect", runConnect],
  ["rooms", runRooms],
  ["real", runReal],
];
for (const [name, run] of PLAN) await group(name, () => run(context));

/** Which real development loops: --loops, else CREWHUB_REGRESS_LOOPS, else `dev` (8291, tools/loops-dev.sh's folder); `main` is the instance from crewhub-loops main (8293). */
function loopsName() {
  const name = (opts.loops || process.env.CREWHUB_REGRESS_LOOPS || "dev").trim();
  if (!/^[a-z0-9-]+$/.test(name)) opts.fail(`--loops <name> is a short lower-case name (dev, main), not ${JSON.stringify(name)}`);
  return name;
}
/** The suffix of that instance's folders: none for `dev`, `-<name>` otherwise (~/crewhub-loops-dev-main and its socket). */
function loopsSuffix() {
  return loopsName() === "dev" ? "" : `-${loopsName()}`;
}
/**
 * The env file of the development loops: --loops-env and nothing else (round 57d). regressPlan refuses real without it;
 * an empty one here would resolve to the working directory, so it fails instead of reading anything.
 */
function loopsEnvFile() {
  if (plan.loopsEnv === "") opts.fail("the development loops' env file is --loops-env <file> only, and none was given: no file is searched for");
  return path.resolve(plan.loopsEnv);
}
/** The development loops' Unix socket: --loops-socket, else `tools/loops-dev.sh`'s `~/crewhub-loops-dev/run/api.sock`. */
function loopsSocketPath() {
  const given = opts["loops-socket"];
  const text = given || `~/crewhub-loops-dev${loopsSuffix()}/run/api.sock`;
  return path.resolve(text.replace(/^~(?=\/|$)/, process.env.HOME ?? "~"));
}
/** The development loops' data folder the connect group's host looks in: --loops-app-data, else `tools/loops-dev.sh`'s `~/crewhub-loops-dev`. */
function loopsAppData() {
  const text = opts["loops-app-data"] || `~/crewhub-loops-dev${loopsSuffix()}`;
  return path.resolve(text.replace(/^~(?=\/|$)/, process.env.HOME ?? "~"));
}
function isUnixSocket(file) {
  try {
    return statSync(file).isSocket();
  } catch {
    return false;
  }
}
/** `KEY=value` lines of a dotenv-style file; only the three keys the groups need are kept, the rest never leaves this function. */
function readEnvFile(file) {
  const out = {};
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const m = /^\s*(?:export\s+)?(LOOPS_DEV_URL|LOOPS_DEV_KEY_FILE|LOOPS_DEV_READONLY_KEY_FILE)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2").replace(/^~(?=\/|$)/, process.env.HOME ?? "~");
  }
  return out;
}
/** Polls the host's board of `slug` for up to `ms` and answers the first ticket whose column changed (slug, key, from, to), or null. */
async function waitForMove(hostApi, slug, ms) {
  const columnsOf = async () => {
    const board = await hostApi(`/board/${encodeURIComponent(slug)}`);
    return new Map((board.columns ?? []).flatMap((c) => c.tickets.map((t) => [t.key, c.status])));
  };
  const deadline = Date.now() + ms;
  let before = await columnsOf();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const now = await columnsOf();
    for (const [key, status] of now) {
      const was = before.get(key);
      if (was !== undefined && was !== status) return { slug, key, from: was, to: status };
    }
    before = now;
  }
  return null;
}

writeFileSync(`${OUT}${tag}-problems.json`, JSON.stringify({ restarts, forgets, problems }, null, 1));
const road2Asks = problems.filter((x) => x.kind === "external" && road2Ask(x));
const external = problems.filter((x) => x.kind === "external" && !road2Ask(x)).map((x) => x.text);
const closing = closingCheck(problems, { loopsOrigins: [...allLoopsOrigins()], restarts });
const refusals = closing.probeRefusals;
const errors = problemLines(closing.failing);
ok(`no external requests beyond road 2's own (${road2Asks.length} GET(s) of the four chat routes at the loops web origins the hosts named: the page's probe and, where the origin is set, its poll)`, external.length === 0, [...new Set(external)].slice(0, 5).join(" "));
ok(`no page errors or console errors beyond the probe's CORS refusal where the fake does not name the page's origin (${refusals.length} line(s), the browser's own two for ${new Set(refusals.map((x) => x.pageOrigin)).size} page(s)) and a health read refused inside one of the town group's host restarts (${closing.restartRefusals.length} line(s), ${restarts.length} restart(s))`, errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();

const passed = results.filter((r) => r.pass).length;
log.push(...errors.slice(5), `regress: ${passed}/${results.length}`);
writeFileSync(`${OUT}${tag}-results.json`, JSON.stringify(results, null, 1));
writeFileSync(`${OUT}${tag}.log`, log.join("\n") + "\n");
console.log(log.join("\n"));
process.exit(passed === results.length ? 0 : 1);
