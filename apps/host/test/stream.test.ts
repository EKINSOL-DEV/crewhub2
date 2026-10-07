import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { type LoopsStub, createLoopsStub, envelope, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";

const isEvent = (seq: number) => (m: Record<string, unknown>) => m.type === "event" && (m.envelope as { seq: number }).seq === seq;
const isReset = (reason: string) => (m: Record<string, unknown>) => m.type === "reset" && m.reason === reason;
const isStatus = (loops: string) => (m: Record<string, unknown>) => m.type === "status" && m.loops === loops;
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the shared stream", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });
  async function start(stubOptions: Parameters<typeof createLoopsStub>[0] = {}, hostOptions: Partial<Parameters<typeof createHost>[0]> = {}) {
    const stub = await createLoopsStub({ ...installation(), ...stubOptions });
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, ...hostOptions });
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
    stub.emit({ type: "ticket.moved", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: { from: "planned", to: "in_progress" } });
    stub.emit({ type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    await a.next(isEvent(12));
    await b.next(isEvent(12));
    assert.deepEqual(a.messages.filter((m) => m.type === "event").map((m) => (m.envelope as { seq: number }).seq), [11, 12]);
    assert.equal(stub.streamsOpened(), 1, "one upstream stream");
    stub.heartbeat();
    const beat = await a.next((m) => m.type === "heartbeat");
    assert.equal(beat.seq, 12);
  });

  it("catches a client up from its cursor out of the buffer, and resets one whose cursor is too old", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] }, { bufferSize: 3 });
    const warm = await openSse(`${host.url}/world-api/stream`);
    cleanup.push(async () => warm.close());
    await warm.next(isStatus("ok"));
    for (let i = 0; i < 5; i += 1) stub.emit({ type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
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

  it("reconnects from the cursor when loops ends the stream, without a reset", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] });
    const a = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    stub.endStreams();
    await settle(50);
    stub.emit({ type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    await a.next(isEvent(2));
    assert.ok(stub.streamsOpened() >= 2);
    assert.equal(a.messages.filter((m) => m.type === "reset").length, 0);
    assert.ok(stub.requests.some((r) => r.path === "/api/events/stream?after=1"), "reconnects with after=<cursor>");
  });

  it("resets with 'gone' when loops answers 410", async () => {
    const { stub, host } = await start({ events: [envelope(100, "ticket.created")], minAfter: 100 });
    const a = await openSse(`${host.url}/world-api/stream?cursor=100`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    stub.endStreams();
    (stub as unknown as { minAfterBump?: boolean }).minAfterBump = true;
    // loops forgot the log up to 150: the next reconnect from 100 is 410
    stub.emit({ seq: 150, type: "ticket.created", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    await a.next(isEvent(150));
    const gone = await createLoopsStub({ ...installation(), events: [envelope(150, "ticket.created")], minAfter: 151 });
    cleanup.push(() => gone.close());
    const goneHost = await createHost({ loopsUrl: gone.url, key: gone.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 } });
    cleanup.push(() => goneHost.close());
    // the host's first connection asks after=150 (the tail), which loops says is gone: the clients re-snapshot
    const b = await openSse(`${goneHost.url}/world-api/stream?cursor=150`);
    cleanup.push(async () => b.close());
    await b.next(isReset("gone"));
  });

  it("goes down and comes back: status messages, host heartbeats, and a reset when the tail went backwards", async () => {
    const first = await createLoopsStub({ ...installation(), events: [envelope(1, "ticket.created"), envelope(2, "ticket.created")] });
    const host = await createHost({ loopsUrl: first.url, key: first.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 60 } });
    cleanup.push(() => host.close());
    const a = await openSse(`${host.url}/world-api/stream?cursor=2`);
    cleanup.push(async () => a.close());
    await a.next(isStatus("ok"));
    const port = first.port;
    await first.close();
    await a.next(isStatus("down"), 3000);
    const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as { loops: string };
    assert.equal(health.loops, "down");
    assert.equal((await fetch(`${host.url}/world-api/snapshot`)).status, 503);
    // a fresh install on the same port: the tail is lower than our cursor
    const second = await createLoopsStubOnPort(port, { ...installation(), events: [envelope(1, "ticket.created")] });
    cleanup.push(() => second.close());
    await a.next(isReset("reconnected"), 3000);
    await a.next(isStatus("ok"));
  });
});

/** A stub bound to a given port, for the restart case. */
async function createLoopsStubOnPort(port: number, options: Parameters<typeof createLoopsStub>[0]): Promise<LoopsStub> {
  for (let i = 0; i < 20; i += 1) {
    const stub = await createLoopsStubWithPort(port, options);
    if (stub !== null) return stub;
    await settle(50);
  }
  throw new Error(`port ${port} not free`);
}
async function createLoopsStubWithPort(port: number, options: Parameters<typeof createLoopsStub>[0]): Promise<LoopsStub | null> {
  const { createLoopsStub: make } = await import("./loopsStub.ts");
  try {
    return await make({ ...options, port } as Parameters<typeof make>[0]);
  } catch {
    return null;
  }
}
