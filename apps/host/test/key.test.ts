import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";

describe("the key", () => {
  it("appears in no response of the host, even when loops echoes the Authorization header", async () => {
    const stub = await createLoopsStub({ ...installation(), echoAuth: true, events: [] });
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    try {
      const paths = ["/world-api/health", "/world-api/snapshot", "/world-api/tickets/AT-1", "/world-api/tickets/AT-999", "/world-api/projects/nope", "/world-api/board/nope", "/world-api/nothing", "/world-api/project-groups"];
      for (const path of paths) {
        const res = await fetch(`${host.url}${path}`);
        const text = await res.text();
        assert.ok(!text.includes(stub.key), `${path} leaked the key`);
        for (const [name, value] of res.headers) assert.ok(!`${name}: ${value}`.includes(stub.key), `${path} leaked the key in a header`);
      }
      const missing = await (await fetch(`${host.url}/world-api/tickets/AT-999`)).text();
      assert.ok(missing.includes("[redacted]"), "an echoed key is scrubbed, the rest of the body passes");
      const sse = await openSse(`${host.url}/world-api/stream?cursor=0`);
      await sse.next((m) => m.type === "status");
      sse.close();
      assert.ok(!JSON.stringify(sse.messages).includes(stub.key));
      assert.ok(stub.requests.every((r) => r.authorization === `Bearer ${stub.key}`), "every loops read carried the key");
    } finally {
      await host.close();
      await stub.close();
    }
  });
});
