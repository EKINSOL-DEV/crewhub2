/**
 * A rejected key is never confused with loops being down (round 3, hostcare). One test per path that sets the key's
 * state: the start-up check, the stream's 401/403, the credential re-check that ends a stream, the discovery losing
 * loops; and the ways loops can be down (stopped, a 5xx, a timeout, a 401 from a loops whose health does not answer),
 * which leave the key `unchecked` or as it was. A rejected key is kept, with its reason, until DELETE forgets it.
 * Everything against the stub on 127.0.0.1 port 0.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { type HostOptions, STREAM_REFUSED_REASON, createHost } from "../src/host.ts";
import { UNKNOWN_REASON } from "../src/keyCheck.ts";
import type { KeyStore } from "../src/keyStore.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
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


function memoryStore(): KeyStore & { forgotten: number } {
  const store = {
    file: "/memory/loops-key",
    forgotten: 0,
    save() {},
    forget() {
      store.forgotten += 1;
    },
  };
  return store;
}

describe("the key's state, honestly", () => {
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

  async function startHost(options: Partial<HostOptions>) {
    const lines: string[] = [];
    const store = memoryStore();
    // The read timeout stays the host's default (10 s): a slow read on a loaded machine must never pass for loops being
    // down in these tests. The one test about a timeout sets a short one itself, against a stub that hangs.
    const host = await createHost({ keyStore: store, keyName: "crewhub-world", keySource: "stored", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line), ...options });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    const key = async () => (await health()).connection.key as { state: string; reason?: string; source?: string; recheckAt?: string };
    const forget = () => fetch(`${host.url}/world-api/connect`, { method: "DELETE", headers: { origin: host.url } });
    return { host, lines, store, health, key, forget };
  }

  it("the start-up check: a revoked key (401 from a loops whose health answers) is rejected with the reason, kept, and forgotten only on DELETE", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { health, key, store, forget, lines } = await startHost({ discovery: { appData: appData(stub.port), intervalMs: 40 }, key: "chl_revoked_0123456789" });
    await waitFor("the verdict", async () => (await key()).state === "rejected");
    const rejected = await key();
    assert.equal(rejected.reason, UNKNOWN_REASON);
    assert.equal(rejected.source, "stored");
    assert.equal((await health()).loops, "unauthorized");
    assert.equal((await health()).connection.stream.state, "idle", "a rejected key opens no stream");
    await soak(200);
    assert.equal(store.forgotten, 0, "never forgotten by itself");
    assert.equal((await key()).state, "rejected", "and still rejected");
    assert.ok(lines.some((l) => /rejected by loops .* \(the key is kept; paste a new one or forget it\)/.test(l)), lines.join("\n"));
    const at = Date.parse((await key()).recheckAt ?? "");
    assert.ok(at > Date.now() + 60_000, "the kept key is re-checked later, not polled: recheckAt is minutes away");
    assert.equal((await forget()).status, 200);
    assert.equal(store.forgotten, 1);
    assert.equal((await key()).state, "none");
    assert.equal((await key()).recheckAt, undefined, "Forget cancels the re-check");
  });

  it("the start-up check: loops in trouble (503, health answering) leaves the key unchecked and the stream down; ok once loops recovers", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    stub.outage({ status: 503, healthOk: true });
    const { health, key, lines } = await startHost({ discovery: { appData: appData(stub.port), intervalMs: 40 }, key: stub.key });
    await waitFor("the discovery", async () => (await health()).connection.discovery.state === "found");
    await waitFor("the first attempt", async () => (await health()).connection.stream.state === "down");
    assert.equal((await key()).state, "unchecked", "a 503 is not a verdict on the key");
    assert.equal((await key()).reason, undefined);
    assert.equal((await health()).loops, "down");
    assert.ok(lines.some((l) => /key crewhub-world \(stored\) unchecked: crewhub-loops answered 503/.test(l)), lines.join("\n"));
    stub.outage(null);
    await waitFor("the recovery", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).state, "ok");
    assert.equal((await health()).loops, "ok");
  });

  it("a 401 from a loops whose health does not answer (restarting) is down, not a verdict on the key", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    stub.outage({ status: 401 });
    const { health, key, lines } = await startHost({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the first attempt", async () => (await health()).connection.stream.state === "down");
    assert.equal((await key()).state, "unchecked");
    assert.equal((await health()).loops, "down", "never unauthorized");
    assert.ok(lines.some((l) => /answered 401 but crewhub-loops' health does not answer: restarting\?/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /refused the key \(401 or 403\) but its health does not answer: down/.test(l)), "the stream's own guard");
    stub.outage(null);
    await waitFor("the recovery", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).state, "ok");
  });

  it("a timeout is down: the key stays unchecked until loops answers", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    stub.outage({ status: 0, hang: true, healthOk: true });
    const { health, key, lines } = await startHost({ loopsUrl: stub.url, key: stub.key, readTimeoutMs: 1000 });
    await waitFor("the first attempt (the read timeout)", async () => (await health()).connection.stream.state === "down");
    assert.equal((await key()).state, "unchecked");
    assert.ok(lines.some((l) => /did not answer \(a timeout or a refused connection\)/.test(l)), lines.join("\n"));
    stub.outage(null);
    await waitFor("the recovery", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).state, "ok");
  });

  it("loops stopped mid-run and started again on its port: the stream goes down and comes back, the key stays ok", async () => {
    const port = await freePort();
    const stub = await createLoopsStub({ ...installation(), port });
    const { health, key } = await startHost({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).state, "ok");
    await stub.close();
    await waitFor("loops down", async () => (await health()).connection.stream.state === "down");
    assert.equal((await key()).state, "ok", "a refused connection says nothing about the key");
    assert.equal((await health()).loops, "down");
    const again = await createLoopsStub({ ...installation(), port });
    cleanup.push(() => again.close());
    await waitFor("loops back", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).state, "ok");
  });

  it("the stream's 401 after a credential re-check ended it (revoked meanwhile): rejected with the reason, kept, forgotten on DELETE", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { health, key, store, forget, lines } = await startHost({ loopsUrl: stub.url, key: stub.key });
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    stub.revoke();
    await waitFor("the verdict", async () => (await key()).state === "rejected");
    assert.equal((await key()).reason, STREAM_REFUSED_REASON);
    assert.equal((await health()).loops, "unauthorized");
    assert.equal(store.forgotten, 0);
    assert.ok(lines.some((l) => /rejected on the stream \(the key is kept/.test(l)), lines.join("\n"));
    // The stream stops: no retry with a refused key (each was a 401 and a health probe every 30 s); the host waits.
    await waitFor("the stream stopped", async () => (await health()).connection.stream.state === "idle" && stub.openStreams() === 0);
    const requestsAfterVerdict = stub.requests.length;
    const recheckAt = Date.parse((await key()).recheckAt ?? "");
    assert.ok(recheckAt > Date.now() + 60_000, "re-checked minutes later, said in health");
    await soak(400);
    assert.equal(stub.requests.length, requestsAfterVerdict, "nothing asked of loops while the key waits");
    assert.equal((await forget()).status, 200);
    assert.equal(store.forgotten, 1);
    assert.equal((await key()).state, "none");
    assert.equal((await key()).recheckAt, undefined, "Forget cancels the re-check");
    await soak(400);
    assert.ok(!stub.requests.slice(requestsAfterVerdict).some((r) => r.authorization !== undefined), "and no re-check with the forgotten key");
  });

  it("a rejected key is re-checked slowly, with a health probe first, and a bot re-enabled in loops comes back by itself", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { health, key, lines } = await startHost({ loopsUrl: stub.url, key: stub.key, recheckMs: 300 });
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    stub.revoke();
    await waitFor("the verdict", async () => (await key()).state === "rejected");
    await waitFor("the stream stopped", async () => (await health()).connection.stream.state === "idle");
    const seen = stub.requests.length;
    // Loops down at re-check time: one keyless health probe, no key check, still rejected, a new time said.
    stub.outage({ status: 503 });
    const firstAt = (await key()).recheckAt ?? "";
    await waitFor("the probe that found loops down", () => lines.some((l) => /not re-checked: crewhub-loops does not answer its health/.test(l)));
    const sinceRejected = stub.requests.slice(seen);
    assert.ok(sinceRejected.every((r) => r.path === "/api/health" && r.authorization === undefined), `only keyless health probes: ${sinceRejected.map((r) => r.path).join(" ")}`);
    assert.equal((await key()).state, "rejected");
    await waitFor("a later re-check time", async () => ((await key()).recheckAt ?? "") > firstAt);
    // Loops back and the bot re-enabled: the next re-check (a probe, then the key check) brings the stream back, no paste.
    stub.outage(null);
    stub.revoke(false);
    await waitFor("the key accepted again", async () => (await key()).state === "ok");
    await waitFor("the stream back", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).recheckAt, undefined);
    assert.ok(lines.some((l) => /re-checking the kept key crewhub-world \(stored\)/.test(l)), lines.join("\n"));
    const probes = stub.requests.slice(seen).filter((r) => r.path === "/api/health" && r.authorization === undefined).length;
    const streamTries = stub.requests.slice(seen).filter((r) => r.path.startsWith("/api/events/stream")).length;
    assert.ok(probes >= 2 && probes <= 6, `a probe per re-check, not a poll: ${probes}`);
    assert.equal(streamTries, 1, "one stream request: the one that came back, never a retry with the refused key");
  });

  it("the discovery losing loops (the app's road): the host looks again, the key stays ok, and it is ok when loops is back", async () => {
    const port = await freePort();
    const stub = await createLoopsStub({ ...installation(), port });
    const { health, key } = await startHost({ discovery: { appData: appData(port), intervalMs: 40 }, key: stub.key });
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    await stub.close();
    await waitFor("the discovery searching again", async () => (await health()).connection.discovery.state === "searching");
    assert.equal((await key()).state, "ok", "unchanged: loops went away, the key did not");
    assert.equal((await health()).connection.stream.state, "idle");
    assert.equal((await health()).loops, "down");
    const again = await createLoopsStub({ ...installation(), port });
    cleanup.push(() => again.close());
    await waitFor("found again", async () => (await health()).connection.stream.state === "ok");
    assert.equal((await key()).state, "ok");
    assert.equal(again.streamsOpened(), 1);
  });
});
