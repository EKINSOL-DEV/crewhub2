import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";

describe("health", () => {
  it("reports ok with the key name, loops' version, the cursor and the connection's states", async () => {
    const stub = await createLoopsStub({ ...installation() });
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", retryMs: { min: 20, max: 100 } });
    try {
      const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
      assert.equal(health.loops, "ok");
      assert.equal(health.keyName, "crewhub-world");
      assert.equal(health.sharedKey, false);
      assert.equal(health.transport, "tcp");
      assert.deepEqual(health.connection, { discovery: { state: "found", via: "env-url" }, key: { state: "ok" }, stream: { state: "ok", reconnects: 0 }, snapshot: { state: "idle" } }, "an unpaired request sees the states only");
      assert.equal(health.cursor, 0);
      assert.equal(health.loopsWebUrl, stub.url, "the loops origin, for the sign-in link");
      for (let i = 0; i < 20 && health.loopsCommit === undefined; i += 1) {
        await new Promise((r) => setTimeout(r, 20));
        Object.assign(health, await (await fetch(`${host.url}/world-api/health`)).json());
      }
      assert.equal(health.loopsCommit, "053b5f47");
    } finally {
      await host.close();
      await stub.close();
    }
  });

  it("reports unauthorized for a refused key (401 and 403 alike) and down when nothing answers", async () => {
    const stub = await createLoopsStub(installation());
    const wrongKey = await createHost({ loopsUrl: stub.url, key: "chl_wrong", keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    const nobody = await createHost({ loopsUrl: "http://127.0.0.1:1", key: "chl_x", keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    try {
      assert.equal(((await (await fetch(`${wrongKey.url}/world-api/health`)).json()) as { loops: string }).loops, "unauthorized");
      assert.equal(((await (await fetch(`${nobody.url}/world-api/health`)).json()) as { loops: string }).loops, "down");
    } finally {
      await wrongKey.close();
      await nobody.close();
      await stub.close();
    }
  });
});
