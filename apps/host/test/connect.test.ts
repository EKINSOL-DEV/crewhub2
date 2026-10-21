/**
 * The smooth connection, host side: a host that starts without loops and without a key, finds loops in the app's data
 * folder (injected: a temp folder, never the real one), reports the honest states in health, takes a pasted key on
 * `POST /world-api/connect` after checking it with loops, refuses a probe, reader or unknown key with the reason,
 * stores an accepted key, switches its one upstream stream to it, and forgets it on `DELETE`. The key appears in no
 * response and no log line. Everything on 127.0.0.1 port 0 and a temp folder.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { type HostOptions, createHost } from "../src/host.ts";
import { PROBE_REASON, READER_REASON, UNKNOWN_REASON } from "../src/keyCheck.ts";
import type { KeyStore } from "../src/keyStore.ts";
import { BUSY_REASON } from "../src/stream.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A key store in memory, as the host sees it. */
function memoryStore(): KeyStore & { saved: string[]; forgotten: number } {
  const store = {
    file: "/memory/loops-key",
    saved: [] as string[],
    forgotten: 0,
    save(key: string) {
      store.saved.push(key);
    },
    forget() {
      store.forgotten += 1;
    },
  };
  return store;
}

async function waitFor(what: string, predicate: () => Promise<boolean> | boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await settle(25);
  }
}

describe("the smooth connection", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  /** An app data folder in a temp dir with settings.json naming `port`. */
  function appData(port: number): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(path.join(dir, "run"));
    writeFileSync(path.join(dir, "settings.json"), `{"port": ${port}}\n`);
    return dir;
  }

  async function startHost(options: Partial<HostOptions> & { appData: string }) {
    const lines: string[] = [];
    const store = memoryStore();
    const { appData: folder, ...rest } = options;
    const host = await createHost({ discovery: { appData: folder, intervalMs: 40 }, keyStore: store, pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line), ...rest });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    const connect = (body: unknown, init: RequestInit = {}) =>
      fetch(`${host.url}/world-api/connect`, { method: "POST", headers: { origin: host.url, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body), ...init });
    return { host, lines, store, health, connect };
  }

  it("starts without loops and without a key, finds the app's port when it appears, and waits for a key", async () => {
    const port = await freePort();
    const { host, health, lines } = await startHost({ appData: appData(port) });
    assert.deepEqual((await health()).connection, { discovery: { state: "searching" }, key: { state: "none" }, stream: { state: "idle", reconnects: 0 }, archived: { source: "none", count: 0, slugs: [] }, snapshot: { state: "idle" } });
    assert.equal((await health()).loops, "down", "the world from before reads down");
    assert.equal((await (await fetch(`${host.url}/world-api/snapshot`)).json()).error, "no_loops");
    const stub = await createLoopsStub({ ...installation(), port });
    cleanup.push(() => stub.close());
    await waitFor("the discovery", async () => (await health()).connection.discovery.state === "found");
    const found = await health();
    assert.deepEqual(found.connection.discovery, { state: "found", via: "app-port", target: `http://127.0.0.1:${port}` }, "pairing off: every request counts as paired and sees the target");
    assert.equal(found.connection.key.state, "none");
    assert.equal(found.loops, "unauthorized", "the world from before: no key reads nothing");
    assert.equal(found.loopsWebUrl, `http://127.0.0.1:${port}`, "the web URL follows the port found");
    assert.equal(found.transport, "tcp");
    assert.equal((await (await fetch(`${host.url}/world-api/snapshot`)).json()).error, "no_key");
    assert.equal(stub.streamsOpened(), 0, "no key, no stream");
    assert.deepEqual(host.connection().discovery, { state: "found", via: "app-port", target: `http://127.0.0.1:${port}` });
    assert.ok(lines.some((l) => /loops not found/.test(l)) && lines.some((l) => /found via app-port/.test(l)), lines.join("\n"));
  });

  it("finds the app's socket before its port", async () => {
    const port = await freePort();
    const folder = appData(port);
    const socketPath = path.join(folder, "run", "api.sock");
    assert.ok(socketPath.length < 100, "macOS caps a socket path at 104 bytes");
    const stub = await createLoopsStub({ ...installation(), socketPath });
    cleanup.push(() => stub.close());
    const { health, host } = await startHost({ appData: folder });
    await waitFor("the discovery", async () => (await health()).connection.discovery.state === "found");
    assert.equal((await health()).connection.discovery.via, "app-socket");
    assert.equal((await health()).transport, "unix");
    assert.equal(host.connection().discovery.target, socketPath);
  });

  it("takes a pasted key: checks it with loops, stores it, switches to it, and answers the states (never the key)", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { host, health, connect, store, lines } = await startHost({ appData: appData(stub.port) });
    await waitFor("the discovery", async () => (await health()).connection.discovery.state === "found");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "unauthorized");

    const refused = await connect({ key: "chl_wrong_key_0123456789" });
    assert.equal(refused.status, 403);
    assert.deepEqual(await refused.json(), { error: "key_rejected", reason: UNKNOWN_REASON });
    assert.deepEqual(store.saved, [], "a refused key is not stored");
    assert.equal((await health()).connection.key.state, "none", "a refused key changes nothing");

    const accepted = await connect({ key: ` ${stub.key}\n` });
    assert.equal(accepted.status, 200);
    const body = (await accepted.json()) as Record<string, any>;
    assert.equal(body.ok, true);
    assert.equal(body.connection.key.state, "ok");
    assert.equal(body.connection.key.name, "crewhub-world");
    assert.equal(body.connection.key.source, "stored");
    assert.deepEqual(store.saved, [stub.key], "stored whole, trimmed");
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    const live = await health();
    assert.equal(live.loops, "ok");
    assert.equal(live.keyName, "crewhub-world");
    assert.equal(live.connection.key.name, "crewhub-world", "pairing off counts as paired: the details show");
    assert.equal(live.connection.key.source, "stored");
    assert.equal(host.connection().stream.cursor, 0);
    assert.equal((await fetch(`${host.url}/world-api/snapshot`)).status, 200);
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    assert.equal(stub.streamsOpened(), 1, "one upstream stream");

    // The same key pasted again: the old stream stops before the new one opens; the tab is told to re-snapshot.
    assert.equal((await connect({ key: stub.key })).status, 200);
    await tab.next((m) => m.type === "reset" && m.reason === "reconnected");
    await waitFor("one open stream", () => stub.openStreams() === 1);
    assert.equal(stub.streamsOpened(), 2);

    const everything = [...lines, JSON.stringify(body), JSON.stringify(live), JSON.stringify(tab.messages)].join("\n");
    assert.ok(!everything.includes(stub.key), "the key is in no log line and no response");
    assert.ok(lines.some((l) => /key crewhub-world accepted from the browser/.test(l)));

    const forgotten = await fetch(`${host.url}/world-api/connect`, { method: "DELETE", headers: { origin: host.url } });
    assert.equal(forgotten.status, 200);
    assert.equal(store.forgotten, 1);
    assert.equal((await health()).connection.key.state, "none");
    assert.equal((await health()).connection.stream.state, "idle");
    await waitFor("the stream closed", () => stub.openStreams() === 0);
  });

  it("refuses a probe key and a read-only bot's key with the reason, in the loops web's words", async () => {
    const probe = await createLoopsStub({ ...installation(), routes: { ...installation().routes, "/api/auth/me": { principal: { id: "crewhub-world", kind: "agent", displayName: "World", role: "probe" } } } });
    cleanup.push(() => probe.close());
    const a = await startHost({ appData: appData(probe.port) });
    await waitFor("the discovery", async () => (await a.health()).connection.discovery.state === "found");
    const probed = await a.connect({ key: probe.key });
    assert.equal(probed.status, 403);
    assert.deepEqual(await probed.json(), { error: "key_rejected", reason: PROBE_REASON });

    const reader = await createLoopsStub({ ...installation(), routes: { ...installation().routes, "/api/projects": () => ({ status: 403, body: { error: { code: "forbidden", message: "This key reads tickets, comments and rules only", detail: null } } }) } });
    cleanup.push(() => reader.close());
    const b = await startHost({ appData: appData(reader.port) });
    await waitFor("the discovery", async () => (await b.health()).connection.discovery.state === "found");
    const read = await b.connect({ key: reader.key });
    assert.equal(read.status, 403);
    assert.deepEqual(await read.json(), { error: "key_rejected", reason: READER_REASON });
    assert.ok(/Read only/.test(READER_REASON) && /New external bot/.test(READER_REASON));
  });

  it("says busy, with the reason, while loops refuses the stream with 429, and ok afterwards", async () => {
    const stub = await createLoopsStub({ ...installation(), busy: { count: 2, retryAfter: "1" } });
    cleanup.push(() => stub.close());
    const { health, host } = await startHost({ appData: appData(stub.port), key: stub.key, keyName: "crewhub-world", keySource: "env" });
    await waitFor("the 429", async () => (await health()).connection.stream.state === "busy");
    const busy = await health();
    assert.equal(busy.loops, "down", "the world from before sees down, never stale");
    assert.equal(busy.connection.stream.reason, BUSY_REASON);
    assert.equal(busy.connection.key.state, "ok", "the key is fine: the budget is the problem");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    const status = await tab.next((m) => m.type === "status");
    assert.deepEqual(status, { type: "status", loops: "down", stream: "busy", reason: BUSY_REASON });
    await waitFor("the stream after Retry-After", async () => (await health()).connection.stream.state === "ok", 6000);
    assert.equal((await health()).connection.stream.reason, undefined);
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    assert.ok((await health()).connection.stream.reconnects >= 2);
  });

  it("reports a key from a file that loops rejects, and keeps the stream closed", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { health, host } = await startHost({ appData: appData(stub.port), key: "chl_revoked_0123456789", keyName: "crewhub-world", keySource: "default" });
    await waitFor("the verdict", async () => (await health()).connection.key.state === "rejected");
    assert.equal((await health()).loops, "unauthorized");
    assert.equal(host.connection().key.reason, UNKNOWN_REASON);
    assert.equal(host.connection().key.source, "default");
    assert.equal(stub.streamsOpened(), 0, "a rejected key opens no stream");
  });

  it("answers connect only to a paired browser on its own origin with JSON, and nothing else than POST and DELETE", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { host, connect } = await startHost({ appData: appData(stub.port), pairing: "on" });
    const unpaired = await connect({ key: stub.key });
    assert.equal(unpaired.status, 401);
    assert.deepEqual(await unpaired.json(), { error: "not_paired" });
    const cookie = await (async () => {
      const response = await fetch(host.mintPairLink(), { redirect: "manual" });
      return (/^(crewhub_world_pair=[^;]+)/.exec(response.headers.get("set-cookie") ?? "") as RegExpExecArray)[1] as string;
    })();
    const paired = (body: unknown, headers: Record<string, string>) => fetch(`${host.url}/world-api/connect`, { method: "POST", headers: { cookie, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    assert.equal((await paired({ key: stub.key }, { "content-type": "application/json" })).status, 403, "no Origin: not the world's page");
    assert.equal((await paired({ key: stub.key }, { origin: "http://127.0.0.1:1", "content-type": "application/json" })).status, 403, "another origin on this machine: the guard");
    assert.equal((await paired({ key: stub.key }, { origin: host.url, "content-type": "text/plain" })).status, 415);
    assert.equal((await paired("{not json", { origin: host.url, "content-type": "application/json" })).status, 400);
    assert.equal((await paired({ key: "not a key" }, { origin: host.url, "content-type": "application/json" })).status, 400);
    assert.equal((await paired({ key: `chl_${"x".repeat(5000)}` }, { origin: host.url, "content-type": "application/json" })).status, 400, "too large");
    assert.equal((await fetch(`${host.url}/world-api/connect`, { headers: { cookie } })).status, 405, "GET is not a connect");
    assert.equal((await fetch(`${host.url}/world-api/health`, { method: "POST", headers: { origin: host.url } })).status, 405, "only connect takes a write");
    const ok = await paired({ key: stub.key }, { origin: host.url, "content-type": "application/json" });
    assert.equal(ok.status, 200);
    const detailed = (await (await fetch(`${host.url}/world-api/health`, { headers: { cookie } })).json()) as Record<string, any>;
    assert.equal(detailed.connection.key.name, "crewhub-world", "a paired request sees the details");
    assert.equal(detailed.connection.discovery.target, stub.url);
    const bare = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    assert.equal(bare.connection.key.name, undefined, "an unpaired request sees the states only");
    assert.equal(bare.connection.discovery.target, undefined);
  });
});
