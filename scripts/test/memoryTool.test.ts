/* The memory tool's pure parts (round 45, tools/lib/chatSoak.mjs and tools/lib/heap.mjs): the chat soak's options,
   the counter of the host's reads of agent messages, the agents a fake's chat names, the sender's turn, the page-side
   counter's cap, the counts by shape on a hand-made heap snapshot (and, since round 47, on a real one), the summing by constructor, and the minified
   names of three's classes read from a chunk's class bodies. Node only: no browser, no host. */
import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_FLAGS, CHAT_OPTIONS, chatAgents, chatSettings, createDmReadCounter, formatChat, lostIn, nextDm, pageChatCounter } from "../../tools/lib/chatSoak.mjs";
import { SHAPES, formatShapes, resolveThreeNames, shapeCounts, summarize, topBySize } from "../../tools/lib/heap.mjs";

const parsed = (over: Record<string, unknown> = {}) => ({ ...CHAT_OPTIONS, ...Object.fromEntries(CHAT_FLAGS.map((f) => [f, false])), ...over });
const failing = () => {
  const messages: string[] = [];
  return { messages, fail: (m: string) => { messages.push(m); throw new Error(m); } };
};

test("the chat soak's options: nothing asked for is inactive; each option parses; the burst needs its minute", () => {
  assert.deepEqual(chatSettings(parsed()), { pairedTab: false, chatPanel: false, dmEvery: null, burst: 0, burstAt: null, active: false });
  assert.deepEqual(chatSettings(parsed({ "paired-tab": true })), { pairedTab: true, chatPanel: false, dmEvery: null, burst: 0, burstAt: null, active: false }, "a paired tab alone is not the chat soak");
  assert.deepEqual(chatSettings(parsed({ "chat-panel": true, "dm-every": "5", burst: "300", "burst-at": "30" })), { pairedTab: false, chatPanel: true, dmEvery: 5, burst: 300, burstAt: 30, active: true });
  assert.equal(chatSettings(parsed({ "dm-every": "2.5" })).dmEvery, 2.5);
  for (const [over, said] of [
    [{ burst: "50" }, /--burst needs --burst-at/],
    [{ "burst-at": "5" }, /--burst-at needs --burst/],
    [{ "dm-every": "0" }, /--dm-every takes a number of at least 1/],
    [{ "dm-every": "soon" }, /--dm-every takes a number/],
    [{ burst: "1.5", "burst-at": "1" }, /--burst takes a whole number/],
    [{ burst: "-1", "burst-at": "1" }, /--burst takes a whole number/],
  ] as const) {
    const f = failing();
    assert.throws(() => chatSettings(parsed(over), f.fail), said, JSON.stringify(over));
    assert.equal(f.messages.length, 1);
  }
});

test("the read counter sees only the host's reads of agent messages, by id, with in flight, status and errors", async () => {
  const counter = createDmReadCounter();
  let open = 0;
  const gate: (() => void)[] = [];
  const fake = (url: string | URL | Request) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    open += 1;
    return new Promise<Response>((resolve, reject) => gate.push(() => { open -= 1; if (u.endsWith("/m-err")) reject(new Error("socket hung up")); else resolve(new Response("{}", { status: u.endsWith("/m-404") ? 404 : 200 })); }));
  };
  const wrapped = counter.wrap(fake as unknown as typeof fetch);
  const other = wrapped("http://127.0.0.1:1/api/dm/threads");
  const a1 = wrapped("http://127.0.0.1:1/api/dm/messages/m-1");
  const a2 = wrapped(new URL("http://127.0.0.1:1/api/dm/messages/m-1"));
  const b = wrapped("http://127.0.0.1:1/api/dm/messages/m-404");
  const c = wrapped("http://127.0.0.1:1/api/dm/messages/m-err").catch((e: Error) => e.message);
  assert.equal(counter.tally().inFlight, 4, "the threads list is not a message read");
  for (const release of gate) release();
  await Promise.all([other, a1, a2, b]);
  assert.equal(await c, "socket hung up", "the error is passed on");
  const t = counter.tally();
  assert.deepEqual(t, { ids: 3, total: 4, once: 2, twice: 1, more: 0, ok: 2, bad: 1, inFlight: 0, maxInFlight: 4, errors: 1 });
  assert.equal(t.ok + t.bad + t.errors, t.total, "ok, bad and errors are disjoint (round 47): a read that threw is an error, not also bad");
  const w = counter.inWindow(0, Date.now() + 1);
  assert.deepEqual([w.count, w.statuses], [4, { 200: 2, 404: 1, error: 1 }]);
  assert.deepEqual(counter.reads.get("m-1")?.map((r) => r.status), [200, 200]);
  assert.match(formatChat({ sent: 5, burstSent: 0, reads: t, rows: 4, lost: 0 }), /^chat sent 5 reads 3 ids\/4 total \(twice 1, bad 1, errors 1, in flight 0, max 4\) rows 4$/);
  assert.match(formatChat({ sent: 305, burstSent: 300, reads: t, rows: 4, lost: 172 }), /\(burst 300\).* lost 172$/);
});

test("the agents the soak writes to are the scenario's leads, else the threads' agents; the sender takes them in turn", async () => {
  const asked: { url: string; auth: string | undefined }[] = [];
  const answers = (agents: unknown[], threads: unknown[]) =>
    (async (url: string, init?: { headers?: Record<string, string> }) => {
      asked.push({ url, auth: init?.headers?.authorization });
      return new Response(JSON.stringify(url.endsWith("/api/agents") ? { agents } : { threads }), { status: 200 });
    }) as unknown as typeof fetch;
  const fake = { url: "http://127.0.0.1:1", key: "chl_secret", keyName: "crewhub-world" };
  const leads = [
    { id: "g-man", role: "lead", isCrewhubLead: true },
    { id: "cr-lead", role: "lead" },
    { id: "cr-dev-1", role: "worker" },
    { id: "ci-bot", role: "lead", external: true },
    { id: "crewhub-world", role: "lead", external: true, viewer: true },
    { id: "cl-lead", role: "lead" },
  ];
  const agents = await chatAgents(fake, answers(leads, []));
  assert.deepEqual(agents, ["g-man", "cr-lead", "cl-lead"], "the leads, not a worker, not an external bot, not the key's own bot");
  assert.deepEqual(asked, [{ url: "http://127.0.0.1:1/api/agents", auth: "Bearer chl_secret" }], "one ask, with the key as the bearer");
  const at = new Date(2026, 9, 26, 23, 5, 7);
  assert.deepEqual(nextDm(agents, 0, at), { agent: "g-man", text: "soak 1 at 23:05:07" });
  assert.deepEqual(nextDm(agents, 4, at), { agent: "cr-lead", text: "soak 5 at 23:05:07" });
  asked.length = 0;
  assert.deepEqual(await chatAgents(fake, answers([{ id: "cr-dev-1", role: "worker" }], [{ id: "t1", agentId: "g-man" }, { id: "t3", agent: { id: "cl-lead" } }])), ["g-man", "cl-lead"], "no lead: the threads' agents");
  assert.deepEqual(asked.map((a) => a.url), ["http://127.0.0.1:1/api/agents", "http://127.0.0.1:1/api/dm/threads"]);
  await assert.rejects(chatAgents(fake, answers([], [])), /names no agent/);
  await assert.rejects(chatAgents(fake, (async () => new Response("", { status: 403 })) as unknown as typeof fetch), /answered 403/);
});

test("the page-side counter keeps a count and at most `keep` labels", () => {
  const source = pageChatCounter(20);
  assert.match(source, /keep: 20/);
  assert.match(source, /state\.labels\.splice\(0, state\.labels\.length - state\.keep\)/, "the labels list is capped in the page");
  assert.doesNotMatch(source, /window\.__r40/, "the scratch rig's name is gone");
  assert.match(source, /closest\("\.chat-sheet"\)/, "only the Chat panel's list counts: the text view's second Recent answers list would count each answer twice (round 47, F11)");
});

/** A heap snapshot in V8's format with four objects: an InstancedMesh (isInstancedMesh and isMesh), a Mesh, a
    MeshStandardMaterial and a plain object with an `isMesh` that is not its own property (a shortcut edge, not a property). */
function snapshotFixture() {
  const strings = ["", "InstancedMesh", "Mesh", "MeshStandardMaterial", "Object", "isInstancedMesh", "isMesh", "isMeshStandardMaterial", "color", "(string)", "hello"];
  const s = (text: string) => strings.indexOf(text);
  const nodeTypes = ["hidden", "array", "string", "object", "code", "closure", "regexp", "number", "native", "synthetic", "concatenated string", "sliced string", "symbol", "bigint", "object shape"];
  const edgeTypes = ["context", "element", "property", "internal", "hidden", "shortcut", "weak"];
  const T = (t: string) => nodeTypes.indexOf(t), E = (t: string) => edgeTypes.indexOf(t);
  // node: type, name, id, self_size, edge_count, trace_node_id, detachedness
  const nodes: number[] = [], edges: number[] = [];
  const node = (type: string, name: string, size: number, list: [string, string, number][]) => {
    nodes.push(T(type), s(name), nodes.length / 7 + 1, size, list.length, 0, 0);
    for (const [etype, ename, to] of list) edges.push(E(etype), etype === "element" ? Number(ename) : s(ename), to * 7);
  };
  node("object", "InstancedMesh", 100, [["property", "isInstancedMesh", 5], ["property", "isMesh", 5]]); // 0
  node("object", "Mesh", 70, [["property", "isMesh", 5]]); // 1
  node("object", "MeshStandardMaterial", 60, [["property", "isMeshStandardMaterial", 5], ["property", "color", 4]]); // 2
  node("object", "Object", 40, [["shortcut", "isMesh", 5]]); // 3
  node("object", "Object", 40, []); // 4
  node("string", "hello", 24, []); // 5
  return { snapshot: { meta: { node_fields: ["type", "name", "id", "self_size", "edge_count", "trace_node_id", "detachedness"], node_types: [nodeTypes], edge_fields: ["type", "name_or_index", "to_node"], edge_types: [edgeTypes] } }, nodes, edges, strings };
}

test("the counts by shape: the own flag names the instance, an InstancedMesh is not a Mesh, a shortcut edge does not count", () => {
  const snapshot = snapshotFixture();
  assert.deepEqual(shapeCounts(snapshot), { instancedMeshes: 1, materials: 1, meshes: 1 });
  assert.deepEqual(SHAPES.map((s) => s.key), ["instancedMeshes", "materials", "meshes"]);
  assert.equal(formatShapes(shapeCounts(snapshot)), "batches (InstancedMesh) 1, MeshStandardMaterial 1, Mesh 1");
  const totals = summarize(snapshot);
  assert.deepEqual([totals.bytes, totals.nodes, totals.shapes], [334, 6, { instancedMeshes: 1, materials: 1, meshes: 1 }]);
  assert.deepEqual(totals.byName.get("Object"), { count: 2, size: 80 });
  assert.deepEqual(totals.byName.get("(string)"), { count: 1, size: 24 });
  assert.deepEqual(topBySize(totals, 2).map((r) => r.name), ["InstancedMesh", "Object"]);
});

/* Round 47: the walker on V8's own snapshot, not the test's idea of it. The soak's batch and material counts rest on V8
   recording three's `this.isMesh = true` as a property edge of the instance; this pins that across a V8 or a three
   upgrade. Two snapshots of this process (the snapshot collects garbage first) around 7 InstancedMesh, 5 Mesh and 3
   MeshStandardMaterial kept alive: the deltas are exactly those. About half a second on the Mac (two snapshots of a small heap). */
import { getHeapSnapshot } from "node:v8";
import { text } from "node:stream/consumers";
import * as THREE from "three";
import type { HeapSnapshot } from "../../tools/lib/heap.mjs";

const realSnapshot = async (): Promise<HeapSnapshot> => JSON.parse(await text(getHeapSnapshot()));

test("the counts by shape on a real V8 heap snapshot: the instances made between two snapshots, each counted once", async () => {
  const before = shapeCounts(await realSnapshot());
  const geometry = new THREE.BufferGeometry();
  const basic = new THREE.MeshBasicMaterial();
  const kept: object[] = [
    ...Array.from({ length: 7 }, () => new THREE.InstancedMesh(geometry, basic, 1)),
    ...Array.from({ length: 5 }, () => new THREE.Mesh(geometry, basic)),
    ...Array.from({ length: 3 }, () => new THREE.MeshStandardMaterial()),
  ];
  const after = shapeCounts(await realSnapshot());
  assert.equal(kept.length, 15);
  assert.deepEqual(
    { instancedMeshes: after.instancedMeshes - before.instancedMeshes, materials: after.materials - before.materials, meshes: after.meshes - before.meshes },
    { instancedMeshes: 7, materials: 3, meshes: 5 },
    "an InstancedMesh counts as a batch and not as a Mesh; a MeshBasicMaterial is no MeshStandardMaterial",
  );
});

test("three's minified names come from the chunk's class bodies, or stay null", () => {
  const chunk = "var X=class{constructor(e,t,n){return this.isColor=!0}};var Sn=class{constructor(){this.isObject3D=!0}},Jr=class extends Sn{constructor(e=new wr,t=new Ir){super(),this.isMesh=!0,this.type=`Mesh`}copy(e){}},oi=class extends Jr{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0}};var Ar=class{};\nvar fo=class extends Ar{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`}};";
  assert.deepEqual(resolveThreeNames(chunk), { InstancedMesh: "oi", Mesh: "Jr", MeshStandardMaterial: "fo" });
  assert.deepEqual(resolveThreeNames("nothing of three here"), { InstancedMesh: null, Mesh: null, MeshStandardMaterial: null });
});

/* Round 47, the review's F8 and F11: the host's lost messages summed from question 14's own line (one line at most
   every 5 s, with the count since the one before), over the whole run, not over the 2000 lines the tool keeps; and a
   burst that no sample follows is refused before the run. */
import { createHostLog } from "../../tools/lib/live.mjs";

// q14's line, exactly as `task/q14-dm-read-cap`'s host.ts writes it (`noteLostLine`).
const q14Lost = (count: number, last: string) => `chat: ${count} agent message(s) not read after one retry, those bubbles are lost (last: ${last})`;

test("the host's lost messages: q14's line summed by its count, over every line logged, not the lines kept", () => {
  assert.equal(lostIn(q14Lost(172, "m_300, no answer")), 172);
  assert.equal(lostIn(q14Lost(1, "m_9, 502")), 1);
  assert.equal(lostIn("chat: read m_9 again after 250 ms"), 0, "no other line counts");
  assert.equal(lostIn("loops stream: lost the connection, reconnecting"), 0, "the word lost alone is not a lost message");
  const log = createHostLog(5, () => new Date(2026, 9, 28, 23, 0, 0));
  log.log("loops stream: open");
  log.log(q14Lost(172, "m_300, no answer"));
  log.log(q14Lost(3, "m_303, 502"));
  for (let i = 0; i < 10; i++) log.log(`chat: line ${i}`);
  assert.equal(log.lines.length, 5, "the lines kept are capped");
  assert.ok(!log.lines.some((l) => lostIn(l) > 0), "both lost lines rolled off the kept ones");
  assert.equal(log.lost(), 175, "lost: 175, summed as the lines came in");
  assert.equal(log.lines[0], "23:00:00 chat: line 5", "each line with its time of day");
});

test("--burst-at is checked against --minutes: the burst must follow a sample that has another after it", () => {
  const burst = (at: string, minutes: number, every: number) => {
    const f = failing();
    try {
      return chatSettings(parsed({ burst: "300", "burst-at": at }), f.fail, { minutes, every }).burstAt;
    } catch {
      return f.messages[0];
    }
  };
  assert.equal(burst("90", 180, 600), 90, "round 41's three hours: the burst after minute 90");
  assert.equal(burst("170", 180, 600), 170, "after the sample at 170, the one at 180 reads it");
  assert.match(String(burst("180", 180, 600)), /--burst-at 180 leaves no sample after the burst .*at most --burst-at 170/);
  assert.match(String(burst("200", 180, 600)), /leaves no sample after the burst/, "past the run's end");
  assert.match(String(burst("5", 8, 600)), /the last at minute 0\): at most --burst-at 0/, "a run shorter than one interval has one sample, at 0");
  assert.equal(burst("4.5", 10, 60), 4.5, "a minute between samples: the burst follows the next sample (minute 5)");
  assert.equal(chatSettings(parsed({ burst: "300", "burst-at": "999" })).burstAt, 999, "without the run's length nothing is checked");
});

/* Round 47: the verdict at a run's end (tools/lib/verdict.mjs), item 3 of COST_POLICY's "What to soak and how". Round
   46's three potlings hours pass by its own numbers; three made-up runs fail one rule each; runs too short for the
   window cannot be judged. The fixture is round 46's snapshot totals, (code) rows and the rows the first and the last
   snapshot's top-40 tables share, cut from its 178 kB JSON. */
import { readFileSync } from "node:fs";
import { judge, formatVerdict, fitWindow, rowKind, snapshotDiff, type VerdictSnapshot } from "../../tools/lib/verdict.mjs";

const r46 = JSON.parse(readFileSync(new URL("./fixtures/soak/r46-potlings-3h.json", import.meta.url), "utf8")) as { minutes: number; snapshots: VerdictSnapshot[]; first: [string, number, number][]; last: [string, number, number][] };
const sums = (rows: [string, number, number][]) => rows.map(([name, count, size]) => [name, { count, size }] as const);
const MiB = 1048576;
/** Snapshots at `minutes`, the total without code from `rest(minute)` and the code from `code(minute)`, both in MB. */
const run = (minutes: number[], rest: (m: number) => number, code: (m: number) => number): VerdictSnapshot[] => minutes.map((m) => ({ minute: m, bytes: Math.round((rest(m) + code(m)) * MiB), code: Math.round(code(m) * MiB) }));
const flatDiff = snapshotDiff([["Object", { count: 100, size: 1000 }]], [["Object", { count: 100, size: 1000 }]]);

test("the verdict on round 46's three potlings hours: levels off, by the numbers round 46 read", () => {
  const v = judge({ minutes: r46.minutes, snapshots: r46.snapshots, diff: snapshotDiff(sums(r46.first), sums(r46.last)) });
  assert.deepEqual(v.window, { from: 100, to: 180 });
  assert.deepEqual(v.fit?.minutes, [120, 150, 180], "three snapshots in the last 80 minutes");
  assert.equal(v.fit?.mbPerHour?.toFixed(3), "0.154");
  assert.equal(v.jsObjects?.mb.toFixed(2), "0.15");
  assert.deepEqual([v.code?.from, v.code?.to, v.code?.mbPerHour.toFixed(2)], [10, 180, "0.51"]);
  assert.deepEqual([v.levelling?.mid, v.levelling?.firstMBPerHour.toFixed(2), v.levelling?.secondMBPerHour.toFixed(2)], [90, "0.94", "0.13"]);
  assert.deepEqual(v.failed, []);
  assert.equal(v.levelsOff, true);
  const lines = formatVerdict(v);
  assert.equal(lines.at(-1), "verdict: levels off (item 3: the fit, the JS objects, the (code) ceiling and the levelling test pass)");
  assert.ok(lines.some((l) => /minute 180: total 51\.47 MB, \(code\) 15\.08 MB, without code 36\.39 MB {2}\(in the window\)/.test(l)), "the total without code at each snapshot");
  assert.ok(lines.some((l) => /^ {2}\(code\), minute 10 to 180: \+1\.46 MB, 0\.51 MB an hour \(at most 1\.5: pass\)/.test(l)));
});

test("the verdict: a code leak fails the (code) ceiling", () => {
  // An eval on every chat message: 2 MB of code an hour from the start, the JS objects flat.
  const v = judge({ minutes: 60, snapshots: run([10, 20, 30, 40, 50, 60], () => 36, (m) => 14 + (2 * m) / 60), diff: flatDiff });
  assert.deepEqual(v.failed, ["code-ceiling"]);
  assert.equal(v.levelsOff, false);
  assert.equal(v.code?.mbPerHour.toFixed(2), "2.00");
  assert.equal(v.levelling, null, "an hour asks no levelling test");
  assert.equal(formatVerdict(v).at(-1), "verdict: does not level off: the (code) ceiling failed");
});

test("the verdict: a code rise under the ceiling that does not level off fails the levelling test", () => {
  // Two hours, (code) at 0.6 MB an hour for the first hour and 1.2 for the second: under 1.5 overall, rising.
  const code = (m: number) => 14 + (m <= 60 ? (0.6 * (m - 10)) / 60 : 0.5 + (1.2 * (m - 60)) / 60);
  const v = judge({ minutes: 120, snapshots: run([10, 40, 60, 80, 100, 120], () => 36, code), diff: flatDiff });
  assert.ok(v.code!.pass, `under the ceiling (${v.code!.mbPerHour.toFixed(2)} MB an hour)`);
  assert.deepEqual([v.levelling?.from, v.levelling?.mid, v.levelling?.to], [10, 60, 120]);
  assert.deepEqual(v.failed, ["levelling"]);
  assert.match(formatVerdict(v).at(-1)!, /^verdict: does not level off: the levelling test failed$/);
});

test("the verdict: a JS-object leak fails item 3, the fit and the diff", () => {
  // 0.6 MB of plain objects held over the hour: the total without code rises 0.72 MB an hour, the diff says where.
  const leak = snapshotDiff([["Object", { count: 50_000, size: 1_600_000 }], ["(code)", { count: 1, size: 14 * MiB }]], [["Object", { count: 70_000, size: 1_600_000 + 0.6 * MiB }], ["(code)", { count: 1, size: 14.4 * MiB }], ["native system / JSArrayBufferData", { count: 9, size: 4 * MiB }]]);
  assert.equal((leak.byKind.objects / MiB).toFixed(2), "0.60");
  assert.equal((leak.byKind.code / MiB).toFixed(2), "0.40", "the code is left out of the JS objects");
  assert.equal(leak.byKind["V8 bookkeeping"], 4 * MiB, "and V8's bookkeeping too");
  assert.equal((leak.jsBytes / MiB).toFixed(2), "0.60", "the JS objects are the objects alone");
  const v = judge({ minutes: 60, snapshots: run([10, 20, 30, 40, 50, 60], (m) => 36 + (0.6 * (m - 10)) / 50, (m) => 14 + (0.4 * (m - 10)) / 50), diff: leak });
  assert.deepEqual(v.failed, ["fit", "js-objects"]);
  assert.equal(v.fit?.mbPerHour?.toFixed(2), "0.72");
  assert.equal(v.jsObjects?.rows[0]?.name, "Object");
  assert.equal(formatVerdict(v).at(-1), "verdict: does not level off: the fit, the JS objects failed");
});

test("the verdict: a run too short for the window, or too few snapshots in it, cannot be judged", () => {
  assert.equal(fitWindow(10), null);
  assert.deepEqual(fitWindow(60), { from: 10, to: 60 });
  assert.deepEqual(fitWindow(90), { from: 10, to: 60 });
  assert.deepEqual(fitWindow(180), { from: 100, to: 180 });
  const smoke = judge({ minutes: 10, snapshots: run([0, 10], () => 36, () => 14), diff: null });
  assert.equal(smoke.levelsOff, null);
  assert.equal(formatVerdict(smoke).at(-1), "verdict: cannot judge: the run is 10 minutes; the rules need an hour (minutes 10 to 60) or two hours or more (the last 80 minutes)");
  const two = judge({ minutes: 60, snapshots: run([10, 60], () => 36, () => 14), diff: flatDiff });
  assert.equal(two.levelsOff, null, "not a guess from two points");
  assert.match(two.line, /^verdict: cannot judge: 2 snapshots in the window \(minutes 10 to 60\), a fit takes 3$/);
  const none = judge({ minutes: 60, snapshots: [], diff: null });
  assert.match(none.line, /cannot judge: 0 snapshots in the window/);
});

test("the snapshot rows by kind, as item 3 lists them", () => {
  const kinds = Object.fromEntries(["(code)", "native system / ExternalStringData", "native system / JSArrayBufferData", "(system) Foo", "(object shape)", "native blink::ComputedStyle", "native WebGLBuffer", "InspectorNetworkResourcesData", "array (object elements)", "closure e", "(string)", "(concatenated string)", "(number)", "Object", "fo", "Map"].map((n) => [n, rowKind(n)]));
  assert.deepEqual(kinds, {
    "(code)": "code",
    "native system / ExternalStringData": "external strings",
    "native system / JSArrayBufferData": "V8 bookkeeping",
    "(system) Foo": "V8 bookkeeping",
    "(object shape)": "V8 bookkeeping",
    "native blink::ComputedStyle": "native",
    "native WebGLBuffer": "native",
    InspectorNetworkResourcesData: "inspector",
    "array (object elements)": "arrays",
    "closure e": "closures",
    "(string)": "strings",
    "(concatenated string)": "strings",
    "(number)": "numbers",
    Object: "objects",
    fo: "named constructors",
    Map: "named constructors",
  });
  const d = snapshotDiff([["fo", { count: 1, size: 100 }]], [["oi", { count: 2, size: 300 }]]);
  assert.equal(d.jsBytes, 200, "a name in one snapshot only counts from or to nothing");
});
