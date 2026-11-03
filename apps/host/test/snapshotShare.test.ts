/* One assembly for the tabs that ask together (round 53, r51-review H3): after a reset every open tab asks for a snapshot
   at once, and each used to read the whole studio again. A `/snapshot` that comes while an assembly is on its way now
   takes that one's answer (its cursor is where that assembly started; the tab's stream replays from there); one that
   comes after it ends, or after a reset of the upstream, starts its own. */
import assert from "node:assert/strict";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { createHost, type Host } from "../src/host.ts";
import { createLoopsStub, envelope, installation, type LoopsStub } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

describe("the snapshot of tabs that ask together", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  /** The stub behind a proxy that counts the reads of `held` and keeps them waiting until `release()`. */
  async function behindHold(held: string): Promise<{ stub: LoopsStub; stubOptions: Parameters<typeof createLoopsStub>[0] & {}; host: Host; hits: () => number; release: () => void }> {
    // The options object stays the stub's: a test may raise `minAfter` later (the stub reads it at every request).
    const stubOptions: Parameters<typeof createLoopsStub>[0] & {} = { ...installation(), events: [envelope(3, "ticket.created")] };
    const stub = await createLoopsStub(stubOptions);
    let hits = 0;
    let open = false;
    const waiting: (() => void)[] = [];
    const proxy: Server = createServer((req, res) => {
      const forward = () => {
        const ahead = request(`${stub.url}${req.url}`, { method: req.method, headers: req.headers }, (answer) => {
          // At once: the stream's head has no body behind it until an event, and the host waits for the head.
          res.writeHead(answer.statusCode ?? 502, answer.headers).flushHeaders();
          answer.pipe(res);
        });
        ahead.on("error", () => res.destroy());
        req.pipe(ahead);
      };
      if (new URL(req.url ?? "/", "http://127.0.0.1").pathname !== held) return forward();
      hits += 1;
      if (open) forward();
      else waiting.push(forward);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const host = await createHost({ loopsUrl: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 20, max: 40 }, log: () => undefined });
    cleanup.push(async () => {
      await host.close();
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
      await stub.close();
    });
    const release = () => {
      open = true;
      for (const go of waiting.splice(0)) go();
    };
    return { stub, stubOptions, host, hits: () => hits, release };
  }

  it("two snapshots asked during one assembly read loops once and get the same snapshot", async () => {
    const { host, hits, release } = await behindHold("/api/board/atlas");
    const first = fetch(`${host.url}/world-api/snapshot`);
    await waitFor("the first assembly at the held read", () => hits() >= 1);
    const second = fetch(`${host.url}/world-api/snapshot`);
    // A second assembly would reach the held read too: give it the time to, then let both go.
    await waitFor("a second read of the board, if a second assembly runs", () => hits() >= 2, 1000).catch(() => undefined);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const [bodyA, bodyB] = (await Promise.all([a.json(), b.json()])) as { cursor: number }[];
    assert.equal(hits(), 1, "one read of the board for both tabs");
    assert.deepEqual(bodyB, bodyA, "the same snapshot, at the same cursor");
  });

  it("a snapshot asked after the assembly ended reads loops again", async () => {
    const { host, hits, release } = await behindHold("/api/board/atlas");
    release();
    assert.equal((await fetch(`${host.url}/world-api/snapshot`)).status, 200);
    assert.equal((await fetch(`${host.url}/world-api/snapshot`)).status, 200);
    assert.equal(hits(), 2, "nothing is kept after an assembly ends");
  });

  it("a snapshot asked after a reset of the upstream starts its own assembly, even while the one before still runs", async () => {
    const { stub, stubOptions, host, hits, release } = await behindHold("/api/board/atlas");
    const tab = await openSse(`${host.url}/world-api/stream`);
    cleanup.push(async () => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    const first = fetch(`${host.url}/world-api/snapshot`);
    await waitFor("the first assembly at the held read", () => hits() >= 1);
    // loops' log moves on under the host: an event voids the sealed cursor, the stream ends, and the reconnect's after=
    // is below the log's floor, 410: the host resets its tabs ("gone").
    stubOptions.minAfter = 1000;
    stub.emit({ type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    stub.endStreams();
    await tab.next((m) => m.type === "reset" && m.reason === "gone");
    const second = fetch(`${host.url}/world-api/snapshot`);
    await waitFor("the second assembly at the held read", () => hits() >= 2, 3000).catch(() => undefined);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    await Promise.all([a.text(), b.text()]);
    assert.equal(hits(), 2, "the snapshot after the reset was read again, not taken from the one begun before it");
  });
});
