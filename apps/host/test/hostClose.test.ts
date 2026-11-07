/**
 * The host's close is the connection's close (review-c1, finding 8): `host.close()` ends every tab's stream and
 * reads nothing more from loops. The connection's own close is pinned in connection.test.ts; this pins the wiring.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { testHost } from "./testHost.ts";
import { waitFor } from "./wait.ts";

describe("host.close()", () => {
  it("ends the tabs' streams and the connection: the open stream's body ends, and loops sees no read after", async () => {
    const stub = await createLoopsStub({ ...installation() });
    try {
      const host = await testHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: () => undefined });
      const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as { connection: { stream: { state: string } } };
      await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
      const tab = await fetch(`${host.url}/world-api/stream?cursor=0`);
      assert.equal(tab.status, 200);
      const reader = tab.body!.getReader();
      const first = await reader.read();
      assert.equal(first.done, false, "the stream is open");
      await host.close();
      const reads = stub.requests.length;
      // Drain what was written before the end; the end itself is the fact.
      let ended = false;
      const deadline = Date.now() + 5000;
      while (!ended && Date.now() < deadline) {
        const { done } = await reader.read();
        ended = done;
      }
      assert.equal(ended, true, "the tab's stream ended with the host");
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepEqual(stub.requests.slice(reads).map((r) => r.path), [], "loops was read after the host closed");
    } finally {
      await stub.close();
    }
  });
});
