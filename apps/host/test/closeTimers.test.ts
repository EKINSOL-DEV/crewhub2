import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";

describe("a closed host", () => {
  it("reads nothing from loops after close, not even the chat threads a dm event asked for a moment before", async () => {
    const THREAD = { id: "dmt_boing", agentId: "boing", createdAt: "2026-10-21T18:00:00.000Z", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 };
    const stub = await createLoopsStub({ ...installation(), keyReadsChat: true, dm: { threads: [THREAD], messages: {} } });
    try {
      const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: () => undefined });
      const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as { connection: { stream: { state: string }; session?: { state: string } } };
      await waitFor("the stream and the chat road", async () => {
        const h = await health();
        return h.connection.stream.state === "ok" && h.connection.session?.state === "key";
      });
      const { seq } = stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: ["boing"], payload: { threadId: "dmt_boing", messageId: "dm_p1", agentId: "boing" } });
      await waitFor("the host heard the dm event", async () => ((await (await fetch(`${host.url}/world-api/health`)).json()) as { cursor?: number }).cursor === seq);
      await host.close();
      const reads = stub.requests.length;
      // The threads' re-read waits THREADS_REFRESH_MS (1 s) after a dm event.
      await new Promise((resolve) => setTimeout(resolve, 1300));
      assert.deepEqual(stub.requests.slice(reads).map((r) => r.path), [], "the host read loops after it was closed");
    } finally {
      await stub.close();
    }
  });
});
