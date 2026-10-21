/* memory.mjs: memory growth over a long run.

   Usage:
     node tools/memory.mjs --port <port> [demo|stress|live] [--minutes <n>] [--every <s>] [--cast <id>] [--stress <n>]
                           [--scenario <id>] [--snapshots <min,min,...>] [--preview] [--loops-url <url> --key-file <file>]
                           [--fake-scenario <id>] [--fake-speed 0|1|4|16] [--host-port <port>]
                           [--json <file>] [--out <dir>] [--swiftshader]

   demo    the normal demo town at 16x (default 10 minutes); --scenario <id> picks the demo scenario (the page's
           ?scenario=<id>; left out: the default storyline)
   stress  the stress fixture (?stress=<n>, default 1; dev builds only) at 16x (default 5 minutes)
   live    live mode (?source=live) against a crewhub-loops behind a host the tool starts (lib/live.mjs): an in-process
           fake playing --fake-scenario (default small-team) at --fake-speed (default 16), or the loops --loops-url
           names with --key-file (the fake on its own port, or the development loops on 8291; loopback only). In a dev
           run the host listens on --host-port behind your Vite (started with CREWHUB_WORLD_PORT=<host-port>); with
           --preview it serves apps/world/dist on --host-port and the browser opens the host directly (a production
           build: what users get). Default 30 minutes. One host at a time against the development loops.

   Every `--every` seconds (default 30) it collects garbage (CDP HeapProfiler.collectGarbage), then samples the JS heap
   after GC (Runtime.getHeapUsage), the renderer's geometries and textures (window.__worldPerf, the fps overlay is
   switched on through localStorage), the DOM node and listener counts (Memory.getDOMCounters) and the last frame's
   draw calls (React's dev-only performance measures are cleared first). Growth is the last sample minus the median of
   the first three, after the first minute (warm-up).
   --snapshots <min,...> takes a heap snapshot at those minutes (0 is right after the town is dressed), sums it by
   constructor (lib/heap.mjs) and prints the 25 largest kinds of object; from the second snapshot on it also prints
   what grew most since the one before, by self size. The snapshot itself is parsed and dropped; the totals land in
   --json. A snapshot pauses the page for a few seconds, so its sample is not a frame measurement.
   Same browser set-up as perf.mjs: GPU-backed headless Chromium, 1440 x 900, DPR 1, Pretty, light. --json writes the
   points, the growth and the snapshot totals (a bare file name lands in --out). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { formatRows, growth as heapGrowth, heapTotals, mb as heapMb, topBySize } from "./lib/heap.mjs";
import { LIVE_OPTIONS, LIVE_USAGE, startLive } from "./lib/live.mjs";
import { castChoice, cli, launch, speed, store, worldUrl } from "./lib/world.mjs";

const opts = cli(
  `node tools/memory.mjs --port <port> [demo|stress|live] [--minutes <n>] [--every <s>] [--cast <id>] [--stress <n>] [--scenario <id>] [--snapshots <min,min,...>] [--preview] ${LIVE_USAGE} [--json <file>] [--out <dir>] [--swiftshader]`,
  { options: { minutes: null, every: "30", json: null, cast: null, stress: "1", scenario: null, snapshots: "", ...LIVE_OPTIONS }, flags: ["preview"] },
);
const scenario = opts.rest[0] ?? "demo";
if (!["demo", "stress", "live"].includes(scenario)) opts.fail(`unknown scenario "${scenario}"; known: demo, stress, live`);
const minutes = Number(opts.minutes ?? (scenario === "stress" ? "5" : scenario === "live" ? "30" : "10"));
const every = Number(opts.every);
const snapshotMinutes = opts.snapshots === "" ? [] : opts.snapshots.split(",").map(Number);
if (snapshotMinutes.some((m) => !Number.isFinite(m) || m < 0)) opts.fail("--snapshots takes minutes, e.g. 0,10,30");
const jsonOut = opts.json && (path.isAbsolute(opts.json) || opts.json.includes(path.sep) ? opts.json : path.join(opts.out, opts.json));
opts.source = scenario === "live" ? "live" : "demo";
const live = scenario === "live" ? await startLive(opts, { preview: opts.preview }) : null;
const base = live ? live.base : opts.base;

const browser = await launch({ swiftshader: opts.swiftshader, extra: ["--enable-precise-memory-info"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
await store(context, { "crewhub-world.quality": "pretty", "crewhub-world.fps": "on", ...castChoice(opts.cast) });
const page = await context.newPage();
page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
if (live) {
  console.log(live.describe);
  await live.pair(page);
}
await page.goto(worldUrl(base, scenario === "stress" ? opts.stress : null, opts.scenario, null, opts.source));
await page.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0 && window.__worldPerf, null, { timeout: 60000 });
// The first frame: before it the shaders are still compiling, nothing is on the GPU and the JS still holds every
// vertex copy, so a sample then is a pre-upload number, not the start.
await page.waitForFunction(() => performance.getEntriesByName("world:first-frame").length > 0, null, { timeout: 60000 }).catch(() => undefined);
if (live) {
  // The chip says Live: the snapshot is in and the stream open (20 s, else the run goes on and says so).
  const ok = await page.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ok) console.log("  live: the connection chip does not say Live after 20 s; measuring anyway");
} else await speed(page, "16x");

const mb = (b) => (b / 1048576).toFixed(1);
const points = [];
const snapshots = [];
const started = Date.now();
let lastTotals = null;
async function snapshotAt(minute) {
  const t0 = Date.now();
  const totals = await heapTotals(cdp);
  const took = Date.now() - t0;
  console.log(`${scenario} snapshot at minute ${minute}: ${heapMb(totals.bytes)} in ${totals.nodes} nodes (${(took / 1000).toFixed(1)} s); the largest kinds:`);
  for (const line of formatRows(topBySize(totals))) console.log(line);
  const record = { minute, bytes: totals.bytes, nodes: totals.nodes, top: topBySize(totals, 40) };
  if (lastTotals) {
    const rows = heapGrowth(lastTotals.totals, totals, 40);
    console.log(`${scenario} grown since minute ${lastTotals.minute} (${heapMb(totals.bytes - lastTotals.totals.bytes)} in all):`);
    for (const line of formatRows(rows.slice(0, 25), { delta: true })) console.log(line);
    record.grownSince = lastTotals.minute;
    record.grown = rows;
  }
  lastTotals = { minute, totals };
  snapshots.push(record);
}
let nextSnapshot = 0;
for (let t = 0; t <= minutes * 60; t += every) {
  const wait = started + t * 1000 - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  // React's development build records every render as a performance measure (its DevTools tracks) and the browser
  // keeps them all: about 2 MB per 5 minutes at 16x. A production build records none. Cleared, so a dev-server run
  // measures the app only.
  await page.evaluate(() => performance.clearMeasures());
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const perf = await page.evaluate(() => {
    const p = window.__worldPerf;
    return p ? { geometries: p.geometries, textures: p.textures, calls: p.calls, workMean: p.workMean } : null;
  });
  const chip = live ? await page.locator(".connection-chip").first().getAttribute("data-connection").catch(() => null) : null;
  const point = { t, heap: heap.usedSize, geometries: perf?.geometries ?? -1, textures: perf?.textures ?? -1, calls: perf?.calls ?? -1, nodes: dom.nodes, listeners: dom.jsEventListeners, ...(live ? { connection: chip } : {}) };
  points.push(point);
  console.log(
    `${scenario} ${String(t).padStart(4)} s  heap ${mb(point.heap).padStart(6)} MB  geo ${String(point.geometries).padStart(4)}  tex ${String(point.textures).padStart(3)}  calls ${String(point.calls).padStart(4)}  dom ${point.nodes}  listeners ${point.listeners}${live ? `  ${chip ?? "no chip"}` : ""}`,
  );
  while (nextSnapshot < snapshotMinutes.length && t >= snapshotMinutes[nextSnapshot] * 60) {
    await snapshotAt(snapshotMinutes[nextSnapshot]);
    nextSnapshot += 1;
  }
}
const warm = points.filter((p) => p.t >= 60);
const baseOf = (key) => warm.slice(0, 3).map((p) => p[key]).sort((a, b) => a - b)[1] ?? warm[0]?.[key] ?? 0;
const last = points[points.length - 1];
const growth = { heapMB: +mb(last.heap - baseOf("heap")), geometries: last.geometries - baseOf("geometries"), textures: last.textures - baseOf("textures"), domNodes: last.nodes - baseOf("nodes"), listeners: last.listeners - baseOf("listeners") };
console.log(`${scenario} growth after warm-up: heap ${growth.heapMB} MB, geo ${growth.geometries}, tex ${growth.textures}, dom ${growth.domNodes}, listeners ${growth.listeners}`);
if (jsonOut)
  writeFileSync(
    jsonOut,
    JSON.stringify(
      { scenario, minutes, every, build: opts.preview ? "preview" : "dev", ...(opts.cast ? { cast: opts.cast } : {}), ...(opts.scenario ? { demoScenario: opts.scenario } : {}), ...(live ? { loops: opts["loops-url"] || `fake:${opts["fake-scenario"]}@${opts["fake-speed"]}x` } : {}), points, growth, snapshots },
      null,
      2,
    ),
  );
await browser.close();
if (live) await live.close();
