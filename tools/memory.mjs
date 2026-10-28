/* memory.mjs: memory growth over a long run.

   Usage:
     node tools/memory.mjs --port <port> [demo|stress|live] [--minutes <n>] [--every <s>] [--cast <id>] [--stress <n>]
                           [--scenario <id>] [--snapshots <min,min,...>] [--save-snapshots <dir>] [--count-names <a,b,...>]
                           [--preview] [--loops-url <url> --key-file <file>] [--fake-scenario <id>] [--fake-speed 0|1|4|16]
                           [--host-port <port>] [--paired-tab] [--chat-panel] [--dm-every <s>] [--burst <n> --burst-at <min>]
                           [--json <file>] [--out <dir>] [--swiftshader]

   demo    the normal demo town at 16x (default 10 minutes); --scenario <id> picks the demo scenario (the page's
           ?scenario=<id>; left out: the default storyline). With --preview the page is a production build you serve
           on --port yourself (`npx vite preview --port <port>` in apps/world, without CREWHUB_WORLD_PORT: the preview
           then answers /world-api as "no host" and the page runs the demo).
   stress  the stress fixture (?stress=<n>, default 1; dev builds only) at 16x (default 5 minutes)
   live    live mode (?source=live) against a crewhub-loops behind a host the tool starts (lib/live.mjs): an in-process
           fake playing --fake-scenario (default small-team) at --fake-speed (default 16), or the loops --loops-url
           names with --key-file (the fake on its own port, or the development loops on 8291; loopback only). In a dev
           run the host listens on --host-port behind your Vite (started with CREWHUB_WORLD_PORT=<host-port>); with
           --preview it serves apps/world/dist on --host-port (0: a free port) and the browser opens the host directly
           (a production build: what users get). Default 30 minutes. One host at a time against the development loops.

   Every `--every` seconds (default 30) it collects garbage (CDP HeapProfiler.collectGarbage), then samples the JS heap
   after GC (Runtime.getHeapUsage), the renderer's geometries and textures (window.__worldPerf, the fps overlay is
   switched on through localStorage), the DOM node and listener counts (Memory.getDOMCounters) and the last frame's
   draw calls (React's dev-only performance measures are cleared first). Growth is the last sample minus the median of
   the first three, after the first minute (warm-up).
   --snapshots <min,...> takes a heap snapshot at those minutes (0 is right after the town is dressed), sums it by
   constructor (lib/heap.mjs) and prints the 25 largest kinds of object; from the second snapshot on it also prints
   what grew most since the one before, by self size. Under every snapshot it prints the counts a soak watches (round
   45): the far crowd's batches (InstancedMesh), the MeshStandardMaterials and the Meshes, found by the flag each
   three.js constructor sets on its instances, so no minified name is needed; with --preview it also says what the
   built chunk calls those classes (for a retainer walk). --count-names <a,b> adds the counts of those constructor
   names as the snapshot sums them, and (round 47) the faded figures' shared copies alive, read from the page right
   before and after the snapshot: each is a MeshStandardMaterial, so the materials minus the faded copies are the ones
   the far crowd and the kit hold. The snapshot itself is parsed and dropped, unless --save-snapshots <dir> keeps the
   raw file (minute-<n>.heapsnapshot, the heap's size each); the totals land in --json. A snapshot pauses the page for
   a few seconds, so its sample is not a frame measurement; a heap past about 290 MB no longer fits one string and
   the snapshot throws, so a run that may grow that far takes its snapshots early.
   At the run's end (round 47) the tool judges the snapshots by docs/COST_POLICY.md "What to soak and how", item 3
   (lib/verdict.mjs): the total without (code) at each snapshot and its fit over the window, the JS objects from the
   first snapshot to the last by kind, the (code) rate against its ceiling, the levelling test for a run over an hour,
   and one verdict line: levels off, does not (and which rule failed), or cannot judge (and why: a run too short for
   the window, too few snapshots in it). The JSON keeps it as `verdict`.
   Every sample also carries the frame time over the overlay's window (mean and p95, the work per frame) and the faded
   copies alive (`faded`, round 47, from `window.__worldStores` in every mode); a live run
   (round 27, the soak) adds the host's upstream stream (its state and how often it reconnected, from the host the
   tool started), the page's own stores (`window.__worldStores`, state/soak.ts: the bubbles alive, the Recent answers,
   the chat threads) and the town document's revision with the host's revision the page is on. The growth line also
   says the heap's growth an hour after warm-up.
   The chat soak (rounds 40, 41 and 45; live mode, the in-process fake, lib/chatSoak.mjs): --paired-tab opens a second
   tab of the same context on the same host once the first is Live and leaves it open, sampling its heap, DOM and chip
   too; --chat-panel opens the Chat panel (road 1) once the chip says Live and counts the Recent answers rows the page
   adds; --dm-every <s> makes the fake's person write to the scenario's lead agents in turn (GET /api/agents, role
   lead, not an external bot; the threads' agents when there is no lead), every <s> seconds, and the agents' scripted
   replies come back over road 1 as the host's reads of
   /api/dm/messages/<id>, which the tool counts from outside (by id: once or twice, the status, how many in flight at
   once: the gate's number); --burst <n> --burst-at <min> sends <n> in one instant right after the sample at that
   minute. With any of these the fake's key reads the chat. Every list the tool keeps in the page is capped. The
   sample line and the JSON carry the sent count, the reads and the rows; the end prints the tally, the burst's minute
   and the messages the host's log says were lost (the counts on the read gate's lost lines, summed over the whole run;
   the gate logs no retry, round 47). --burst-at must leave a sample after the burst.
   When the DOM node count moved since the last sample (round 29), the sample is followed by one line naming what
   changed in the document tree: the nodes added and removed (an element by tag, classes, label and the nearest named
   landmark; a text node by its parent), grouped with counts, at most six entries (lib/domdiff.ts; the point's
   `domDiff` field in --json holds the same entries). A count that moves while the tree is unchanged is nodes outside
   the document tree, so the line also says the documents count when it moved (an SVG image or a parsed string is a
   document of its own) and the detached trees the inspector lists (DOM.getDetachedDomNodes: each by its root and
   its node count).
   Same browser set-up as perf.mjs: GPU-backed headless Chromium, 1440 x 900, DPR 1, Pretty, light. --json writes the
   points, the growth and the snapshot totals (a bare file name lands in --out). */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_FLAGS, CHAT_OPTIONS, CHAT_USAGE, READ_PAGE_CHAT, chatAgents, chatSettings, createDmReadCounter, formatChat, nextDm, pageChatCounter } from "./lib/chatSoak.mjs";
import { capDomDiff, describeDetached, domDiff, domInventory, formatDomDiff } from "./lib/domdiff.ts";
import { formatRows, formatShapes, growth as heapGrowth, heapTotals, mb as heapMb, resolveThreeNames, topBySize } from "./lib/heap.mjs";
import { LIVE_OPTIONS, LIVE_USAGE, startLive } from "./lib/live.mjs";
import { formatVerdict, judge, snapshotDiff } from "./lib/verdict.mjs";
import { castChoice, cli, launch, speed, store, worldUrl } from "./lib/world.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const opts = cli(
  `node tools/memory.mjs --port <port> [demo|stress|live] [--minutes <n>] [--every <s>] [--cast <id>] [--stress <n>] [--scenario <id>] [--snapshots <min,min,...>] [--save-snapshots <dir>] [--count-names <a,b,...>] [--preview] ${LIVE_USAGE} ${CHAT_USAGE} [--json <file>] [--out <dir>] [--swiftshader]`,
  { options: { minutes: null, every: "30", json: null, cast: null, stress: "1", scenario: null, snapshots: "", "save-snapshots": "", "count-names": "", ...LIVE_OPTIONS, ...CHAT_OPTIONS }, flags: ["preview", ...CHAT_FLAGS] },
);
const scenario = opts.rest[0] ?? "demo";
if (!["demo", "stress", "live"].includes(scenario)) opts.fail(`unknown scenario "${scenario}"; known: demo, stress, live`);
const minutes = Number(opts.minutes ?? (scenario === "stress" ? "5" : scenario === "live" ? "30" : "10"));
const every = Number(opts.every);
const snapshotMinutes = opts.snapshots === "" ? [] : opts.snapshots.split(",").map(Number);
if (snapshotMinutes.some((m) => !Number.isFinite(m) || m < 0)) opts.fail("--snapshots takes minutes, e.g. 0,10,30");
const saveSnapshots = opts["save-snapshots"] === "" ? null : path.resolve(opts["save-snapshots"]);
if (saveSnapshots) mkdirSync(saveSnapshots, { recursive: true });
const countNames = opts["count-names"] === "" ? [] : opts["count-names"].split(",").filter(Boolean);
const jsonOut = opts.json && (path.isAbsolute(opts.json) || opts.json.includes(path.sep) ? opts.json : path.join(opts.out, opts.json));
const chat = chatSettings(opts, opts.fail, { minutes, every });
if (chat.active && scenario !== "live") opts.fail("the chat soak (--chat-panel, --dm-every, --burst) is live mode's: node tools/memory.mjs live ...");
if (chat.pairedTab && scenario !== "live") opts.fail("--paired-tab is live mode's: node tools/memory.mjs live ...");
if (chat.active && opts["loops-url"] !== "") opts.fail("the chat soak writes to the in-process fake's chat: leave --loops-url out");
opts.source = scenario === "live" ? "live" : "demo";
// The host's reads of the agents' answers, counted from outside: the host uses the process-wide fetch, round 40.
const dmReads = createDmReadCounter();
if (chat.active) globalThis.fetch = dmReads.wrap(globalThis.fetch);
const live = scenario === "live" ? await startLive(opts, { preview: opts.preview, keyReadsChat: chat.active }) : null;
const base = live ? live.base : opts.base;
// What the built chunk calls three's classes (a retainer walk goes by name; the counts below do not): with --preview.
const threeNames = opts.preview ? resolveFromDist() : null;
function resolveFromDist() {
  const assets = path.join(REPO, "apps", "world", "dist", "assets");
  if (!existsSync(assets)) return null;
  const chunk = readdirSync(assets).find((f) => /^three-.*\.js$/.test(f));
  return chunk ? { chunk, ...resolveThreeNames(readFileSync(path.join(assets, chunk), "utf8")) } : null;
}

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
if (threeNames) console.log(`  three's classes in ${threeNames.chunk}: InstancedMesh ${threeNames.InstancedMesh ?? "?"}, MeshStandardMaterial ${threeNames.MeshStandardMaterial ?? "?"}, Mesh ${threeNames.Mesh ?? "?"}`);

// The paired tab (round 39): a second tab of the same context, opened without a link once the first tab is Live and
// left open the whole run; the context's pairing (or the page's per-tab bearer, where it has one) makes it Live.
let paired = null;
let pairedCdp = null;
if (live && chat.pairedTab) {
  paired = await context.newPage();
  paired.on("pageerror", (e) => console.error(`  paired tab page error: ${e.message}`));
  pairedCdp = await context.newCDPSession(paired);
  await paired.goto(worldUrl(base, null, opts.scenario, null, opts.source));
  const ok = await paired.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).then(() => true).catch(() => false);
  console.log(`  paired tab: ${ok ? "Live" : "not Live after 20 s"}; left open`);
  await page.bringToFront();
}
// The chat soak (rounds 40 and 45): the Chat panel open on road 1, the page's rows counted, a sender over the fake's agents.
let agents = [];
let sent = 0;
let burstSent = 0;
let burstAt = null;
let sender = null;
if (live && chat.chatPanel) {
  await page.locator(".chat-open").first().click({ timeout: 10000 });
  const sheet = await page.waitForSelector(".chat-sheet", { timeout: 5000 }).then(() => true).catch(() => false);
  await page.evaluate(pageChatCounter(20));
  const glance = (await page.locator(".chat-sheet-lead").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  console.log(`  chat panel: ${sheet ? "open" : "not open after 5 s"}; glance: "${glance.slice(0, 160)}"`);
}
if (live && (chat.dmEvery !== null || chat.burst > 0)) {
  agents = await chatAgents(live.fake);
  console.log(`  chat agents (the scenario's leads, in turn): ${agents.join(", ")}`);
  if (chat.dmEvery !== null) {
    sender = setInterval(() => {
      const dm = nextDm(agents, sent);
      sent += 1;
      live.fake.sendDm(dm.agent, dm.text);
    }, chat.dmEvery * 1000);
    console.log(`  sender: one message to an agent every ${chat.dmEvery} s${chat.burst > 0 ? `; a burst of ${chat.burst} right after the sample at minute ${chat.burstAt}` : ""}`);
  } else console.log(`  a burst of ${chat.burst} right after the sample at minute ${chat.burstAt}`);
}
const readPageChat = async () => (chat.chatPanel ? await page.evaluate(READ_PAGE_CHAT).catch(() => null) : null);
const chatPoint = async () => {
  if (!chat.active) return null;
  const onPage = await readPageChat();
  return { sent, burstSent, reads: dmReads.tally(), rows: onPage?.rows ?? -1, lost: live.lost() };
};

const mb = (b) => (b / 1048576).toFixed(1);
const points = [];
const snapshots = [];
const started = Date.now();
let lastTotals = null;
// The first snapshot from minute 10 on (the warm-up's end), kept whole: the verdict's diff runs from it to the last.
let firstRead = null;
// The page's probe (state/soak.ts): the stores in a live run, the faded copies in every run; null where it is missing.
const readStores = () => page.evaluate(() => (typeof window.__worldStores === "function" ? window.__worldStores() : null)).catch(() => null);
async function snapshotAt(minute) {
  const t0 = Date.now();
  const fadedBefore = (await readStores())?.faded ?? null;
  const totals = await heapTotals(cdp, { file: saveSnapshots ? path.join(saveSnapshots, `minute-${minute}.heapsnapshot`) : null });
  const fadedAfter = (await readStores())?.faded ?? null;
  const took = Date.now() - t0;
  console.log(`${scenario} snapshot at minute ${minute}: ${heapMb(totals.bytes)} in ${totals.nodes} nodes (${(took / 1000).toFixed(1)} s); the largest kinds:`);
  for (const line of formatRows(topBySize(totals))) console.log(line);
  const counts = Object.fromEntries(countNames.map((n) => [n, totals.byName.get(n)?.count ?? 0]));
  console.log(`  counts at minute ${minute}: ${formatShapes(totals.shapes)}${countNames.length > 0 ? `; ${countNames.map((n) => `${n} ${counts[n]}`).join(", ")}` : ""}`);
  // Each faded copy is a MeshStandardMaterial of its own: the materials less the faded copies are the crowd's and the kit's.
  // The count read right before is the snapshot's (only a GC lies between); the page moves when the snapshot lets it go
  // (round 47's smoke: 27 before, 21 after, 27 again at the next sample), so the one after is said beside it only.
  const faded = fadedBefore ?? fadedAfter;
  console.log(
    faded === null
      ? "  faded copies: the page has no probe"
      : `  faded copies at minute ${minute}: ${faded} (MeshStandardMaterial less the faded copies: ${totals.shapes.materials - faded})${fadedAfter !== faded ? `; ${fadedAfter ?? "?"} right after the snapshot` : ""}`,
  );
  const code = totals.byName.get("(code)")?.size ?? 0;
  const record = { minute, bytes: totals.bytes, code, nodes: totals.nodes, shapes: totals.shapes, faded, ...(fadedAfter !== faded ? { fadedAfter } : {}), ...(countNames.length > 0 ? { counts } : {}), top: topBySize(totals, 40) };
  if (firstRead === null && minute >= 10) firstRead = { minute, totals };
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
// The last sample's DOM (round 29): the node count and the inventory the diff reads when the count moves.
let lastDom = null;
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
  const inventory = await page.evaluate(domInventory).catch(() => null);
  const perf = await page.evaluate(() => {
    const p = window.__worldPerf;
    return p ? { geometries: p.geometries, textures: p.textures, calls: p.calls, workMean: p.workMean, frameMean: p.frameMean, frameP95: p.frameP95, fps: p.fps } : null;
  });
  const chip = live ? await page.locator(".connection-chip").first().getAttribute("data-connection").catch(() => null) : null;
  // Live (round 27, the soak): the page's own stores and the town's revision (`window.__worldStores`, state/soak.ts),
  // and the host's upstream stream straight from the host the tool started (its state and reconnect count).
  const stores = await readStores();
  const upstream = live ? live.host.connection().stream : null;
  let pairedPoint = null;
  if (paired) {
    await pairedCdp.send("HeapProfiler.collectGarbage").catch(() => undefined);
    const h2 = await pairedCdp.send("Runtime.getHeapUsage").catch(() => null);
    const d2 = await pairedCdp.send("Memory.getDOMCounters").catch(() => null);
    const c2 = await paired.locator(".connection-chip").first().getAttribute("data-connection").catch(() => null);
    pairedPoint = { heap: h2?.usedSize ?? -1, nodes: d2?.nodes ?? -1, listeners: d2?.jsEventListeners ?? -1, connection: c2 };
  }
  const chatNow = await chatPoint();
  const point = {
    t,
    heap: heap.usedSize,
    geometries: perf?.geometries ?? -1,
    textures: perf?.textures ?? -1,
    calls: perf?.calls ?? -1,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    frameMean: perf?.frameMean ?? null,
    frameP95: perf?.frameP95 ?? null,
    workMean: perf?.workMean ?? null,
    faded: stores?.faded ?? null,
    ...(live ? { connection: chip, upstream: upstream ? { state: upstream.state, reconnects: upstream.reconnects } : null, stores } : {}),
    ...(pairedPoint ? { paired: pairedPoint } : {}),
    ...(chatNow ? { chat: chatNow } : {}),
  };
  // The DOM diff (round 29): when the node count moved since the last sample, what was added and removed, by element.
  let domLine = "";
  if (lastDom !== null && inventory !== null && lastDom.inventory !== null && dom.nodes !== lastDom.nodes) {
    const diff = capDomDiff(domDiff(lastDom.inventory, inventory), 6);
    // Nodes alive outside the document tree: the detached trees the inspector can list, and the documents count
    // (an SVG image or a parsed string is a document of its own).
    const detached = await cdp.send("DOM.getDetachedDomNodes").then((r) => describeDetached(r.detachedNodes, 4)).catch(() => []);
    point.domDiff = { ...diff, documents: dom.documents, detached };
    const documents = dom.documents !== lastDom.documents ? ` (documents ${lastDom.documents} -> ${dom.documents})` : "";
    domLine = `\n  dom ${lastDom.nodes} -> ${dom.nodes}${documents}: ${formatDomDiff(diff)}${detached.length > 0 ? `; detached: ${detached.join(", ")}` : ""}`;
  }
  lastDom = { nodes: dom.nodes, documents: dom.documents, inventory };
  points.push(point);
  const frame = `${perf ? `  frame ${perf.frameMean.toFixed(1)}/${perf.frameP95.toFixed(1)} ms work ${perf.workMean.toFixed(1)}` : ""}  faded ${point.faded ?? "?"}`;
  const soak = live ? `  ${chip ?? "no chip"}  upstream ${upstream ? `${upstream.state} r${upstream.reconnects}` : "?"}${stores ? `  said ${stores.said} answers ${stores.answers} threads ${stores.threads ?? "-"} rev ${stores.docRevision}/${stores.hostRev ?? "-"}` : ""}` : "";
  const pairedLine = pairedPoint ? `  paired ${pairedPoint.connection ?? "no chip"} heap ${mb(pairedPoint.heap)} MB dom ${pairedPoint.nodes} listeners ${pairedPoint.listeners}` : "";
  const chatLine = chatNow ? `  ${formatChat(chatNow)}` : "";
  console.log(
    `${scenario} ${String(t).padStart(4)} s  heap ${mb(point.heap).padStart(6)} MB  geo ${String(point.geometries).padStart(4)}  tex ${String(point.textures).padStart(3)}  calls ${String(point.calls).padStart(4)}  dom ${point.nodes}  listeners ${point.listeners}${frame}${soak}${pairedLine}${chatLine}${domLine}`,
  );
  // A minute's snapshot goes before that minute's burst (round 41: the snapshot at the half reads the town before it).
  while (nextSnapshot < snapshotMinutes.length && t >= snapshotMinutes[nextSnapshot] * 60) {
    await snapshotAt(snapshotMinutes[nextSnapshot]);
    nextSnapshot += 1;
  }
  if (live && chat.burst > 0 && burstAt === null && t >= chat.burstAt * 60) {
    burstAt = new Date();
    for (let i = 0; i < chat.burst; i++) {
      live.fake.sendDm(agents[(sent + i) % agents.length], `burst ${i + 1} of ${chat.burst}`);
    }
    sent += chat.burst;
    burstSent = chat.burst;
    console.log(`  burst: ${chat.burst} messages sent in one instant at ${burstAt.toTimeString().slice(0, 8)} (minute ${t / 60}); the agents' replies follow 8 s later in demo time`);
  }
}
if (sender) clearInterval(sender);
let chatEnd = null;
if (live && chat.active) {
  // The last replies and their reads land in the seconds after the last send.
  await page.waitForTimeout(15000);
  const tally = dmReads.tally();
  const onPage = await readPageChat();
  const burst = burstAt ? dmReads.inWindow(burstAt.getTime(), 60000) : null;
  const lost = live.lost();
  chatEnd = { sent, burstSent, burstAt: burstAt?.toISOString() ?? null, tally, rows: onPage?.rows ?? -1, lastLabels: onPage?.labels ?? [], burstMinute: burst, lost };
  console.log(
    `chat tally: sent ${sent}${burstAt ? ` (burst ${burstSent} at ${burstAt.toTimeString().slice(0, 8)})` : ""}; the host read ${tally.total} times over ${tally.ids} ids (${tally.once} once, ${tally.twice} twice, ${tally.more} more; ${tally.ok} with 200, ${tally.bad} with another status, ${tally.errors} with no answer), at most ${tally.maxInFlight} in flight at once${burst ? `; the burst's minute: ${burst.count} reads, ${JSON.stringify(burst.statuses)}, mean ${burst.meanMs} ms, slowest ${burst.slowestMs} ms` : ""}; the page added ${chatEnd.rows} Recent answers rows; the host's log: ${lost} agent message${lost === 1 ? "" : "s"} lost`,
  );
  const chatLines = live.lines.filter((l) => /lost|retr|dm|chat/i.test(l));
  if (chatLines.length > 0) {
    console.log(`host log, ${chatLines.length} line${chatLines.length === 1 ? "" : "s"} about the chat (the first 20):`);
    for (const l of chatLines.slice(0, 20)) console.log(`  ${l}`);
  }
}
const warm = points.filter((p) => p.t >= 60);
const baseOf = (key) => warm.slice(0, 3).map((p) => p[key]).sort((a, b) => a - b)[1] ?? warm[0]?.[key] ?? 0;
const last = points[points.length - 1];
// Per hour (round 27, the soak): the growth after warm-up over the hours between the warm-up's base and the last sample.
const hours = warm.length > 3 ? (last.t - warm[1].t) / 3600 : 0;
const growth = { heapMB: +mb(last.heap - baseOf("heap")), geometries: last.geometries - baseOf("geometries"), textures: last.textures - baseOf("textures"), domNodes: last.nodes - baseOf("nodes"), listeners: last.listeners - baseOf("listeners"), hours: +hours.toFixed(2), heapMBPerHour: hours > 0 ? +(mb(last.heap - baseOf("heap")) / hours).toFixed(2) : null };
console.log(`${scenario} growth after warm-up: heap ${growth.heapMB} MB, geo ${growth.geometries}, tex ${growth.textures}, dom ${growth.domNodes}, listeners ${growth.listeners}${growth.heapMBPerHour !== null ? ` (${growth.heapMBPerHour} MB an hour over ${growth.hours} h)` : ""}`);
if (snapshots.length > 1) {
  const first = snapshots[0].shapes, end = snapshots[snapshots.length - 1].shapes;
  const fadedLine = snapshots[0].faded !== null || snapshots[snapshots.length - 1].faded !== null ? `, faded copies ${snapshots[0].faded ?? "?"} -> ${snapshots[snapshots.length - 1].faded ?? "?"}` : "";
  console.log(`${scenario} counts, minute ${snapshots[0].minute} to ${snapshots[snapshots.length - 1].minute}: batches ${first.instancedMeshes} -> ${end.instancedMeshes}, MeshStandardMaterial ${first.materials} -> ${end.materials}${fadedLine}, Mesh ${first.meshes} -> ${end.meshes}`);
}
// The verdict (round 47, lib/verdict.mjs): item 3 of "What to soak and how" on the snapshots, said in one line at the end.
const verdict = judge({ minutes, snapshots: snapshots.map((s) => ({ minute: s.minute, bytes: s.bytes, code: s.code })), diff: firstRead && lastTotals && lastTotals.minute > firstRead.minute ? snapshotDiff(firstRead.totals.byName, lastTotals.totals.byName) : null });
for (const line of formatVerdict(verdict)) console.log(line);
if (jsonOut)
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        scenario,
        minutes,
        every,
        build: opts.preview ? "preview" : "dev",
        ...(opts.cast ? { cast: opts.cast } : {}),
        ...(opts.scenario ? { demoScenario: opts.scenario } : {}),
        ...(live ? { loops: opts["loops-url"] || `fake:${opts["fake-scenario"]}@${opts["fake-speed"]}x` } : {}),
        ...(paired ? { pairedTab: true } : {}),
        ...(chat.active ? { chat: { agents, dmEvery: chat.dmEvery, burst: chat.burst, burstAt: chat.burstAt, end: chatEnd } } : {}),
        ...(threeNames ? { threeNames } : {}),
        points,
        growth,
        snapshots,
        verdict,
      },
      null,
      2,
    ),
  );
await browser.close();
if (live) await live.close();
