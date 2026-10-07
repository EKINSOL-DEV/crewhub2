/* perf.mjs: the one measurement script. Every frame number in the reports comes from it.

   Usage:
     node tools/perf.mjs --port <port> [scenario...] [--quality pretty|fast] [--theme light|dark] [--cast <id>]
                         [--scenario <id>] [--stress <n>] [--rooms three|classic] [--json <file>] [--minutes <n>] [--preview] [--out <dir>] [--swiftshader]

   With no scenario it runs them all (about three minutes):
     demo-town      the normal demo, town view, 1x
     demo-inside    the normal demo, Enter on the first building, 1x
     stress-town    the stress fixture (?stress=1: 12 buildings, ~100 agents) at 4x, town view
     stress-inside  the stress fixture at 4x, Enter on the first building
     phone-fast     375 x 812, Fast, 4x CPU throttle (CDP), the normal demo town (--scenario picks another; with
                    --stress <n> the stress fixture at 4x instead, dev builds only; so do the other phone-* scenarios)
     startup        time to the first drawn frame and to a dressed town (median of 3 cold loads in fresh contexts)
   Not in the default run:
     phone-fast-dpr3      phone-fast at DPR 3 as a mobile viewport
     phone-fast-inside    375 x 812, Fast, 4x CPU throttle: Enter on the first building, then focus its first room
                          (ArrowRight, Enter); samples the focused room
     phone-pretty-inside  the same on Pretty (whatever --quality says)
     stress-16x     the stress fixture at 16x from 8:00 (the turn to dusk), with shadow redraws per 10 s
     view-change    the normal demo: twice enter the first building, zoom a room, back out of the room and the
                    building; counts frames over 33 ms and long tasks (> 50 ms) over the whole run
     view-change-stress  the same on the stress fixture at 4x
     long           the 16x stress town for --minutes (default 10), heap and GPU memory per minute

   Method: GPU-backed headless Chromium (Metal ANGLE), 1440 x 900 at DPR 1, a fresh browser context per scenario. The
   app's frame rate overlay is switched on through localStorage (crewhub-world.fps); the script waits for the scene
   (the "world:town-dressed" performance mark), discards the first 3 s after the view change, samples for 10 s and
   reads the overlay's numbers over exactly that window (window.__worldPerfWindow(10000)). The frame time is the time
   between drawn frames (the app draws at most 60 fps; the stress fixture is uncapped); the work is the CPU time of a
   frame (update and render submission). "drawn n/s" is frames drawn per second over the window: it is below 60 when
   frames run long or when the loop rests (nothing moves; rests do not count as frame time). "slow" counts frames more
   than 33 ms after the one before. calls and triangles are the last frame's; geometries and textures are in GPU
   memory; heap is the JS heap at the end.
   Note: headless Chromium runs requestAnimationFrame at 120 Hz with about +-1.5 ms jitter, so a steady 60 fps reads
   as a frame p95 of about 18 ms; compare like with like. --swiftshader (no GPU) gives numbers of its own kind: never
   compare them with GPU runs.

   Options: --quality forces the Graphics setting (phone-fast is always Fast), --theme the colour scheme (light by
   default), --cast the viewer's cast choice (Settings > Town > Cast), --scenario the demo scenario of the demo-*,
   phone-*, startup and view-change scenarios by its id (the page's ?scenario=<id>; left out: the default storyline),
   --stress the fixture's size as the page's ?stress=<n> (1 by default: 12 buildings, ~100 agents; 20: 20 buildings,
   200 agents in four groups), --rooms the building plan of the page (?rooms=three|classic: the three halls of the
   spec addendum or the classic ten rooms), --json writes every result as
   JSON (a bare file name lands in --out), --minutes the length of `long`.

   Production numbers (--preview): measure what users get, a minified production build, instead of the Vite dev
   server (dev React and unbundled modules cost more, notably in startup and on the phone). The caller builds and
   serves it on its own port, then passes that port and --preview:
     (cd apps/world && npx vite build && npx vite preview --port <port> --strictPort --host 127.0.0.1)
     node tools/perf.mjs --port <port> --preview [scenario...]
   Rebuild after every change you want to measure; preview serves dist/ as it was built. The stress fixture exists in
   dev builds only, so with --preview the stress scenarios (stress-town, stress-inside, stress-16x,
   view-change-stress, long) are skipped with a note and the default run is the other four. A production run says so
   in its header and marks each line "preview"; dev runs print as before. --json results carry build: "preview" or
   "dev", and the cast, scenario and stress size when given. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { castChoice, cli, launch, seek, speed, store, worldUrl } from "./lib/world.mjs";

const opts = cli(
  "node tools/perf.mjs --port <port> [scenario...] [--quality pretty|fast] [--theme light|dark] [--cast <id>] [--scenario <id>] [--stress <n>] [--rooms three|classic] [--json <file>] [--minutes <n>] [--preview] [--out <dir>] [--swiftshader]",
  { options: { quality: "pretty", theme: "light", json: null, minutes: "10", cast: null, scenario: null, stress: null, rooms: null }, flags: ["preview"] },
);
const { port, quality, theme, preview, base } = opts;
const jsonOut = opts.json && (path.isAbsolute(opts.json) || opts.json.includes(path.sep) ? opts.json : path.join(opts.out, opts.json));
const minutes = Number(opts.minutes);
/** --cast <id>: the viewer's cast choice (Settings > Town > Cast). */
const castId = opts.cast;
/** --stress <n>: the stress fixture's size, as the page's ?stress=<n>. */
const stressSize = opts.stress ?? "1";
/** The phone scenarios run the stress fixture (at 4x) only when --stress is given; otherwise the demo, as --scenario says. */
const phoneStress = opts.stress !== null;
const build = preview ? "preview" : "dev";
/** Scenarios that need the dev-only stress fixture. */
const STRESS_ONLY = ["stress-town", "stress-inside", "stress-16x", "view-change-stress", "long"];
const ALL = ["demo-town", "demo-inside", "stress-town", "stress-inside", "phone-fast", "startup"];
const scenarios = opts.rest.length ? opts.rest : preview ? ALL.filter((s) => !STRESS_ONLY.includes(s)) : ALL;
const SETTLE_MS = 3000,
  SAMPLE_MS = 10000;

const browser = await launch({ swiftshader: opts.swiftshader, extra: ["--enable-precise-memory-info"] });

async function open({ phone = false, stress = phone && phoneStress, fast = false, pretty = false, fps = true, dpr = 1 } = {}) {
  const context = await browser.newContext({
    viewport: phone ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    ...(dpr > 1 ? { isMobile: true, hasTouch: true } : {}),
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  await store(context, { "crewhub-world.quality": fast ? "fast" : pretty ? "pretty" : quality, "crewhub-world.fps": fps ? "on" : "off", ...castChoice(castId) });
  // Long tasks (> 50 ms) for the view-change scenarios.
  await context.addInitScript(() => {
    window.__longtasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longtasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
  if (phone) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.goto(worldUrl(base, stress ? stressSize : null, opts.scenario, opts.rooms));
  await page.waitForFunction((fps) => performance.getEntriesByName("world:town-dressed").length > 0 && (!fps || window.__worldPerfWindow), fps, { timeout: 60000 });
  if (phone && stress) await speed(page, "4x");
  return { context, page };
}

async function enterFirst(page) {
  const before = await page.evaluate(() => window.__worldPerf?.view);
  await page.locator("canvas").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((v) => window.__worldPerf && window.__worldPerf.view !== v, before, { timeout: 10000 });
}

/** Focus the entered building's first room by keyboard (ArrowRight, Enter), as a visitor would. */
async function focusFirstRoom(page) {
  await page.locator("canvas").first().focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  // The overlay's view names the building only; the room's zoom tween ends well inside the settle time.
  await page.waitForTimeout(1000);
}

/** Discard the settle time after a view change, then sample for 10 s and read the window. */
async function sample(page) {
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForTimeout(SAMPLE_MS);
  return page.evaluate((ms) => window.__worldPerfWindow(ms), SAMPLE_MS);
}

const results = [];
const mb = (bytes) => (bytes == null ? "?" : `${(bytes / 1048576).toFixed(0)}MB`);
const n1 = (v) => v.toFixed(1);
function line(name, r) {
  results.push({ scenario: name, quality: name.startsWith("phone-fast") ? "fast" : name.startsWith("phone-pretty") ? "pretty" : quality, theme, build, ...(castId ? { cast: castId } : {}), ...(name.includes("stress") || (name.startsWith("phone") && phoneStress) ? { stress: stressSize } : opts.scenario ? { scenario: opts.scenario } : {}), ...r });
  // Dev runs print exactly as before; a production run marks each line.
  const mark = preview ? " [preview]" : "";
  if (name.startsWith("view-change")) {
    console.log(`${name.padEnd(14)} frames over 33 ms ${r.slow} (max frame ${n1(r.frameMax)} ms, p95 ${n1(r.frameP95)} ms), long tasks ${r.longtasks.length} (total ${r.longtasks.reduce((a, b) => a + b, 0).toFixed(0)} ms, max ${Math.max(0, ...r.longtasks).toFixed(0)} ms: ${r.longtasks.map((d) => d.toFixed(0)).join(" ")})${mark}`);
    return;
  }
  if (name === "startup") {
    console.log(`${name.padEnd(14)} DOM ready ${r.domReady.toFixed(0)} ms, first frame ${r.firstFrame.toFixed(0)} ms, dressed town ${r.dressed.toFixed(0)} ms (median of ${r.runs.length}: ${r.runs.map((x) => x.dressed.toFixed(0)).join(", ")})${mark}`);
    return;
  }
  // Drawn frames per second over the window: below 60 either because frames ran long (see the frame times) or because
  // the loop rested (it draws on demand; the frame times then skip the rest).
  const fps = !r.frames ? "idle" : `drawn ${(r.frames / (SAMPLE_MS / 1000)).toFixed(1)}/s`;
  console.log(
    `${name.padEnd(14)} ${fps.padStart(14)}  frame ${n1(r.frameMean)} / p95 ${n1(r.frameP95)} / max ${n1(r.frameMax)} ms, slow ${r.slow}  work ${n1(r.workMean)} / p95 ${n1(r.workP95)} ms  calls ${r.calls}  tris ${(r.triangles / 1e6).toFixed(2)}M  geo ${r.geometries}  tex ${r.textures}  heap ${mb(r.heap)}  [${r.quality}, ${r.view}${preview ? ", preview" : ""}]`,
  );
}

/** Enter the first building, zoom its first room, back out of the room and the building; twice. About 14 s, inside the
 *  frame ring's window. */
async function viewChange(name, stress) {
  const { context, page } = await open({ stress });
  if (stress) await speed(page, "4x");
  await page.waitForTimeout(SETTLE_MS);
  const t0 = await page.evaluate(() => performance.now());
  const canvas = page.locator("canvas").first();
  for (let i = 0; i < 2; i++) {
    await canvas.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2000);
  }
  const ms = (await page.evaluate(() => performance.now())) - t0;
  const r = await page.evaluate((ms) => window.__worldPerfWindow(ms), ms);
  const longtasks = await page.evaluate((t0) => window.__longtasks.filter((e) => e.start >= t0).map((e) => e.duration), t0);
  line(name, { ...r, longtasks });
  await context.close();
}

const run = {
  async "demo-town"() {
    const { context, page } = await open();
    line("demo-town", await sample(page));
    await context.close();
  },
  async "demo-inside"() {
    const { context, page } = await open();
    await enterFirst(page);
    line("demo-inside", await sample(page));
    await context.close();
  },
  async "stress-town"() {
    const { context, page } = await open({ stress: true });
    await speed(page, "4x");
    line("stress-town", await sample(page));
    await context.close();
  },
  async "stress-inside"() {
    const { context, page } = await open({ stress: true });
    await speed(page, "4x");
    await enterFirst(page);
    line("stress-inside", await sample(page));
    await context.close();
  },
  async "view-change"() {
    await viewChange("view-change", false);
  },
  async "view-change-stress"() {
    await viewChange("view-change-stress", true);
  },
  async "stress-16x"() {
    // The stress town at 16x through the day's turn to dusk (seek 8:00): the drift's light and sun move fastest here.
    // Also counts the shadow-map redraws in the sample window (dev builds: window.__town).
    const { context, page } = await open({ stress: true });
    await seek(page, 480000);
    await speed(page, "16x");
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => {
      const r = window.__town?.renderer;
      window.__shadowRedraws = 0;
      if (!r) return;
      const render = r.render.bind(r);
      r.render = (scene, camera) => {
        if (r.shadowMap.enabled && (r.shadowMap.autoUpdate || r.shadowMap.needsUpdate)) window.__shadowRedraws++;
        render(scene, camera);
      };
    });
    await page.waitForTimeout(SAMPLE_MS);
    const r = await page.evaluate((ms) => ({ ...window.__worldPerfWindow(ms), shadowRedraws: window.__shadowRedraws }), SAMPLE_MS);
    line("stress-16x", r);
    console.log(`${"".padEnd(14)} shadow redraws ${r.shadowRedraws} per ${SAMPLE_MS / 1000} s`);
    await context.close();
  },
  async "phone-fast-dpr3"() {
    // A phone's own pixel density (DPR 3, mobile viewport), Fast, 4x CPU throttle.
    const { context, page } = await open({ phone: true, fast: true, dpr: 3 });
    line("phone-fast-dpr3", await sample(page));
    await context.close();
  },
  async "phone-fast-inside"() {
    const { context, page } = await open({ phone: true, fast: true });
    await enterFirst(page);
    await page.waitForTimeout(1500);
    await focusFirstRoom(page);
    line("phone-fast-inside", await sample(page));
    await context.close();
  },
  async "phone-pretty-inside"() {
    const { context, page } = await open({ phone: true, pretty: true });
    await enterFirst(page);
    await page.waitForTimeout(1500);
    await focusFirstRoom(page);
    line("phone-pretty-inside", await sample(page));
    await context.close();
  },
  async "phone-fast"() {
    const { context, page } = await open({ phone: true, fast: true });
    line("phone-fast", await sample(page));
    await context.close();
  },
  async startup() {
    // One warm-up load lets Vite transform the modules; then three measured loads, each in a fresh context.
    const runs = [];
    for (let i = 0; i < 4; i++) {
      const { context, page } = await open({ fps: false });
      const marks = await page.evaluate(() => ({
        firstFrame: performance.getEntriesByName("world:first-frame")[0]?.startTime ?? NaN,
        dressed: performance.getEntriesByName("world:town-dressed")[0]?.startTime ?? NaN,
        domReady: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? NaN,
      }));
      if (i) runs.push(marks);
      await context.close();
    }
    const median = (key) => runs.map((r) => r[key]).sort((a, b) => a - b)[1];
    line("startup", { domReady: median("domReady"), firstFrame: median("firstFrame"), dressed: median("dressed"), runs });
  },
  async long() {
    const { context, page } = await open({ stress: true });
    await speed(page, "16x");
    const points = [];
    for (let m = 0; m <= minutes; m++) {
      if (m) await page.waitForTimeout(60000);
      const p = await page.evaluate(() => window.__worldPerfWindow(10000));
      points.push({ minute: m, heap: p.heap, geometries: p.geometries, textures: p.textures, workMean: p.workMean, frameP95: p.frameP95 });
      console.log(`long minute ${String(m).padStart(2)}  heap ${mb(p.heap)}  geo ${p.geometries}  tex ${p.textures}  work ${n1(p.workMean)} ms  frame p95 ${n1(p.frameP95)} ms`);
    }
    results.push({ scenario: "long", quality, theme, build, ...(castId ? { cast: castId } : {}), stress: stressSize, minutes, points });
    await context.close();
  },
};

console.log(`perf.mjs  port ${port}  quality ${quality}  theme ${theme}${castId ? `  cast ${castId}` : ""}${opts.scenario ? `  scenario ${opts.scenario}` : ""}${opts.stress !== null ? `  stress ${stressSize}` : ""}${opts.rooms ? `  rooms ${opts.rooms}` : ""}${opts.swiftshader ? "  swiftshader" : ""}  ${new Date().toISOString()}${preview ? "  build preview (production)" : ""}`);
for (const name of scenarios) {
  if (preview && STRESS_ONLY.includes(name)) {
    console.log(`${name.padEnd(14)} skipped: the stress fixture exists in dev builds only`);
    continue;
  }
  if (!run[name]) {
    console.error(`unknown scenario ${name}; known: ${Object.keys(run).join(", ")}`);
    continue;
  }
  try {
    await run[name]();
  } catch (e) {
    console.log(`${name.padEnd(14)} FAILED: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
