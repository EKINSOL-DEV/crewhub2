/* profile.mjs: a CPU profile of the world's first paint, or of the first entry into a building (--enter), resolved to
   source files, so the next cut can be found.

   Usage:
     node tools/profile.mjs --port <port> [--runs 1] [--stacks <ms>] [--enter] [--throttle 1] [--viewport 1440x900] [--tag profile] [--out <dir>]
                            [--fake-scenario <id>] [--loops-url <url> --key-file <file>] [--host-port <port>] [--swiftshader]

   What it does: a production run of live mode (lib/live.mjs with --preview: the host serves apps/world/dist on a free
   port against an in-process fake crewhub-loops at speed 0, or the loops of --loops-url; the browser is paired through
   the one-time link first), then per run a fresh context opens the world with a trace on (the timeline, user timing
   and the V8 CPU profiler) until the town is drawn and dressed (`world:town-dressed`). Every frame of the profile is
   resolved through dist's source maps (lib/sourcemap.mjs), so the output names files of apps/ and packages/, not
   minified chunks. **Build with source maps first**: `(cd apps/world && npx vite build --sourcemap)` (and build again
   without them afterwards if the dist is to be served: the maps are only read by this tool).

   Printed per run (the page's own time, ms since navigation, up to the dressed mark):
     the marks (`world:snapshot`, `world:first-frame`, `world:walks`, `world:town-dressed`);
     the CPU in the page's own code;
     self time per function, top 40 (the engine's idle, program and GC rows included, so the page's share is plain);
     inclusive time per source file, top 30 (a sample counts once per file on its stack: what a file costs with what
     it calls);
     every task over 10 ms up to 50 ms past the dressed mark: when it started, how long, and the deepest frames of the
     page's own code in its samples (what the task was doing);
     with --stacks <ms>: for every such task that starts before <ms> after navigation, the whole stacks of its samples
     (outermost frame first, the heaviest stacks first) and the inclusive time per frame: this is what names the module
     and the call behind work done at import (`--stacks 120` found the director's navigation world at module
     evaluation in round 6).
   The raw trace goes to --out as <tag>-<run>.trace.json (open it in DevTools' Performance panel for the picture).
   With --enter (round 25): the run goes on past the dressed town for 2.5 s of idle time (the likely building's inside
   is built ahead, round 24), then the canvas is focused and Enter pressed: the first entry into building 0. The
   report is then of the 500 ms after the key (`profile:enter`, a mark the tool sets): the page's own CPU in them, the
   self and inclusive tables, every task over 10 ms in them, and with --stacks (any number: the window is the filter
   then) their whole stacks. --throttle <rate> slows the page's CPU (4: round 21's phone) and --viewport <w>x<h> sizes
   it (375x812 is mobile, with touch); both apply to the first paint too.

   Reading it: the page's own CPU until dressed is the budget; the inclusive-by-file table says where it goes; the
   tasks say what blocks the main thread and for how long; a task before the scene exists is import-time work, and
   --stacks says whose. Numbers move with the machine's load: profile a before and an after back to back, twice each.

   Method: GPU-backed headless Chromium, 1440 x 900 at DPR 1, a fresh context per run. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cli, launch } from "./lib/world.mjs";
import { LIVE_OPTIONS, startLive } from "./lib/live.mjs";
import { SourceMap } from "./lib/sourcemap.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO, "apps", "world", "dist");
const USAGE = "node tools/profile.mjs --port <port> [--runs 1] [--stacks <ms>] [--enter] [--throttle 1] [--viewport 1440x900] [--tag profile] [--out <dir>] [--fake-scenario <id>] [--loops-url <url> --key-file <file>] [--host-port <port>] [--swiftshader]";
const opts = cli(USAGE, { options: { runs: "1", tag: "profile", stacks: "0", throttle: "1", viewport: "1440x900", ...LIVE_OPTIONS, source: "live", "fake-speed": "0", "host-port": "0" }, flags: ["enter"] });
const throttle = Number(opts.throttle);
if (!(throttle >= 1)) opts.fail("--throttle <rate> must be 1 or more");
const [viewWidth, viewHeight] = opts.viewport.split("x").map(Number);
if (!(viewWidth > 0 && viewHeight > 0)) opts.fail("--viewport takes <width>x<height>");
const phone = viewWidth <= 500;
/** The enter's window: this long after the key. */
const ENTER_WINDOW_MS = 500;
if (!existsSync(path.join(DIST, "index.html"))) opts.fail("no build in apps/world/dist: run (cd apps/world && npx vite build --sourcemap) first");
const stacksUntil = Number(opts.stacks);
if (!(stacksUntil >= 0)) opts.fail("--stacks <ms> must be a number of milliseconds after navigation (0: off)");
const runs = Number(opts.runs);
if (!(runs >= 1)) opts.fail("--runs <n> must be 1 or more");

const maps = new Map();
/** The original position of a frame in a dist chunk, through its map, or null. */
function resolve(url, line, column) {
  const file = (url ?? "").replace(/^.*\/assets\//, "");
  if (!file || !/\.js$/.test(file)) return null;
  if (!maps.has(file)) {
    const mapPath = path.join(DIST, "assets", `${file}.map`);
    maps.set(file, existsSync(mapPath) ? new SourceMap(JSON.parse(readFileSync(mapPath, "utf8"))) : null);
  }
  const map = maps.get(file);
  const pos = map?.originalPositionFor({ line: line + 1, column });
  if (!pos?.source) return null;
  return { source: pos.source.replace(/^.*?\/(packages|apps|node_modules)\//, "$1/"), line: pos.line, name: pos.name };
}
if (!existsSync(path.join(DIST, "assets")) || !readFileSync(path.join(DIST, "index.html"), "utf8").includes("/assets/")) opts.fail("apps/world/dist has no assets folder: build first");
const mapped = (await import("node:fs")).readdirSync(path.join(DIST, "assets")).some((f) => f.endsWith(".js.map"));
if (!mapped) console.warn("profile.mjs: no .js.map beside the chunks: frames stay minified. Build with (cd apps/world && npx vite build --sourcemap).");

const live = await startLive(opts, { preview: true });
console.log(live.describe);
const browser = await launch(opts);
const CATEGORIES = ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink.user_timing", "disabled-by-default-v8.cpu_profiler"];
const ENGINE = /^\((idle|program|garbage|root)/;
try {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({ viewport: { width: viewWidth, height: viewHeight }, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
    const page = await context.newPage();
    if (throttle > 1) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
    await live.pair(page);
    await page.goto("about:blank");
    await browser.startTracing(page, { categories: CATEGORIES, screenshots: false });
    await page.goto(live.base);
    await page.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(200);
    if (opts.enter) {
      await page.waitForTimeout(2300);
      await page.locator("canvas").first().focus();
      await page.evaluate(() => performance.mark("profile:enter"));
      await page.keyboard.press("Enter");
      await page.waitForTimeout(ENTER_WINDOW_MS + 1000);
    }
    const trace = await browser.stopTracing();
    const marks = await page.evaluate(() => performance.getEntriesByType("mark").map((m) => ({ name: m.name, ms: Math.round(m.startTime) })));
    await context.close();
    writeFileSync(path.join(opts.out, `${opts.tag}-${run}.trace.json`), trace);
    report(run, JSON.parse(trace.toString()).traceEvents, marks);
  }
} finally {
  await browser.close();
  await live.close();
}

function report(run, events, marks) {
  const navigation = events.find((e) => e.name === "navigationStart" && e.args?.data?.documentLoaderURL?.startsWith(live.origin));
  if (!navigation) {
    console.log(`=== run ${run}: no navigation event in the trace`);
    return;
  }
  const ms = (ts) => (ts - navigation.ts) / 1000;
  const dressedMs = marks.find((m) => m.name === "world:town-dressed")?.ms ?? Infinity;
  const enterMs = marks.find((m) => m.name === "profile:enter")?.ms;
  if (opts.enter && enterMs === undefined) {
    console.log(`=== run ${run}: no profile:enter mark (the page did not take the key)`);
    return;
  }
  // The window reported: the first paint (navigation to the dressed town), or the enter's 500 ms after the key.
  const from = opts.enter ? enterMs : 0;
  const until = opts.enter ? enterMs + ENTER_WINDOW_MS : dressedMs;
  console.log(`\n=== run ${run}: marks ${marks.map((m) => `${m.name}@${m.ms}`).join(" ")}${opts.enter ? ` (the enter's window: ${from} to ${until} ms)` : ""}`);
  const tasks = events.filter((e) => e.ph === "X" && e.name === "RunTask" && e.dur > 10000 && ms(e.ts) >= from - 1 && ms(e.ts) < until + (opts.enter ? 0 : 50)).sort((a, b) => a.ts - b.ts);
  // The CPU profile: nodes (call frames with their parent) and timed samples.
  const nodes = new Map();
  const samples = [];
  let time = 0;
  for (const e of events) {
    if (e.name === "Profile" && e.args?.data?.startTime) time = e.args.data.startTime;
    if (e.name !== "ProfileChunk") continue;
    const data = e.args.data;
    for (const n of data.cpuProfile?.nodes ?? []) nodes.set(n.id, { frame: n.callFrame, parent: n.parent });
    const ids = data.cpuProfile?.samples ?? [];
    const deltas = data.timeDeltas ?? [];
    for (let i = 0; i < ids.length; i++) {
      time += deltas[i] ?? 0;
      samples.push({ id: ids[i], ts: time, dt: (deltas[i] ?? 0) / 1000 });
    }
  }
  const keys = new Map();
  const keyOf = (id) => {
    if (!keys.has(id)) {
      const f = nodes.get(id).frame;
      const r = resolve(f.url, f.lineNumber, f.columnNumber);
      keys.set(id, r ? `${f.functionName || r.name || "(anon)"}  ${r.source}:${r.line}` : `${f.functionName || "(anon)"}  ${(f.url ?? "").replace(/^.*\/assets\//, "")}:${f.lineNumber}:${f.columnNumber}`);
    }
    return keys.get(id);
  };
  const stackOf = (id) => {
    const frames = [];
    for (let at = id; at; at = nodes.get(at)?.parent) frames.push(keyOf(at));
    return frames;
  };
  const self = new Map();
  const byFile = new Map();
  let own = 0;
  for (const s of samples) {
    const t = ms(s.ts);
    if (t < from || t > until || !nodes.get(s.id)) continue;
    const key = keyOf(s.id);
    self.set(key, (self.get(key) ?? 0) + s.dt);
    if (ENGINE.test(nodes.get(s.id).frame.functionName)) continue;
    own += s.dt;
    const files = new Set(stackOf(s.id).map((k) => k.split("  ")[1]?.split(":")[0]).filter(Boolean));
    for (const f of files) byFile.set(f, (byFile.get(f) ?? 0) + s.dt);
  }
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(opts.enter ? `--- CPU in the page's own code in the ${ENTER_WINDOW_MS} ms after the key: ${own.toFixed(0)} ms` : `--- CPU in the page's own code until dressed: ${own.toFixed(0)} ms of ${dressedMs} ms`);
  console.log("--- self time per function, top 40");
  for (const [k, v] of top(self, 40)) console.log(`  ${v.toFixed(1).padStart(7)} ms  ${k}`);
  console.log("--- inclusive per source file (a sample counts once per file on its stack), top 30");
  for (const [k, v] of top(byFile, 30)) console.log(`  ${v.toFixed(1).padStart(7)} ms  ${k}`);
  console.log("--- tasks over 10 ms: start, length, the deepest frames of the page's own code in their samples");
  const within = (t) => samples.filter((s) => s.ts >= t.ts && s.ts <= t.ts + t.dur && nodes.get(s.id));
  for (const t of tasks) {
    const deepest = new Map();
    for (const s of within(t)) {
      const key = stackOf(s.id).find((k) => !/node_modules|^\(/.test(k)) ?? keyOf(s.id);
      deepest.set(key, (deepest.get(key) ?? 0) + s.dt);
    }
    console.log(`  ${ms(t.ts).toFixed(0).padStart(5)} ms  ${(t.dur / 1000).toFixed(0).padStart(4)} ms`);
    for (const [k, v] of top(deepest, 5)) console.log(`           ${v.toFixed(1).padStart(6)} ms  ${k}`);
  }
  if (!stacksUntil) return;
  console.log(opts.enter ? "--- whole stacks of the tasks over 10 ms in the enter's window (per task: inclusive per frame, the page's own frames, then the 12 heaviest stacks)" : `--- whole stacks of the tasks over 10 ms that start before ${stacksUntil} ms (per task: inclusive per frame, then the 12 heaviest stacks)`);
  for (const t of tasks.filter((t) => opts.enter || ms(t.ts) < stacksUntil)) {
    const inTask = within(t);
    const byStack = new Map();
    const byFrame = new Map();
    for (const s of inTask) {
      const frames = stackOf(s.id);
      const key = frames.slice().reverse().join("\n");
      byStack.set(key, (byStack.get(key) ?? 0) + s.dt);
      for (const f of new Set(frames)) byFrame.set(f, (byFrame.get(f) ?? 0) + s.dt);
    }
    console.log(`  task at ${ms(t.ts).toFixed(0)} ms, ${(t.dur / 1000).toFixed(0)} ms, ${inTask.length} samples, ${byStack.size} distinct stacks`);
    console.log("    inclusive per frame, top 14:");
    for (const [k, v] of top(byFrame, 14)) console.log(`      ${v.toFixed(1).padStart(6)} ms  ${k}`);
    // The page's own frames (apps/ and packages/) on their own: React's and three's internals carry them.
    const own = [...byFrame].filter(([k]) => !/node_modules|^\(/.test(k));
    console.log("    inclusive per frame of the page's own code, top 24:");
    for (const [k, v] of top(new Map(own), 24)) console.log(`      ${v.toFixed(1).padStart(6)} ms  ${k}`);
    for (const [stack, v] of top(byStack, 12)) {
      console.log(`    ${v.toFixed(1)} ms:`);
      for (const f of stack.split("\n")) console.log(`        ${f}`);
    }
  }
}
