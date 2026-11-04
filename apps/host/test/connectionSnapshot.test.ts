/* One assembly for the tabs that ask together (round 53, r51-review H3), through the connection's interface (round 59d,
   C1; the facts stood in snapshotShare.test.ts through `/world-api/snapshot`): after a reset every open tab asks for a
   snapshot at once, and each used to read the whole studio again. A `snapshot()` that comes while an assembly is on its
   way takes that one's answer (its cursor is where that assembly started; the tab's stream replays from there); one
   that comes after it ends, or after a reset of the upstream, starts its own. */
import assert from "node:assert/strict";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import type { HostMessage } from "@crewhub/loops-client";
import type { Connection } from "../src/connection.ts";
import { createLoopsStub, envelope, installation, type LoopsStub } from "./loopsStub.ts";
import { testConnection } from "./testHost.ts";
import { waitFor } from "./wait.ts";

describe("the snapshot of tabs that ask together", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  /** The stub behind a proxy that counts the reads of `held` and keeps them waiting until `release()`. */
  async function behindHold(held: string): Promise<{ stub: LoopsStub; stubOptions: Parameters<typeof createLoopsStub>[0] & {}; conn: Connection; hits: () => number; release: () => void }> {
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
    const conn = testConnection({
      discovery: { loopsUrl: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, loopsSocket: null, loopsWebUrl: null, appData: "" },
      key: { key: stub.key, name: "crewhub-world", source: "env" },
      timings: { retryMs: { min: 20, max: 100 }, reconnectMs: { min: 20, max: 40 } },
      log: () => undefined,
    });
    conn.start();
    // The route awaited a relink in the making; here the discovery's first pass has not begun it yet: wait for loops found.
    await waitFor("loops found", () => conn.state(false).discovery.state === "found");
    cleanup.push(async () => {
      await conn.close();
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
      await stub.close();
    });
    const release = () => {
      open = true;
      for (const go of waiting.splice(0)) go();
    };
    return { stub, stubOptions, conn, hits: () => hits, release };
  }

  it("two snapshots asked during one assembly read loops once and get the same snapshot", async () => {
    const { conn, hits, release } = await behindHold("/api/board/atlas");
    const first = conn.snapshot();
    await waitFor("the first assembly at the held read", () => hits() >= 1);
    const second = conn.snapshot();
    // A second assembly would reach the held read too: give it the time to, then let both go.
    await waitFor("a second read of the board, if a second assembly runs", () => hits() >= 2, 1000).catch(() => undefined);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.kind, "ok");
    assert.equal(b.kind, "ok");
    assert.equal(hits(), 1, "one read of the board for both tabs");
    assert.deepEqual(b.kind === "ok" && b.body, a.kind === "ok" && a.body, "the same snapshot, at the same cursor");
  });

  it("a snapshot asked after the assembly ended reads loops again", async () => {
    const { conn, hits, release } = await behindHold("/api/board/atlas");
    release();
    assert.equal((await conn.snapshot()).kind, "ok");
    assert.equal((await conn.snapshot()).kind, "ok");
    assert.equal(hits(), 2, "nothing is kept after an assembly ends");
  });

  it("a snapshot asked after a reset of the upstream starts its own assembly, even while the one before still runs", async () => {
    const { stub, stubOptions, conn, hits, release } = await behindHold("/api/board/atlas");
    const messages: HostMessage[] = [];
    const detach = conn.feed({ send: (m) => messages.push(m), cursor: null, end: () => undefined });
    cleanup.push(async () => detach());
    await waitFor("the tab's status ok", () => messages.some((m) => m.type === "status" && m.loops === "ok"));
    const first = conn.snapshot();
    await waitFor("the first assembly at the held read", () => hits() >= 1);
    // loops' log moves on under the host: an event voids the sealed cursor, the stream ends, and the reconnect's after=
    // is below the log's floor, 410: the host resets its tabs ("gone").
    stubOptions.minAfter = 1000;
    stub.emit({ type: "ticket.updated", project: null, ticket: null, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    stub.endStreams();
    await waitFor("the tab's reset", () => messages.some((m) => m.type === "reset" && m.reason === "gone"));
    const second = conn.snapshot();
    await waitFor("the second assembly at the held read", () => hits() >= 2, 3000).catch(() => undefined);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual([a.kind, b.kind], ["ok", "ok"]);
    assert.equal(hits(), 2, "the snapshot after the reset was read again, not taken from the one begun before it");
  });
});
