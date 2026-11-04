/**
 * The connection to loops through its interface (connection.ts, round 59d C1): no HTTP, no host; the loops stub on
 * 127.0.0.1 port 0 behind it, as before. What stood in keyStates.test.ts ("the key's state, honestly", round 3), in
 * loopsVersion.test.ts (round 7) and in closeTimers.test.ts, read here from `state()`, `words()` and the log instead
 * of health over HTTP; and the pasted key's outcomes (`setKey`), which connect.test.ts pins through the route.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { type ConnectionTimings, STREAM_REFUSED_REASON } from "../src/connection.ts";
import { UNKNOWN_REASON } from "../src/keyCheck.ts";
import type { KeyStore } from "../src/keyStore.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { testConnection } from "./testHost.ts";
import { waitFor } from "./wait.ts";

/** A soak, not a wait: the test expects nothing to happen in this time. It can only make the test slower, never fail it. */
const soak = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function memoryStore(): KeyStore & { forgotten: number; saved: string[] } {
  const store = {
    file: "/memory/loops-key",
    forgotten: 0,
    saved: [] as string[],
    save(key: string) {
      store.saved.push(key);
    },
    forget() {
      store.forgotten += 1;
    },
  };
  return store;
}

describe("the connection to loops", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  function appData(port: number): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-app-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(path.join(dir, "run"));
    writeFileSync(path.join(dir, "settings.json"), `{"port": ${port}}\n`);
    return dir;
  }

  /** A connection aimed at a URL or an app data folder, with a stored key (the holder's source) or none, started. */
  function start(aim: { loopsUrl?: string; appData?: string; intervalMs?: number; key?: string; timings?: ConnectionTimings }) {
    const lines: string[] = [];
    const store = memoryStore();
    // The read timeout stays the default (10 s): a slow read on a loaded machine must never pass for loops being down
    // in these tests. The one test about a timeout sets a short one itself, against a stub that hangs.
    const conn = testConnection({
      discovery: { loopsUrl: aim.loopsUrl ?? null, loopsSocket: null, loopsWebUrl: null, appData: aim.appData ?? "", ...(aim.intervalMs === undefined ? {} : { intervalMs: aim.intervalMs }) },
      ...(aim.key === undefined ? {} : { key: { key: aim.key, name: "crewhub-world", source: "stored" } }),
      keyStore: store,
      timings: { retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, ...aim.timings },
      log: (line) => lines.push(line),
    });
    cleanup.push(() => conn.close());
    conn.start();
    const state = () => conn.state(true);
    const key = () => state().key;
    const stream = () => state().stream.state;
    const loops = () => conn.words().loops;
    return { conn, lines, store, state, key, stream, loops };
  }

  it("the start-up check: a revoked key (401 from a loops whose health answers) is rejected with the reason, kept, and forgotten only on forgetKey", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { conn, key, stream, loops, store, lines } = start({ appData: appData(stub.port), intervalMs: 40, key: "chl_revoked_0123456789" });
    await waitFor("the verdict", () => key().state === "rejected");
    const rejected = key();
    assert.equal(rejected.reason, UNKNOWN_REASON);
    assert.equal(rejected.source, "stored");
    assert.equal(loops(), "unauthorized");
    assert.equal(stream(), "idle", "a rejected key opens no stream");
    await soak(200);
    assert.equal(store.forgotten, 0, "never forgotten by itself");
    assert.equal(key().state, "rejected", "and still rejected");
    assert.ok(lines.some((l) => /rejected by loops .* \(the key is kept; paste a new one or forget it\)/.test(l)), lines.join("\n"));
    const at = Date.parse(key().recheckAt ?? "");
    assert.ok(at > Date.now() + 60_000, "the kept key is re-checked later, not polled: recheckAt is minutes away");
    await conn.forgetKey();
    assert.equal(store.forgotten, 1);
    assert.equal(key().state, "none");
    assert.equal(key().recheckAt, undefined, "Forget cancels the re-check");
    assert.ok(lines.some((l) => /key crewhub-world \(stored\) forgotten/.test(l)));
  });

  it("the start-up check: loops in trouble (503, health answering) leaves the key unchecked and the stream down; ok once loops recovers", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    stub.outage({ status: 503, healthOk: true });
    const { state, key, stream, loops, lines } = start({ appData: appData(stub.port), intervalMs: 40, key: stub.key });
    await waitFor("the discovery", () => state().discovery.state === "found");
    await waitFor("the first attempt", () => stream() === "down");
    assert.equal(key().state, "unchecked", "a 503 is not a verdict on the key");
    assert.equal(key().reason, undefined);
    assert.equal(loops(), "down");
    assert.ok(lines.some((l) => /key crewhub-world \(stored\) unchecked: crewhub-loops answered 503/.test(l)), lines.join("\n"));
    stub.outage(null);
    await waitFor("the recovery", () => stream() === "ok");
    assert.equal(key().state, "ok");
    assert.equal(loops(), "ok");
  });

  it("a 401 from a loops whose health does not answer (restarting) is down, not a verdict on the key", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    stub.outage({ status: 401 });
    const { key, stream, loops, lines } = start({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the first attempt", () => stream() === "down");
    assert.equal(key().state, "unchecked");
    assert.equal(loops(), "down", "never unauthorized");
    assert.ok(lines.some((l) => /answered 401 but crewhub-loops' health does not answer: restarting\?/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /refused the key \(401 or 403\) but its health does not answer: down/.test(l)), "the stream's own guard");
    stub.outage(null);
    await waitFor("the recovery", () => stream() === "ok");
    assert.equal(key().state, "ok");
  });

  it("a timeout is down: the key stays unchecked until loops answers", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    stub.outage({ status: 0, hang: true, healthOk: true });
    const { key, stream, lines } = start({ loopsUrl: stub.url, key: stub.key, timings: { readTimeoutMs: 1000 } });
    await waitFor("the first attempt (the read timeout)", () => stream() === "down");
    assert.equal(key().state, "unchecked");
    assert.ok(lines.some((l) => /did not answer \(a timeout or a refused connection\)/.test(l)), lines.join("\n"));
    stub.outage(null);
    await waitFor("the recovery", () => stream() === "ok");
    assert.equal(key().state, "ok");
  });

  it("loops stopped mid-run and started again on its port: the stream goes down and comes back, the key stays ok", async () => {
    const port = await freePort();
    const stub = await createLoopsStub({ ...installation(), port });
    const { key, stream, loops } = start({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the stream", () => stream() === "ok");
    assert.equal(key().state, "ok");
    await stub.close();
    await waitFor("loops down", () => stream() === "down");
    assert.equal(key().state, "ok", "a refused connection says nothing about the key");
    assert.equal(loops(), "down");
    const again = await createLoopsStub({ ...installation(), port });
    cleanup.push(() => again.close());
    await waitFor("loops back", () => stream() === "ok");
    assert.equal(key().state, "ok");
  });

  it("the stream's 401 after a credential re-check ended it (revoked meanwhile): rejected with the reason, kept, forgotten on forgetKey", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { conn, key, stream, loops, store, lines } = start({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the stream", () => stream() === "ok");
    stub.revoke();
    await waitFor("the verdict", () => key().state === "rejected");
    assert.equal(key().reason, STREAM_REFUSED_REASON);
    assert.equal(loops(), "unauthorized");
    assert.equal(store.forgotten, 0);
    assert.ok(lines.some((l) => /rejected on the stream \(the key is kept/.test(l)), lines.join("\n"));
    // The stream stops: no retry with a refused key (each was a 401 and a health probe every 30 s); the host waits.
    await waitFor("the stream stopped", () => stream() === "idle" && stub.openStreams() === 0);
    const requestsAfterVerdict = stub.requests.length;
    const recheckAt = Date.parse(key().recheckAt ?? "");
    assert.ok(recheckAt > Date.now() + 60_000, "re-checked minutes later, said in the states");
    await soak(400);
    assert.equal(stub.requests.length, requestsAfterVerdict, "nothing asked of loops while the key waits");
    await conn.forgetKey();
    assert.equal(store.forgotten, 1);
    assert.equal(key().state, "none");
    assert.equal(key().recheckAt, undefined, "Forget cancels the re-check");
    await soak(400);
    assert.ok(!stub.requests.slice(requestsAfterVerdict).some((r) => r.authorization !== undefined), "and no re-check with the forgotten key");
  });

  it("a rejected key is re-checked slowly, with a health probe first, and a bot re-enabled in loops comes back by itself", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { key, stream, lines } = start({ loopsUrl: stub.url, key: stub.key, timings: { recheckMs: 300 } });
    await waitFor("the stream", () => stream() === "ok");
    stub.revoke();
    await waitFor("the verdict", () => key().state === "rejected");
    await waitFor("the stream stopped", () => stream() === "idle");
    const seen = stub.requests.length;
    // Loops down at re-check time: one keyless health probe, no key check, still rejected, a new time said.
    stub.outage({ status: 503 });
    const firstAt = key().recheckAt ?? "";
    await waitFor("the probe that found loops down", () => lines.some((l) => /not re-checked: crewhub-loops does not answer its health/.test(l)));
    const sinceRejected = stub.requests.slice(seen);
    assert.ok(sinceRejected.every((r) => r.path === "/api/health" && r.authorization === undefined), `only keyless health probes: ${sinceRejected.map((r) => r.path).join(" ")}`);
    assert.equal(key().state, "rejected");
    await waitFor("a later re-check time", () => (key().recheckAt ?? "") > firstAt);
    // Loops back and the bot re-enabled: the next re-check (a probe, then the key check) brings the stream back, no paste.
    stub.outage(null);
    stub.revoke(false);
    await waitFor("the key accepted again", () => key().state === "ok");
    await waitFor("the stream back", () => stream() === "ok");
    assert.equal(key().recheckAt, undefined);
    assert.ok(lines.some((l) => /re-checking the kept key crewhub-world \(stored\)/.test(l)), lines.join("\n"));
    const probes = stub.requests.slice(seen).filter((r) => r.path === "/api/health" && r.authorization === undefined).length;
    const streamTries = stub.requests.slice(seen).filter((r) => r.path.startsWith("/api/events/stream")).length;
    assert.ok(probes >= 2 && probes <= 6, `a probe per re-check, not a poll: ${probes}`);
    assert.equal(streamTries, 1, "one stream request: the one that came back, never a retry with the refused key");
  });

  it("the discovery losing loops (the app's road): the connection looks again, the key stays ok, and it is ok when loops is back", async () => {
    const port = await freePort();
    const stub = await createLoopsStub({ ...installation(), port });
    const { state, key, stream, loops } = start({ appData: appData(port), intervalMs: 40, key: stub.key });
    await waitFor("the stream", () => stream() === "ok");
    await stub.close();
    await waitFor("the discovery searching again", () => state().discovery.state === "searching");
    assert.equal(key().state, "ok", "unchanged: loops went away, the key did not");
    assert.equal(stream(), "idle");
    assert.equal(loops(), "down");
    const again = await createLoopsStub({ ...installation(), port });
    cleanup.push(() => again.close());
    await waitFor("found again", () => stream() === "ok");
    assert.equal(key().state, "ok");
    assert.equal(again.streamsOpened(), 1);
  });

  it("reads loops' version keyless (round 29): crewhub-loops main refuses the public health route to a viewer key, and the version is still named", async () => {
    const stub = await createLoopsStub({ ...installation(), version: "0.3.1", healthRefusesKey: true, keyReadsChat: true });
    cleanup.push(() => stub.close());
    const { conn, state, loops } = start({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the version", () => conn.words().version === "0.3.1");
    assert.equal(loops(), "ok");
    assert.equal(state().session?.state, "key", "the viewer key is still the key road");
    const healthReads = stub.requests.filter((r) => r.path === "/api/health");
    assert.ok(healthReads.length > 0 && healthReads.every((r) => r.authorization === undefined), `every health read is keyless: ${healthReads.map((r) => (r.authorization === undefined ? "keyless" : "with the key")).join(", ")}`);
  });

  it("says the new version and the one it saw first after loops came back upgraded, and logs the change once (round 7)", async () => {
    const port = await freePort();
    const first = await createLoopsStub({ ...installation(), port, version: "0.1.0" });
    const { conn, key, loops, lines } = start({ loopsUrl: first.url, key: first.key });
    await waitFor("the first version", () => conn.words().version === "0.1.0");
    assert.equal(conn.words().versionBefore, undefined, "one version seen: nothing to say");
    await first.close();
    await waitFor("loops down", () => loops() === "down");
    const second = await createLoopsStub({ ...installation(), port, version: "0.2.0" });
    cleanup.push(() => second.close());
    await waitFor("the new version", () => conn.words().version === "0.2.0");
    assert.equal(conn.words().versionBefore, "0.1.0");
    assert.equal(loops(), "ok");
    assert.equal(key().state, "ok", "an upgrade is no verdict on the key");
    assert.equal(lines.filter((l) => /crewhub-loops version 0\.1\.0 → 0\.2\.0/.test(l)).length, 1, lines.join("\n"));
    // The same version read again (another reconnect) is no change.
    second.endStreams();
    await waitFor("the reconnect", () => second.streamsOpened() >= 2);
    assert.equal(lines.filter((l) => /crewhub-loops version/.test(l)).length, 1, "logged once");
    assert.equal(conn.words().versionBefore, "0.1.0", "the first version stays the first");
  });

  it("a pasted key: checked with loops, stored, switched to, the states ok; a wrong key is rejected with loops' reason and said once; no loops found, or loops not answering, is no verdict", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { conn, key, stream, store, lines } = start({ loopsUrl: stub.url });
    await waitFor("the discovery", () => conn.state(false).discovery.state === "found");
    assert.equal(key().state, "none");
    const wrong = await conn.setKey("chl_wrong_key_0123456789");
    assert.equal(wrong.state, "rejected");
    assert.ok(wrong.state === "rejected" && /does not know this key/.test(wrong.reason));
    assert.ok(lines.some((l) => /^a pasted key was rejected: /.test(l)), lines.join("\n"));
    assert.equal(key().state, "none", "a refused paste changes nothing");
    assert.deepEqual(store.saved, [], "never stored");
    const ok = await conn.setKey(stub.key);
    assert.deepEqual(ok, { state: "ok", name: "crewhub-world", stored: true });
    assert.deepEqual(store.saved, [stub.key], "stored once; the store sees the key, the log never does");
    assert.ok(!lines.some((l) => l.includes(stub.key)), "the key is in no log line");
    assert.deepEqual([key().state, key().source, key().name], ["ok", "stored", "crewhub-world"]);
    await waitFor("the stream", () => stream() === "ok");
    stub.outage({ status: 503 });
    const down = await conn.setKey(stub.key);
    assert.equal(down.state, "unreachable", "loops not answering its health: nothing is known about the pasted key");
    stub.outage(null);
    const port = await freePort();
    const nowhere = start({ appData: appData(port), intervalMs: 40 });
    await soak(100);
    assert.deepEqual(await nowhere.conn.setKey(stub.key), { state: "no_loops" });
  });

  it("a closed connection reads nothing from loops, not even the chat threads a dm event asked for a moment before", async () => {
    const THREAD = { id: "dmt_boing", agentId: "boing", createdAt: "2026-10-21T18:00:00.000Z", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 };
    const stub = await createLoopsStub({ ...installation(), keyReadsChat: true, dm: { threads: [THREAD], messages: {} } });
    cleanup.push(() => stub.close());
    const { conn, state, stream } = start({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the stream and the chat road", () => stream() === "ok" && state().session?.state === "key");
    const { seq } = stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: ["boing"], payload: { threadId: "dmt_boing", messageId: "dm_p1", agentId: "boing" } });
    await waitFor("the dm event heard", () => conn.words().cursor === seq);
    await conn.close();
    const reads = stub.requests.length;
    // The threads' re-read waits THREADS_REFRESH_MS (1 s) after a dm event.
    await soak(1300);
    assert.deepEqual(stub.requests.slice(reads).map((r) => r.path), [], "the connection read loops after it was closed");
  });
});
