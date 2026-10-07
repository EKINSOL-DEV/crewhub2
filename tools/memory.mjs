/* memory.mjs: memory growth over a long run.

   Usage:
     node tools/memory.mjs --port <port> [demo|stress] [--minutes <n>] [--every <s>] [--cast <id>] [--stress <n>]
                           [--json <file>] [--out <dir>] [--swiftshader]

   demo    the normal demo town at 16x (default 10 minutes)
   stress  the stress fixture (?stress=<n>, default 1; dev builds only) at 16x (default 5 minutes)

   Every `--every` seconds (default 30) it collects garbage (CDP HeapProfiler.collectGarbage), then samples the JS heap
   after GC (Runtime.getHeapUsage), the renderer's geometries and textures (window.__worldPerf, the fps overlay is
   switched on through localStorage), the DOM node and listener counts (Memory.getDOMCounters) and the last frame's
   draw calls (React's dev-only performance measures are cleared first). Growth is the last sample minus the median of
   the first three, after the first minute (warm-up).
   Same browser set-up as perf.mjs: GPU-backed headless Chromium, 1440 x 900, DPR 1, Pretty, light. --json writes the
   points and the growth (a bare file name lands in --out). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { castChoice, cli, launch, speed, store, worldUrl } from "./lib/world.mjs";

const opts = cli("node tools/memory.mjs --port <port> [demo|stress] [--minutes <n>] [--every <s>] [--cast <id>] [--stress <n>] [--json <file>] [--out <dir>] [--swiftshader]", {
  options: { minutes: null, every: "30", json: null, cast: null, stress: "1" },
});
const scenario = opts.rest[0] ?? "demo";
if (!["demo", "stress"].includes(scenario)) opts.fail(`unknown scenario "${scenario}"; known: demo, stress`);
const minutes = Number(opts.minutes ?? (scenario === "stress" ? "5" : "10"));
const every = Number(opts.every);
const jsonOut = opts.json && (path.isAbsolute(opts.json) || opts.json.includes(path.sep) ? opts.json : path.join(opts.out, opts.json));

const browser = await launch({ swiftshader: opts.swiftshader, extra: ["--enable-precise-memory-info"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
await store(context, { "crewhub-world.quality": "pretty", "crewhub-world.fps": "on", ...castChoice(opts.cast) });
const page = await context.newPage();
page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await page.goto(worldUrl(opts.base, scenario === "stress" ? opts.stress : null));
await page.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0 && window.__worldPerf, null, { timeout: 60000 });
await speed(page, "16x");

const mb = (b) => (b / 1048576).toFixed(1);
const points = [];
const started = Date.now();
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
  const point = { t, heap: heap.usedSize, geometries: perf?.geometries ?? -1, textures: perf?.textures ?? -1, calls: perf?.calls ?? -1, nodes: dom.nodes, listeners: dom.jsEventListeners };
  points.push(point);
  console.log(
    `${scenario} ${String(t).padStart(4)} s  heap ${mb(point.heap).padStart(6)} MB  geo ${String(point.geometries).padStart(4)}  tex ${String(point.textures).padStart(3)}  calls ${String(point.calls).padStart(4)}  dom ${point.nodes}  listeners ${point.listeners}`,
  );
}
const warm = points.filter((p) => p.t >= 60);
const base = (key) => warm.slice(0, 3).map((p) => p[key]).sort((a, b) => a - b)[1] ?? warm[0]?.[key] ?? 0;
const last = points[points.length - 1];
const growth = { heapMB: +mb(last.heap - base("heap")), geometries: last.geometries - base("geometries"), textures: last.textures - base("textures"), domNodes: last.nodes - base("nodes"), listeners: last.listeners - base("listeners") };
console.log(`${scenario} growth after warm-up: heap ${growth.heapMB} MB, geo ${growth.geometries}, tex ${growth.textures}, dom ${growth.domNodes}, listeners ${growth.listeners}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scenario, minutes, every, ...(opts.cast ? { cast: opts.cast } : {}), points, growth }, null, 2));
await browser.close();
