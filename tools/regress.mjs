/* regress.mjs: the browser regression pass of the integrated world, in ten groups.

   Usage:
     node tools/regress.mjs --port <port> [--groups connect,walk,demo,tour,live,town,ops,chat,rooms,real] --host-port <port> [--loops-env <file>] [--loops-socket <path>] [--loops-app-data <dir>] [--cpu-throttle <rate>] [--tag pass] [--out <dir>] [--swiftshader]

   Groups (--groups, default all ten, in this order; connect first, the connection being the first priority):
     connect the connect flow (spec addendum "a smooth connection"), 25 checks in two halves, both behind your Vite
           (started with CREWHUB_WORLD_PORT=<host-port>; apps/world/dist is never looked at here, whatever the live
           group does with it). Against the stub host of lib/connectStub.mjs, on --host-port, always: one page meets
           every screen in order (No crewhub-loops found, Pair this browser naming `npm run world`, Connect with a
           masked field, a key typed and Enter: the field empty again and the host checking, rejected with loops'
           reason, the focus back on the key field, and Forget this key, which brings Connect back, crewhub-loops not answering, then the town with the
           Live chip and no reload), the key in no DOM, storage or URL, the Connection panel's facts and Escape, the
           stub's `unpaired` state (a host that no longer knows the browser: Pair this browser over the live tab,
           and the town back by itself once paired again) and, on a second page, the Stream busy chip over the town
           (loops' 429); every screen asks the host's health every 2.5 s, not back to back (round 48). Against the REAL development loops (the env file and the skip rules of `real`, plus
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
     walk  37 checks along a visitor's walk through the demo (keyboard, the text view, the timeline, chat, build mode and the prop editor's focus,
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
           or CREWHUB_REGRESS_LOOPS=main picks the instance from crewhub-loops main, 8293: its env file is
           tools/out/loops-dev-main.env, its folder ~/crewhub-loops-dev-main, its socket there; any other name the same
           way with that suffix; the connect group's real half follows the same choice): it reads
           --loops-env (default: the first tools/out/loops-dev<-name>.env of this worktree, the main checkout or
           ~/Documents/GitHub/crewhub2-world-demo; LOOPS_DEV_URL and LOOPS_DEV_KEY_FILE, the admin lines are never
           read), skips cleanly with one INFO line when that loops does not answer (counted as neither pass nor fail),
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
   detail }) and <tag>.log (what is printed, with each group's time as an INFO line). The last line printed is
   `regress: <passed>/<total>`; the exit code is 0 only when every check passed.

   Run it against a dev server (Vite): some checks read the scene through `window.__town`, which only dev builds set. */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cli, dressed, launch, list, problemLines, seek, speed, watch } from "./lib/world.mjs";
import { createConnectStub } from "./lib/connectStub.mjs";
import { createLoopsWebStub } from "./lib/loopsWebStub.mjs";
import { isProbeRefusal } from "./lib/probeRefusal.ts";
import { appDataPort, ownAppData, ownLoopsUrl, ownPort } from "./lib/toolGuard.ts";

// The connect group first: the connection is the first priority, so a default pass fails on it first.
const GROUPS = ["connect", "walk", "demo", "tour", "live", "town", "ops", "chat", "rooms", "real"];
const USAGE = "node tools/regress.mjs --port <port> [--groups walk,demo,tour,live,town,ops,chat,connect,rooms,real] --host-port <port> [--loops dev|main] [--loops-env <file>] [--loops-socket <path>] [--loops-app-data <dir>] [--cpu-throttle <rate>] [--tag pass] [--out <dir>] [--swiftshader]";
const opts = cli(USAGE, { options: { tag: "pass", groups: GROUPS.join(","), "host-port": "", loops: "", "loops-env": "", "loops-socket": "", "loops-app-data": "", "cpu-throttle": "1" } });
const cpuThrottle = Number(opts["cpu-throttle"]);
if (!(cpuThrottle >= 1)) opts.fail("--cpu-throttle <rate> must be 1 (none) or more");
const groups = list(opts.groups, GROUPS, opts.fail, "group");
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

async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...options });
  const p = await ctx.newPage();
  watch(p, origin, problems);
  // --cpu-throttle: the page's CPU slowed through the browser's own throttle (a slow machine on purpose, for the timed checks).
  if (cpuThrottle > 1) await (await ctx.newCDPSession(p)).send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  return p;
}
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
/**
 * The probe's refusal as the browser prints it (the verdict origin-not-set or unreachable): exactly the CORS line for
 * the threads route at a loops origin of this run from the page's own origin, and the browser's "Failed to load
 * resource" line for that same URL. Nothing else (lib/probeRefusal.ts, the rule a11y.mjs shares since round 32).
 */
const probeRefusal = (x) => isProbeRefusal(x, allLoopsOrigins());
const sheet = (p) => p.locator("#text-view");
/** Opens the text view (T), reads it and closes it again. */
const text = async (p) => {
  await p.keyboard.press("t");
  await p.waitForTimeout(400);
  const t = await sheet(p).innerText().catch(() => "");
  await p.keyboard.press("Escape");
  return t;
};
const canvas = (p) => p.locator("canvas").first();
const crumbs = async (p) => (await p.locator("header, .breadcrumb, nav").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
/** The chip in the header that says the data is scripted; since the scenario picker it is a button, "Demo: <scenario>". */
const demoChip = (p) => p.locator("header .demo-word, header .chip").filter({ hasText: /^Demo\b/ }).first();
/** The breadcrumb: how many levels it shows and the name of the current one. */
const trail = (p) => p.locator("nav.world-breadcrumb");
const levels = (p) => trail(p).getAttribute("data-levels").catch(() => null);
const level = async (p) => (await trail(p).locator(".crumb-current").innerText().catch(() => "")).trim();
/** The entered building's slug as the scene has it; undefined outside a dev build. */
const entered = (p) => p.evaluate(() => globalThis.__town?.view?.entered);
/** How many of the elements `selector` finds are drawn: a box on screen, not hidden, not faded out. */
const drawn = (p, selector) =>
  p.evaluate((selector) => {
    const shown = (e) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && e.closest(".anchor")?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    return [...document.querySelectorAll(selector)].filter(shown).length;
  }, selector);
/** The labels that show over the scene: every element of the label layer that is drawn and not faded out. */
const labels = (p, selector = ".world-labels .anchor *") =>
  p.evaluate((selector) => {
    const shown = (e) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && e.closest(".anchor")?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    return [...document.querySelectorAll(selector)].filter((e) => e.children.length === 0 || e.matches(".room-sign, .town-sign")).filter(shown).length;
  }, selector);
const walkersWalking = (p) => p.evaluate(() => [...(globalThis.__town?.walks?.walkers?.() ?? [])].filter((x) => x.walking).length).catch(() => -1);
/** What the polite status line says after a key, as one string. */
const announced = async (p, key, settle = 500) => {
  await p.keyboard.press(key);
  await p.waitForTimeout(settle);
  return (await p.locator("[aria-live=polite]").allInnerTexts()).join(" ").replace(/\s+/g, " ").trim();
};
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

await group("walk", async () => {
  // 1. Town, Demo label, text view completeness
  let p = await open();
  await town(p, 3000);
  await shot(p, "01-town");
  // The chip in the header says the data is scripted; since the scenario picker it is a button, "Demo: <scenario>".
  const chip = demoChip(p);
  ok("Demo chip visible", await chip.isVisible().catch(() => false), (await chip.innerText().catch(() => "")).trim());
  let tv = await text(p);
  ok("text view opens with demo line", /Demo mode/.test(tv), tv.slice(0, 80).replace(/\n/g, " | "));
  ok("text view lists buildings", /CrewHub World \(CR\)/.test(tv) && /crewhub-loops \(CL\)/.test(tv) && /Launch & Marketing \(MK\)/.test(tv));

  // 2. Keyboard: enter a building, move between rooms, zoom a room, Details, back out
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  await shot(p, "02-building");
  const crumb = await crumbs(p);
  ok("entered a building by keyboard", /Town/.test(crumb) && (await entered(p)) !== null, crumb);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(400);
  const status1 = await p.locator("[aria-live=polite]").allInnerTexts();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  await shot(p, "03-room");
  ok("room focus announced", status1.join(" ").trim().length > 0, status1.filter((s) => s.trim()).join(" | ").slice(0, 120));
  // Details (D): every label shows, the button says so, and D again takes them away. Back out of the room first, so the
  // count is the building's (a zoomed room already reveals its own labels).
  await p.keyboard.press("Escape");
  await p.waitForTimeout(900);
  const detailsButton = p.getByRole("button", { name: "Details (D)", exact: true });
  const before = await labels(p);
  await canvas(p).focus();
  await p.keyboard.press("d");
  await p.waitForTimeout(900);
  const during = await labels(p);
  const pressed = await detailsButton.getAttribute("aria-pressed").catch(() => null);
  const signs = await labels(p, ".world-labels .room-sign");
  await shot(p, "03b-details");
  await p.keyboard.press("d");
  await p.waitForTimeout(900);
  const after = await labels(p);
  ok("Details (D) shows more labels and toggles back", during > before && after === before, `${before} → ${during} → ${after}`);
  ok("Details button pressed state", pressed === "true", String(pressed));
  ok("Details on shows room signs", signs > 0, String(signs));
  for (let i = 0; i < 3; i++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  const home = await crumbs(p);
  const still = await entered(p);
  ok("Escape chain returns to the town", still === null, `${home} (entered: ${still})`);

  // 3. Speed control and scrub: stall, attention, release, stale
  await speed(p, "16x").catch((e) => log.push("16x " + e.message.split("\n")[0]));
  await p.waitForTimeout(2000);
  await p.getByRole("button", { name: "Pause", exact: true }).click().catch((e) => log.push("pause " + e.message.split("\n")[0]));
  // The times are the script's (packages/demo/src/script.ts): CR-24 stalls from 2:56 to 6:30, CL-44 needs attention from
  // 8:00, 0.3.0 is published at 11:04 and the probe is silent from 10:10 to 15:40.
  for (const [label, ms] of [["stall", 200000], ["attention", 510000], ["release", 665000], ["stale", 900000]]) {
    ok(`seek ${label}`, await seek(p, ms));
    await p.waitForTimeout(1500);
    const t = await text(p);
    if (label === "stall") ok("stall in text view", /stalled, quiet \d+ min/.test(t), (t.match(/stalled, quiet[^;\n]*/) ?? [""])[0]);
    if (label === "attention") ok("attention in text view", /attention/i.test(t));
    if (label === "release") ok("release in text view", /[Rr]elease/.test(t) && /published/i.test(t));
    if (label === "stale") ok("stale in text view", /stale|unknown/i.test(t));
    await shot(p, `04-${label}`);
  }

  // 4. Inside a building while playing: drone, walks
  await seek(p, 200000);
  await speed(p, "4x").catch((e) => log.push("4x " + e.message.split("\n")[0]));
  await canvas(p).focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1500);
  let walking = 0;
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(500);
    walking = Math.max(walking, await walkersWalking(p));
    if (i % 8 === 0) await shot(p, `05-live-${i}`);
  }
  tv = await text(p);
  ok("walkers seen (max at once)", walking > 0, String(walking));
  info(`drone transit line present at the end: ${/in transit/.test(tv)}`);
  await p.keyboard.press("Escape");

  // 5. Chat dock: open, send, scripted reply
  await p.locator("aside.dock button").first().click().catch((e) => log.push("dock " + e.message.split("\n")[0]));
  await p.waitForTimeout(800);
  await p.locator("textarea").first().fill("Hello from the browser regression pass");
  await p.getByRole("button", { name: "Send" }).click().catch((e) => log.push("send " + e.message.split("\n")[0]));
  await p.waitForTimeout(6000);
  const chat = await p.locator(".bubble-chat").innerText().catch(() => "");
  ok("chat message sent", /browser regression pass/.test(chat));
  ok("scripted reply arrived", /\(demo reply\)/.test(chat), chat.slice(-120).replace(/\n/g, " | "));
  await shot(p, "06-chat");
  await p.keyboard.press("Escape");

  // 6. Build mode: place, undo
  await canvas(p).focus();
  if ((await entered(p)) == null) await p.keyboard.press("Enter");
  await p.waitForTimeout(1200);
  await p.keyboard.press("b");
  await p.waitForTimeout(600);
  await shot(p, "07-build");
  const build = p.locator(".build-sheet");
  ok("build mode opens", /Build/.test(await build.innerText().catch(() => "")));
  // The palette is whatever the catalogue offers today: take its entries in order until one fits where the ghost starts.
  const status = build.locator(".build-status");
  const undo = build.getByRole("button", { name: "Undo", exact: true });
  const redo = build.getByRole("button", { name: "Redo", exact: true });
  const steps = async () => `undo ${(await undo.isEnabled().catch(() => null)) ? "on" : "off"}, redo ${(await redo.isEnabled().catch(() => null)) ? "on" : "off"}`;
  const stepsBefore = await steps();
  let placed = "";
  const entries = await build.locator(".build-palette .palette-item").count();
  for (let i = 0; i < Math.min(entries, 8) && !/Placed /.test(placed); i++) {
    await build.locator(".build-palette .palette-item").nth(i).click();
    await p.waitForTimeout(300);
    await canvas(p).focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(800);
    placed = (await status.innerText().catch(() => "")).replace(/\s+/g, " ");
  }
  const stepsPlaced = await steps();
  ok("place puts a prop down", /Placed /.test(placed) && /undo on/.test(stepsPlaced), (await build.locator(".build-message").innerText().catch(() => "")).trim() || placed.slice(0, 140));
  await p.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await p.waitForTimeout(500);
  // The sheet keeps its last message; the undo itself is announced, the step moves to Redo and the prop is selected no more.
  const undone = ((await p.locator("[aria-live=polite]").allInnerTexts()).join(" ").match(/Undone\./) ?? [""])[0];
  const stepsUndone = await steps();
  ok("undo takes the placement back", undone !== "" && /redo on/.test(stepsUndone) && !/redo on/.test(stepsPlaced), `${undone} (${stepsBefore} → ${stepsPlaced} → ${stepsUndone})`);
  await shot(p, "08-build-undo");
  // Round 48 (r48-ui U7): the prop editor is a dialog: the focus goes into it when it opens and back to the button that
  // opened it when it closes (it stayed on New prop behind the sheet, and fell to the page on close).
  const newProp = build.getByRole("button", { name: "New prop", exact: true });
  await newProp.focus();
  await p.keyboard.press("Enter");
  await p.waitForSelector(".editor-sheet", { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(300);
  const focusWhere = () => p.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? "body" : a.closest(".editor-sheet") ? "editor" : (a.textContent ?? "").trim().slice(0, 30); }).catch(() => "?");
  const inEditor = await focusWhere();
  await p.locator(".editor-sheet").getByRole("button", { name: "Close the prop editor" }).click().catch(() => {});
  await p.waitForSelector(".editor-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
  const afterEditor = await focusWhere();
  ok("the prop editor takes the focus when it opens and gives it back to New prop when it closes", inEditor === "editor" && afterEditor === "New prop", `open: ${inEditor}, closed: ${afterEditor}`);
  await p.keyboard.press("b");

  // 7. Settings: style, director, model calls, graphics, town export
  await p.getByRole("button", { name: /settings/i }).first().click().catch((e) => log.push("settings " + e.message.split("\n")[0]));
  await p.waitForTimeout(600);
  const settingsSheet = p.locator(".settings-sheet");
  const settings = await settingsSheet.innerText().catch(() => "");
  ok("settings show style Greenhouse", /Greenhouse/.test(settings));
  ok("settings show director off by default", /director/i.test(settings));
  ok("settings show model calls 0", /Model calls\s*0/.test(settings), (settings.match(/Model calls[^\n]*(\n[^\n]*)?/) ?? [""])[0].replace(/\n/g, " "));
  const graphics = settingsSheet.locator(".quality-setting select");
  ok("Graphics setting defaults to Pretty", (await graphics.inputValue().catch(() => "")) === "pretty");
  const shadows = () => p.evaluate(() => globalThis.__town?.renderer?.shadowMap?.enabled);
  await graphics.selectOption("fast");
  await p.waitForTimeout(600);
  const fast = await shadows();
  const stored = await p.evaluate(() => localStorage.getItem("crewhub-world.quality"));
  await graphics.selectOption("pretty");
  await p.waitForTimeout(600);
  const pretty = await shadows();
  ok("Graphics Fast/Pretty switch shadow maps and persist", fast === false && pretty === true && stored === "fast", `fast=${fast} pretty=${pretty} stored=${stored}`);
  const [download] = await Promise.all([
    p.waitForEvent("download", { timeout: 5000 }).catch(() => null),
    p.getByRole("button", { name: /export the town/i }).click().catch((e) => log.push("export " + e.message.split("\n")[0])),
  ]);
  ok("town export downloads a file", !!download, download ? download.suggestedFilename() : "");
  await shot(p, "09-settings");
  await p.keyboard.press("Escape");

  // 8. Where form
  await p.keyboard.press("t");
  await p.waitForTimeout(500);
  const whereSelect = sheet(p).locator("select").first();
  if (await whereSelect.count()) {
    const options = await whereSelect.locator("option").allTextContents();
    const pick = options.find((o) => /cl-lead|CL Lead/i.test(o)) ?? options[1];
    if (pick) await whereSelect.selectOption({ label: pick });
    await p.getByRole("button", { name: /where/i }).first().click().catch(() => {});
    await p.waitForTimeout(500);
  }
  const whereText = await sheet(p).innerText().catch(() => "");
  ok("where answers", /You are|is in|real avatar|town hall/i.test(whereText), (whereText.match(/(You are[^\n]*)/) ?? [""])[0].slice(0, 140));
  await shot(p, "10-where");
  await p.context().close();

  // 9. Reduced motion: no walkers moving
  p = await open({ reducedMotion: "reduce" });
  await town(p, 2000);
  await speed(p, "16x").catch(() => {});
  let moving = 0;
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(500);
    moving = Math.max(moving, await walkersWalking(p));
  }
  ok("reduced motion: no walking", moving === 0, String(moving));
  await shot(p, "11-reduced");
  await p.context().close();

  // 10. The theme button: system, light, dark and round again, and the scene draws in each
  p = await open();
  await town(p, 2000);
  const themes = [];
  let drawing = true;
  for (let i = 0; i < 3; i++) {
    await p.getByRole("button", { name: /^Theme: / }).click();
    await p.waitForTimeout(700);
    themes.push(await p.evaluate(() => document.documentElement.getAttribute("data-theme")));
    // A frame drawn after the switch: the canvas is there, has a size and holds a live WebGL context.
    drawing &&= await p.evaluate(() => {
      const c = document.querySelector("canvas");
      const gl = globalThis.__town?.renderer?.getContext?.();
      return !!c && c.width > 0 && c.height > 0 && (!gl || !gl.isContextLost());
    });
    if (themes.at(-1) === "dark") await shot(p, "11b-theme");
  }
  ok("theme button cycles and the scene keeps rendering", themes.join(" → ") === "light → dark → system" && drawing, themes.join(" → "));
  await p.context().close();

  // 11. Phone and dark
  for (const scheme of ["light", "dark"]) {
    p = await open({ viewport: { width: 375, height: 812 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    await town(p, 2500);
    await shot(p, `12-375-${scheme}-town`);
    const sc = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`375 ${scheme}: no horizontal scroll`, sc.sw <= sc.cw, `${sc.sw}/${sc.cw}`);
    const small = await p.evaluate(() => [...document.querySelectorAll("button, a, input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(e).visibility !== "hidden"; }).map((e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24)));
    info(`375 ${scheme} targets under 40px (visible box): ${small.length} ${small.slice(0, 8).join(", ")}`);
    // A building's sign is a quiet name, smaller than a finger: its ::after pad is what is tapped.
    const pads = await p.evaluate(() => [...document.querySelectorAll("button.town-sign")].flatMap((e) => { const s = getComputedStyle(e, "::after"); return s.content === "none" ? [0, 0] : [Math.round(parseFloat(s.width)), Math.round(parseFloat(s.height))]; }));
    ok(`375 ${scheme}: building signs have 40px hit pads`, pads.length > 0 && pads.every((n) => n >= 40), pads.join(","));
    await p.context().close();
  }
  p = await open({ colorScheme: "dark" });
  await town(p, 2500);
  await shot(p, "13-dark-town");
  await p.context().close();
});

await group("demo", async () => {
  // 15. The new loops events (spec addendum, round 7): the storyline's quiet fact (CR-17 at 8:10) puts dust and a
  // clock tag on the package and a line in the text view; an automation run (8:40 on CR-20, 8:52 failed on CL-76)
  // pins a card on the board by the front door and leaves a line. Each check waits for the model's state (a quiet
  // object, a pinned card), never for the clock, and enters the building by its slug (Enter walks the town in its
  // own order).
  const model = (fn) => p.evaluate((src) => { const t = globalThis.__town; const m = t?.view?.model; return m ? new Function("m", "t", `return (${src})(m, t)`)(m, t) : null; }, fn.toString()).catch(() => null);
  const untilModel = async (check, ms = 20000) => { const d = Date.now() + ms; while (Date.now() < d) { if (await model(check)) return true; await p.waitForTimeout(250); } return false; };
  const pause = () => p.getByRole("button", { name: "Pause", exact: true }).click().catch((e) => log.push("pause " + e.message.split("\n")[0]));
  const enterSlug = async (slug) => {
    await canvas(p).focus();
    for (let i = 0; i < 8; i++) {
      await p.keyboard.press("Enter");
      await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(1200);
      if ((await entered(p)) === slug) return true;
      for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
      await p.waitForTimeout(800);
      await canvas(p).focus();
      await p.keyboard.press("ArrowRight");
    }
    return false;
  };
  let p = await open();
  await town(p, 2500);
  // a. ticket.quiet: dust and the words
  ok("seek before the quiet fact", await seek(p, 485000));
  await speed(p, "16x").catch((e) => log.push("16x " + e.message.split("\n")[0]));
  ok("a quiet object in the model within 20 s of play", await untilModel((m) => m.buildings.some((b) => b.objects.some((o) => o.quiet))));
  await pause();
  const quiet = await model((m) => m.buildings.flatMap((b) => b.objects.filter((o) => o.quiet).map((o) => `${o.key} ${o.quiet.status} ${o.quiet.minutes} min`)));
  ok("the quiet fact is CR-17 in review for 30 min", (quiet ?? []).includes("CR-17 review 30 min"), JSON.stringify(quiet));
  ok("entered crewhub", await enterSlug("crewhub"));
  await p.keyboard.press("d");
  await p.waitForTimeout(1200);
  const tags = await p.locator(".world-labels .quiet-tag").allInnerTexts().catch(() => []);
  ok("the clock tag on the dusty package says quiet 30 min", tags.some((t) => /quiet 30 min/.test(t)), tags.join(" | "));
  const quietText = await text(p);
  ok("quiet in the text view", /CR-17 has been quiet in Review for 30 min \(since \d\d:\d\d\): dust on it, a clock tag "quiet 30 min"\./.test(quietText), (quietText.match(/CR-17 has been quiet[^\n]*/) ?? [""])[0]);
  await shot(p, "16-quiet");
  await p.keyboard.press("d");
  for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  // b. automation.ran: the card on the board and the lines
  ok("seek before the first run", await seek(p, 519000));
  await speed(p, "4x").catch((e) => log.push("4x " + e.message.split("\n")[0]));
  ok("a card pinned on crewhub's board within 20 s of play", await untilModel((m) => m.buildings.some((b) => b.slug === "crewhub" && b.board.some((c) => c.from <= m.now))));
  await pause();
  ok("entered crewhub again", await enterSlug("crewhub"));
  const cards = await p.locator(".world-labels .board-card").allInnerTexts().catch(() => []);
  ok("the card by the front door names the run and its change", cards.some((c) => /Automation "Label stale bugs" ran on CR-20: done; labels changed by the automation/.test(c)), cards.join(" | "));
  const boardText = await text(p);
  ok("the card in the text view", /A card on the board by the front door: Automation "Label stale bugs" ran on CR-20: done/.test(boardText), (boardText.match(/A card on the board[^\n]*/) ?? [""])[0]);
  ok("the run as a line in the text view", /^Automation "Label stale bugs" ran on CR-20: done; labels changed by the automation\.$/m.test(boardText));
  await shot(p, "16-board");
  for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  // c. a failed run says so in words
  ok("seek before the failed run", await seek(p, 530000));
  await speed(p, "4x").catch((e) => log.push("4x " + e.message.split("\n")[0]));
  ok("a failed card pinned on crewhub-loops' board within 20 s of play", await untilModel((m) => m.buildings.some((b) => b.slug === "crewhub-loops" && b.board.some((c) => c.outcome === "failed" && c.from <= m.now))));
  await pause();
  ok("entered crewhub-loops", await enterSlug("crewhub-loops"));
  const failed = await p.locator(".world-labels .board-card.failed").allInnerTexts().catch(() => []);
  ok("the failed card says failed", failed.some((c) => /Automation "Nudge the reviewer" ran on CL-76: failed/.test(c)), failed.join(" | "));
  const failedText = await text(p);
  ok("the failure in the text view", /Automation "Nudge the reviewer" ran on CL-76: failed\./.test(failedText));
  await shot(p, "16-board-failed");
  for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  // d. Round 9: a snapshot carries the facts the log holds. A seek loads a fresh snapshot, nothing plays: the quiet
  // fact and the runs are there at once, as in a tab opened after the quiet job spoke.
  ok("seek after the quiet fact, paused", await seek(p, 500000));
  await p.waitForTimeout(1500);
  const carriedQuiet = await text(p);
  ok("a fresh snapshot carries the quiet fact: the dust is there without playing", /CR-17 has been quiet in Review for 30 min/.test(carriedQuiet), (carriedQuiet.match(/CR-17 has been quiet[^\n]*/) ?? ["no quiet line"])[0]);
  ok("seek just after the first run, paused", await seek(p, 521000));
  await p.waitForTimeout(1500);
  const carriedRuns = await text(p);
  ok("a fresh snapshot carries the run: the card is pinned and the line is there", /A card on the board by the front door: Automation "Label stale bugs" ran on CR-20: done/.test(carriedRuns) && /^Automation "Label stale bugs" ran on CR-20: done/m.test(carriedRuns), (carriedRuns.match(/A card on the board[^\n]*/) ?? ["no card line"])[0]);
  ok("seek past the comment that ends the quiet stretch", await seek(p, 700000));
  await p.waitForTimeout(1500);
  const ended = await text(p);
  ok("after the comment the snapshot carries no quiet for CR-17", !/CR-17 has been quiet/.test(ended));
  await p.context().close();
  // 14. Round 17: the demo's dock answers feed the same store as the live bubbles: a message to an agent in the dock, its
  // scripted reply as a bubble over the agent, the text view's Recent answers row, and that row opening the agent's card.
  p = await open();
  await town(p, 2000);
  await p.locator("aside.dock button").first().click().catch(() => {});
  await p.waitForTimeout(800);
  await p.locator("textarea").first().fill("Is the reading nook done? (regress, round 17)");
  await p.getByRole("button", { name: "Send" }).click().catch(() => {});
  const demoBubble = p.locator(".bubble.said");
  await demoBubble.first().waitFor({ timeout: 20000 }).catch(() => {});
  const demoBubbleAgent = await demoBubble.first().getAttribute("data-said-agent").catch(() => null);
  const demoBubbleText = (await demoBubble.first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.keyboard.press("t");
  await p.waitForSelector("#text-view .text-recent", { timeout: 5000 }).catch(() => {});
  const demoRecent = (await p.locator("#text-view .text-recent").innerText().catch(() => "")).replace(/\s+/g, " ");
  const demoRows = await p.locator("#text-view .text-recent .recent-row").evaluateAll((els) => els.map((el) => ({ agent: el.getAttribute("data-answer-agent"), label: el.getAttribute("aria-label") }))).catch(() => []);
  await shot(p, "19-demo-recent-answers");
  await p.locator("#text-view .text-recent .recent-row").first().click().catch(() => {});
  await p.locator(".agent-card").first().waitFor({ timeout: 3000 }).catch(() => {});
  const demoCard = (await p.locator(".agent-card").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("demo (round 17): the dock's scripted reply shows as a bubble over the agent, the text view's Recent answers lists it with the demo reply's words, and its row opens that agent's card", demoBubbleAgent !== null && /\(demo reply\)/.test(demoBubbleText) && /^Recent answers \(1\)/.test(demoRecent) && demoRows.length === 1 && demoRows[0].agent === demoBubbleAgent && /\(demo reply\)/.test(demoRows[0].label ?? "") && /Open .*'s card$/.test(demoRows[0].label ?? "") && demoCard !== "", `bubble over ${demoBubbleAgent}: "${demoBubbleText.slice(0, 60)}"; rows ${JSON.stringify(demoRows).slice(0, 160)}; card: ${demoCard.slice(0, 60) || "none"}`);
  await p.context().close();
});

await group("demo", async () => {
  // 12. The jump list: / opens it, a building's name narrows it, Enter lands inside that building.
  let p = await open();
  await town(p, 2500);
  await canvas(p).focus();
  await p.keyboard.press("/");
  const dialog = p.getByRole("dialog", { name: "Jump to" });
  const opened = await dialog.waitFor({ timeout: 3000 }).then(() => true, () => false);
  const field = dialog.getByRole("combobox");
  ok("jump list opens on / with the search focused", opened && (await field.evaluate((e) => document.activeElement === e).catch(() => false)));
  await p.keyboard.type("crewhub-loops");
  await p.waitForTimeout(400);
  const top = (await dialog.getByRole("option").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await shot(p, "14-jump");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  const slug = await entered(p);
  const where = await crumbs(p);
  ok("jump list: Enter lands inside the named building", slug != null && /crewhub-loops/.test(where) && !(await dialog.isVisible().catch(() => false)), `"${top.slice(0, 50)}" → ${where} (entered: ${slug})`);
  await shot(p, "15-jumped");
  // 12b. A figure outside the buildings: the jump list lands beside the postman in the town, selected; Enter opens its card there.
  await canvas(p).focus();
  await p.keyboard.press("/");
  await dialog.waitFor({ timeout: 3000 }).catch(() => {});
  await p.keyboard.type("postman");
  await p.waitForTimeout(400);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(1500);
  await canvas(p).focus();
  await p.keyboard.press("Enter");
  const townCard = p.locator(".agent-card");
  await townCard.first().waitFor({ timeout: 3000 }).catch(() => {});
  const townCardText = (await townCard.first().innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("jump list: the postman's card opens in the town", (await entered(p)) == null && (await townCard.count()) > 0 && /the post office/.test(townCardText), townCardText.slice(0, 100) || "no card");
  await shot(p, "15b-town-card");
  await p.context().close();

  // 12c. Round 48 (r48-unknown U5): a card that cannot be drawn says so in its place, and the town stays (it used to
  // take the canvas with it, as a graphics failure). The AgentCard module Vite serves this one page throws when it
  // renders: a route of this check's own, the app has no switch for it. Its console errors are the throw's, on purpose,
  // so this page keeps its own list instead of the run's.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    await ctx.route(/\/src\/components\/AgentCard\.tsx(\?|$)/, async (route) => {
      // Read through the context's request client (the module as Vite serves it), then served rewritten.
      const original = await ctx.request.get(route.request().url());
      const body = (await original.text()).replace("export function AgentCard(", 'export function AgentCard() {\n  throw new Error("regress: this card throws on purpose");\n}\nfunction AgentCardDrawn(');
      await route.fulfill({ status: original.status(), headers: original.headers(), body });
    });
    const pg = await ctx.newPage();
    watch(pg, origin, [], "card throws");
    await town(pg, 2000);
    await canvas(pg).focus();
    await pg.keyboard.press("/");
    await pg.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.type("postman");
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(1500);
    await canvas(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(800);
    const failed = (await pg.locator(".agent-card-failed").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const canvases = await pg.locator(".canvas-host canvas").count();
    const fallback = await pg.locator(".text-sheet.fallback").count();
    ok("a card that cannot be drawn says so in its place, and the town stays", /could not be drawn/.test(failed) && canvases > 0 && fallback === 0, `card "${failed.slice(0, 80)}", canvas ${canvases}, graphics-failure text view ${fallback}`);
    await shot(pg, "15c-card-failed");
    await ctx.close();
  }

  // 13. The scenario picker: the Demo chip opens it, One project changes the town, Small team brings it back.
  p = await open();
  await town(p, 2000);
  const menu = p.getByRole("menu", { name: "Demo scenario" });
  const pick = async (name) => {
    await demoChip(p).click();
    await menu.waitFor({ timeout: 3000 });
    const items = await menu.getByRole("menuitemradio").allInnerTexts();
    const checked = (await menu.getByRole("menuitemradio", { checked: true }).innerText().catch(() => "")).split("\n")[0];
    if (name) {
      const before = p.url();
      await menu.getByRole("menuitemradio", { name }).click();
      await p.waitForURL((u) => u.toString() !== before, { timeout: 8000 }).catch(() => {});
      await dressed(p);
      await p.waitForTimeout(1500);
    }
    return { items: items.map((t) => t.split("\n")[0]), checked };
  };
  const first = await pick(null);
  ok("scenario picker opens on the Demo chip", first.items.length >= 3 && first.checked === "Small team", `${first.items.join(", ")}; checked: ${first.checked}`);
  await shot(p, "16-picker");
  await p.keyboard.press("Escape");
  const one = await pick("One project");
  const chipOne = (await demoChip(p).innerText().catch(() => "")).trim();
  const tvOne = await text(p);
  ok("scenario picker: One project loads a different town", /One project/.test(chipOne) && /Pocket Garden \(PG\)/.test(tvOne) && !/crewhub-loops \(CL\)/.test(tvOne), `${chipOne}; ${new URL(p.url()).search}; was ${one.checked}`);
  await shot(p, "17-one-project");
  const back = await pick("Small team");
  const chipBack = (await demoChip(p).innerText().catch(() => "")).trim();
  const tvBack = await text(p);
  ok("scenario picker: back to Small team", back.checked === "One project" && /Small team/.test(chipBack) && /crewhub-loops \(CL\)/.test(tvBack), `${chipBack}; ${new URL(p.url()).search}`);
  await p.context().close();

  // 14. The Studio scenario's Region level: district cards, a beacon, a pin, into a district and a building, and the
  // Escape chain back out to the Region.
  p = await open();
  await town(p, 3000, `${BASE}?scenario=studio`);
  const cards = p.locator(".district-card");
  const cardCount = await cards.count();
  const shown = await drawn(p, ".district-card");
  ok("studio: the Region level shows district cards", shown >= 2 && (await level(p)) === "Region", `${shown} of ${cardCount} cards drawn; at "${await level(p)}" (levels ${await levels(p)})`);
  await shot(p, "18-region");
  const beacons = await p.locator(".district-card.beacon").count();
  const beaconWords = await p.locator(".district-card.beacon .district-needs").first().innerText().catch(() => "");
  ok("studio: a district that needs a person carries a beacon", beacons > 0 && /Needs a person/.test(beaconWords), `${beacons} of ${cardCount} districts; ${beaconWords.slice(0, 80)}`);
  const pins = p.locator(".need-pin");
  const pinCount = await pins.count();
  const pinLabel = (await pins.first().getAttribute("aria-label").catch(() => "")) ?? "";
  ok("studio: a building that needs a person carries a pin", pinCount > 0 && (await drawn(p, ".need-pin")) > 0 && /needs a person/.test(pinLabel), `${pinCount} pins; ${pinLabel.slice(0, 90)}`);
  const card = cards.first();
  const districtName = (await card.locator("strong").innerText().catch(() => "")).trim();
  await card.click();
  await p.waitForTimeout(2000);
  const atDistrict = await level(p);
  ok("studio: a district card goes to the district", (await levels(p)) === "2" && atDistrict === districtName && atDistrict !== "", `${atDistrict} (levels ${await levels(p)})`);
  await shot(p, "19-district");
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  const inBuilding = await entered(p);
  ok("studio: a building entered from the district", inBuilding != null && (await levels(p)) === "3", `${await level(p)} (entered: ${inBuilding}, levels ${await levels(p)})`);
  await shot(p, "20-studio-building");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  const step1 = { levels: await levels(p), at: await level(p), entered: await entered(p) };
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1500);
  const step2 = { levels: await levels(p), at: await level(p) };
  ok("studio: Escape goes building → district → Region", step1.entered == null && step1.levels === "2" && step1.at === districtName && step2.levels === "1" && step2.at === "Region", `${step1.at} (${step1.levels}) → ${step2.at} (${step2.levels})`);
  await shot(p, "21-region-again");
  await p.context().close();
});

// The introduction inside the world (round 20): a first-run tour over the demo town. The world takes a browser that says
// navigator.webdriver for a tool's and never starts the tour in it by itself (so no other group or tool sees it); this
// group's browsers say false, as a person's does, so the fresh-browser road is the real one.
await group("tour", async () => {
  const person = async (options = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", ...options });
    await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    const pg = await ctx.newPage();
    watch(pg, origin, problems, "tour");
    return pg;
  };
  const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const inside = (box, width, height) => !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
  const count = (pg) => pg.locator(".tour-count").innerText().then((t) => t.trim()).catch(() => "");
  const focusIn = (pg) => pg.evaluate(() => (document.querySelector(".tour-card")?.contains(document.activeElement) === true ? (document.activeElement?.textContent?.trim() ?? "") : "outside")).catch(() => "no page");

  const pg = await person();
  await pg.goto(BASE);
  await dressed(pg, 60000).catch(() => {});
  const card = pg.locator(".tour-card");
  await card.waitFor({ timeout: 10000 }).catch(() => {});
  ok("tour: a fresh browser sees step 1 of 6 over the town, as a dialog named by its title", (await card.count()) === 1 && (await count(pg)) === "Step 1 of 6" && (await card.getAttribute("role")) === "dialog" && (await pg.locator(".tour-title").innerText().catch(() => "")) === "The town" && (await pg.evaluate(() => { const d = document.querySelector(".tour-card"); return document.getElementById(d?.getAttribute("aria-labelledby") ?? "")?.textContent === "The town"; })), await count(pg));
  ok("tour: the focus moved into the card, on Next", (await focusIn(pg)) === "Next", await focusIn(pg));
  await pg.keyboard.press("Tab");
  const cycled = await focusIn(pg);
  await pg.keyboard.press("Shift+Tab");
  ok("tour: Tab cycles in the card (Next → Skip and back)", cycled === "Skip" && (await focusIn(pg)) === "Next", cycled);
  await shot(pg, "41-tour-step1");
  await pg.getByRole("button", { name: "Next" }).click();
  await pg.waitForTimeout(400);
  const ring = await pg.locator(".tour-spot").boundingBox().catch(() => null);
  const jump = await pg.locator(".jump-button").boundingBox().catch(() => null);
  const text2 = (await pg.locator(".tour-text").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("tour: step 2 rings the jump list button and names it to a screen reader", (await count(pg)) === "Step 2 of 6" && !!ring && !!jump && ring.x <= jump.x && ring.y <= jump.y && ring.x + ring.width >= jump.x + jump.width && ring.y + ring.height >= jump.y + jump.height && /Highlighted on the screen: Jump to a district, project or agent\./.test(text2), text2.slice(-80));
  const cardBox = await card.boundingBox();
  ok("tour: the card does not cover what it describes", !overlaps(cardBox, jump) && inside(cardBox, 1440, 900));
  await shot(pg, "42-tour-step2");
  await pg.getByRole("button", { name: "Back" }).click();
  await pg.waitForTimeout(200);
  ok("tour: Back returns to step 1", (await count(pg)) === "Step 1 of 6", await count(pg));
  await pg.getByRole("button", { name: "Skip" }).click();
  await pg.waitForTimeout(200);
  const flag = await pg.evaluate(() => localStorage.getItem("crewhub-world.tour")).catch(() => null);
  ok("tour: Skip closes it and the browser remembers", (await card.count()) === 0 && flag === "done", String(flag));
  await pg.reload();
  await dressed(pg, 60000).catch(() => {});
  await pg.waitForTimeout(2500);
  ok("tour: after Skip and a reload it does not come back", (await card.count()) === 0);
  // Settings reopens it; the sheet closes so the card stands over the town; Escape skips it and the focus goes back to Settings.
  await pg.getByRole("button", { name: "Settings", exact: true }).click();
  await pg.getByRole("button", { name: "Show the introduction" }).click();
  await card.waitFor({ timeout: 3000 }).catch(() => {});
  ok("tour: Settings › Show the introduction reopens it, Settings closed, the focus inside", (await card.count()) === 1 && (await pg.locator(".settings-sheet").count()) === 0 && (await focusIn(pg)) === "Next", await focusIn(pg));
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);
  const backOn = await pg.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName).catch(() => "");
  ok("tour: Escape skips it and the focus returns to the Settings button", (await card.count()) === 0 && backOn === "Settings", backOn);
  // The "?" menu: Show the introduction, and the link to the document.
  await pg.getByRole("button", { name: "Help" }).click();
  const items = (await pg.locator('[role="menu"] [role="menuitem"]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
  ok("tour: the ? menu offers the introduction and the document", items.some((t) => /^Show the introduction/.test(t)) && items.some((t) => /^Read the introduction/.test(t)), items.join(" | "));
  await pg.getByRole("menuitem", { name: /Show the introduction/ }).click();
  await card.waitFor({ timeout: 3000 }).catch(() => {});
  ok("tour: the ? menu reopens it", (await card.count()) === 1);
  await pg.keyboard.press("Escape");
  await pg.context().close();
  // A phone: the card spans the width at the far edge from what it describes, inside the screen, no horizontal scroll.
  const phone = await person({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
  await phone.goto(BASE);
  await dressed(phone, 60000).catch(() => {});
  const phoneCard = phone.locator(".tour-card");
  await phoneCard.waitFor({ timeout: 10000 }).catch(() => {});
  const box1 = await phoneCard.boundingBox();
  ok("tour: on a phone step 1 fits the screen", inside(box1, 375, 812) && (await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)), box1 ? `${Math.round(box1.x)},${Math.round(box1.y)} ${Math.round(box1.width)}x${Math.round(box1.height)}` : "no card");
  await phone.getByRole("button", { name: "Next" }).click();
  await phone.waitForTimeout(400);
  const box2 = await phoneCard.boundingBox();
  const jump2 = await phone.locator(".jump-button").boundingBox().catch(() => null);
  ok("tour: on a phone step 2 does not cover the jump button", inside(box2, 375, 812) && !overlaps(box2, jump2), box2 && jump2 ? `card y ${Math.round(box2.y)}, button y ${Math.round(jump2.y)}` : "no boxes");
  await shot(phone, "43-tour-phone");
  await phone.getByRole("button", { name: "Skip" }).click();
  await phone.context().close();
});

await group("live", async () => {
  // 15. Live mode against a fake crewhub-loops behind the host, both started here on 127.0.0.1.
  const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const dist = DIST;
  const served = DIST_SERVED;
  const hostPort = Number(opts["host-port"]);
  if (!served && (!Number.isInteger(hostPort) || hostPort <= 0)) opts.fail("--host-port <port> must be a port number");
  if (served) info(`live: ${distFresh}`);
  const fakeOptions = { heartbeatMs: 1000 };
  let fake = noteLoops(await createLoopsFake(fakeOptions));
  // The loops web app the host names (`loopsWebUrl`), for the Chat panel's frame: a stub page that records how it was fetched.
  const web = noteLoops(await createLoopsWebStub());
  const hostOptions = { loopsUrl: fake.url, loopsWebUrl: web.url, key: fake.key, keyName: fake.keyName, retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000, log: () => undefined };
  const host = await createHost(served ? { ...hostOptions, staticDir: dist } : { ...hostOptions, port: hostPort, allowedOrigins: [origin] });
  const liveOrigin = served ? host.url : origin;
  // The page is opened without `?source=live`: the source is `auto`, the probe finds the host and the health it answers
  // is what the sign-in link follows (an override skips the probe, and the link would fall back to the default URL).
  const liveBase = `${liveOrigin}/`;
  const pairing = typeof host.mintPairLink === "function";
  info(`live: fake on 127.0.0.1:${fake.port}, loops web stub on 127.0.0.1:${web.port}, host on 127.0.0.1:${host.port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`}; pairing ${pairing ? "on" : "not present"}`);
  const openLive = async (into = problems) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const pg = await ctx.newPage();
    watch(pg, liveOrigin, into, "live");
    return pg;
  };
  const chip = (pg) => pg.locator(".connection-chip").first();
  const state = (pg) => chip(pg).getAttribute("data-connection").catch(() => null);
  /** Waits for the connection chip to say `wanted` and answers what it says then. */
  const until = async (pg, wanted, timeout) => {
    await pg.waitForSelector(`.connection-chip[data-connection="${wanted}"]`, { timeout }).catch(() => {});
    return state(pg);
  };
  try {
    if (pairing) {
      // Without the cookie: the API refuses and the world asks to pair, naming the command and never the link. The
      // refused request is a console error in the browser (it is what it is meant to be), so it is kept apart.
      const own = [];
      const bare = await openLive(own);
      const status = await bare.request.get(`${liveOrigin}/world-api/snapshot`).then((r) => r.status()).catch(() => 0);
      await bare.goto(liveBase);
      await bare.waitForTimeout(3000);
      const page = await bare.locator(".pair-page").count();
      const body = (await bare.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok("pairing: /world-api answers 401 without a cookie", status === 401, String(status));
      ok("pairing: the world asks to pair this browser", page > 0 && /Pair this browser/i.test(body) && /npm run world/.test(body) && !/\/pair\//.test(body), body.slice(0, 160));
      await shot(bare, "22-pair-page");
      await bare.context().close();
      problems.push(...own.filter((x) => !/401/.test(x.text)));
    } else info("live: the host has no mintPairLink, so the two pairing checks are skipped");

    const pg = await openLive();
    if (pairing) {
      // Behind the Vite proxy the link must open on Vite's origin (it proxies /pair); on the host's own when it serves dist.
      const link = host.mintPairLink(served ? undefined : origin);
      await pg.goto(link);
      await pg.waitForTimeout(500);
      ok("pairing: the one-time link lands on /", new URL(pg.url()).pathname === "/" && new URL(pg.url()).origin === liveOrigin, new URL(pg.url()).pathname);
    }
    await pg.goto(liveBase);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    const live1 = await until(pg, "live", 20000);
    ok("live: the chip says Live against the fake", live1 === "live", `${live1}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "23-live");
    // The Chat panel (round 12, road A): the chip opens a panel that frames the loops web the host names (the stub page
    // of lib/loopsWebStub.mjs here, which records how it was fetched), says it is loops' own chat and what it needs,
    // keeps the link to the app, and grants the frame no more than the chat needs; the panel takes the focus, Escape
    // closes it and the focus returns to the chip; from a card the panel is that agent's and its close button returns
    // the focus to the card; on a phone the panel is the whole screen.
    await pg.locator(".chat-open").click();
    await pg.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const frame = pg.locator(".chat-sheet iframe.chat-frame");
    const src = await frame.getAttribute("src").catch(() => null);
    await pg.frameLocator(".chat-sheet iframe.chat-frame").locator("[data-stub=loops-web]").waitFor({ timeout: 10000 }).catch(() => {});
    const framed = web.requests.filter((r) => r.dest === "iframe");
    ok("live: the Chat chip opens the Chat panel, which frames the loops web the host names", src === `${web.url}/` && framed.length > 0, `src ${src}; ${web.requests.length} requests to the stub, ${framed.length} as a frame (Sec-Fetch-Site ${framed[0]?.site ?? "none"})`);
    // Round 17: in one glance, two short lines (what this is, the one thing to do on this road) above Recent answers; the
    // whole story behind "About this chat", a details element the keyboard opens (Tab to its summary, Enter). This group's
    // fake does not let the key read the chat, so the road's line says no bubbles here (the chat group checks the key road).
    const glance = async (p) => p.locator(".chat-sheet-lead").evaluate((el) => { const lh = parseFloat(getComputedStyle(el).lineHeight) || 20; const lines = (sel) => Math.round(el.querySelector(sel).getBoundingClientRect().height / lh); return { what: el.querySelector(".chat-sheet-what")?.textContent ?? "", todo: el.querySelector(".chat-sheet-todo")?.textContent ?? "", whatLines: lines(".chat-sheet-what"), todoLines: lines(".chat-sheet-todo"), aboveList: Math.round(el.closest(".card-body").querySelector(".chat-recent").getBoundingClientRect().top - el.getBoundingClientRect().top), aboutOpen: el.closest(".card-body").querySelector(".chat-about")?.open ?? null }; }).catch(() => null);
    // Round 28: the page's own probe of road 2 asks the loops web origin the host names (the stub, which answers no CORS
    // header), so its verdict is "the origin is not set" and the glance says so; wait for it, so the words are the verdict's.
    await pg.waitForFunction(() => window.__worldStores?.().pageChat?.probe === "origin-not-set", null, { timeout: 10000 }).catch(() => {});
    const g = await glance(pg);
    const closedText = (await pg.locator(".chat-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    await pg.locator(".chat-about > summary").focus().catch(() => {});
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(200);
    const panelText = (await pg.locator(".chat-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    const aboutOpen = await pg.locator(".chat-about").evaluate((el) => el.open).catch(() => null);
    const appHref = await pg.locator(".chat-sheet .chat-open-app").getAttribute("href").catch(() => null);
    ok("live (round 17): the panel reads in one glance: crewhub-loops' own chat and the one thing to do on this road (no viewer key, and the page's probe of road 2 finds the world's origin not set on this loops: no bubbles here), two short lines above Recent answers; the whole story (what typing needs, no password, and since round 18 what the Recent answers list is) behind About this chat, which Enter on its summary opens; the link to the app", g !== null && /^crewhub-loops' own chat, framed here\.$/.test(g.what) && /^Sign in to crewhub-loops below to type; no bubbles: the world's origin is not set on crewhub-loops \(see About\)\.$/.test(g.todo) && g.whatLines === 1 && g.todoLines <= 2 && g.aboutOpen === false && !/signed in to crewhub-loops as a person/.test(closedText) && !/The last 10 answers this page saw/.test(closedText) && aboutOpen === true && /signed in to crewhub-loops as a person/.test(panelText) && /no password/.test(panelText) && /chat head in loops' dock/.test(panelText) && /The last 10 answers this page saw, newest first/.test(panelText) && appHref === web.url, g ? `"${g.what}" / "${g.todo}" (${g.whatLines}+${g.todoLines} lines, the list ${g.aboveList} px below); about open before ${g.aboutOpen}, after Enter ${aboutOpen}; ${appHref}` : "no lead");
    const sandbox = await frame.getAttribute("sandbox").catch(() => null);
    const allow = await frame.getAttribute("allow").catch(() => null);
    ok("live: the frame's sandbox is no wider than the chat needs", sandbox === "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" && allow === "clipboard-write", `sandbox "${sandbox}", allow "${allow}"`);
    await shot(pg, "23b-chat-panel");
    const focusInside = await pg.evaluate(() => !!document.querySelector(".chat-sheet")?.contains(document.activeElement));
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(300);
    const closed = (await pg.locator(".chat-sheet").count()) === 0;
    const backOnChip = await pg.evaluate(() => document.activeElement?.classList.contains("chat-open") ?? false);
    ok("live: the panel takes the focus; Escape closes it and the focus returns to the chip", focusInside && closed && backOnChip, `focus inside ${focusInside}, closed ${closed}, back on the chip ${backOnChip}`);
    // From a card: the jump list lands beside cl-lead, Enter opens its card, its Chat button opens the panel for it.
    await canvas(pg).focus();
    await pg.keyboard.press("/");
    await pg.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.type("cl-lead");
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Enter");
    await pg.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    await canvas(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
    // Round 22: the card's Work says what cl-lead holds (the fake's board: six open tickets, CL-45 on its desk, CL-80
    // in review waiting on Nicky), the Answers section says why no answer can be known on this road (the host keeps no
    // session here, or a plain key with nobody signed in), and Lane, Projects and Recent sit behind a closed More
    // disclosure that opens on a click.
    await pg.waitForFunction(() => !/Reading the last progress line/.test(document.querySelector(".agent-card")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const leadCard = (await pg.locator(".agent-card").innerText().catch(() => "")).replace(/\s+/g, " ");
    const holds = /Holds\s*6 open tickets: 3 in progress, 2 review, 1 planned; 1 waits on Nicky/.test(leadCard);
    const listed = /CL-80 .*review, waits on Nicky/.test(leadCard) && /CL-81/.test(leadCard) && !/CL-45 .*in progress\b.*CL-45/.test(leadCard);
    // Round 24: the fake's CL-40 (the analyst's, in progress) waits on cl-lead, so the card says who waits on it and who holds it.
    const waited = /Waited on by\s*1 open ticket of others\s*CL-40 .*in progress, Analyst holds it/.test(leadCard);
    // The headings read uppercased (the eyebrow's text-transform), so the section names match case-insensitively.
    const answers = /Answers\s*(No answers can arrive here: this crewhub-loops does not let the world's key read the chat|No answer from it since this page opened)/i.test(leadCard);
    // The line is the agent's own from the fake's events (CL-81), else CL-45's read from the source, else the honest words.
    const progressSaid = /\b(start|update|done|question) on CL-\d+, (just now|\d+ (min|h) ago)|No progress line: none seen since this page opened, and CL-45 has none\./.test(leadCard);
    const moreClosed = (await pg.locator("details.agent-card-more:not([open])").count()) === 1 && !(await pg.locator(".agent-card h3", { hasText: /^Lane$/ }).isVisible().catch(() => true));
    ok("live (round 22, 24): the card says what cl-lead holds and whom it waits on, who waits on it, why no answer can be known with a plain key, and the progress line or its absence", holds && listed && waited && answers && progressSaid, `holds ${holds}, listed ${listed}, waited on by ${waited}, answers ${answers}, progress ${progressSaid}: ${leadCard.slice(0, 1200)}`);
    await pg.locator("details.agent-card-more > summary").click().catch(() => {});
    await pg.waitForTimeout(200);
    const laneAfter = await pg.locator(".agent-card h3", { hasText: /^Lane$/ }).isVisible().catch(() => false);
    const moreText = (await pg.locator("details.agent-card-more").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("live (round 22): Lane, Projects and Recent sit behind More, closed at first and open on a click", moreClosed && laneAfter && /Lane/.test(moreText) && /Projects/.test(moreText), `closed before ${moreClosed}, Lane shown after ${laneAfter}; ${moreText.slice(0, 120)}`);
    await shot(pg, "23c0-card-round22");
    await pg.locator(".agent-card .agent-chat").click().catch(() => {});
    await pg.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const title = (await pg.locator(".chat-sheet .card-title").first().innerText().catch(() => "")).trim();
    const forAgent = await pg.locator(".chat-sheet").getAttribute("data-agent").catch(() => null);
    const cardSrc = await frame.getAttribute("src").catch(() => null);
    await pg.frameLocator(".chat-sheet iframe.chat-frame").locator("[data-stub=loops-web]").waitFor({ timeout: 10000 }).catch(() => {});
    const asked = web.requests.filter((r) => r.path === "/?chat=cl-lead" && r.dest === "iframe");
    ok("live: from a card the frame asks loops for that agent's chat (?chat=<id>), and the stub was fetched so as a frame", cardSrc === `${web.url}/?chat=cl-lead` && asked.length > 0, `src ${cardSrc}; ${asked.length} framed request(s) with the query`);
    await shot(pg, "23c-chat-from-card");
    await pg.getByRole("button", { name: "Close the chat panel" }).click().catch(() => {});
    await pg.waitForTimeout(300);
    const backOnCard = await pg.evaluate(() => document.activeElement?.classList.contains("agent-chat") ?? false);
    ok("live: the card's Chat button opens the panel for that agent; its close button returns the focus to the card", /^Chat with /.test(title) && forAgent === "cl-lead" && (await pg.locator(".chat-sheet").count()) === 0 && backOnCard, `"${title}" for ${forAgent}, focus back on the card's button ${backOnCard}`);
    for (let i = 0; i < 3; i++) {
      await pg.keyboard.press("Escape");
      await pg.waitForTimeout(300);
    }
    // Round 13: loops' chat dock lists enabled agents of loops role lead only, so the postman's card (loops role router, at
    // the post office, no lead to offer) has no Chat button and says why; no ?chat= is ever asked for it.
    await canvas(pg).focus();
    await pg.keyboard.press("/");
    await pg.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.type("postman");
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(1500);
    await canvas(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
    const postmanCard = (await pg.locator(".agent-card").innerText().catch(() => "")).replace(/\s+/g, " ");
    const postmanChat = await pg.locator(".agent-card .agent-chat").count();
    const postmanNote = (await pg.locator(".agent-card .agent-chat-note").innerText().catch(() => "")).replace(/\s+/g, " ");
    const askedForPostman = web.requests.filter((r) => /chat=postman/.test(r.path)).length;
    ok("live: the postman's card has no Chat button (loops chats with leads only) and says why; nothing asked loops for its chat", /Postman/.test(postmanCard) && postmanChat === 0 && /crewhub-loops chats with leads only: Postman is the postman \(loops role router\)\.$/.test(postmanNote) && askedForPostman === 0, `${postmanChat} Chat button(s); "${postmanNote}"; ${askedForPostman} request(s) with chat=postman`);
    ok("live (round 22): the postman's card says in words that it holds no ticket and that no line and no answer were seen", /Holds\s*no ticket: crewhub-loops assigns it none right now/.test(postmanCard) && /No progress line: none seen since this page opened and no ticket on its desk/.test(postmanCard) && /(no answers can arrive|No answer from it since this page opened)/i.test(postmanCard), postmanCard.slice(0, 500));
    await shot(pg, "23e-card-leads-only");
    for (let i = 0; i < 3; i++) {
      await pg.keyboard.press("Escape");
      await pg.waitForTimeout(300);
    }
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: "light" });
    const ph = await phone.newPage();
    watch(ph, liveOrigin, problems, "live phone");
    // A new context has no pairing cookie: the phone pairs first, as the desktop page did.
    if (pairing) await ph.goto(host.mintPairLink(served ? undefined : origin));
    await ph.goto(liveBase);
    await ph.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await until(ph, "live", 20000);
    await ph.locator(".chat-open").click().catch(() => {});
    await ph.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const box = await ph.locator(".chat-sheet").boundingBox().catch(() => null);
    const fullClass = await ph.locator(".chat-sheet.chat-sheet-full").count();
    ok("live: on a phone the Chat panel is the whole screen", fullClass === 1 && !!box && box.width >= 370 && box.height >= 800, box ? `${Math.round(box.width)}x${Math.round(box.height)}, full-screen class ${fullClass}` : "no panel");
    await shot(ph, "23d-chat-phone");
    await phone.close();
    // Zones in a live town (round 11, L22 option 3): the Connection panel says where districts come from, and with none
    // made yet the text view says nothing about zones at all.
    await chip(pg).click().catch(() => {});
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const zonesRow = (await pg.locator(".connection-zones").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(300);
    const liveText = await text(pg);
    ok(
      "live: the Connection panel says zones are made by hand here and crewhub-loops has none; the text view says nothing odd",
      /^none yet: every building stands in the one district\./.test(zonesRow) && /crewhub-loops has no project groups/.test(zonesRow) && /kept in this browser/.test(zonesRow) && !/Unnamed zone|No zone|made by hand/.test(liveText),
      zonesRow.slice(0, 120),
    );

    // The scripted director in live mode (round 11): its own opt-in, off by default and not implied by the demo's switch
    // (stored on here, before a reload); every line of the text view's director section tagged "scripted"; switched on,
    // the plans section at once and, over the fake's events, a quick plan whose intents read "scripted director:";
    // switched off, the kill switch: the section says off again. The director writes nothing: the page's only road to
    // loops is the host, and every request the page sends while the director runs is counted; the world's only non-GET
    // requests are Connect and Forget, neither of which happens here.
    await pg.evaluate(() => localStorage.setItem("crewhub.presence.v1", JSON.stringify({ directorEnabled: true })));
    await pg.reload();
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await until(pg, "live", 20000);
    const writes = [];
    const countWrites = (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    };
    pg.on("request", countWrites);
    const openSettings = async () => {
      await pg.getByRole("button", { name: /settings/i }).first().click();
      await pg.waitForSelector(".settings-sheet", { timeout: 5000 }).catch(() => {});
    };
    const liveSwitch = () => pg.locator(".settings-sheet").getByLabel(/Scripted director in live mode/);
    // Escape closes Settings from its button, not from a focused checkbox (the keys leave form controls alone): the close button, as a person would.
    const closeSettings = async () => {
      await pg.getByRole("button", { name: /close settings/i }).first().click().catch(() => pg.keyboard.press("Escape"));
      await pg.waitForSelector(".settings-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    };
    await openSettings();
    const settingsText = (await pg.locator(".settings-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    const switchCount = await liveSwitch().count();
    const switchOn = switchCount === 1 ? await liveSwitch().isChecked() : null;
    ok("live director: Settings offer the live opt-in, off, with the demo's switch stored on and not shown", switchCount === 1 && switchOn === false && !/Demo: scripted director/.test(settingsText) && /never touches crewhub-loops/.test(settingsText), `${switchCount} switch(es), checked ${switchOn}; ${settingsText.slice(0, 120)}`);
    await shot(pg, "23b-live-settings-director");
    await closeSettings();
    const directorSection = () => sheet(pg).locator("section", { has: pg.locator("h3", { hasText: /^Scripted director/ }) });
    const sectionTags = async () => {
      const tags = await directorSection().locator(".text-kind").evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
      return { count: tags.length, allScripted: tags.length > 0 && tags.every((k) => k === "scripted") };
    };
    const off1 = await text(pg);
    await pg.keyboard.press("t");
    await pg.waitForTimeout(300);
    const tagsOff = await sectionTags();
    await pg.keyboard.press("Escape");
    ok("live director: the text view says the scripted director is off, every line tagged scripted", /Scripted director/.test(off1) && /scripted director is off/i.test(off1) && /never anything in crewhub-loops/.test(off1) && tagsOff.allScripted, `${tagsOff.count} tag(s); ${(off1.match(/Scripted director[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " ").slice(0, 160)}`);
    await openSettings();
    await liveSwitch().check();
    await closeSettings();
    await pg.keyboard.press("t");
    await pg.waitForTimeout(400);
    const onText = (await sheet(pg).innerText().catch(() => "")).replace(/\s+/g, " ");
    const tagsOn = await sectionTags();
    ok("live director: switched on, the plans section is there at once, tagged scripted", /Scripted director plans/.test(onText) && /No plan yet|Plan \d+ \(/.test(onText) && tagsOn.allScripted, `${tagsOn.count} tag(s); ${(onText.match(/Scripted director plans.{0,140}/) ?? [""])[0]}`);
    // A quick plan: 20 s after the fake's last movement-relevant event, at most one per building per minute.
    const planLines = sheet(pg).locator("li", { hasText: /scripted director: / });
    const planAt = Date.now();
    await planLines.first().waitFor({ timeout: 90000 }).catch(() => {});
    const planText = (await sheet(pg).innerText().catch(() => "")).replace(/\s+/g, " ");
    const played = await planLines.count();
    const tagsPlan = await sectionTags();
    const demoTags = await sheet(pg).locator('.text-kind[data-kind="demo"]').count();
    ok("live director: a quick plan over the fake's events, its intents read 'scripted director:', nothing tagged demo", played > 0 && /Plan \d+ \((quick|scheduled)/.test(planText) && tagsPlan.allScripted && demoTags === 0, `${played} intent line(s) after ${((Date.now() - planAt) / 1000).toFixed(1)} s, ${tagsPlan.count} scripted tag(s), ${demoTags} demo tag(s); ${(planText.match(/Plan \d+ \([^)]*\)[^.]*\./) ?? [""])[0]}`);
    await directorSection().first().scrollIntoViewIfNeeded().catch(() => {});
    await shot(pg, "23c-live-director-plan");
    await pg.keyboard.press("Escape");
    await openSettings();
    await liveSwitch().uncheck();
    await closeSettings();
    const off2 = await text(pg);
    ok("live director: switched off, the kill switch: the text view says off again over the kept plans and no intent is left", /scripted director is off/i.test(off2) && !/scripted director: /.test(off2), (off2.match(/Scripted director[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " ").slice(0, 120));
    pg.off("request", countWrites);
    ok("live director: the page sent no write while the director planned and played (GET and HEAD only)", writes.length === 0, writes.length === 0 ? "no non-GET request" : writes.slice(0, 3).join(", "));
    const { port, key, keyName } = fake;
    const lastSeq = fake.lastSeq();
    await fake.close();
    const down = await until(pg, "loops-down", 20000);
    ok("live: Loops down after the fake closes", down === "loops-down", `${down}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "24-loops-down");
    fake = noteLoops(await createLoopsFake({ ...fakeOptions, port, key, keyName, firstSeq: lastSeq }));
    const again = await until(pg, "live", 30000);
    ok("live: Live again after a new fake on the same port", again === "live", `${again}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "25-live-again");
    await pg.context().close();
  } finally {
    await host.close().catch(() => {});
    await fake.close().catch(() => {});
    await web.close().catch(() => {});
    // The Chat panel's frame is the one request that leaves the page's origin, by design: it is the loops web app
    // (the stub here). Only those requests are expected; anything else leaving the page still fails the closing check.
    const framed = problems.filter((x) => x.kind === "external" && x.text.includes(web.url));
    for (const x of framed) problems.splice(problems.indexOf(x), 1);
    info(`live: ${framed.length} request(s) left the page for the loops web stub, the Chat panel's frame, as designed`);
  }
});

await group("chat", async () => {
  // 17. The chat over the key (round 12; the one road since round 19, the sign-in road gone with the switch to the viewer
  // key): over a fake whose viewer key reads the chat (the key road), then over a fake whose key does not (no bubbles,
  // the plain words). The host serves the built world on a free port (or listens on --host-port behind your Vite, as the
  // live and ops groups do).
  const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const dist = path.join(REPO, "apps", "world", "dist");
  const served = existsSync(path.join(dist, "index.html"));
  const hostPort = Number(opts["host-port"]);
  if (!served && (!Number.isInteger(hostPort) || hostPort <= 0)) opts.fail("--host-port <port> must be a port number");
  // The key road: a loops whose viewer key may read the chat (world/viewer-key, 8292): no sign-in at all.
  const fake2 = noteLoops(await createLoopsFake({ heartbeatMs: 1000, speed: 1, startAt: 200_000, keyReadsChat: true }));
  const web2 = noteLoops(await createLoopsWebStub());
  const lines2 = [];
  const hostOptions2 = { loopsUrl: fake2.url, loopsWebUrl: web2.url, key: fake2.key, keyName: fake2.keyName, pairing: "off", retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000, log: (line) => lines2.push(line) };
  const host2 = await createHost(served ? { ...hostOptions2, staticDir: dist } : { ...hostOptions2, port: hostPort, allowedOrigins: [origin] });
  const keyOrigin = served ? host2.url : origin;
  info(`chat (key road): fake on 127.0.0.1:${fake2.port} whose key reads the chat, host on 127.0.0.1:${host2.port}`);
  const own2 = [];
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pg2 = await ctx2.newPage();
  watch(pg2, keyOrigin, own2, "chat key");
  try {
    await pg2.goto(`${keyOrigin}/`);
    await pg2.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg2.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    const health2 = await pg2.request.get(`${keyOrigin}/world-api/health`).then((r) => r.json());
    await pg2.locator(".connection-chip").first().click();
    await pg2.waitForSelector(".connection-chat", { timeout: 5000 }).catch(() => {});
    const words = (await pg2.locator(".connection-chat").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("chat (key road): health says session key, the panel's Chat section says a sign-in is not needed for the bubbles and shows no sign-in form, the host's log says the key reads the chat", health2.connection?.session?.state === "key" && /A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat/.test(words) && (await pg2.getByLabel("Password").count()) === 0 && lines2.some((l) => /the key reads the chat on this crewhub-loops/.test(l)), `${health2.connection?.session?.state}; ${words.slice(0, 100)}`);
    await shot(pg2, "57-chat-key-not-needed");
    await pg2.keyboard.press("Escape");
    // Round 17: the glance on the key road says the bubbles need no sign-in, in one clause.
    await pg2.locator(".chat-open").click();
    await pg2.waitForSelector(".chat-sheet-lead", { timeout: 5000 }).catch(() => {});
    const glanceKey = await pg2.locator(".chat-sheet-lead").evaluate((el) => ({ what: el.querySelector(".chat-sheet-what")?.textContent ?? "", todo: el.querySelector(".chat-sheet-todo")?.textContent ?? "", aboutOpen: el.closest(".card-body").querySelector(".chat-about")?.open ?? null })).catch(() => null);
    ok("chat (key road, round 17): the panel's glance says sign in below to type and that the answers come as bubbles without it, About this chat closed", glanceKey !== null && glanceKey.what === "crewhub-loops' own chat, framed here." && glanceKey.todo === "Sign in to crewhub-loops below to type; the answers come as bubbles without it." && glanceKey.aboutOpen === false, glanceKey ? `"${glanceKey.todo}"` : "no lead");
    await shot(pg2, "57b-chat-key-glance");
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    const bubble2 = pg2.locator('.bubble.said[data-said-agent="g-man"]');
    await bubble2.waitFor({ timeout: 90000 }).catch(() => {});
    const said2 = (await bubble2.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    ok("chat (key road): an agent's answer comes over the key's own stream and shows as a bubble, with no session anywhere", /Busy and calm/.test(said2) && fake2.sessionsOpen() === 0, said2.slice(0, 100) || `no bubble; host: ${lines2.slice(-4).join(" | ").slice(0, 200)}`);
    await shot(pg2, "58-chat-key-bubble");
    await bubble2.click().catch(() => {});
    await pg2.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const agent2 = await pg2.locator(".chat-sheet").getAttribute("data-agent").catch(() => null);
    ok("chat (key road): a tap on the bubble opens the Chat panel on that agent", agent2 !== null && /g-man/.test(agent2), `data-agent ${agent2}`);
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    // Round 14: an agent inside a building answers (the fake's sendDm: the person writes to cr-lead, in the lead's office
    // of CrewHub World, and its scripted reply comes 8 s later). From the town the figure inside is not drawn, so a chat
    // mark stands over the building (in one row with the pin when the building has one), the text view carries the
    // line with its place and an "answered" chip beside the building, and the mark enters the building, where the
    // bubble wraps to at most three lines, keeps clear of the name label, and has an accessible name that joins the
    // sentences without a double full stop. The mark goes when the bubble does.
    const noOverlap = (a, b) => !a || !b || a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    const bubbleFacts = (locator) =>
      locator
        .evaluate((el) => {
          const text = el.querySelector(".bubble-text");
          const cs = getComputedStyle(el);
          const ts = getComputedStyle(text);
          const label = el.parentElement?.querySelector(".name-pill, .agent-plate") ?? null;
          const r = el.getBoundingClientRect();
          const l = label?.getBoundingClientRect() ?? null;
          const lineHeight = parseFloat(ts.lineHeight) || parseFloat(ts.fontSize) * 1.2;
          return {
            aria: el.getAttribute("aria-label"),
            title: el.getAttribute("title"),
            whiteSpace: cs.whiteSpace,
            clamp: ts.webkitLineClamp,
            lines: Math.round(text.getBoundingClientRect().height / lineHeight),
            clipped: text.scrollHeight > text.clientHeight + 1,
            bubble: { x: r.left, y: r.top, width: r.width, height: r.height, bottom: r.bottom },
            label: l && { x: l.left, y: l.top, width: l.width, height: l.height, top: l.top, text: label.textContent },
            viewport: innerWidth,
          };
        })
        .catch(() => null);
    const answered = async (p, label) => {
      fake2.sendDm("cr-lead", `Is the reading nook done? (${label})`);
      const mark = p.locator('.chat-mark[data-said-mark="cr-lead"]');
      await mark.waitFor({ timeout: 30000 }).catch(() => {});
      return mark;
    };
    const mark = await answered(pg2, "desk");
    const markName = await mark.getAttribute("aria-label").catch(() => null);
    const markBox = await mark.boundingBox().catch(() => null);
    const pinBox = await pg2.locator('.need-anchor[data-anchor="n:crewhub"] .need-pin').boundingBox().catch(() => null);
    const figureInside = await pg2.locator('.bubble.said[data-said-agent="cr-lead"]').count();
    ok("chat (key road, round 14): an agent inside a building answered: from the town a chat mark stands over that building, named for a screen reader, not on the pin when both", markName === "CR Lead answered: open CrewHub World" && markBox !== null && figureInside === 0 && noOverlap(markBox, pinBox), `${markName}; mark ${markBox ? "shown" : "missing"}; pin ${pinBox ? "beside it" : "none"}; bubbles inside drawn from the town: ${figureInside}; host: ${lines2.slice(-2).join(" | ").slice(0, 160)}`);
    await shot(pg2, "59-chat-mark-town");
    await pg2.keyboard.press("t");
    await pg2.waitForSelector("#text-view", { timeout: 5000 }).catch(() => {});
    const tv = (await sheet(pg2).innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg2, "60-chat-text-view");
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector("#text-view", { state: "detached", timeout: 5000 }).catch(() => {});
    const saysLine = tv.match(/CR Lead says: .*?\(in the [^)]*\)/)?.[0] ?? null;
    ok("chat (key road, round 14): the text view carries the agent's line with its place in the Town section and an 'answered' chip beside the building, from the same source as the bubble", saysLine !== null && /^CR Lead says: \(demo reply\) .*\(in the lead's office of CrewHub World\)$/.test(saysLine) && /CR Lead answered/.test(tv) && /Chat: crewhub-loops' own chat.*A sign-in is not needed for the bubbles/.test(tv), saysLine ?? tv.slice(0, 200));
    await pg2.locator('.chat-mark[data-said-mark="cr-lead"]').click().catch(() => {});
    await pg2.waitForFunction(() => /CrewHub World/.test(document.querySelector("nav.world-breadcrumb .crumb-current")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const bubble3 = pg2.locator('.bubble.said[data-said-agent="cr-lead"]');
    await bubble3.waitFor({ timeout: 5000 }).catch(() => {});
    const facts = await bubbleFacts(bubble3);
    await shot(pg2, "61-chat-bubble-wrapped");
    ok("chat (key road, round 14): the mark enters the building; the bubble there wraps to two or three lines (clamped at three, nothing cut off) and stands clear above the name label", (await level(pg2)) === "CrewHub World" && facts !== null && facts.whiteSpace === "normal" && facts.clamp === "3" && facts.lines >= 2 && facts.lines <= 3 && !facts.clipped && facts.label !== null && noOverlap(facts.bubble, facts.label) && facts.bubble.bottom <= facts.label.top, facts ? `${facts.lines} line(s), clamp ${facts.clamp}, clipped ${facts.clipped}, bubble bottom ${Math.round(facts.bubble.bottom)} vs label top ${facts.label ? Math.round(facts.label.top) : "none"}` : `no bubble inside; level ${await level(pg2)}`);
    ok("chat (key road, round 14): the bubble's accessible name joins the line and the action without a double full stop", facts !== null && /^CR Lead says: \(demo reply\) .*\. Open CR Lead$/.test(facts.aria ?? "") && !/\.\./.test(facts.aria ?? "") && facts.title === (facts.aria ?? "").replace(/ Open CR Lead$/, ""), facts?.aria ?? "no bubble");
    await pg2.keyboard.press("Escape");
    await pg2.waitForFunction(() => !/CrewHub World/.test(document.querySelector("nav.world-breadcrumb .crumb-current")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const markBack = (await pg2.locator('.chat-mark[data-said-mark="cr-lead"]').count()) === 1;
    await pg2.waitForSelector('.chat-mark[data-said-mark="cr-lead"]', { state: "detached", timeout: 20000 }).catch(() => {});
    const markGone = (await pg2.locator('.chat-mark[data-said-mark="cr-lead"]').count()) === 0;
    const bubbleGone = (await pg2.locator('.bubble.said[data-said-agent="cr-lead"]').count()) === 0;
    ok("chat (key road, round 14): back in the town the mark stands while the bubble lives and goes when it expires", markBack && markGone && bubbleGone, `mark on return ${markBack}, gone ${markGone}, bubble gone ${bubbleGone}`);
    // Round 16: the text view's Recent answers section lists both answers newest first (cr-lead's, then g-man's) with
    // their times, after both bubbles went; its row opens the Chat panel on that agent.
    await pg2.keyboard.press("t");
    await pg2.waitForSelector("#text-view .text-recent", { timeout: 5000 }).catch(() => {});
    const recentSection = (await pg2.locator("#text-view .text-recent").innerText().catch(() => "")).replace(/\s+/g, " ");
    const recentAgents = await pg2.locator("#text-view .text-recent .recent-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-answer-agent"))).catch(() => []);
    await shot(pg2, "66-chat-recent-text-view");
    await pg2.locator("#text-view .text-recent .recent-row").first().click().catch(() => {});
    await pg2.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const fromText = await pg2.locator(".chat-sheet").getAttribute("data-agent").catch(() => null);
    ok("chat (key road, round 16): the text view's Recent answers section lists both answers, newest first, with their times, and its first row opens the Chat panel on cr-lead", /^Recent answers \(2\)/.test(recentSection) && recentAgents.length === 2 && recentAgents[0] === "cr-lead" && recentAgents[1] === "g-man" && /\d\d:\d\d:\d\d CR Lead \(demo reply\)/.test(recentSection) && /\d\d:\d\d:\d\d [^ ]+ Busy and calm/.test(recentSection) && fromText === "cr-lead", `${recentAgents.join(", ")}; ${recentSection.slice(0, 160)}; opened ${fromText}`);
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector("#text-view", { state: "detached", timeout: 5000 }).catch(() => {});
    // Round 24: the thread's own facts reach the card over the key road: the host read the threads again after the
    // dm.* events and sent them to the tab, so G-Man's card says when its last message was written and that one is
    // unread (its answer, which the person never read). Last here: the jump moves the camera to the town hall, which
    // the mark checks above must not see.
    await canvas(pg2).focus();
    await pg2.keyboard.press("/");
    await pg2.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg2.keyboard.type("G-Man");
    await pg2.waitForTimeout(400);
    await pg2.keyboard.press("Enter");
    await pg2.waitForTimeout(1500);
    await canvas(pg2).focus();
    await pg2.keyboard.press("Enter");
    await pg2.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
    await pg2.waitForFunction(() => /Chat\s*last message/.test(document.querySelector(".agent-card")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const gmanCard = (await pg2.locator(".agent-card").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("chat (key road, rounds 24 and 25): G-Man's card says the thread's own facts from the host (last message just now, 1 unread in the key maker's view) above its answer", /Chat\s*last message (just now|\d+ min ago), 1 unread in the key maker's view/.test(gmanCard) && /Busy and calm/.test(gmanCard), gmanCard.replace(/^.*?ANSWERS/, "ANSWERS").slice(0, 240));
    await shot(pg2, "58b-chat-key-card-thread");
    for (let i = 0; i < 3; i++) {
      await pg2.keyboard.press("Escape");
      await pg2.waitForTimeout(300);
    }
    // A phone, dark: the same answer; the bubble fits the width and stays clear of the label there too.
    const phoneCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
    const ph2 = await phoneCtx.newPage();
    watch(ph2, keyOrigin, own2, "chat key phone");
    try {
      await ph2.goto(`${keyOrigin}/`);
      await ph2.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
      await ph2.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
      const phoneMark = await answered(ph2, "phone");
      await shot(ph2, "62-chat-mark-phone-dark");
      await phoneMark.click().catch(() => {});
      await ph2.waitForFunction(() => /CrewHub World/.test(document.querySelector("nav.world-breadcrumb .crumb-current")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
      const phoneBubble = ph2.locator('.bubble.said[data-said-agent="cr-lead"]');
      await phoneBubble.waitFor({ timeout: 5000 }).catch(() => {});
      const phoneFacts = await bubbleFacts(phoneBubble);
      await shot(ph2, "63-chat-bubble-phone-dark");
      ok("chat (key road, round 14): on a phone in the dark theme the mark enters the building and the bubble fits the width, wraps within three lines and stays clear of the name label", phoneFacts !== null && phoneFacts.bubble.x >= 0 && phoneFacts.bubble.x + phoneFacts.bubble.width <= phoneFacts.viewport && phoneFacts.lines <= 3 && !phoneFacts.clipped && noOverlap(phoneFacts.bubble, phoneFacts.label), phoneFacts ? `${phoneFacts.lines} line(s), x ${Math.round(phoneFacts.bubble.x)} to ${Math.round(phoneFacts.bubble.x + phoneFacts.bubble.width)} of ${phoneFacts.viewport}, label ${phoneFacts.label ? "clear" : "none"}` : `no bubble on the phone; level ${await level(ph2)}`);
      // Round 16: the Chat panel on the phone (the whole screen) lists the answer; the row fits the width.
      await ph2.keyboard.press("Escape");
      await ph2.waitForTimeout(300);
      await ph2.locator(".chat-open").click().catch(() => {});
      await ph2.waitForSelector(".chat-recent .recent-row", { timeout: 5000 }).catch(() => {});
      const phoneRow = await ph2.locator(".chat-recent .recent-row").first().boundingBox().catch(() => null);
      const phoneRows = await ph2.locator(".chat-recent .recent-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-answer-agent"))).catch(() => []);
      await shot(ph2, "67-chat-recent-phone-dark");
      ok("chat (key road, round 16): on the phone the Chat panel's Recent answers block lists cr-lead's answer in a row that fits the width", phoneRows.length === 1 && phoneRows[0] === "cr-lead" && phoneRow !== null && phoneRow.x >= 0 && phoneRow.x + phoneRow.width <= 375, `${phoneRows.join(", ")}; row ${phoneRow ? `${Math.round(phoneRow.x)} to ${Math.round(phoneRow.x + phoneRow.width)}` : "none"}`);
    } finally {
      await phoneCtx.close().catch(() => {});
    }
    problems.push(...own2.filter((x) => !(x.kind === "external" && x.text.includes(web2.url))));
  } finally {
    await ctx2.close().catch(() => {});
    await host2.close().catch(() => {});
    await fake2.close().catch(() => {});
    await web2.close().catch(() => {});
  }

  // No chat road (round 19): a loops that does not let the key read the chat (a plain external bot's key, an older
  // loops, 8291 today): health has no session, the Connection panel's Chat section, the Chat panel's glance and About
  // this chat, Recent answers' empty state and the text view's Chat line all say so and point to a viewer key; the
  // sign-in road is gone (a write to /world-api/session is refused by the write gate, 405; a read is 404); an agent's
  // answer on loops shows no mark and no bubble.
  const fake3 = noteLoops(await createLoopsFake({ heartbeatMs: 1000, speed: 1, startAt: 200_000 }));
  const web3 = noteLoops(await createLoopsWebStub());
  const lines3 = [];
  const hostOptions3 = { loopsUrl: fake3.url, loopsWebUrl: web3.url, key: fake3.key, keyName: fake3.keyName, pairing: "off", retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000, log: (line) => lines3.push(line) };
  const host3 = await createHost(served ? { ...hostOptions3, staticDir: dist } : { ...hostOptions3, port: hostPort, allowedOrigins: [origin] });
  const noneOrigin = served ? host3.url : origin;
  info(`chat (no chat road): fake on 127.0.0.1:${fake3.port} whose key does not read the chat, host on 127.0.0.1:${host3.port}`);
  const own3 = [];
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pg3 = await ctx3.newPage();
  watch(pg3, noneOrigin, own3, "chat none");
  try {
    await pg3.goto(`${noneOrigin}/`);
    await pg3.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg3.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    // Round 28: the page's probe asks the loops web origin the host names (the stub: no CORS header), so the verdict is
    // "the origin is not set"; the words of every place are that verdict's, with this page's origin as the value to set.
    await pg3.waitForFunction(() => window.__worldStores?.().pageChat?.probe === "origin-not-set", null, { timeout: 10000 }).catch(() => {});
    const health3 = await pg3.request.get(`${noneOrigin}/world-api/health`).then((r) => r.json());
    const goneWrite = await pg3.request.post(`${noneOrigin}/world-api/session`, { headers: { origin: noneOrigin, "content-type": "application/json" }, data: { id: "nicky", password: "x" } }).then((r) => r.status()).catch(() => -1);
    const goneRead = await pg3.request.get(`${noneOrigin}/world-api/session`).then((r) => r.status()).catch(() => -1);
    await pg3.locator(".connection-chip").first().click();
    await pg3.waitForSelector(".connection-chat", { timeout: 5000 }).catch(() => {});
    const words3 = (await pg3.locator(".connection-chat").innerText().catch(() => "")).replace(/\s+/g, " ");
    const road3 = await pg3.locator(".connection-chat").getAttribute("data-road").catch(() => null);
    const probe3 = await pg3.locator(".connection-chat").getAttribute("data-probe").catch(() => null);
    await shot(pg3, "68-chat-none-panel");
    ok("chat (no chat road, round 19; round 28's words): health has no session, /world-api/session is gone (a write refused 405, a read 404), the panel's Chat section says this crewhub-loops does not let the world's key read the chat and nor this page (the probe's verdict over the fake: the world's origin is not set there), and points first to the setting with this page's exact origin, then to a viewer key, with no sign-in form; the host's log says the same", health3.connection?.session === undefined && goneWrite === 405 && goneRead === 404 && road3 === "none" && /^No bubbles: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there\. For the agents' answers as bubbles, set CHL_WORLD_ORIGIN=http:\/\/127\.0\.0\.1:\d+ on that crewhub-loops and restart it, or make a viewer key in Settings > Agents > Connect CrewHub World \(it reads only the chat of the person who makes it\) and paste it in the world's Connect screen\./.test(words3.replace(/^Chat /, "")) && probe3 === "origin-not-set" && (await pg3.getByLabel("Password").count()) === 0 && (await pg3.getByRole("button", { name: /Sign in|Forget the session/ }).count()) === 0 && lines3.some((l) => /the key does not read the chat on this crewhub-loops \(no viewer key\): no bubbles over the key; make a viewer key .*, or set CHL_WORLD_ORIGIN/.test(l)), `session ${JSON.stringify(health3.connection?.session)}; /session write ${goneWrite}, read ${goneRead}; data-road ${road3}, data-probe ${probe3}; ${words3.slice(0, 120)}`);
    await pg3.keyboard.press("Escape");
    await pg3.waitForTimeout(200);
    await pg3.locator(".chat-open").click();
    await pg3.waitForSelector(".chat-sheet-lead", { timeout: 5000 }).catch(() => {});
    const glance3 = await pg3.locator(".chat-sheet-lead").evaluate((el) => ({ what: el.querySelector(".chat-sheet-what")?.textContent ?? "", todo: el.querySelector(".chat-sheet-todo")?.textContent ?? "", aboutOpen: el.closest(".card-body").querySelector(".chat-about")?.open ?? null })).catch(() => null);
    await pg3.locator(".chat-about > summary").click().catch(() => {});
    await pg3.waitForTimeout(200);
    const about3 = (await pg3.locator(".chat-about").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (!(await pg3.locator(".chat-recent").evaluate((el) => el.open).catch(() => false))) await pg3.locator(".chat-recent > summary").click().catch(() => {});
    await pg3.waitForTimeout(200);
    const empty3 = (await pg3.locator('.chat-recent [data-recent="empty"]').innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg3, "69-chat-none-chat-panel");
    ok("chat (no chat road, round 19; round 28's words): the Chat panel's glance says no bubbles here (the world's origin is not set on this loops), About this chat holds the same story as the Connection panel, and Recent answers' empty state says no answer can arrive, the exact CHL_WORLD_ORIGIN value to set and how to make a viewer key", glance3 !== null && glance3.what === "crewhub-loops' own chat, framed here." && glance3.todo === "Sign in to crewhub-loops below to type; no bubbles: the world's origin is not set on crewhub-loops (see About)." && glance3.aboutOpen === false && /No bubbles: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there/.test(about3) && /Typing in the framed chat is crewhub-loops' own/.test(about3) && /^No answers can arrive: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there\. For bubbles, set CHL_WORLD_ORIGIN=http:\/\/127\.0\.0\.1:\d+ on that crewhub-loops and restart it, or make a viewer key in Settings > Agents > Connect CrewHub World/.test(empty3), glance3 ? `"${glance3.todo}"; about: ${about3.slice(0, 100)}; empty: ${empty3.slice(0, 100)}` : "no lead");
    await pg3.keyboard.press("Escape");
    await pg3.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    // An agent answers on loops: the key's stream never carries it, so no mark and no bubble; the text view says why.
    fake3.sendDm("cr-lead", "Is the reading nook done? (no chat road)");
    await pg3.waitForSelector('.chat-mark[data-said-mark="cr-lead"], .bubble.said', { timeout: 15000 }).catch(() => {});
    const marks3 = await pg3.locator(".chat-mark").count();
    const bubbles3 = await pg3.locator(".bubble.said").count();
    await pg3.keyboard.press("t");
    await pg3.waitForSelector("#text-view", { timeout: 5000 }).catch(() => {});
    const tv3 = (await sheet(pg3).innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg3, "70-chat-none-text-view");
    await pg3.keyboard.press("Escape");
    ok("chat (no chat road, round 19): an agent's answer on loops shows no mark and no bubble (the key's stream never carries it), and the text view's Chat line and Recent answers say why", marks3 === 0 && bubbles3 === 0 && /Chat: crewhub-loops' own chat.*No bubbles: this crewhub-loops does not let the world's key read the chat/.test(tv3) && /No answers can arrive: this crewhub-loops does not let the world's key read the chat/.test(tv3), `marks ${marks3}, bubbles ${bubbles3}; ${tv3.slice(0, 160)}`);
    problems.push(...own3.filter((x) => !(x.kind === "external" && x.text.includes(web3.url))));
  } finally {
    await ctx3.close().catch(() => {});
    await host3.close().catch(() => {});
    await fake3.close().catch(() => {});
    await web3.close().catch(() => {});
  }

  // Road 2 (round 28): the page reads loops itself. The fake names the page's origin as its CHL_WORLD_ORIGIN (the
  // guard and the CORS headers of loops main, packages/loops-fake); the host's key does not read the chat and the host
  // names the fake as the loops web origin, so the page's probe asks the fake with the person's own cookie: signed in
  // at the fake's own login (the cookie in this browser context; the world never sees a password), the probe says on
  // and the road is page; an agent inside a building answers (the fake's sendDm to cr-lead) and the page's own poll
  // brings it: the chat mark over the building, the bubble inside, the Recent answers row; every request the page
  // made to the fake was a GET on the four routes with the events query loops forces, and the console has no CORS line.
  const fake4 = noteLoops(await createLoopsFake({ heartbeatMs: 1000, speed: 1, startAt: 200_000 }));
  const lines4 = [];
  const hostOptions4 = { loopsUrl: fake4.url, key: fake4.key, keyName: fake4.keyName, pairing: "off", retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000, log: (line) => lines4.push(line) };
  const host4 = await createHost(served ? { ...hostOptions4, staticDir: dist } : { ...hostOptions4, port: hostPort, allowedOrigins: [origin] });
  const pageOrigin4 = served ? host4.url : origin;
  fake4.setWorldOrigin(pageOrigin4);
  info(`chat (road 2): fake on 127.0.0.1:${fake4.port} with CHL_WORLD_ORIGIN=${pageOrigin4}, host on 127.0.0.1:${host4.port} naming the fake as the loops web origin`);
  const own4 = [];
  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pg4 = await ctx4.newPage();
  watch(pg4, pageOrigin4, own4, "chat road 2");
  const asks4 = [];
  pg4.on("request", (r) => {
    if (!r.url().startsWith(fake4.url)) return;
    const url = new URL(r.url());
    asks4.push({ method: r.method(), path: url.pathname, query: url.search, type: r.resourceType() });
  });
  try {
    const login4 = await ctx4.request.post(`${fake4.url}/api/auth/login`, { data: { id: fake4.person.id, password: fake4.person.password } });
    const cookies4 = (await ctx4.cookies(fake4.url)).map((c) => c.name);
    await pg4.goto(`${pageOrigin4}/`);
    await pg4.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg4.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    await pg4.waitForFunction(() => window.__worldStores?.().pageChat?.probe === "on", null, { timeout: 15000 }).catch(() => {});
    const stores4 = await pg4.evaluate(() => window.__worldStores?.().pageChat ?? null).catch(() => null);
    const health4 = await pg4.request.get(`${pageOrigin4}/world-api/health`).then((r) => r.json());
    await pg4.locator(".connection-chip").first().click();
    await pg4.waitForSelector(".connection-chat", { timeout: 5000 }).catch(() => {});
    await pg4.locator(".connection-chat").scrollIntoViewIfNeeded().catch(() => {});
    const words4 = (await pg4.locator(".connection-chat").innerText().catch(() => "")).replace(/\s+/g, " ");
    const road4 = await pg4.locator(".connection-chat").getAttribute("data-road").catch(() => null);
    await shot(pg4, "71-chat-road2-panel");
    const wanted4 = `^Chat The bubbles come from your own chat: this crewhub-loops lets this page read the chat as you, signed in there in this browser \\(the world's origin is set there, CHL_WORLD_ORIGIN=${pageOrigin4.replace(/[.]/g, "\\.")}\\), so the agents' answers to you show as bubbles; nothing of it goes through the host, and the world keeps nothing\\.`;
    ok("chat (road 2, round 28): signed in at the fake in this browser (its own login; the cookie lives in the context, the world sees no password) with the fake naming this page's origin as CHL_WORLD_ORIGIN, the page's probe says on and the road is page while the host's key reads no chat (health has no session), and the panel's Chat section says the bubbles come from your own chat with this page's exact origin as the setting's value", login4.status() === 200 && cookies4.includes("chl_session") && health4.connection?.session === undefined && stores4?.probe === "on" && stores4?.road === "page" && stores4?.polling === true && road4 === "page" && new RegExp(wanted4).test(words4), `login ${login4.status()}, cookies ${cookies4.join(",")}; session ${JSON.stringify(health4.connection?.session)}; ${JSON.stringify(stores4)}; ${words4.slice(0, 140)}`);
    await pg4.keyboard.press("Escape");
    await pg4.waitForTimeout(200);
    // An agent inside a building answers (the fake's sendDm to cr-lead: its scripted reply 8 s later in demo time): the
    // page's own poll brings it, never the host (its key reads no chat): the chat mark over the building from the town,
    // the bubble inside after a tap on the mark, the Recent answers row, the glance on this road.
    fake4.sendDm("cr-lead", "Is the reading nook done? (road 2)");
    const mark4 = pg4.locator('.chat-mark[data-said-mark="cr-lead"]');
    await mark4.waitFor({ timeout: 30000 }).catch(() => {});
    const markText4 = (await mark4.getAttribute("title").catch(() => null)) ?? "";
    await shot(pg4, "72-chat-road2-mark");
    await mark4.click().catch(() => {});
    const bubble4 = pg4.locator('.bubble.said[data-said-agent="cr-lead"]');
    await bubble4.waitFor({ timeout: 10000 }).catch(() => {});
    const said4 = (await bubble4.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await shot(pg4, "73-chat-road2-bubble");
    const stores4b = await pg4.evaluate(() => window.__worldStores?.().pageChat ?? null).catch(() => null);
    ok("chat (road 2): the agent's answer comes through the page's own poll (the host's log never says its key reads the chat): the chat mark over its building from the town, then the bubble inside with the message's first line", markText4 !== "" && said4 !== "" && (stores4b?.lines ?? 0) >= 1 && !lines4.some((l) => /the key reads the chat/.test(l)), `mark "${markText4.slice(0, 70)}"; bubble "${said4.slice(0, 70)}"; ${JSON.stringify(stores4b)}; host: ${lines4.slice(-3).join(" | ").slice(0, 200)}`);
    await pg4.keyboard.press("Escape");
    await pg4.waitForTimeout(300);
    await pg4.locator(".chat-open").click();
    await pg4.waitForSelector(".chat-recent", { timeout: 5000 }).catch(() => {});
    if (!(await pg4.locator(".chat-recent").evaluate((el) => el.open).catch(() => false))) await pg4.locator(".chat-recent > summary").click().catch(() => {});
    await pg4.waitForTimeout(200);
    const rows4 = await pg4.locator(".recent-row").count();
    const rowAgent4 = await pg4.locator(".recent-row").first().getAttribute("data-answer-agent").catch(() => null);
    const glance4 = (await pg4.locator(".chat-sheet-todo").innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg4, "74-chat-road2-recent");
    ok("chat (road 2): Recent answers lists the answer with the agent, and the panel's glance says type below, you are signed in there, and the answers come as bubbles because this page reads your own chat", rows4 >= 1 && rowAgent4 === "cr-lead" && glance4 === "Type to an agent below (you are signed in there); the answers come as bubbles: this page reads your own chat.", `${rows4} row(s), first ${rowAgent4}; "${glance4}"`);
    await pg4.keyboard.press("Escape");
    await pg4.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    // The page's every ask of the fake (the Chat panel's frame asks the fake's root too: a document, not the page's own
    // fetch; the fake answers it 404, the one console line this page is allowed).
    const own4Asks = asks4.filter((a) => a.type === "fetch" || a.type === "xhr");
    const bad4 = own4Asks.filter((a) => a.method !== "GET" || !ROAD2_ROUTES.some((route) => route.test(a.path)));
    const events4 = own4Asks.filter((a) => a.path === "/api/events");
    const badQuery4 = events4.filter((a) => {
      const q = new URLSearchParams(a.query);
      return q.get("types") !== "dm.created,dm.answered" || Number(q.get("limit")) !== 50 || q.has("after") || !(q.has("cursor") || q.get("from") === "tail");
    });
    const corsLines4 = own4.filter((x) => x.kind === "console" && /CORS|ERR_FAILED/.test(x.text));
    ok("chat (road 2): every fetch the page made to the fake was a GET on the four routes (the threads, the events poll with types dm.created,dm.answered and limit 50, from=tail then the sealed cursor, a message by id); no CORS line in the console", own4Asks.length >= 3 && bad4.length === 0 && badQuery4.length === 0 && events4.length >= 1 && own4Asks.some((a) => a.path.startsWith("/api/dm/messages/")) && corsLines4.length === 0, `${own4Asks.length} fetches: ${[...new Set(own4Asks.map((a) => `${a.method} ${a.path.replace(/\/[A-Za-z0-9_-]+$/, (m) => (a.path.startsWith("/api/dm/messages/") ? "/<id>" : m))}`))].join(", ")}; ${bad4.length} off the shape, ${badQuery4.length} bad poll quer${badQuery4.length === 1 ? "y" : "ies"}; ${corsLines4.length} CORS line(s)`);
    problems.push(...own4.filter((x) => !(x.kind === "external" && x.url === `${fake4.url}/`) && !(x.kind === "console" && /status of 404/.test(x.text))));
  } finally {
    await ctx4.close().catch(() => {});
    await host4.close().catch(() => {});
    await fake4.close().catch(() => {});
  }
});

await group("town", async () => {
  // The world database (round 20): the host keeps the live town per installation in world.db. Two paired browsers on one
  // host see one town (a zone made in one appears in the other through the stream's `town` message); a host restart on
  // the same database keeps it; a browser with an older town of its own imports it once into a host that has none.
  const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const { openWorldDb } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "worldDb.ts")).href);
  const dist = DIST;
  const served = DIST_SERVED;
  const hostPort = Number(opts["host-port"]);
  if (!served && (!Number.isInteger(hostPort) || hostPort <= 0)) opts.fail("--host-port <port> must be a port number");
  const fake = noteLoops(await createLoopsFake({ heartbeatMs: 1000 }));
  // One pairing secret for every host of this group, so a restart keeps the browsers paired; two databases: the first
  // host's, left behind, and the one the rest of the group runs on.
  const pairingSecret = randomBytes(32);
  // Under --out, fresh for this run and removed at its end, as the ops group's config folder (review F9: two folders a
  // run were left in $TMPDIR).
  const dbDirs = ["a", "b"].map((side) => path.join(OUT, `${tag}-town-${side}`));
  for (const dir of dbDirs) rmSync(dir, { recursive: true, force: true });
  const dbs = dbDirs.map((dir) => openWorldDb(dir));
  const hostLog = [];
  const base = { loopsUrl: fake.url, key: fake.key, keyName: fake.keyName, retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000, log: (line) => hostLog.push(line), pairingSecret };
  const start = (worldDb, port) => createHost(served ? { ...base, worldDb, staticDir: dist, ...(port ? { port } : {}) } : { ...base, worldDb, port: hostPort, allowedOrigins: [origin] });
  let host = await start(dbs[0]);
  const port = host.port;
  const liveOrigin = served ? host.url : origin;
  const liveBase = `${liveOrigin}/`;
  info(`town: fake on 127.0.0.1:${fake.port}, host on 127.0.0.1:${port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin}`}; databases ${dbs.map((d) => d.file).join(" and ")}`);
  const contexts = [];
  const openPaired = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    contexts.push(ctx);
    const pg = await ctx.newPage();
    watch(pg, liveOrigin, problems, "town");
    // The town store's own log lines (`[town] …`), for the detail of a failed check.
    pg.townLog = [];
    pg.on("console", (m) => {
      if (/\[town\]/.test(m.text())) pg.townLog.push(m.text().replace("[town] ", ""));
    });
    if (typeof host.mintPairLink === "function") {
      await pg.goto(host.mintPairLink(served ? undefined : origin));
      await pg.waitForTimeout(300);
    }
    await pg.goto(liveBase);
    await pg.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    return pg;
  };
  const zoneLines = async (pg) => (await text(pg)).split("\n").filter((l) => /^Zone \d+ \(/.test(l));
  const townRow = async (pg) => {
    await pg.locator(".connection-chip").first().click().catch(() => {});
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const row = (await pg.locator(".connection-town").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    return row;
  };
  const addZone = async (pg) => {
    await canvas(pg).focus();
    await pg.keyboard.press("b");
    await pg.waitForTimeout(800);
    await pg.locator(".build-sheet").getByRole("button", { name: "Add a zone" }).click();
    await pg.waitForTimeout(800);
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(400);
  };
  const hostTown = async (pg) => {
    const r = await pg.request.get(`${liveOrigin}/world-api/town`).catch(() => null);
    const body = r ? await r.json().catch(() => null) : null;
    return { status: r ? r.status() : 0, rev: body?.rev ?? null, zones: (body?.document?.zones ?? []).map((z) => z.id) };
  };
  /**
   * Waits for a browser to show the host's revision (round 22: state, never time): the page keeps the revision it is on
   * in `<html data-town-rev>`; `min` left out means the revision the host has now. Answers the revision the page shows.
   */
  const atRev = async (pg, min = null, timeout = 15000) => {
    const wanted = min ?? (await hostTown(pg)).rev ?? 0;
    await pg.waitForFunction((w) => Number(document.documentElement.dataset.townRev ?? -1) >= w, wanted, { timeout }).catch(() => {});
    return Number(await pg.evaluate(() => document.documentElement.dataset.townRev ?? "-1"));
  };
  try {
    // 1. A first browser on a host whose database is empty: its empty town goes up once, a zone made here is the host's.
    const first = await openPaired();
    const before = await townRow(first);
    await addZone(first);
    await atRev(first);
    const made = await hostTown(first);
    ok("town: the Connection panel says the host keeps the town, and a zone made here is on the host", /^Kept by the world's host for this crewhub-loops, shared by every paired browser\./.test(before) && made.status === 200 && made.zones.includes("zone-1"), `${before.slice(0, 90)} | host: ${made.status} rev ${made.rev} zones ${made.zones.join(",")}`);
    await shot(first, "31-town-host");

    // 2. The host goes away and comes back on the same port with a database that has no town: the browser's own town
    // (kept in IndexedDB under the installation's key) is imported once, and the host now has the zone.
    await host.close();
    host = await start(dbs[1], port);
    await first.reload();
    await first.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(first, 1);
    const imported = await hostTown(first);
    const note = await townRow(first);
    ok("town: a browser with an older town of its own imports it once into a host that has none", imported.status === 200 && imported.rev === 1 && imported.zones.includes("zone-1") && /sent to the world's host once/.test(note), `host: ${imported.status} rev ${imported.rev} zones ${imported.zones.join(",")} | ${note.slice(0, 120)}`);

    // 3. A second paired browser sees the same town; a zone made there reaches the first through the stream.
    const second = await openPaired();
    await atRev(second);
    const seenBySecond = await zoneLines(second);
    await addZone(second);
    await atRev(second);
    const again = await hostTown(second);
    await atRev(first, again.rev);
    const seenByFirst = await zoneLines(first);
    const pair = seenBySecond.some((l) => l.startsWith("Zone 1 (")) && seenByFirst.some((l) => l.startsWith("Zone 2 (")) && /kept by the world's host/.test(seenByFirst.join(" ")) && again.rev >= 2;
    ok("town: two browsers on one host see one town; a zone made in one appears in the other", pair, `second saw ${seenBySecond.length} zone line(s); first now ${seenByFirst.map((l) => l.slice(0, 7)).join(", ")}; host rev ${again.rev}`);
    if (!pair) {
      info(`town: the second browser's town log: ${second.townLog.slice(-20).join(" | ") || "(nothing)"}`);
      info(`town: the first browser's town log: ${first.townLog.slice(-20).join(" | ") || "(nothing)"}`);
      info(`town: the second browser's page revision ${await second.evaluate(() => document.documentElement.dataset.townRev ?? "none")}, storage words: ${(await second.locator(".connection-town").innerText().catch(() => "")).slice(0, 120)}`);
      info(`town: the host's log: ${hostLog.filter((l) => /town of/.test(l)).join(" | ")}`);
      const { DatabaseSync } = await import("node:sqlite");
      const peek = new DatabaseSync(dbs[1].file, { readOnly: true });
      const rows = peek.prepare("SELECT installation, rev, history FROM towns").all();
      peek.close();
      for (const row of rows) {
        const h = JSON.parse(row.history ?? "null");
        info(`town: the host's history of ${row.installation} at rev ${row.rev}: index ${h?.index}, entries ${(h?.entries ?? []).map((e) => `r${e.revision}[${(e.zones ?? []).map((z) => z.id).join(",")}|plots ${e.plots.length}]`).join(" ")}`);
      }
    }
    await shot(second, "32-town-second");

    // 4. A host restart on the same database keeps the town.
    await host.close();
    host = await start(dbs[1], port);
    await first.reload();
    await first.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(first);
    const kept = await zoneLines(first);
    const row = await townRow(first);
    ok("town: a host restart keeps the town", kept.some((l) => l.startsWith("Zone 1 (")) && kept.some((l) => l.startsWith("Zone 2 (")) && /^Kept by the world's host/.test(row), `${kept.map((l) => l.slice(0, 7)).join(", ")} | ${row.slice(0, 80)}`);
    await shot(first, "33-town-restart");

    // 5. Round 21: the undo history is the host's. An undo in the second browser (build mode, Ctrl+Z) takes Zone 2 away
    // in the first too; after a host restart the first browser redoes it (the history came back with the database) and
    // the second sees Zone 2 again.
    await second.reload();
    await second.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(second);
    await canvas(second).focus();
    await second.keyboard.press("b");
    await second.waitForTimeout(800);
    const revBeforeUndo = (await hostTown(second)).rev;
    await second.locator(".build-sheet").getByRole("button", { name: "Undo", exact: true }).click();
    await atRev(second, revBeforeUndo + 1);
    await second.keyboard.press("Escape");
    await atRev(first, revBeforeUndo + 1);
    const afterUndo = await zoneLines(first);
    await host.close();
    host = await start(dbs[1], port);
    await first.reload();
    await first.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(first);
    await canvas(first).focus();
    await first.keyboard.press("b");
    await first.waitForTimeout(800);
    const redoButton = first.locator(".build-sheet").getByRole("button", { name: "Redo", exact: true });
    const redoEnabled = await redoButton.isEnabled().catch(() => false);
    const revBeforeRedo = (await hostTown(first)).rev;
    if (redoEnabled) await redoButton.click();
    await atRev(first, revBeforeRedo + 1);
    await first.keyboard.press("Escape");
    await atRev(second, revBeforeRedo + 1);
    const afterRedo = await zoneLines(second);
    ok(
      "town: an undo in one browser is seen in the other, and a redo after a host restart brings it back for both",
      !afterUndo.some((l) => l.startsWith("Zone 2 (")) && afterUndo.some((l) => l.startsWith("Zone 1 (")) && redoEnabled && afterRedo.some((l) => l.startsWith("Zone 2 (")),
      `after undo: ${afterUndo.map((l) => l.slice(0, 7)).join(", ") || "none"}; redo offered after the restart: ${redoEnabled}; after redo the second sees ${afterRedo.map((l) => l.slice(0, 7)).join(", ")}`,
    );
    if (afterUndo.some((l) => l.startsWith("Zone 2 (")) || !redoEnabled || !afterRedo.some((l) => l.startsWith("Zone 2 ("))) {
      // The undo check failed: the host's revision and its last history entries, and both browsers' town logs, as the
      // two-browser check prints them (r27-townback: an identical revision sent on a come-back was found this way).
      info(`town: undo detail: rev before the undo ${revBeforeUndo}, the host now ${JSON.stringify(await hostTown(second))}; the second's town log: ${second.townLog.slice(-20).join(" | ") || "(nothing)"}; the first's: ${first.townLog.slice(-20).join(" | ") || "(nothing)"}`);
      info(`town: the host's log: ${hostLog.slice(-12).join(" | ")}`);
      const { DatabaseSync } = await import("node:sqlite");
      const peek = new DatabaseSync(dbs[1].file, { readOnly: true });
      const rows = peek.prepare("SELECT installation, rev, updated_by, history FROM towns").all();
      peek.close();
      for (const row of rows) {
        const h = JSON.parse(row.history ?? "null");
        for (const e of (h?.entries ?? []).slice(-2)) info(`town: entry r${e.revision}: ${JSON.stringify(e).slice(0, 1600)}`);
        info(`town: the host's history of ${row.installation} at rev ${row.rev} (by ${row.updated_by}): index ${h?.index}, entries ${(h?.entries ?? []).map((e) => `r${e.revision}[zones ${(e.zones ?? []).map((z) => z.id).join(",")}; placements ${(e.placements ?? []).length}; plots ${(e.plots ?? []).length}]`).join(" ")}`);
      }
    }
    await shot(first, "34-town-redo");

    // 6. A restore is previewed and confirmed, never silent: a town file with Zone 1 renamed is imported in Settings >
    // Town; the preview names the rename; Cancel changes nothing; the same import confirmed renames it on the host.
    const current = await first.request.get(`${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null);
    const renamed = JSON.parse(JSON.stringify(current.document));
    for (const z of renamed.zones ?? []) if (z.id === "zone-1") z.name = "Harbour";
    const file = { name: "harbour.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(renamed)) };
    const openSettings = async (pg) => {
      await pg.getByRole("button", { name: "Settings", exact: true }).click();
      await pg.waitForSelector(".settings-sheet", { timeout: 5000 });
    };
    await openSettings(first);
    await first.locator('.settings-sheet input[type="file"]').setInputFiles(file);
    await first.waitForSelector(".restore-sheet", { timeout: 5000 }).catch(() => {});
    const previewText = (await first.locator(".restore-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    const focused = await first.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    await first.keyboard.press("Escape");
    await first.waitForTimeout(500);
    const dialogGone = (await first.locator(".restore-sheet").count()) === 0;
    const revAfterCancel = (await first.request.get(`${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null))?.rev;
    ok(
      "town: an import opens a preview that names the change, with the focus inside; Escape cancels and nothing changes",
      /renamed "Harbour"/.test(previewText) && /1 change\./.test(previewText) && focused === "Cancel" && dialogGone && revAfterCancel === current.rev,
      `${previewText.slice(0, 120)} | focus on "${focused}" | rev ${current.rev} → ${revAfterCancel}`,
    );
    await first.locator('.settings-sheet input[type="file"]').setInputFiles(file);
    await first.waitForSelector(".restore-sheet", { timeout: 5000 }).catch(() => {});
    await shot(first, "35-town-restore-preview");
    await first.locator(".restore-sheet").getByRole("button", { name: "Restore", exact: true }).click();
    await atRev(first, current.rev + 1);
    const afterRestore = await first.request.get(`${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null);
    const restoreNote = (await first.locator(".settings-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    await first.keyboard.press("Escape");
    await atRev(second, current.rev + 1);
    // The renamed zone no longer matches the "Zone n" filter: every hand-made zone line of the second browser is read.
    const secondSees = (await text(second)).split("\n").filter((l) => /\(made by hand/.test(l));
    ok(
      "town: the confirmed restore is the next revision on the host, named Harbour in the other browser too, and Undo is offered",
      afterRestore?.rev === current.rev + 1 && (afterRestore?.document?.zones ?? []).some((z) => z.name === "Harbour") && afterRestore?.canUndo === true && /Restored from harbour\.json/.test(restoreNote) && secondSees.some((l) => l.startsWith("Harbour (")),
      `rev ${current.rev} → ${afterRestore?.rev}; canUndo ${afterRestore?.canUndo}; second sees ${secondSees.map((l) => l.slice(0, 9)).join(", ")}`,
    );
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await host.close().catch(() => {});
    await fake.close().catch(() => {});
    for (const db of dbs) db.close();
    for (const dir of dbDirs) rmSync(dir, { recursive: true, force: true });
  }
});

await group("ops", async () => {
  // 16. The live operations road (round 7): loops stopped and started, the key revoked while Live and another pasted,
  // loops upgraded (another health version), each under a running host over the fake, each with its honest screen.
  // The host listens on --host-port behind your Vite; the fake is reopened on its own port for every act.
  const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const { createKeyStore } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "keyStore.ts")).href);
  // As the live group: with apps/world/dist built the host serves it on a free port and the browser opens the host
  // directly (no port of yours is taken); otherwise the host listens on --host-port behind your Vite.
  const dist = DIST;
  const served = DIST_SERVED;
  const hostPort = Number(opts["host-port"]);
  if (!served && (!Number.isInteger(hostPort) || hostPort <= 0)) opts.fail("--host-port <port> must be a port number");
  if (served) info(`ops: ${distFresh}`);
  const configDir = path.join(OUT, `${tag}-ops-config`);
  rmSync(configDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const store = createKeyStore(configDir);
  const fakeOptions = { heartbeatMs: 1000, version: "0.1.0+fake.ops" };
  let fake = noteLoops(await createLoopsFake(fakeOptions));
  const { port, keyName } = fake;
  const firstKey = fake.key;
  let lastSeq = fake.lastSeq();
  const hostOptions = { loopsUrl: fake.url, key: firstKey, keyName, keySource: "stored", keyStore: store, pairing: "off", retryMs: { min: 100, max: 500 }, reconnectMs: { min: 100, max: 300 }, heartbeatMs: 1000, log: () => undefined };
  const host = await createHost(served ? { ...hostOptions, staticDir: dist } : { ...hostOptions, port: hostPort, allowedOrigins: [origin] });
  const opsOrigin = served ? host.url : origin;
  const opsBase = `${opsOrigin}/`;
  info(`ops: fake on 127.0.0.1:${port}, host on 127.0.0.1:${host.port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`}, the key store under ${configDir}`);
  const own = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pg = await ctx.newPage();
  watch(pg, opsOrigin, own, "ops");
  const chip = pg.locator(".connection-chip").first();
  const chipState = () => chip.getAttribute("data-connection").catch(() => null);
  const until = async (wanted, timeout) => {
    await pg.waitForSelector(`.connection-chip[data-connection="${wanted}"]`, { timeout }).catch(() => {});
    return chipState();
  };
  const screen = (which, timeout) =>
    pg
      .waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout })
      .then(() => true)
      .catch(() => false);
  const hostApi = (p) => pg.request.get(`${opsOrigin}/world-api${p}`).then((r) => r.json());
  /**
   * Opens the Connection panel, waits until its facts (one line) satisfy `wanted` (the panel asks the host when it
   * opens and on every state change, then every 5 s: up to its poll and a margin), closes it with Escape and
   * answers the facts as last read.
   */
  const panelFacts = async (wanted = () => true) => {
    await chip.click();
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    let facts = "";
    const deadline = Date.now() + 8000;
    for (;;) {
      facts = (await pg.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
      if (wanted(facts) || Date.now() > deadline) break;
      await pg.waitForTimeout(250);
    }
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    return facts;
  };
  const mark = () => pg.evaluate(() => ((globalThis.__opsMarker = "set"), undefined));
  const marked = () => pg.evaluate(() => globalThis.__opsMarker ?? null).catch(() => null);
  const leaked = async (key) => {
    const part = key.slice(4, 24);
    const html = await pg.content();
    const stored = await pg.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))).catch(() => "");
    return html.includes(part) || stored.includes(part) || pg.url().includes(part);
  };
  /** Polls the host's health until `test` holds, for `ms`; answers the last health read. */
  const healthUntil = async (test, ms) => {
    const deadline = Date.now() + ms;
    let h = await hostApi("/health").catch(() => null);
    while (!(h && test(h)) && Date.now() < deadline) {
      await pg.waitForTimeout(500);
      h = await hostApi("/health").catch(() => null);
    }
    return h;
  };
  try {
    await pg.goto(opsBase);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    const live0 = await until("live", 20000);
    ok("ops: Live over the fake before anything happens", live0 === "live", `${live0}`);
    await mark();

    // (a) loops stops and starts under the host.
    lastSeq = fake.lastSeq();
    await fake.close();
    const down = await until("loops-down", 20000);
    const factsDown = await panelFacts((f) => /down; the host retries/.test(f));
    ok("ops (a): loops stopped under the host: the Loops down chip over the last known town, the panel says the stream is down and the host retries, the key still accepted", down === "loops-down" && /down; the host retries/.test(factsDown) && /accepted/.test(factsDown), `${down}; ${factsDown.slice(0, 160)}`);
    await shot(pg, "47-ops-loops-stopped");
    fake = noteLoops(await createLoopsFake({ ...fakeOptions, port, key: firstKey, keyName, firstSeq: lastSeq }));
    const back = await until("live", 30000);
    const healthBack = await healthUntil((h) => h.loops === "ok" && typeof h.cursor === "number", 10000);
    ok("ops (a): loops started again: Live without a reload, the key still accepted, the cursor goes on", back === "live" && (await marked()) === "set" && healthBack?.connection?.key?.state === "ok" && healthBack?.cursor >= lastSeq, `${back}, marker ${await marked()}, key ${healthBack?.connection?.key?.state}, cursor ${lastSeq} → ${healthBack?.cursor}`);
    await shot(pg, "48-ops-loops-back");

    // (b) the key revoked while Live: the fake comes back on its port with another key, so the host's key gets 401
    // from a loops whose health answers (a verdict), not a loops that is down.
    lastSeq = fake.lastSeq();
    await fake.close();
    // The new key is another bot's (round 48): the page must name the key the host holds now.
    const secondName = `${keyName}-2`;
    fake = noteLoops(await createLoopsFake({ ...fakeOptions, port, keyName: secondName, firstSeq: lastSeq }));
    const rejected = await screen("rejected", 30000);
    // The screen asks the host at once for loops' reason; give that read a moment.
    let reason = "";
    for (let attempt = 0; attempt < 16 && !/refused the key on the event stream/.test(reason); attempt += 1) {
      await pg.waitForTimeout(250);
      reason = (await pg.locator(".connect-rejected").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    }
    const forgetButtons = await pg.getByRole("button", { name: "Forget this key" }).count();
    const healthRejected = await healthUntil((h) => h.connection?.key?.state === "rejected", 10000);
    ok("ops (b): the key revoked while Live: the rejected screen over the live tab with loops' reason, the kept key and Forget; the host's key state is rejected", rejected && /refused the key on the event stream/.test(reason) && forgetButtons === 1 && healthRejected?.connection?.key?.state === "rejected" && healthRejected?.loops === "unauthorized", `${rejected ? "rejected screen" : `no rejected screen (chip ${await chipState()})`}; key ${healthRejected?.connection?.key?.state}; ${reason.slice(0, 100)}`);
    await shot(pg, "49-ops-key-revoked");
    const secondKey = fake.key;
    await pg.getByLabel("Access key").fill(secondKey);
    await pg.keyboard.press("Enter");
    const liveAgain = await until("live", 30000);
    let storedKey = "";
    try {
      storedKey = readFileSync(store.file, "utf8").trim();
    } catch {}
    const healthNew = await healthUntil((h) => h.connection?.key?.state === "ok" && h.connection?.stream?.state === "ok", 10000);
    ok("ops (b): the new key pasted: the town is back by itself without a reload, the host stores the new key and streams with it, neither key is anywhere in the page", liveAgain === "live" && (await marked()) === "set" && storedKey === secondKey && healthNew?.connection?.key?.state === "ok" && !(await leaked(firstKey)) && !(await leaked(secondKey)), `${liveAgain}, marker ${await marked()}, stored ${storedKey === secondKey}, key ${healthNew?.connection?.key?.state}`);
    storedKey = "";
    await shot(pg, "50-ops-new-key");
    // Round 48 (r48-ui U3): Settings > Source names the key the host holds now, not the one the page started with.
    await pg.getByRole("button", { name: "Settings", exact: true }).click();
    await pg.waitForSelector(".settings-sheet", { timeout: 5000 }).catch(() => {});
    const sourceHost = (await pg.locator(".settings-sheet .source-host").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("ops (b): Settings names the key the host holds now, not the one the page started with", sourceHost.includes(`Key: ${secondName}.`) && !sourceHost.includes(`Key: ${keyName}.`), sourceHost.slice(0, 160));
    await pg.getByRole("button", { name: /close settings/i }).first().click().catch(() => pg.keyboard.press("Escape"));
    await pg.waitForSelector(".settings-sheet", { state: "detached", timeout: 5000 }).catch(() => {});

    // (c) loops upgraded: the fake comes back on its port with another health version.
    lastSeq = fake.lastSeq();
    await fake.close();
    fake = noteLoops(await createLoopsFake({ ...fakeOptions, version: "0.2.0+fake.ops", port, key: secondKey, keyName: secondName, firstSeq: lastSeq }));
    const liveUpgraded = await until("live", 30000);
    const healthUpgraded = await healthUntil((h) => h.loopsCommit === "0.2.0+fake.ops", 15000);
    const factsUpgraded = await panelFacts((f) => /it was 0\.1\.0\+fake\.ops when this host started/.test(f));
    ok("ops (c): loops upgraded under the host: Live, health says the new version and the one the host read first, the panel says crewhub-loops was updated under the host", liveUpgraded === "live" && healthUpgraded?.loopsCommit === "0.2.0+fake.ops" && healthUpgraded?.loopsCommitBefore === "0.1.0+fake.ops" && /crewhub-loops version 0\.2\.0\+fake\.ops; it was 0\.1\.0\+fake\.ops when this host started/.test(factsUpgraded), `${liveUpgraded}; ${healthUpgraded?.loopsCommitBefore ?? "no before"} → ${healthUpgraded?.loopsCommit}; ${factsUpgraded.slice(0, 160)}`);
    await shot(pg, "51-ops-upgraded");
    // The revoked key's 401 and the refused reads it causes are console errors in the browser, what they are meant to be.
    problems.push(...own.filter((x) => !(x.kind === "console" && /status of (401|403|503)/.test(x.text))));
  } finally {
    await ctx.close().catch(() => {});
    await host.close().catch(() => {});
    await fake.close().catch(() => {});
    rmSync(configDir, { recursive: true, force: true });
  }
});

await group("connect", async () => {
  // 15b. The connect flow (spec addendum "a smooth connection"), always behind your Vite: first the stub host of
  // lib/connectStub.mjs and then a real, keyless host listen on --host-port (CREWHUB_WORLD_PORT) and the browser opens
  // your Vite. apps/world/dist is never looked at here, whatever the live group does when it exists: the stub has no
  // static files, and a one-time pairing link must land on the Vite origin to pair the page that opens it.
  const hostPort = Number(opts["host-port"]);
  if (!Number.isInteger(hostPort) || hostPort <= 0) opts.fail("--host-port <port> must be a port number");
  const GOOD_KEY = "chl_" + "stubKEY-_0123456789abcdefghijklmnopqrstuvwx".slice(0, 43);
  const screen = (pg, which, timeout = 15000) =>
    pg
      .waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout })
      .then(() => true)
      .catch(() => false);
  const title = async (pg) => (await pg.locator("#connect-title").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const chip = (pg) => pg.locator(".connection-chip").first();
  const chipState = (pg) => chip(pg).getAttribute("data-connection").catch(() => null);
  /** Waits for the connection chip to say `wanted` and answers what it says then. */
  const until = async (pg, wanted, timeout) => {
    await pg.waitForSelector(`.connection-chip[data-connection="${wanted}"]`, { timeout }).catch(() => {});
    return chipState(pg);
  };
  const keyField = (pg) => pg.getByLabel("Access key");
  /** Types a key into the field and submits it with Enter, as a person does. */
  const paste = async (pg, key) => {
    await keyField(pg).fill(key);
    await pg.keyboard.press("Enter");
  };
  /** Whether a key shows anywhere it must not: the DOM, local or session storage, the URL (a middle slice: never its tail, which the hint names). */
  const leaked = async (pg, key) => {
    const part = key.slice(4, 24);
    const html = await pg.content();
    const stored = await pg.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))).catch(() => "");
    return html.includes(part) || stored.includes(part) || pg.url().includes(part);
  };
  /** How many times the page asks the host's health in `ms`. */
  const healthAsks = async (pg, ms) => {
    let count = 0;
    const seen = (request) => {
      if (new URL(request.url()).pathname === "/world-api/health") count += 1;
    };
    pg.on("request", seen);
    await pg.waitForTimeout(ms);
    pg.off("request", seen);
    return count;
  };
  const reasonText = async (pg) => (await pg.locator(".connect-rejected").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  /** A mark set on the window: still there at the end means the page never reloaded in between. */
  const mark = (pg) => pg.evaluate(() => ((globalThis.__connectMarker = "set"), undefined));
  const marked = (pg) => pg.evaluate(() => globalThis.__connectMarker ?? null).catch(() => null);
  /** The browser logs every 4xx a fetch meets: the refused key's 403 and the unpaired tab's 401 are what they are meant to be. */
  // The browser logs every 4xx and 5xx a fetch meets: the refused key's 403, the unpaired tab's 401, and the 503 no_key the
  // other tab's stream meets when it reconnects after a Forget elsewhere (the stub ends the streams; a real host keeps them).
  const expected = (x) => x.kind === "console" && (/status of (401|403)/.test(x.text) || (/\[connect stub other tab\]/.test(x.text) && /status of 503/.test(x.text)));
  const own = [];
  const openConnect = async (label) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const pg = await ctx.newPage();
    watch(pg, origin, own, label);
    return pg;
  };

  /** Half one: every screen in order against the stub, on one page; the stub decides the host's state, the page follows by polling. */
  async function stubHalf() {
    // "checking" holds until the tool moves the stub on (a real host would connect or refuse in a second).
    const stub = await createConnectStub({ port: hostPort, state: "no-loops", origin, checkMs: 60_000, log: () => undefined });
    loopsOriginGetters.push(() => stub.webUrl());
    info(`connect: stub host on 127.0.0.1:${stub.port} behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`);
    try {
      const pg = await openConnect("connect stub");
      await pg.goto(BASE);
      const noLoops = await screen(pg, "no-loops");
      ok("connect: No crewhub-loops found comes first", noLoops && /No crewhub-loops found/.test(await title(pg)), await title(pg));
      // Round 48 (r48-ui U1): a Connect screen asks every 2.5 s (CONNECT_POLL_MS). The gate's onHealth was a new function on
      // every answer, so the poll's effect started again with each one and asked back to back, thousands of times a second.
      const asks = await healthAsks(pg, 6000);
      ok("connect: a Connect screen asks the host's health every 2.5 s, not back to back", asks <= 5, `${asks} health request(s) in 6 s`);
      await shot(pg, "34-connect-no-loops");
      await stub.setState("pair");
      const pair = await screen(pg, "pair");
      const pairBody = (await pg.locator(".connect-page").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok("connect: Pair this browser names npm run world and never a link", pair && /Pair this browser/.test(pairBody) && /npm run world/.test(pairBody) && !/\/pair\//.test(pairBody), pairBody.slice(0, 120));
      await stub.setState("connect");
      const connect = await screen(pg, "connect");
      ok("connect: the Connect screen offers a masked key field", connect && (await keyField(pg).getAttribute("type").catch(() => null)) === "password");
      await shot(pg, "35-connect-connect");
      await mark(pg);
      await paste(pg, GOOD_KEY);
      const checking = await screen(pg, "checking", 5000);
      const fieldAfter = await keyField(pg).inputValue().catch(() => "?");
      ok("connect: Enter posts the key, the field is empty again and the host says checking", checking && stub.state === "checking" && fieldAfter === "", `stub ${stub.state}, field "${fieldAfter}"`);
      await stub.setState("rejected");
      const rejected = await screen(pg, "rejected");
      const reason = await reasonText(pg);
      const forgetButton = pg.getByRole("button", { name: "Forget this key" });
      ok("connect: the rejected screen gives loops' reason, keeps the key and offers Forget", rejected && /Read only/.test(reason) && (await forgetButton.count()) === 1, reason.slice(0, 100));
      // Round 48 (r48-ui U2): the field is disabled while the key is checked, which drops the focus to the page; the answer
      // gives it back, so a keyboard user is where they were and can paste another key.
      const focused = await pg.evaluate(() => (document.activeElement ? `${document.activeElement.tagName.toLowerCase()} ${document.activeElement.getAttribute("type") ?? ""}`.trim() : "none")).catch(() => "?");
      ok("connect: the refused key gives the focus back to the key field, not the page", focused === "input password", `focus on ${focused}`);
      await shot(pg, "36-connect-rejected");
      await forgetButton.click();
      const back = await screen(pg, "connect", 10000);
      ok("connect: Forget this key brings the Connect screen back", back && stub.state === "connect", `stub ${stub.state}`);
      await stub.setState("loops-down");
      const down = await screen(pg, "loops-down");
      ok("connect: crewhub-loops not answering has its own screen, never an empty town", down && /not answering/.test(await title(pg)), await title(pg));
      await shot(pg, "37-connect-loops-down");
      await stub.setState("connected");
      await pg.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
      const live = await until(pg, "live", 30000);
      const marker = await marked(pg);
      ok("connect: the town appears with the Live chip, without a reload", live === "live" && marker === "set", `${live}, marker ${marker}`);
      await dressed(pg, 30000).catch(() => {});
      await shot(pg, "38-connect-town");
      ok("connect: the key is in no DOM, storage or URL", !(await leaked(pg, GOOD_KEY)));
      await chip(pg).click();
      await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
      const facts = (await pg.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
      const inPanel = await pg.evaluate(() => document.querySelector(".connection-sheet")?.contains(document.activeElement) === true).catch(() => false);
      await shot(pg, "39-connect-panel");
      await pg.keyboard.press("Escape");
      await pg.waitForTimeout(200);
      const closed = (await pg.locator(".connection-sheet").count()) === 0 && (await pg.evaluate(() => document.activeElement?.classList.contains("connection-chip")).catch(() => false)) === true;
      ok("connect: the panel names where loops was found, the key and the stream; Escape hands the focus back to the chip", /found/.test(facts) && /crewhub-world/.test(facts) && /socket/.test(facts) && /streaming/.test(facts) && inPanel && closed, facts.slice(0, 140));
      // Forget this key in one tab (round 10, r10-sheet): the other live tabs lose the host's key, not their standing with
      // loops: they show the Connect screen (the host's key is none), never "crewhub-loops rejected the key", and without a
      // reload. The forgetting tab reloads onto the Connect screen itself.
      const other = await pg.context().newPage();
      watch(other, origin, own, "connect stub other tab");
      await other.goto(BASE);
      const otherLive = await until(other, "live", 30000);
      await mark(other);
      await chip(pg).click();
      await pg.getByRole("button", { name: "Forget this key" }).click();
      await pg.getByRole("button", { name: "Forget", exact: true }).click();
      const otherConnect = await screen(other, "connect", 15000);
      const otherRejected = (await other.locator('.connect-page[data-screen="rejected"]').count()) > 0;
      ok("connect: Forget this key in one tab sends the other live tab to the Connect screen (the host has no key), never to rejected, without a reload", otherLive === "live" && otherConnect && !otherRejected && stub.state === "connect" && (await marked(other)) === "set", `other: live ${otherLive}, connect ${otherConnect}, rejected ${otherRejected}; stub ${stub.state}`);
      await shot(other, "39b-connect-other-tab-after-forget");
      await other.close();
      await stub.setState("connected");
      const relive = await until(pg, "live", 30000);
      ok("connect: after the forget, a key again brings the forgetting tab's town back", relive === "live", relive);
      await mark(pg);
      // A host that no longer knows this browser (a restart without its secret): the tab shows Pair this browser, not
      // Stale, and comes back by itself once it is paired again.
      await stub.setState("unpaired");
      const pairAgain = await screen(pg, "pair", 20000);
      ok("connect: a live tab the host no longer knows shows Pair this browser", pairAgain, pairAgain ? "" : `chip ${await chipState(pg)}`);
      await shot(pg, "40-connect-pair-again");
      await stub.setState("connected");
      const again = await until(pg, "live", 20000);
      const marker2 = await marked(pg);
      ok("connect: paired again, the town comes back by itself without a reload", again === "live" && marker2 === "set", `${again}, marker ${marker2}`);
      await pg.context().close();
      // loops' 429 on the stream (another host or tab uses the key): the town with the Stream busy chip, on a fresh page.
      await stub.setState("busy");
      const busyPage = await openConnect("connect stub busy");
      await busyPage.goto(BASE);
      const busy = await until(busyPage, "stream-busy", 30000);
      const word = (await chip(busyPage).innerText().catch(() => "")).trim();
      const townDrawn = await dressed(busyPage, 20000).then(() => true).catch(() => false);
      ok("connect: loops' 429 on the stream is the Stream busy chip over the town", busy === "stream-busy" && /Stream busy/.test(word) && townDrawn, `${busy}: ${word}; town drawn ${townDrawn}`);
      await shot(busyPage, "41-connect-busy");
      await busyPage.context().close();
    } finally {
      await stub.close().catch(() => {});
    }
  }

  /** Half two: a keyless host the tool starts against the real development loops, found through its data folder. */
  async function realHalf() {
    const envFile = loopsEnvFile();
    const env = readEnvFile(envFile);
    const loopsUrl = (env.LOOPS_DEV_URL ?? "").replace(/\/+$/, "");
    noteLoopsUrl(loopsUrl);
    const keyFile = env.LOOPS_DEV_KEY_FILE ?? "";
    const parsed = (() => {
      try {
        return new URL(loopsUrl);
      } catch {
        return null;
      }
    })();
    const loopback = parsed !== null && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.port !== "";
    if (!loopback || keyFile === "") {
      info(`connect: the real half skipped, no loopback LOOPS_DEV_URL and LOOPS_DEV_KEY_FILE in ${envFile}`);
      return;
    }
    // Never the Mac app's port nor 5180, even when the env file names it (a typo of 8291 is 8091).
    const urlVerdict = ownLoopsUrl(loopsUrl);
    if (!urlVerdict.ok) opts.fail(`${envFile}: LOOPS_DEV_URL ${urlVerdict.reason}`);
    const appData = loopsAppData();
    if (!existsSync(path.join(appData, "settings.json"))) {
      info(`connect: the real half skipped, no settings.json in ${appData} (--loops-app-data names the development loops' data folder)`);
      return;
    }
    // The folder must be a development loops' own, never the Mac app's, and its settings.json must name a port that is
    // neither the app's nor the world host's (round 36): the keyless host below looks exactly there.
    const folderVerdict = ownAppData(appData, process.env.HOME ?? "~");
    if (!folderVerdict.ok) opts.fail(`--loops-app-data: ${folderVerdict.reason}`);
    const portVerdict = appDataPort(readFileSync(path.join(appData, "settings.json"), "utf8"));
    if (!portVerdict.ok) opts.fail(`--loops-app-data ${appData}: ${portVerdict.reason}`);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
    const pg = await ctx.newPage();
    const half = (words) => `connect (${parsed.port}): ${words}`;
    watch(pg, origin, own, `connect ${parsed.port}`);
    const health = await pg.request.get(`${loopsUrl}/api/health`, { timeout: 2000 }).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
    if (!health?.ok) {
      info(`connect: the real half skipped, ${parsed.port} is down`);
      await ctx.close();
      return;
    }
    const readKey = (file) => {
      try {
        return readFileSync(file, "utf8").trim();
      } catch {
        return "";
      }
    };
    let key = readKey(keyFile);
    if (key === "") {
      info(`connect: the real half skipped, cannot read the key file named by ${envFile}`);
      await ctx.close();
      return;
    }
    // The Read only bot's key: LOOPS_DEV_READONLY_KEY_FILE, else the key file's name with -ro before .key.
    const readonlyFile = env.LOOPS_DEV_READONLY_KEY_FILE ?? keyFile.replace(/\.key$/, "-ro.key");
    let readonlyKey = readKey(readonlyFile);
    const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
    const { createKeyStore } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "keyStore.ts")).href);
    const { createArchiveStore } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "archiveStore.ts")).href);
    const { loadPairingSecret } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "pairing.ts")).href);
    const { PAIRING_SECRET_NAME, storedKeyFile } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "config.ts")).href);
    // A fresh folder of the host's own for this run (the stored key and the pairing secret land here), removed at the end.
    const configDir = path.join(OUT, `${tag}-connect-config`);
    rmSync(configDir, { recursive: true, force: true });
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    const secretFile = path.join(configDir, PAIRING_SECRET_NAME);
    const keyPath = storedKeyFile(configDir);
    // What `npm run world` gives the host: the discovery through the data folder, its own stores, pairing on with the
    // secret kept in a file (the second host reads the same file: that is what keeps every paired browser).
    const hostOptions = () => ({
      discovery: { appData, intervalMs: 1000 },
      keyStore: createKeyStore(configDir),
      archiveStore: createArchiveStore(configDir),
      port: hostPort,
      allowedOrigins: [origin],
      pairing: "on",
      pairingSecret: loadPairingSecret(secretFile),
      retryMs: { min: 200, max: 2000 },
      log: () => undefined,
    });
    let host = await createHost(hostOptions());
    info(`connect: loops on 127.0.0.1:${parsed.port} (version ${health.version}); a keyless host on 127.0.0.1:${host.port} looking in ${appData}, its folder ${configDir}, pairing on, behind the Vite proxy on ${origin}`);
    const hostApi = (p) => pg.request.get(`${origin}/world-api${p}`).then((r) => r.json());
    try {
      await pg.goto(host.mintPairLink(origin));
      const landed = new URL(pg.url());
      const connect = await screen(pg, "connect", 20000);
      const first = await hostApi("/health").catch(() => null);
      ok(half("the one-time link lands on the Connect screen of a keyless host that found loops"),
        landed.pathname === "/" && landed.origin === origin && connect && first?.paired === true && first?.connection?.discovery?.state === "found" && first?.connection?.key?.state === "none",
        `${landed.pathname}; loops ${first?.connection?.discovery?.state} via ${first?.connection?.discovery?.via}, key ${first?.connection?.key?.state}`,
      );
      await shot(pg, "42-connect-real-connect");
      await mark(pg);
      if (readonlyKey === "") info(`connect: no Read only key at ${readonlyFile} (LOOPS_DEV_READONLY_KEY_FILE), that check is skipped`);
      else {
        await paste(pg, readonlyKey);
        await pg.waitForFunction(() => /Read only/.test(document.querySelector(".connect-rejected")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
        const roReason = await reasonText(pg);
        ok(half("a Read only bot's key is refused with the words to make one with Read only off"), /Read only/.test(roReason) && /"Read only" off/.test(roReason) && !(await leaked(pg, readonlyKey)), roReason.slice(0, 140));
        readonlyKey = "";
      }
      const bogus = "chl_" + randomBytes(33).toString("base64url").slice(0, 43);
      await paste(pg, bogus);
      await pg.waitForFunction(() => /does not know/.test(document.querySelector(".connect-rejected")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
      const bogusReason = await reasonText(pg);
      const usable = (await screen(pg, "connect", 2000)) && (await keyField(pg).count()) === 1 && (await keyField(pg).isEnabled().catch(() => false));
      ok(half("a key loops does not know is refused and the screen stays usable"), /does not know this key/.test(bogusReason) && usable, bogusReason.slice(0, 100));
      await shot(pg, "43-connect-real-refused");
      await paste(pg, key);
      await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
      const live = await until(pg, "live", 30000);
      const marker = await marked(pg);
      const stored = existsSync(keyPath);
      ok(half("the pasted key connects: the Live chip without a reload, the key stored by the host"), live === "live" && marker === "set" && stored, `${live}, marker ${marker}, stored ${stored}`);
      await dressed(pg, 30000).catch(() => {});
      await shot(pg, "44-connect-real-live");
      const snapshot = await hostApi("/snapshot").catch(() => null);
      const names = (snapshot?.projects ?? []).map((p) => `${p.name} (${p.key})`);
      const tv = await text(pg);
      ok(half("the town shows the real projects by name"), names.length > 0 && names.every((n) => tv.includes(n)) && !/Demo mode/.test(tv), names.join(", ") || tv.slice(0, 120).replace(/\n/g, " | "));
      ok(half("the key is in no DOM, storage or URL"), !(await leaked(pg, key)));
      // The host stopped and started again, as the morning after: the stored key and the same secret file, so the tab
      // is Live again without a new link.
      await host.close();
      host = null;
      const atStop = await until(pg, "stale", 10000);
      const storedKey = readKey(keyPath);
      const restarted = Date.now();
      host = await createHost({ ...hostOptions(), key: storedKey, keyName: "crewhub-world", keySource: "stored" });
      const again = await until(pg, "live", 30000);
      const marker2 = await marked(pg);
      const after = await hostApi("/health").catch(() => null);
      ok(half("a restarted host with the kept pairing secret is Live again without a re-pair"),
        again === "live" && marker2 === "set" && after?.paired === true && after?.connection?.key?.state === "ok" && after?.connection?.key?.source === "stored",
        `${atStop} at the stop, ${again} ${((Date.now() - restarted) / 1000).toFixed(1)} s after the new host; key ${after?.connection?.key?.state} (${after?.connection?.key?.source}), marker ${marker2}`,
      );
      await shot(pg, "45-connect-real-restarted");
      await chip(pg).click();
      await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
      await pg.getByRole("button", { name: "Forget this key" }).click();
      await pg.getByRole("button", { name: "Forget", exact: true }).click();
      const forgot = await screen(pg, "connect", 20000);
      const fileGone = !existsSync(keyPath);
      ok(half("Forget this key hands the Connect screen back and the stored key is gone"), forgot && fileGone, `screen ${forgot ? "connect" : "not connect"}, file gone ${fileGone}`);
      await shot(pg, "46-connect-real-forgotten");
    } finally {
      key = "";
      readonlyKey = "";
      if (host !== null) await host.close().catch(() => {});
      rmSync(configDir, { recursive: true, force: true });
      await ctx.close().catch(() => {});
    }
  }

  try {
    await stubHalf();
    await realHalf();
  } finally {
    problems.push(...own.filter((x) => !expected(x)));
  }
});

await group("rooms", async () => {
  // 16. The three-room building, behind `?rooms=three` whatever this browser's Buildings setting says. The halls are the
  // spec addendum's: Administration (the racks, the mailbox, the archive counter), the floor (desks, the huddle), the
  // lead's office. Their navigation ids are the hall's own model kind: lobby, workers, lead-office.
  const HALLS = ["Administration", "The floor", "Lead's office"];
  let p = await open();
  await town(p, 3000, `${BASE}?rooms=three`);
  // Round 33 (the mutation check of the scene's teardown, r33-mut-scene): what a browser sees once a scene is torn
  // down, in two teardowns. (a) StrictMode's rehearsal mount on the dev build makes a scene, disposes it and makes the
  // one that stays: the host holds one canvas, and no listener from the scene's own files (TownScene.ts,
  // WorldCanvas.tsx, three's OrbitControls) stands twice on window or document. (b) A scene made beside the live one
  // from the same view and disposed once laid out: its canvas keeps no listener (the scene's own, the controls' and
  // the renderer's), the interval it made is cleared, it draws no frame, its host no longer sizes its canvas, the
  // canvas is out of the host (and, put back, is not sized by the host again), and every geometry the scene alone
  // held is disposed.
  // The browser's own listener table for an object (CDP), each listener with the file and line of its handler.
  const inspector = async (page) => {
    const cdp = await page.context().newCDPSession(page);
    const scripts = new Map();
    cdp.on("Debugger.scriptParsed", (e) => scripts.set(e.scriptId, e.url));
    await cdp.send("Debugger.enable");
    const listenersOf = async (expression) => {
      const { result } = await cdp.send("Runtime.evaluate", { expression });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
      await cdp.send("Runtime.releaseObject", { objectId: result.objectId }).catch(() => {});
      return listeners.map((l) => ({ type: l.type, capture: l.useCapture, url: scripts.get(l.scriptId) ?? "", line: l.lineNumber + 1, column: l.columnNumber + 1 }));
    };
    const close = async () => {
      await cdp.send("Debugger.disable").catch(() => {});
      await cdp.detach().catch(() => {});
    };
    return { listenersOf, close };
  };
  let { listenersOf, close: closeInspector } = await inspector(p);
  const sceneFiles = /TownScene\.ts|WorldCanvas\.tsx|OrbitControls/;
  const doubled = (list) => {
    const seen = new Map();
    for (const l of list) {
      if (!sceneFiles.test(l.url)) continue;
      const key = `${l.type}${l.capture ? " (capture)" : ""} ${l.url.replace(/^.*\//, "").replace(/\?.*$/, "")}:${l.line}:${l.column}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].filter(([, n]) => n > 1).map(([key, n]) => `${key} ×${n}`);
  };
  const onWindow = await listenersOf("window");
  const onDocument = await listenersOf("document");
  const sceneOwned = [...onWindow, ...onDocument].filter((l) => sceneFiles.test(l.url)).length;
  const canvases = await p.locator(".canvas-host canvas").count();
  const twice = [...doubled(onWindow), ...doubled(onDocument)];
  ok("rooms (round 33, teardown a): StrictMode's rehearsal mount leaves one canvas in the host and no listener of the scene's files twice on window or document", canvases === 1 && sceneOwned > 0 && twice.length === 0, `${canvases} canvas(es); ${sceneOwned} listener(s) of the scene's files on window and document; doubled: ${twice.join(", ") || "none"}`);
  const made = await p.evaluate(async () => {
    const live = globalThis.__town;
    const { TownScene } = await import("/src/world/TownScene.ts");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:320px;height:200px;opacity:0;pointer-events:none";
    const labels = document.createElement("div");
    document.body.append(host, labels);
    const intervals = [];
    const cleared = new Set();
    const setInterval0 = window.setInterval;
    const clearInterval0 = window.clearInterval;
    window.setInterval = (...args) => {
      const id = setInterval0.apply(window, args);
      intervals.push(id);
      return id;
    };
    window.clearInterval = (id) => {
      cleared.add(id);
      return clearInterval0.call(window, id);
    };
    const none = () => {};
    let ready = false;
    let scene = null;
    try {
      scene = new TownScene(host, labels, { ...live.view }, { enter: none, hover: none, pick: none, error: none, build: none, followed: none, followStopped: none, ready: () => (ready = true), walkPlace: none });
    } finally {
      // The constructor is synchronous: the intervals it made are the probe's. The dev probe points at the live scene again.
      window.setInterval = setInterval0;
      globalThis.__town = live;
    }
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 300 && !ready; i++) await pause(50);
    await frame();
    // Its host sizes it while it lives.
    const canvas = host.querySelector("canvas");
    host.style.width = "400px";
    await pause(100);
    await frame();
    const geometriesOf = (root) => {
      const set = new Set();
      root.traverse((o) => o.geometry && set.add(o.geometry));
      return set;
    };
    // Its own geometries: in its graph and not in the live scene's; the plots' hit boxes share one module constant.
    const shared = geometriesOf(live.scene);
    scene.scene.traverse((o) => o.userData.plot && o.geometry && shared.add(o.geometry));
    const own = [...geometriesOf(scene.scene)].filter((g) => !shared.has(g));
    const disposed = new Set();
    for (const g of own) {
      const dispose = g.dispose;
      g.dispose = function () {
        disposed.add(this);
        return dispose.call(this);
      };
    }
    globalThis.__probe = { scene, host, labels, canvas, intervals, cleared, own, disposed, restore: () => (window.clearInterval = clearInterval0) };
    return { ready, intervals: intervals.length, own: own.length, sizedAlive: canvas?.width ?? -1 };
  });
  const canvasListenersAlive = (await listenersOf("globalThis.__probe.canvas")).length;
  const gone = await p.evaluate(async () => {
    const { scene, host, labels, canvas, intervals, cleared, own, disposed, restore } = globalThis.__probe;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    scene.dispose();
    restore();
    let drawn = 0;
    scene.renderer.render = () => drawn++;
    const inHost = host.querySelector("canvas") !== null;
    // Its canvas put back in the host: a host that changes size must not reach the scene any more (its resize
    // handler sizes the canvas whenever the canvas has a parent).
    host.append(canvas);
    host.style.width = "480px";
    await pause(300);
    await frame();
    const left = own.filter((g) => !disposed.has(g)).map((g) => `${g.type}${g.name ? ` ${g.name}` : ""}`);
    return { intervalsLeft: intervals.filter((id) => !cleared.has(id)).length, drawn, sizedAfter: canvas.width, inHost, left: left.length, leftNames: [...new Set(left)].slice(0, 6).join(", ") };
  });
  const canvasListenersAfter = (await listenersOf("globalThis.__probe.canvas")).length;
  await p.evaluate(() => {
    globalThis.__probe.host.remove();
    globalThis.__probe.labels.remove();
    delete globalThis.__probe;
  });
  await closeInspector();
  ok("rooms (round 33, teardown b): a scene made beside the live one and disposed once laid out keeps no listener on its canvas, clears its interval, draws no frame, leaves the host and is not sized by it again, and disposes every geometry it alone held", made.ready && made.intervals > 0 && made.own > 0 && canvasListenersAlive > 0 && canvasListenersAfter === 0 && gone.intervalsLeft === 0 && gone.drawn === 0 && made.sizedAlive === 400 && gone.sizedAfter === 400 && !gone.inHost && gone.left === 0, `laid out ${made.ready}; canvas listeners ${canvasListenersAlive} alive, ${canvasListenersAfter} after; intervals ${made.intervals} made, ${gone.intervalsLeft} left; frames drawn after ${gone.drawn}; canvas width ${made.sizedAlive} alive (host 400), ${gone.sizedAfter} after (host 480); in host after: ${gone.inHost}; own geometries ${made.own}, undisposed ${gone.left}${gone.left ? ` (${gone.leftNames})` : ""}`);
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  const slug = await entered(p);
  await p.keyboard.press("d");
  await p.waitForTimeout(900);
  // The halls' signs; the four racks in Administration carry signs of their own (`.rack-sign`), counted apart.
  const signs = (await p.locator(".world-labels .room-sign:not(.rack-sign) strong").allInnerTexts()).map((t) => t.trim());
  const racks = (await p.locator(".world-labels .rack-sign").allInnerTexts()).map((t) => t.trim());
  await shot(p, "26-rooms-signs");
  await p.keyboard.press("d");
  await p.waitForTimeout(400);
  ok("rooms: three room signs in a building", signs.length === 3 && HALLS.every((h) => signs.includes(h)), `${signs.join(", ")} (in ${slug})`);
  // The label layout keeps the rack signs from overlapping, so it shows one or more of the four at a time.
  const RACKS = ["Backlog", "Planning", "Review", "Done"];
  ok("rooms: a rack sign in Administration with its count", racks.length > 0 && racks.every((r) => RACKS.some((n) => r.startsWith(n)) && /\d+ tickets?$/.test(r)), racks.join(", "));

  // 17. The arrow keys move the focus between the three halls; the status line sums each hall up.
  const first = await announced(p, "ArrowRight");
  const north = await announced(p, "ArrowUp");
  const west = await announced(p, "ArrowLeft");
  const halls = [first, north, west].map((t) => HALLS.find((h) => t.includes(`${h}:`)) ?? "?");
  ok("rooms: arrow keys move between the three halls", new Set(halls).size === 3 && !halls.includes("?"), `${halls.join(" → ")}; "${west.slice(0, 100)}"`);
  await shot(p, "27-rooms-focus");

  // 18. The text view tells the halls' story: racks with counts, desks with tickets, a package on a rack and one on a desk.
  const tv = await text(p);
  const admin = (tv.match(/Administration: Backlog \d+, Planning \d+, Review \d+, Done \d+[^\n]*/) ?? [""])[0];
  const floor = (tv.match(/The floor: [^\n]*/) ?? [""])[0];
  ok("rooms: the text view names the racks and the desks", admin !== "" && /at its desk on [A-Z]+-\d+/.test(floor) && /Lead's office: /.test(tv), `${admin} | ${floor.slice(0, 90)}`);
  const onRack = (tv.match(/([A-Z]+-\d+) "[^\n]*; on the (Backlog|Planning|Review|Done) rack\./) ?? [])[0] ?? "";
  const onDesk = (tv.match(/([A-Z]+-\d+) "[^\n]*; on ([^\n;]+)'s desk\./) ?? [])[0] ?? "";
  ok("rooms: a package on a rack and one on a desk", onRack !== "" && onDesk !== "", `${onRack.slice(0, 60)}… | ${onDesk.slice(0, 60)}…`);

  // 19. The lead's office beacon: CL-44 needs attention from 8:00 in the demo script, so the office summary names it.
  ok("seek attention (rooms)", await seek(p, 510000));
  await p.waitForTimeout(1500);
  const tvLater = await text(p);
  const office = (tvLater.match(/Lead's office: [^\n]*beacon: [^\n]*/) ?? [""])[0];
  ok("rooms: the lead's office beacon", office !== "", office.slice(0, 120));

  // 19b. A person carries work into Done (spec addendum "a person in the world"): the storyline's first move into Done
  // by its person (PERSON_DONE_AT in packages/demo/src/script.ts, CR-37 at 3:22); the text view tells the carry, and
  // the scene has a person figure walking it. Sought to 4 s before it, read 12 s later (the move has 1.2 s of jitter).
  const { FIRST_PERSON_DONE_MS } = await import(pathToFileURL(path.join(REPO, "packages", "demo", "src", "script.ts")).href);
  ok("seek person (rooms)", await seek(p, FIRST_PERSON_DONE_MS - 4000));
  await p.waitForTimeout(12000);
  const tvPerson = await text(p);
  const carry = (tvPerson.match(/\S+, a person, (is carrying|is on the way in to carry|moved) [A-Z]+-\d+ to Done[^\n]*/) ?? [""])[0];
  const person = await p.evaluate(() => [...(globalThis.__town?.persons?.persons?.() ?? [])].map((w) => `${w.visit.displayName} ${w.phase}${w.holding ? " holding" : ""}`).join("; ")).catch(() => "");
  ok("rooms: a person carries a package to the Done rack", carry !== "" && /^\S+ (to-package|to-rack|leaving)/.test(person), `${carry.slice(0, 80)} | figure: ${person || "none"}`);
  await shot(p, "27b-rooms-person");
  await p.context().close();

  // 19c. The walkers land after the first drawn frame (TownScene: the navigation graph and the walk runtime follow it
  // in a task of their own, marked world:walks), and every figure must already stand where its walker starts: no
  // figure may move or turn between the first frame, the walkers' arrival and a moment later unless its walker walks.
  // W pressed in the first frame begins walk mode, and a follow asked in the first frame holds (both bring the walkers
  // at once). Each page's figures are read at the marks by a hook on performance.mark set before the page loads.
  for (const action of ["none", "walk", "follow"]) {
    p = await open();
    await p.addInitScript(`(() => {
      const samples = (window.__figures = {});
      const sample = (name) => {
        const t = globalThis.__town;
        if (!t) return;
        const out = {};
        t.scene.traverse((o) => {
          const id = o.userData && o.userData.agentId;
          if (!id || out[id]) return;
          o.updateWorldMatrix(true, false);
          const p = new o.position.constructor();
          o.getWorldPosition(p);
          const w = t.walks.walker(id);
          out[id] = { x: p.x, y: p.y, z: p.z, ry: o.rotation.y, walking: !!(w && w.walking) };
        });
        samples[name] = out;
      };
      window.__sampleFigures = sample;
      const mark = performance.mark.bind(performance);
      performance.mark = (name, ...rest) => {
        const r = mark(name, ...rest);
        if (name === "world:first-frame") {
          sample(name);
          if (${JSON.stringify(action)} === "walk") window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }));
          if (${JSON.stringify(action)} === "follow") {
            const t = globalThis.__town;
            const agent = t.view.model.buildings.flatMap((b) => b.agents).find((a) => a.presence === "real");
            if (agent) t.follow((window.__followKey = agent.key));
          }
        } else if (name === "world:walks") sample(name);
        return r;
      };
    })();`);
    await town(p, 1500, `${BASE}?rooms=three`);
    await p.evaluate(() => globalThis.__sampleFigures("later"));
    const figures = await p.evaluate(() => globalThis.__figures);
    const first = figures["world:first-frame"] ?? {};
    const moved = [];
    for (const name of ["world:walks", "later"]) {
      for (const [id, f] of Object.entries(figures[name] ?? {})) {
        const before = first[id];
        if (!before) continue;
        const d = Math.hypot(f.x - before.x, f.y - before.y, f.z - before.z);
        if ((d > 1e-3 || Math.abs(f.ry - before.ry) > 1e-3) && !f.walking) moved.push(`${id} ${d.toFixed(3)} at ${name}`);
      }
    }
    const n = Object.keys(first).length;
    const landed = !!figures["world:walks"];
    if (action === "none") ok("rooms: no figure moves when the walkers land after the first frame", n > 0 && landed && moved.length === 0, `${n} figures at the first frame, walkers ${landed ? "landed" : "NOT landed"}; moved ${moved.length}${moved.length ? ": " + moved.slice(0, 5).join(", ") : ""}`);
    else if (action === "walk") {
      const v = await visitor(p);
      ok("rooms: W in the first frame begins walk mode, no figure moves", v !== null && typeof v.room === "string" && moved.length === 0, `visitor ${v ? `in ${v.room}` : "null"}; moved ${moved.length}`);
      await shot(p, "27c-rooms-first-frame-walk");
    } else {
      const f = await p.evaluate(() => ({ asked: window.__followKey ?? null, following: globalThis.__town?.following ?? null }));
      ok("rooms: a follow asked in the first frame holds, no figure moves", f.asked !== null && f.following === f.asked && moved.length === 0, `${f.asked} → ${f.following}; moved ${moved.length}`);
    }
    await p.context().close();
  }

  // 20. The agent card on a figure at a desk: the jump list lands beside the agent with it selected, Enter opens the card,
  // and its Now line says the floor and the desk.
  p = await open();
  await town(p, 2500, `${BASE}?rooms=three`);
  await canvas(p).focus();
  await p.keyboard.press("/");
  const dialog = p.getByRole("dialog", { name: "Jump to" });
  await dialog.waitFor({ timeout: 3000 }).catch(() => {});
  await p.keyboard.type("cr-dev-1");
  await p.waitForTimeout(400);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await canvas(p).focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(800);
  const card = p.locator(".agent-card");
  const cardText = (await card.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("rooms: the agent card opens on a figure at a desk", (await card.count()) > 0 && /on the floor at an? \w+ desk/.test(cardText), cardText.slice(0, 120));
  await shot(p, "28-rooms-card");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);

  // 21. Walk mode: W starts on the street before the nearest building; north goes through the front door into
  // Administration (its navigation room is `<slug>/lobby`), then along the racks to the door at administration cell
  // (18, 0) and through it onto the floor (`<slug>/workers`, whose side of that door is cell (9, 17); the stop is the
  // cell beyond it). Each stop is reached by `walkTo`, which steers through the camera's yaw in bounded bursts.
  await canvas(p).focus();
  await p.keyboard.press("w");
  await p.waitForTimeout(800);
  await p.keyboard.down("ArrowUp");
  let inside = null;
  for (let i = 0; i < 120 && !inside; i++) {
    await p.waitForTimeout(100);
    const v = await visitor(p);
    if (v?.building) inside = v;
  }
  await p.keyboard.up("ArrowUp");
  ok("rooms: walk mode enters through the front door into Administration", !!inside && /\/lobby$/.test(inside.room), inside ? `${inside.room} (x ${inside.x.toFixed(1)}, z ${inside.z.toFixed(1)})` : "never entered a building");
  await shot(p, "29-rooms-walk-in");
  let onFloor = null;
  if (inside) {
    const b = inside.building;
    await walkTo(p, { room: `${b}/lobby`, cell: { x: 15, z: 7 } }, 8);
    await walkTo(p, { room: `${b}/lobby`, cell: { x: 18, z: 2 } }, 10);
    await walkTo(p, { room: `${b}/lobby`, cell: { x: 18, z: 0 } }, 6);
    onFloor = await walkTo(p, { room: `${b}/workers`, cell: { x: 9, z: 16 } }, 10);
  }
  ok("rooms: walking on reaches the floor", !!onFloor && /\/workers$/.test(onFloor.room), onFloor ? `${onFloor.room} (x ${onFloor.x.toFixed(2)}, z ${onFloor.z.toFixed(2)}, ${Math.hypot(onFloor.dx, onFloor.dz).toFixed(2)} from the stop)` : "no walk");
  await shot(p, "30-rooms-walk-floor");
  // Round 33 (teardown c): the walk's key listeners (WalkControls in WorldCanvas.tsx) stand on window while the walk
  // lasts and are gone once Escape ends it.
  ({ listenersOf, close: closeInspector } = await inspector(p));
  const walkKeys = async () => (await listenersOf("window")).filter((l) => /WorldCanvas\.tsx/.test(l.url)).map((l) => l.type).sort();
  const keysWalking = await walkKeys();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);
  const keysAfter = await walkKeys();
  ok("rooms (round 33, teardown c): the walk's key listeners stand on window during the walk and none is left once Escape ends it", keysWalking.length > 0 && keysAfter.length === 0, `walking: ${keysWalking.join(", ") || "none"}; after Escape: ${keysAfter.join(", ") || "none"}`);
  await closeInspector();
  await p.context().close();
});

await group("real", async () => {
  // 22. Live mode against the real development crewhub-loops: the env file names it and the key file; the host is
  // started here, on --host-port, with that key; the browser opens your Vite (started with CREWHUB_WORLD_PORT).
  const envFile = loopsEnvFile();
  const env = readEnvFile(envFile);
  const loopsUrl = (env.LOOPS_DEV_URL ?? "").replace(/\/+$/, "");
    noteLoopsUrl(loopsUrl);
  const keyFile = env.LOOPS_DEV_KEY_FILE ?? "";
  const parsed = (() => {
    try {
      return new URL(loopsUrl);
    } catch {
      return null;
    }
  })();
  // This machine only: the development loops is loopback, as every address a tool opens.
  const loopback = parsed !== null && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.port !== "";
  if (!loopback || keyFile === "") {
    info(`real: skipped, no loopback LOOPS_DEV_URL and LOOPS_DEV_KEY_FILE in ${envFile}`);
    return;
  }
  // Never the Mac app's port nor 5180, even when the env file names it (a typo of 8291 is 8091).
  const urlVerdict = ownLoopsUrl(loopsUrl);
  if (!urlVerdict.ok) opts.fail(`${envFile}: LOOPS_DEV_URL ${urlVerdict.reason}`);
  const loopsPort = parsed.port;
  // Every read of this group goes through the browser's request context (a tool makes no network call of its own).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pg = await ctx.newPage();
  watch(pg, origin, problems, "real");
  const health = await pg.request.get(`${loopsUrl}/api/health`, { timeout: 2000 }).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
  if (!health?.ok) {
    info(`real: skipped, ${loopsPort} is down`);
    await ctx.close();
    return;
  }
  let key = "";
  try {
    key = readFileSync(keyFile, "utf8").trim();
  } catch {}
  if (key === "") {
    info(`real: skipped, cannot read the key file named by ${envFile}`);
    await ctx.close();
    return;
  }
  const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const hostPort = Number(opts["host-port"]);
  if (!Number.isInteger(hostPort) || hostPort <= 0) opts.fail("--host-port <port> must be a port number");
  const keyName = path.basename(keyFile).replace(/^agent-/, "").replace(/\.key$/, "");
  const hostOptions = { loopsUrl, keyName, pairing: "off", retryMs: { min: 200, max: 2000 }, log: () => undefined };
  const host = await createHost({ ...hostOptions, key, port: hostPort, allowedOrigins: [origin] });
  info(`real: loops on 127.0.0.1:${loopsPort} (version ${health.version}), host on 127.0.0.1:${host.port} behind the Vite proxy on ${origin}, key ${keyName}`);
  // The host's answers through the Vite proxy, as the page reads them.
  const hostApi = (p) => pg.request.get(`${origin}/world-api${p}`).then((r) => r.json());
  const chip = pg.locator(".connection-chip").first();
  let tcpProjects = -1;
  try {
    const snapshot = await hostApi("/snapshot");
    tcpProjects = Array.isArray(snapshot.projects) ? snapshot.projects.length : -1;
    ok("real: the host assembles a snapshot from the real loops", Array.isArray(snapshot.projects) && snapshot.projects.length > 0 && typeof snapshot.cursor === "number", `cursor ${snapshot.cursor}, ${snapshot.projects?.length} projects`);
    const projects = snapshot.projects ?? [];
    const names = projects.map((p) => `${p.name} (${p.key})`);
    await pg.goto(BASE);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    const state = await chip.getAttribute("data-connection").catch(() => null);
    ok("real: the chip says Live against the real loops", state === "live", `${state}: ${(await chip.innerText().catch(() => "")).trim()}`);
    await shot(pg, "31-real-town");
    const tv = await text(pg);
    ok("real: the town shows the real projects by name", names.length > 0 && names.every((n) => tv.includes(n)) && !/Demo mode/.test(tv), `${names.join(", ")}${names.every((n) => tv.includes(n)) ? "" : " | " + tv.slice(0, 160).replace(/\n/g, " | ")}`);
    // Round 9: the facts the log holds come with the snapshot, so a fresh tab shows the dust of a quiet ticket and
    // the last runs' lines; skipped with an INFO line when this loops has none open right now.
    const carriedQuiet = Array.isArray(snapshot.quiet) ? snapshot.quiet : [];
    const carriedRuns = Array.isArray(snapshot.automationRuns) ? snapshot.automationRuns : [];
    if (carriedQuiet.length > 0) ok("real: a fresh tab shows the dust of the quiet tickets the host read from the log", carriedQuiet.every((e) => new RegExp(`${e.ticket?.key} has been quiet in `).test(tv)), carriedQuiet.map((e) => `${e.ticket?.key} ${e.payload?.minutes} min`).join(", "));
    else info("real: no open quiet stretch on this loops right now, the dust check is skipped");
    if (carriedRuns.length > 0) ok("real: a fresh tab lists the last automation runs the host read from the log", carriedRuns.slice(-3).every((e) => tv.includes(`ran on ${e.ticket?.key}: `)), carriedRuns.slice(-3).map((e) => `${e.ticket?.key} ${e.payload?.outcome}`).join(", "));
    else info("real: no automation run on an open ticket on this loops, the run lines check is skipped");
    // The building with the most tickets: its real tickets, by key, in the text view and in the scene.
    const withBoard = projects.map((p) => ({ p, keys: (snapshot.boards?.[p.slug]?.columns ?? []).flatMap((c) => c.tickets.map((t) => t.key)) })).sort((a, b) => b.keys.length - a.keys.length)[0];
    if (withBoard && withBoard.keys.length > 0) {
      await canvas(pg).focus();
      await pg.keyboard.press("/");
      const dialog = pg.getByRole("dialog", { name: "Jump to" });
      await dialog.waitFor({ timeout: 3000 }).catch(() => {});
      await pg.keyboard.type(withBoard.p.name);
      await pg.waitForTimeout(400);
      await pg.keyboard.press("Enter");
      await pg.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
      await pg.waitForTimeout(1200);
      const inside = await entered(pg);
      const tvInside = await text(pg);
      const named = withBoard.keys.filter((k) => tvInside.includes(k));
      ok("real: a building shows its real tickets and the text view names them", inside === withBoard.p.slug && named.length === withBoard.keys.length, `${inside}: ${named.length}/${withBoard.keys.length} of ${withBoard.keys.join(", ")}`);
      await shot(pg, "32-real-building");
      // A move during the run (the seed tool or a person): the building's count follows the board within the budget.
      // The racks are read between two board reads that agree, so a board that moves meanwhile (a fast seed) is read again.
      const moved = await waitForMove(hostApi, withBoard.p.slug, 15000);
      if (moved === null) info("real: no ticket moved during the run, the count check is skipped (run tools/loops-seed.mjs alongside to see it)");
      else {
        await pg.waitForTimeout(1500);
        const rackCounts = async () => {
          const board = await hostApi(`/board/${encodeURIComponent(moved.slug)}`);
          const by = Object.fromEntries((board.columns ?? []).map((c) => [c.status, c.tickets.length]));
          return ["backlog", "planned", "review", "done"].map((k) => by[k] ?? 0);
        };
        // A moved ticket flies to its new rack first (world-model flights, a few seconds at real time), so the racks are
        // given up to 12 s to agree with a board that stands still.
        let racks = [];
        let board = [];
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const before = await rackCounts();
          const tvMoved = await text(pg);
          racks = (tvMoved.match(/Administration: Backlog (\d+), Planning (\d+), Review (\d+), Done (\d+)/) ?? []).slice(1).map(Number);
          board = await rackCounts();
          if (before.join("/") === board.join("/") && racks.join("/") === board.join("/")) break;
          await pg.waitForTimeout(1000);
        }
        ok("real: after a ticket moved, the building's counts follow the board", racks.length === 4 && racks.join("/") === board.join("/"), `${moved.key} ${moved.from} → ${moved.to}; racks ${racks.join("/")} vs board ${board.join("/")}`);
        await shot(pg, "33-real-moved");
      }
    } else info("real: no project has tickets, the building checks are skipped");
    const after = await hostApi("/health");
    ok("real: the host stayed on the real loops", after.loops === "ok" && typeof after.cursor === "number" && after.cursor >= snapshot.cursor, `loops ${after.loops}, cursor ${snapshot.cursor} → ${after.cursor}`);
    // Round 7: loops' version as that loops' own health says it, in the host's health and in the panel (what 8291 can
    // show without being stopped; the stop/start, revoke and upgrade roads are the ops group's, over the fake).
    await chip.click();
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const facts = (await pg.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
    const road = await pg.locator(".connection-chat").getAttribute("data-road").catch(() => null);
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    // Round 29: the chat road and the archive source match the key: a viewer key (crewhub-loops main, --loops main)
    // reads the chat (session key, the Chat section on the key road) and lists the archived projects (includeArchived
    // answers 200 for a viewer, #965); a plain external bot's key reads no chat and the archive comes from the log.
    const viewer = after.connection?.session?.state === "key";
    const archivedSource = after.connection?.archived?.source;
    ok(
      `real: the chat road and the archive source match the key: ${viewer ? "a viewer key reads the chat (session key, the Chat section on the key road) and lists the archived projects" : "a plain external bot's key reads no chat (no session, the Chat section on no road) and the archived projects come from the log"}`,
      viewer ? road === "key" && archivedSource === "list" : after.connection?.session === undefined && road === "none" && ["log", "remembered", "none"].includes(archivedSource),
      `key ${keyName}: session ${JSON.stringify(after.connection?.session)}, data-road ${road}, archived from ${archivedSource} (${after.connection?.archived?.count})`,
    );
    ok("real: the host reports loops' version as its health says it, with no earlier version, and the panel names it", after.loopsCommit === health.version && after.loopsCommitBefore === undefined && facts.includes(`crewhub-loops version ${health.version}`), `${after.loopsCommit} (loops says ${health.version}); panel: ${facts.replace(/.*crewhub-loops version/, "crewhub-loops version").slice(0, 80)}`);
  } finally {
    await host.close().catch(() => {});
  }
  // The socket: with the TCP host closed (one upstream stream of this key at a time), a second host reads the same
  // loops over its Unix socket (CREWHUB_WORLD_LOOPS_SOCKET): the same key, the same projects, `transport: "unix"`.
  const socketPath = loopsSocketPath();
  // A development loops' socket, never the Mac app's (its data folder holds run/api.sock).
  const socketVerdict = ownAppData(socketPath, process.env.HOME ?? "~");
  if (!socketVerdict.ok) opts.fail(`--loops-socket: ${socketVerdict.reason}`);
  let unixHost = null;
  try {
    if (!isUnixSocket(socketPath)) {
      info(`real: socket check skipped, no Unix socket at ${socketPath} (--loops-socket names another)`);
      return;
    }
    unixHost = await createHost({ ...hostOptions, key, loopsSocket: socketPath, port: 0 });
    key = "";
    const unixApi = (p) => pg.request.get(`${unixHost.url}/world-api${p}`).then((r) => r.json());
    let unixHealth = await unixApi("/health");
    for (let attempt = 0; attempt < 25 && unixHealth.loops !== "ok"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      unixHealth = await unixApi("/health");
    }
    ok("real: a host over the Unix socket reads the same loops", unixHealth.transport === "unix" && unixHealth.loops === "ok" && typeof unixHealth.cursor === "number", `transport ${unixHealth.transport}, loops ${unixHealth.loops}, cursor ${unixHealth.cursor}, socket ${socketPath}`);
    const unixSnapshot = await unixApi("/snapshot");
    const unixProjects = Array.isArray(unixSnapshot.projects) ? unixSnapshot.projects.length : -1;
    ok("real: the socket host's snapshot has the projects the TCP host had", unixProjects > 0 && unixProjects === tcpProjects, `${unixProjects} over the socket, ${tcpProjects} over TCP`);
  } finally {
    key = "";
    if (unixHost !== null) await unixHost.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
});

/**
 * The env file of the development loops: --loops-env, else the first `tools/out/loops-dev.env` that exists in this
 * worktree, in the main checkout (through the common git dir) or in ~/Documents/GitHub/crewhub2-world-demo (where
 * the night's phase 0 wrote it); when none exists, this worktree's path, so the skip line names a real place.
 */
/** Which real development loops: --loops, else CREWHUB_REGRESS_LOOPS, else `dev` (8291, tools/loops-dev.sh's folder); `main` is the instance from crewhub-loops main (8293). */
function loopsName() {
  const name = (opts.loops || process.env.CREWHUB_REGRESS_LOOPS || "dev").trim();
  if (!/^[a-z0-9-]+$/.test(name)) opts.fail(`--loops <name> is a short lower-case name (dev, main), not ${JSON.stringify(name)}`);
  return name;
}
/** The suffix of that instance's files: none for `dev`, `-<name>` otherwise (loops-dev-main.env, ~/crewhub-loops-dev-main). */
function loopsSuffix() {
  return loopsName() === "dev" ? "" : `-${loopsName()}`;
}
function loopsEnvFile() {
  if (opts["loops-env"]) return path.resolve(opts["loops-env"]);
  const candidates = [REPO];
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: REPO, encoding: "utf8" }).trim();
    candidates.push(path.dirname(path.resolve(REPO, common)));
  } catch {}
  candidates.push(path.join(process.env.HOME ?? "~", "Documents", "GitHub", "crewhub2-world-demo"));
  const files = candidates.map((dir) => path.join(dir, "tools", "out", `loops-dev${loopsSuffix()}.env`));
  return files.find((file) => existsSync(file)) ?? files[0];
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

const road2Asks = problems.filter((x) => x.kind === "external" && road2Ask(x));
const external = problems.filter((x) => x.kind === "external" && !road2Ask(x)).map((x) => x.text);
const refusals = problems.filter(probeRefusal);
const errors = problemLines(problems.filter((x) => x.kind !== "external" && !probeRefusal(x)));
ok(`no external requests beyond road 2's own (${road2Asks.length} GET(s) of the four chat routes at the loops web origins the hosts named: the page's probe and, where the origin is set, its poll)`, external.length === 0, [...new Set(external)].slice(0, 5).join(" "));
ok(`no page errors or console errors beyond the probe's CORS refusal where the fake does not name the page's origin (${refusals.length} line(s), the browser's own two for ${new Set(refusals.map((x) => x.pageOrigin)).size} page(s))`, errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();

const passed = results.filter((r) => r.pass).length;
log.push(...errors.slice(5), `regress: ${passed}/${results.length}`);
writeFileSync(`${OUT}${tag}-results.json`, JSON.stringify(results, null, 1));
writeFileSync(`${OUT}${tag}.log`, log.join("\n") + "\n");
console.log(log.join("\n"));
process.exit(passed === results.length ? 0 : 1);
