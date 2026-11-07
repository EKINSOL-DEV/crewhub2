/* detachedproof.mjs: does the soak's listing of detached trees keep a tree alive once the page lets go of it? (round 76)

   Usage:
     node tools/detachedproof.mjs [--reps <n>] [--json <file>]

   DOM.getDetachedDomNodes binds every node it lists to the CDP session that asked, so on a session that stays open a
   tree alive for an instant at the call stays for the run (round 75, rr's test 1, Chromium 151.0.7922.34). This holds
   tools/memory.mjs's own listing, lib/domdiff.ts's listDetachedNodes, in the real browser. A node test cannot: it runs
   with no browser (scripts/test/domdiff.test.ts holds the helper's order and the wiring). So this is run by hand or by
   a reviewer when the listing changes, or when Playwright brings a new Chromium; it is not in npm test.

   A blank page by page.setContent: no server, no port (Playwright talks to Chromium over a pipe), no address opened.
   Each arm runs in a browser of its own, so counters are not shared between arms.
     held          the page keeps the tree, nothing lists it: must read kept, or the counters cannot see a tree
     held, listed  the page keeps the tree, listDetachedNodes lists it twice with a settle between: must read kept and
                   list it both times, so the road that frees a released tree still reports a held one
     never listed  the page lets go, nothing lists it: must read freed, or something else holds the tree
     page session  listed on the page's main session, then released (the old call): must read kept, or this Chromium
                   no longer binds what it lists and the next two arms prove nothing
     listed        listDetachedNodes once, then released: must read freed
     listed 3x     listDetachedNodes three times, then released: must read freed
   And once, on a closed page: listDetachedNodes must report the failure, not an empty list.
   The tree: a button with onclick, a span and its text, and a bare text node: 4 nodes, 1 listener. Counters are read
   before the final probe, and the probe uses a session of its own, so it cannot hold what it reads.

   Exit: 0 the listing keeps nothing; 1 the listing keeps the tree (red); 2 a control failed, an arm read neither kept
   nor freed, or the run itself threw, so the run says nothing. */
import { writeFileSync } from "node:fs";
import { describeDetached, detachedReading, listDetachedNodes } from "./lib/domdiff.ts";
import { launch } from "./lib/world.mjs";

const NODES = 4;
const LISTENERS = 1;
const ROOTS = ["button.proof-probe (3 nodes)", "#text (1 nodes)"];
const argv = process.argv.slice(2);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const reps = Number(option("--reps") ?? 3);
const jsonAt = option("--json");
if (!Number.isInteger(reps) || reps < 1 || argv.length % 2 !== 0 || argv.some((a, i) => i % 2 === 0 && !["--reps", "--json"].includes(a))) {
  console.error("usage: node tools/detachedproof.mjs [--reps <n>] [--json <file>]");
  process.exit(2);
}
// Node's own exit for a throw is 1, which here means the listing keeps the tree. A throw says nothing about that.
process.on("uncaughtException", (error) => {
  console.error(`detachedproof: the run threw, so it says nothing: ${error.stack ?? error}`);
  process.exit(2);
});
setTimeout(() => {
  console.error("detachedproof: over 180 s, stopping");
  process.exit(2);
}, 180_000).unref();

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Collects garbage until two reads agree: the counters fall when the sweep runs, so one read after a collection can lag. */
async function settle(cdp) {
  let last = null;
  for (let i = 0; i < 8; i++) {
    await cdp.send("HeapProfiler.collectGarbage");
    await pause(150);
    const read = await cdp.send("Memory.getDOMCounters");
    if (last && last.nodes === read.nodes && last.jsEventListeners === read.jsEventListeners) return { nodes: read.nodes, listeners: read.jsEventListeners };
    last = read;
  }
  return { nodes: last.nodes, listeners: last.jsEventListeners, unsettled: true };
}

/** The final look, on a session of its own and without the helper: a broken helper cannot change what it reads. */
async function probe(context, page) {
  const session = await context.newCDPSession(page);
  const { detachedNodes } = await session.send("DOM.getDetachedDomNodes");
  await session.detach();
  return describeDetached(detachedNodes, 8);
}

/** The listing through tools' own road: the lines describeDetached makes of it, or a throw when it reports a failure. */
async function listed(page) {
  const { detached, failed } = detachedReading(await listDetachedNodes(page), 8);
  if (failed !== null) throw new Error(`the listing reported a failure on a live page: ${failed}`);
  return detached;
}
const ARMS = {
  held: { release: false, list: async () => null },
  "held, listed": { release: false, list: async ({ page }) => listed(page), again: true },
  "never listed": { release: true, list: async () => null },
  "page session": { release: true, list: async ({ cdp }) => describeDetached((await cdp.send("DOM.getDetachedDomNodes")).detachedNodes, 8) },
  listed: { release: true, list: async ({ page }) => listed(page) },
  "listed 3x": {
    release: true,
    list: async ({ page }) => {
      await listed(page);
      await listed(page);
      return listed(page);
    },
  },
};

async function runArm(name) {
  const browser = await launch({ extra: ["--enable-precise-memory-info"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    const cdp = await context.newCDPSession(page);
    await page.setContent('<!doctype html><body><div id="host"></div></body>');
    const baseline = await settle(cdp);
    await page.evaluate(() => {
      const host = document.getElementById("host");
      const button = document.createElement("button");
      button.className = "proof-probe";
      button.onclick = () => {};
      const span = document.createElement("span");
      span.textContent = "proof";
      button.append(span);
      const text = document.createTextNode("proof-text");
      host.append(button, text);
      host.getBoundingClientRect();
      button.remove();
      text.remove();
      window.__keep = [button, text];
    });
    const first = await ARMS[name].list({ page, cdp });
    if (ARMS[name].release) await page.evaluate(() => delete window.__keep);
    const after = await settle(cdp);
    const looked = await probe(context, page);
    const again = ARMS[name].again ? await listed(page) : null;
    return { name, version: browser.version(), baseline, after, nodes: after.nodes - baseline.nodes, listeners: after.listeners - baseline.listeners, first, probe: looked, again, requests };
  } finally {
    await browser.close();
  }
}

/** The listing on a page that is gone: the failure must come back as a failure, with no list. */
async function onClosedPage() {
  const browser = await launch({ extra: ["--enable-precise-memory-info"] });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.close();
    return await listDetachedNodes(page);
  } finally {
    await browser.close();
  }
}

const signed = (n) => `${n >= 0 ? "+" : ""}${n}`;
const runs = [];
for (let rep = 1; rep <= reps; rep++) {
  for (const name of Object.keys(ARMS)) {
    const arm = await runArm(name);
    runs.push({ rep, ...arm });
    console.log(`rep ${rep} ${name.padEnd(12)} nodes ${arm.baseline.nodes} -> ${arm.after.nodes} (${signed(arm.nodes)})  listeners ${arm.baseline.listeners} -> ${arm.after.listeners} (${signed(arm.listeners)})  first list ${arm.first ? arm.first.join(", ") || "empty" : "not called"}  probe ${arm.probe.join(", ") || "empty"}${arm.after.unsettled ? "  UNSETTLED" : ""}`);
  }
}

const closed = await onClosedPage();
console.log(`closed page  nodes ${closed.nodes === null ? "null" : closed.nodes.length}  failed ${closed.failed}`);

const hasRoots = (list) => !!list && ROOTS.every((root) => list.includes(root));
const kept = (a) => a.nodes >= NODES && a.listeners >= LISTENERS && hasRoots(a.probe);
const freed = (a) => a.nodes < NODES && a.listeners < LISTENERS && !ROOTS.some((root) => a.probe.includes(root));
const of = (name) => runs.filter((r) => r.name === name);
const all = (name, test) => of(name).every(test);
const LISTING = ["listed", "listed 3x"];
const checks = {
  noRequest: runs.every((r) => r.requests.length === 0),
  settled: runs.every((r) => !r.after.unsettled && !r.baseline.unsettled),
  heldKept: all("held", kept),
  heldListedKept: all("held, listed", (a) => kept(a) && hasRoots(a.first) && hasRoots(a.again)),
  failureReported: closed.nodes === null && typeof closed.failed === "string" && closed.failed !== "",
  neverListedFreed: all("never listed", freed),
  pageSessionKept: all("page session", kept),
  firstListSawTheTree: ["page session", ...LISTING].every((name) => all(name, (a) => hasRoots(a.first))),
  everyArmReadable: LISTING.every((name) => all(name, kept) || all(name, freed)),
};
const readable = Object.values(checks).every(Boolean);
const listingFreed = LISTING.every((name) => all(name, freed));
const verdict = !readable ? "NOT READABLE: a control failed, so the arms say nothing" : listingFreed ? "FREED: the listing keeps nothing alive" : "RED: the listing keeps a tree alive that nothing else holds";
console.log(`browser ${runs[0].version}`);
console.log(`checks: ${JSON.stringify(checks)}`);
console.log(`verdict: ${verdict}`);
if (jsonAt) writeFileSync(jsonAt, JSON.stringify({ version: runs[0].version, checks, verdict, runs }, null, 1));
process.exit(!readable ? 2 : listingFreed ? 0 : 1);
