/**
 * The Unix socket transport: the stub loops listens on a socket in a temp folder and the host reads it with
 * `loopsSocket`. The same allow-list, the same headers (bearer key, `Host: 127.0.0.1`, no Origin), the same
 * snapshot and stream, the same key scrubbing; health says `transport: "unix"`. Offline: a socket in the temp folder.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsClient } from "../src/loops.ts";
import { createUnixTransport } from "../src/transport.ts";
import { createLoopsStub, envelope, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";

/** A short temp folder: macOS limits a socket path to 104 bytes. */
function socketDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "chw-"));
  assert.ok(path.join(dir, "loops.sock").length < 100, `socket path too long: ${dir}`);
  return dir;
}

describe("the Unix socket transport", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  async function start(stubOptions: Parameters<typeof createLoopsStub>[0] = {}, hostOptions: Partial<Parameters<typeof createHost>[0]> = {}) {
    const dir = socketDir();
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const stub = await createLoopsStub({ ...installation(), socketPath: path.join(dir, "loops.sock"), ...stubOptions });
    cleanup.push(() => stub.close());
    const host = await createHost({ loopsUrl: "http://127.0.0.1:8091", loopsSocket: stub.socketPath as string, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, ...hostOptions });
    cleanup.push(() => host.close());
    return { stub, host, dir };
  }

  it("reads health, the snapshot and a passthrough over the socket, with the key and Host 127.0.0.1 on every read", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] });
    const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
    assert.equal(health.transport, "unix");
    assert.equal(health.loops, "ok");
    assert.equal(health.cursor, 1);
    assert.equal(health.loopsWebUrl, "http://127.0.0.1:8091", "the URL still names the web app for the sign-in link");
    const named = await createHost({ loopsUrl: "http://127.0.0.1:8091", loopsWebUrl: "http://127.0.0.1:8291/", loopsSocket: stub.socketPath as string, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 } });
    cleanup.push(() => named.close());
    assert.equal(((await (await fetch(`${named.url}/world-api/health`)).json()) as { loopsWebUrl: string }).loopsWebUrl, "http://127.0.0.1:8291", "loopsWebUrl names another web app when given");
    const snapshot = (await (await fetch(`${host.url}/world-api/snapshot`)).json()) as { projects: { slug: string }[]; milestones: Record<string, unknown[]>; cursor: number };
    assert.deepEqual(snapshot.projects.map((p) => p.slug), ["atlas", "beacon"]);
    assert.equal(snapshot.milestones.atlas?.length, 3, "paged lists are followed over the socket too");
    assert.equal(snapshot.cursor, 1);
    const ticket = await fetch(`${host.url}/world-api/tickets/AT-1`);
    assert.equal(ticket.status, 200);
    assert.equal(((await ticket.json()) as { ticket: { key: string } }).ticket.key, "AT-1");
    assert.ok(stub.requests.length > 5);
    assert.ok(stub.requests.every((r) => r.authorization === `Bearer ${stub.key}`), "every read carried the key");
    assert.ok(stub.requests.every((r) => r.host === "127.0.0.1"), `every read said Host: 127.0.0.1, got ${JSON.stringify([...new Set(stub.requests.map((r) => r.host))])}`);
    const stripped = await fetch(`${host.url}/world-api/tickets/AT-1/comments?limit=5&origin=x`);
    assert.equal(stripped.status, 200);
    assert.ok(stub.requests.some((r) => r.path === "/api/tickets/AT-1/comments?limit=5"), "a query key off the route's list is dropped before loops sees it");
  });

  it("follows the stream over the socket: events, heartbeats, and a reconnect after loops ends it", async () => {
    const { stub, host } = await start({ events: [envelope(1, "ticket.created")] });
    const sse = await openSse(`${host.url}/world-api/stream?cursor=1`);
    cleanup.push(() => sse.close());
    await sse.next((m) => m.type === "status" && m.loops === "ok");
    stub.emit({ type: "ticket.moved", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: { from: "planned", to: "in_progress" } });
    const event = await sse.next((m) => m.type === "event");
    assert.equal((event.envelope as { seq: number }).seq, 2);
    stub.heartbeat();
    const beat = await sse.next((m) => m.type === "heartbeat");
    assert.equal(beat.seq, 2);
    assert.equal(stub.streamsOpened(), 1, "one upstream stream");
    stub.endStreams();
    for (let i = 0; i < 50 && stub.streamsOpened() < 2; i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.equal(stub.streamsOpened(), 2, "reopened after the end");
    stub.emit({ type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    await sse.next((m) => m.type === "event" && (m.envelope as { seq: number }).seq === 3);
    const streamReads = stub.requests.filter((r) => r.path.startsWith("/api/events/stream"));
    assert.deepEqual(streamReads.map((r) => r.path), ["/api/events/stream?after=1", "/api/events/stream?after=2"], "the cursor is sent back on the reconnect");
  });

  it("keeps the key out of every response and the allow-list in front of every path", async () => {
    const { stub, host } = await start({ echoAuth: true });
    const paths = ["/world-api/health", "/world-api/snapshot", "/world-api/tickets/AT-999", "/world-api/projects/nope", "/world-api/nothing", "/world-api/../api/agents"];
    for (const p of paths) {
      const res = await fetch(`${host.url}${p}`);
      const text = await res.text();
      assert.ok(!text.includes(stub.key), `${p} leaked the key`);
    }
    const missing = await (await fetch(`${host.url}/world-api/tickets/AT-999`)).text();
    assert.ok(missing.includes("[redacted]"), "an echoed key is scrubbed, the rest passes");
    assert.equal((await fetch(`${host.url}/world-api/nothing`)).status, 404);
    assert.ok(!stub.requests.some((r) => r.path.startsWith("/api/nothing") || r.path.startsWith("/api/agents/")), "nothing outside the allow-list reached loops");
    assert.equal((await fetch(`${host.url}/world-api/snapshot`, { method: "POST" })).status, 405);
    const sse = await openSse(`${host.url}/world-api/stream`);
    cleanup.push(() => sse.close());
    await sse.next((m) => m.type === "status");
    assert.ok(!JSON.stringify(sse.messages).includes(stub.key));
  });

  it("reports loops down when nothing listens on the socket, and ok once something does", async () => {
    const dir = socketDir();
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const socketPath = path.join(dir, "loops.sock");
    const host = await createHost({ loopsUrl: "http://127.0.0.1:8091", loopsSocket: socketPath, key: "chl_x", keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 60 } });
    cleanup.push(() => host.close());
    const down = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
    assert.equal(down.loops, "down");
    assert.equal(down.transport, "unix");
    const stub = await createLoopsStub({ ...installation(), key: "chl_x", socketPath });
    cleanup.push(() => stub.close());
    let health = down;
    for (let i = 0; i < 50 && health.loops !== "ok"; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
      health = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
    }
    assert.equal(health.loops, "ok");
  });

  it("times out a read that gets no answer, aborts on the signal, and refuses a path outside the allow-list before connecting", async () => {
    const dir = socketDir();
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const socketPath = path.join(dir, "mute.sock");
    let connections = 0;
    const sockets = new Set<Socket>();
    const mute: Server = createServer((socket) => {
      connections += 1;
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => mute.listen(socketPath, resolve));
    cleanup.push(() => {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve) => mute.close(() => resolve()));
    });
    const transport = createUnixTransport(socketPath, { Authorization: "Bearer chl_x" });
    await assert.rejects(transport.request("/api/health", {}, { accept: "application/json", timeoutMs: 50 }), (e: unknown) => e instanceof Error && e.name === "TimeoutError");
    const abort = new AbortController();
    const pending = transport.request("/api/events/stream", { after: "0" }, { accept: "application/x-ndjson", signal: abort.signal });
    setTimeout(() => abort.abort(), 20);
    await assert.rejects(pending, (e: unknown) => e instanceof Error && e.name === "AbortError");
    assert.equal(connections, 2);
    await assert.rejects(transport.request("/api/agents/lead-1/keys", {}, { accept: "application/json", timeoutMs: 50 }), /not on the allow-list/);
    assert.equal(connections, 2, "nothing was sent for a refused path");
    const client = createLoopsClient({ transport: "unix", socketPath }, "chl_x");
    assert.equal(client.transport, "unix");
    assert.equal(createLoopsClient("http://127.0.0.1:1", "chl_x").transport, "tcp");
  });
});

describe("health over TCP", () => {
  it('says transport: "tcp"', async () => {
    const stub = await createLoopsStub(installation());
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    try {
      const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
      assert.equal(health.transport, "tcp");
      assert.equal(health.loops, "ok");
    } finally {
      await host.close();
      await stub.close();
    }
  });
});
