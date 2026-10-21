import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { GENEROUS_MS, POLL_MS, waitFor } from "./wait.ts";

const isEvent = (seq: number) => (m: Record<string, unknown>) => m.type === "event" && (m.envelope as { seq: number }).seq === seq;
const isReset = (reason: string) => (m: Record<string, unknown>) => m.type === "reset" && m.reason === reason;
const isStatus = (loops: string) => (m: Record<string, unknown>) => m.type === "status" && m.loops === loops;
const streamRequests = (stub: LoopsStub) => stub.requests.filter((r) => r.path.startsWith("/api/events/stream"));
const resumeOf = (path: string) => {
  const query = new URL(path, "http://127.0.0.1").searchParams;
  return query.has("cursor") ? "cursor" : query.has("after") ? `after=${query.get("after")}` : "live";
};
const anEvent = (type = "ticket.updated") => ({ type, project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
/** Waits until `stub` saw `count` stream requests. */
const streamsSeen = (stub: LoopsStub, count: number) => waitFor(`${count} stream requests`, () => streamRequests(stub).length >= count);

describe("the shared stream", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });
  const quick = { retryMs: { min: 20, max: 100 }, reconnectMs: { min: 20, max: 40 } };
  async function start(stubOptions: Parameters<typeof createLoopsStub>[0] = {}, hostOptions: Partial<Parameters<typeof createHost>[0]> = {}) {
    const stub = await createLoopsStub({ ...installation(), ...stubOptions });
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", ...quick, log: () => undefined, ...hostOptions });
    cleanup.push(() => stub.close(), () => host.close());
    return { stub, host };
  }

  it("holds one upstream stream for two clients and delivers events in order with an id", async () => {
    const { stub, host } = await start({ events: [envelope(10, "ticket.created")] });
    const a = await openSse(`${host.url}/world-api/stream?cursor=10`);
    const b = await openSse(`${host.url}/world-api/stream?cursor=10`);
    cleanup.push(async () => a.close(), async () => b.close());
    await a.next(isStatus("ok"));
    await b.next(isStatus("ok"));
    stub.emit({ ...anEvent("ticket.moved"), payload: { from: "planned", to: "in_progress" } });
    stub.emit(anEvent());
    await a.next(isEvent(12));
    await b.next(isEvent(12));
    assert.deepEqual(a.messages.filter((m) => m.type === "event").map((m) => (m.envelope as { seq: number }).seq), [11, 12]);
    assert.equal(stub.streamsOpened(), 1, "one upstream stream");
    stub.heartbeat();
    const beat = await a.next((m) => m.type === "heartbeat");
    assert.equal(beat.seq, 12);
    assert.equal("cursor" in beat, false, "the sealed cursor stays in the host; the tabs count in seqs");
  });

  it("starts from GET /api/events?from=tail and opens the stream with its sealed cursor, never the old tail trick", async () => {
    const { stub, host } = await start({ events: [envelope(10, "ticket.created")] });
    const a = await openSse(`${host.url}/world-api/stream?cursor=10`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    const paths = stub.requests.map((r) => r.path);
    assert.ok(paths.includes("/api/events?from=tail"), `reads the tail with from=tail: ${paths.join(" ")}`);
    assert.ok(!paths.some((p) => p.includes("attachment.added")), "the old trick (lastSeq 0 since CL-390) is not used on a loops that knows from=tail");
    assert.deepEqual(streamRequests(stub).map((r) => resumeOf(r.path)), ["cursor"], "the tail's sealed cursor is an exact 'now'");
    const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as { cursor: number };
    assert.equal(health.cursor, 10, "the cursor is the tail's lastSeq, not 0");
  });

  it("falls back to the old tail read on an older loops without from=tail, and resumes with after=", async () => {
    const { stub, host } = await start({ older: true, events: [envelope(7, "ticket.created")] });
    const a = await openSse(`${host.url}/world-api/stream?cursor=7`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    const paths = stub.requests.map((r) => r.path);
    assert.ok(paths.includes("/api/events?from=tail"), "tries from=tail first");
    assert.ok(paths.some((p) => p.includes("types=attachment.added")), "then the filter that matches nothing");
    assert.deepEqual(streamRequests(stub).map((r) => resumeOf(r.path)), ["after=7"]);
    stub.emit(anEvent());
    await a.next(isEvent(8));
  });

  it("catches a client up from its cursor out of the buffer, and resets one whose cursor is too old", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] }, { bufferSize: 3 });
    const warm = await openSse(`${host.url}/world-api/stream`);
    cleanup.push(async () => warm.close());
    await warm.next(isStatus("ok"));
    for (let i = 0; i < 5; i += 1) stub.emit(anEvent());
    await warm.next(isEvent(6));
    const late = await openSse(`${host.url}/world-api/stream?cursor=4`);
    cleanup.push(async () => late.close());
    await late.next(isEvent(6));
    assert.deepEqual(late.messages.filter((m) => m.type === "event").map((m) => (m.envelope as { seq: number }).seq), [5, 6]);
    const tooOld = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(async () => tooOld.close());
    await tooOld.next(isReset("cursor"));
    const ahead = await openSse(`${host.url}/world-api/stream?cursor=99`);
    cleanup.push(async () => ahead.close());
    await ahead.next(isReset("cursor"));
    assert.equal((await fetch(`${host.url}/world-api/stream?cursor=-1`)).status, 400);
  });

  it("sends the sealed cursor back only while no event followed the heartbeat that carried it, else after=<seq>", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] });
    const a = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    // Round 1: a heartbeat with a cursor, nothing after it, loops ends the stream: the reconnect carries cursor=,
    // and an event written while the host was away is replayed from the cursor's watermark, without a reset.
    stub.heartbeat();
    await a.next((m) => m.type === "heartbeat");
    stub.endStreams();
    stub.emit(anEvent());
    await a.next(isEvent(2));
    await streamsSeen(stub, 2);
    // Round 2: an event follows the heartbeat: the token is void, the reconnect says after=<last seq>.
    stub.heartbeat();
    await a.next((m) => m.type === "heartbeat" && m.seq === 2);
    stub.emit(anEvent());
    await a.next(isEvent(3));
    stub.endStreams();
    await streamsSeen(stub, 3);
    assert.deepEqual(streamRequests(stub).map((r) => resumeOf(r.path)), ["cursor", "cursor", "after=3"]);
    assert.ok(!stub.requests.some((r) => r.path.includes("cursor=") && r.path.includes("after=")), "never both");
    assert.equal(a.messages.filter((m) => m.type === "reset").length, 0, "a normal end is no reset");
  });

  it("pauses with jitter before reconnecting after a normal end (CL-378), not at once", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] }, { reconnectMs: { min: 250, max: 250 } });
    const a = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    stub.heartbeat();
    await a.next((m) => m.type === "heartbeat");
    const ended = Date.now();
    stub.endStreams();
    await streamsSeen(stub, 2);
    const [, second] = streamRequests(stub);
    const gap = (second as { at: number }).at - ended;
    // A timer never fires early: the lower bound proves the pause. No upper bound on the clock (a loaded machine
    // stretches it); that the end was taken for a normal one, not an error, shows in the status messages below.
    assert.ok(gap >= 230, `the reconnect waited ${gap} ms, at least the pause`);
    const okAt = a.messages.findIndex(isStatus("ok"));
    assert.ok(!a.messages.slice(okAt + 1).some((m) => m.type === "status"), "loops stays ok through the pause: a normal end, never the error road");
    assert.equal(resumeOf((second as { path: string }).path), "cursor", "and the reconnect resumes from the sealed cursor");
  });

  it("honours Retry-After on 429 too_many_streams and connects afterwards", async () => {
    const lines: string[] = [];
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")], busy: { count: 1, retryAfter: "1" } }, { log: (line) => lines.push(line) });
    const a = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    const [refused, accepted] = streamRequests(stub) as { at: number }[];
    assert.ok(refused && accepted, "a refused and an accepted stream request");
    const waited = accepted.at - refused.at;
    // The header was read (the host says what it will wait, 1 s and not its 5 s default) and the wait was kept (a
    // timer never fires early). No upper bound on the clock: a loaded machine stretches it.
    assert.ok(lines.some((l) => /429 too_many_streams, retry in 1 s/.test(l)), lines.join("\n"));
    assert.ok(waited >= 900, `waited ${waited} ms for Retry-After: 1`);
    assert.equal(stub.streamsOpened(), 1);
    stub.emit(anEvent());
    await a.next(isEvent(2));
  });

  it("opens exactly one upstream stream whatever the tabs do: reconnects, snapshot reloads, a 429, late tabs", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")], busy: { count: 1, retryAfter: "1" } }, { reconnectMs: { min: 30, max: 60 } });
    const tabs = await Promise.all([1, 2, 3].map(() => openSse(`${host.url}/world-api/stream?cursor=1`)));
    for (const tab of tabs) cleanup.push(async () => tab.close());
    // Snapshot reloads and health reads race the first connection (the 429 is in the way of it).
    await Promise.all([fetch(`${host.url}/world-api/snapshot`), fetch(`${host.url}/world-api/health`), fetch(`${host.url}/world-api/snapshot`)]);
    await tabs[0]!.next(isStatus("ok"));
    // Every round a snapshot reload races the reconnect; the reloads are awaited at the end (a reload still in flight
    // when the host closes would be a dangling rejection after the test, which node --test counts as a failure).
    const reloads: Promise<number>[] = [];
    for (let round = 0; round < 4; round += 1) {
      const late = await openSse(`${host.url}/world-api/stream?cursor=${stub.lastSeq()}`);
      cleanup.push(async () => late.close());
      stub.heartbeat();
      stub.emit(anEvent());
      await late.next(isEvent(stub.lastSeq()));
      reloads.push(fetch(`${host.url}/world-api/snapshot`).then((r) => r.text().then(() => r.status)));
      stub.endStreams();
      await streamsSeen(stub, 3 + round);
      await waitFor("the reconnected stream to be open", () => stub.openStreams() === 1);
    }
    stub.emit(anEvent());
    await tabs[2]!.next(isEvent(stub.lastSeq()));
    assert.deepEqual(await Promise.all(reloads), [200, 200, 200, 200], "every reload got its snapshot, whichever stream it raced");
    assert.ok(stub.streamsOpened() >= 5, `${stub.streamsOpened()} streams opened over the rounds`);
    assert.equal(stub.maxConcurrentStreams(), 1, "never two upstream streams at once");
    assert.equal(stub.openStreams(), 1);
    // The snapshot's own read of the archive events (`types=project.archived,...`, snapshot.ts) is not a tail read.
    const tailReads = stub.requests.filter((r) => r.path.startsWith("/api/events?") && !r.path.includes("types=project.archived")).map((r) => r.path);
    assert.deepEqual(tailReads, tailReads.map(() => "/api/events?from=tail"), "every tail read is from=tail");
  });

  it("resets with 'gone' when loops answers 410 for its cursor, and continues from the tail", async () => {
    const { stub, host } = await start({ events: [envelope(100, "ticket.created")], minAfter: 100 });
    const a = await openSse(`${host.url}/world-api/stream?cursor=100`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    stub.emit({ ...anEvent("ticket.created"), seq: 150 });
    await a.next(isEvent(150));
    // loops forgot the log up to 150: a host whose first stream asks for 150 is told 410, the clients re-snapshot
    const gone = await createLoopsStub({ ...installation(), older: true, events: [envelope(150, "ticket.created")], minAfter: 151 });
    cleanup.push(() => gone.close());
    const goneHost = await createHost({ loopsUrl: gone.url, key: gone.key, keyName: "crewhub-world", pairing: "off", ...quick, log: () => undefined });
    cleanup.push(() => goneHost.close());
    const b = await openSse(`${goneHost.url}/world-api/stream?cursor=150`);
    cleanup.push(async () => b.close());
    await b.next(isReset("gone"));
    await b.next(isStatus("ok"));
  });

  it("goes down and comes back: status messages, host heartbeats, and a reset when the tail went backwards", async () => {
    const first = await createLoopsStub({ ...installation(), events: [envelope(1, "ticket.created"), envelope(2, "ticket.created")] });
    const host = await createHost({ loopsUrl: first.url, key: first.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 60 }, reconnectMs: { min: 20, max: 40 }, log: () => undefined });
    cleanup.push(() => host.close());
    const a = await openSse(`${host.url}/world-api/stream?cursor=2`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    const port = first.port;
    await first.close();
    await a.next(isStatus("down"));
    const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as { loops: string };
    assert.equal(health.loops, "down");
    assert.equal((await fetch(`${host.url}/world-api/snapshot`)).status, 503);
    // a fresh install on the same port: the tail is lower than our cursor
    const second = await createLoopsStubOnPort(port, { ...installation(), events: [envelope(1, "ticket.created")] });
    cleanup.push(() => second.close());
    await a.next(isReset("reconnected"));
    await a.next(isStatus("ok"));
    assert.equal(((await (await fetch(`${host.url}/world-api/health`)).json()) as { cursor: number }).cursor, 1, "the cursor is the new tail");
  });

  it("passes an event type it does not know to the browser unchanged", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] });
    const a = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    stub.emit({ ...anEvent("automation.ran"), payload: { runId: "run_1", automationId: "au_1", outcome: "done", automation: { id: "au_1", name: "Quiet" } } });
    const message = await a.next(isEvent(2));
    assert.equal((message.envelope as { type: string }).type, "automation.ran");
  });
});

/** A stub bound to a given port, for the restart case. */
async function createLoopsStubOnPort(port: number, options: Parameters<typeof createLoopsStub>[0]): Promise<LoopsStub> {
  const deadline = Date.now() + GENEROUS_MS;
  for (;;) {
    const stub = await createLoopsStubWithPort(port, options);
    if (stub !== null) return stub;
    if (Date.now() > deadline) throw new Error(`port ${port} not free after ${GENEROUS_MS} ms`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
async function createLoopsStubWithPort(port: number, options: Parameters<typeof createLoopsStub>[0]): Promise<LoopsStub | null> {
  const { createLoopsStub: make } = await import("./loopsStub.ts");
  try {
    return await make({ ...options, port } as Parameters<typeof make>[0]);
  } catch {
    return null;
  }
}
