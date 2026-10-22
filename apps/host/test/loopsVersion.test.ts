/**
 * loops upgraded under a running host (round 7, the live operations road): the stub stops and comes back on its port
 * with another `/api/health` `version`. The host's health says the new version as `loopsCommit` and the one it read
 * first as `loopsCommitBefore`; the log says the change once; the key stays ok and the stream comes back.
 */
import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("loops' version under a running host", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("reads the version keyless (round 29): crewhub-loops main refuses the public health route to a viewer key, and the host still names the version", async () => {
    const stub = await createLoopsStub({ ...installation(), version: "0.3.1", healthRefusesKey: true, keyReadsChat: true });
    cleanup.push(() => stub.close());
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 } });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the version", async () => (await health()).loopsCommit === "0.3.1");
    const h = await health();
    assert.equal(h.loops, "ok");
    assert.equal(h.connection.session?.state, "key", "the viewer key is still the key road");
    const healthReads = stub.requests.filter((r) => r.path === "/api/health");
    assert.ok(healthReads.length > 0 && healthReads.every((r) => r.authorization === undefined), `every health read is keyless: ${healthReads.map((r) => r.authorization === undefined ? "keyless" : "with the key").join(", ")}`);
  });

  it("says the new version and the one it saw first after loops came back upgraded, and logs the change once", async () => {
    const port = await freePort();
    const lines: string[] = [];
    const first = await createLoopsStub({ ...installation(), port, version: "0.1.0" });
    const host = await createHost({ loopsUrl: first.url, key: first.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the first version", async () => (await health()).loopsCommit === "0.1.0");
    assert.equal((await health()).loopsCommitBefore, undefined, "one version seen: nothing to say");
    await first.close();
    await waitFor("loops down", async () => (await health()).loops === "down");
    const second = await createLoopsStub({ ...installation(), port, version: "0.2.0" });
    cleanup.push(() => second.close());
    await waitFor("the new version", async () => (await health()).loopsCommit === "0.2.0");
    const after = await health();
    assert.equal(after.loopsCommitBefore, "0.1.0");
    assert.equal(after.loops, "ok");
    assert.equal(after.connection.key.state, "ok", "an upgrade is no verdict on the key");
    assert.equal(lines.filter((l) => /crewhub-loops version 0\.1\.0 → 0\.2\.0/.test(l)).length, 1, lines.join("\n"));
    // The same version read again (another reconnect) is no change.
    second.endStreams();
    await waitFor("the reconnect", () => second.streamsOpened() >= 2);
    assert.equal(lines.filter((l) => /crewhub-loops version/.test(l)).length, 1, "logged once");
    assert.equal((await health()).loopsCommitBefore, "0.1.0", "the first version stays the first");
  });
});
