/* The memory tool's pure parts (round 45, tools/lib/chatSoak.mjs and tools/lib/heap.mjs): the chat soak's options,
   the counter of the host's reads of agent messages, the agents a fake's chat names, the sender's turn, the page-side
   counter's cap, the counts by shape on a hand-made heap snapshot, the summing by constructor, and the minified
   names of three's classes read from a chunk's class bodies. Node only: no browser, no host. */
import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_FLAGS, CHAT_OPTIONS, chatAgents, chatSettings, createDmReadCounter, formatChat, lostAndRetried, nextDm, pageChatCounter } from "../../tools/lib/chatSoak.mjs";
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
  assert.deepEqual(t, { ids: 3, total: 4, once: 2, twice: 1, more: 0, ok: 2, bad: 2, inFlight: 0, maxInFlight: 4, errors: 1 });
  const w = counter.inWindow(0, Date.now() + 1);
  assert.deepEqual([w.count, w.statuses], [4, { 200: 2, 404: 1, error: 1 }]);
  assert.deepEqual(counter.reads.get("m-1")?.map((r) => r.status), [200, 200]);
  assert.match(formatChat({ sent: 5, burstSent: 0, reads: t, rows: 4, lost: 0, retried: 0 }), /^chat sent 5 reads 3 ids\/4 total \(twice 1, bad 2, in flight 0, max 4\) rows 4$/);
  assert.match(formatChat({ sent: 305, burstSent: 300, reads: t, rows: 4, lost: 2, retried: 1 }), /\(burst 300\).* lost 2$/);
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
  assert.deepEqual(lostAndRetried(["12:00:00 loops stream: ok", "12:00:05 chat: 3 reads lost after the retry", "12:00:06 chat: read retried after 250 ms"]), { lost: 1, retried: 1 });
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

test("three's minified names come from the chunk's class bodies, or stay null", () => {
  const chunk = "var X=class{constructor(e,t,n){return this.isColor=!0}};var Sn=class{constructor(){this.isObject3D=!0}},Jr=class extends Sn{constructor(e=new wr,t=new Ir){super(),this.isMesh=!0,this.type=`Mesh`}copy(e){}},oi=class extends Jr{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0}};var Ar=class{};\nvar fo=class extends Ar{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`}};";
  assert.deepEqual(resolveThreeNames(chunk), { InstancedMesh: "oi", Mesh: "Jr", MeshStandardMaterial: "fo" });
  assert.deepEqual(resolveThreeNames("nothing of three here"), { InstancedMesh: null, Mesh: null, MeshStandardMaterial: null });
});
