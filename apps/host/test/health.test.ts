import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";

const read = async (url: string) => (await (await fetch(`${url}/world-api/health`)).json()) as Record<string, any>;

describe("health", () => {
  it("reports ok with the key name, loops' version, the cursor and the connection's states (to a paired browser: pairing off here; the unpaired shape is pinned in pairing.test.ts)", async () => {
    const stub = await createLoopsStub({ ...installation() });
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 } });
    try {
      // Health answers at once with the states as they are (it waits for a link in the making for HEALTH_WAIT_MS at
      // most); the shape below is the settled one, so the test waits for the stream, not for a second.
      await waitFor("the stream", async () => (await read(host.url)).connection.stream.state === "ok");
      const health = (await read(host.url)) as Record<string, unknown>;
      assert.equal(health.loops, "ok");
      assert.equal(health.keyName, "crewhub-world");
      assert.equal(health.sharedKey, false);
      assert.equal(health.transport, "tcp");
      assert.deepEqual(health.connection, { discovery: { state: "found", via: "env-url", target: stub.url }, key: { state: "ok", name: "crewhub-world", source: "env" }, stream: { state: "ok", reconnects: 0, cursor: 0 }, archived: { source: "none", count: 0, slugs: [] }, snapshot: { state: "idle" } }, "a paired browser sees the states and the details");
      assert.equal(health.cursor, 0);
      assert.equal(health.loopsWebUrl, stub.url, "the loops origin, for the sign-in link");
      assert.equal(health.checkout, undefined, "no checkout id unless the host was given one");
      // loops' version is read beside the stream (information only): it shows once that read answered.
      await waitFor("loops' version", async () => (await read(host.url)).loopsCommit !== undefined);
      assert.equal((await read(host.url)).loopsCommit, "053b5f47");
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
      // The verdict needs the key check and its health probe; nobody's host needs a refused connection. Both are
      // waited for by their state, not by health's bounded wait.
      await waitFor("the verdict", async () => (await read(wrongKey.url)).connection.key.state === "rejected");
      assert.equal((await read(wrongKey.url)).loops, "unauthorized");
      await waitFor("loops down", async () => (await read(nobody.url)).loops === "down");
      assert.equal((await read(nobody.url)).connection.key.state, "unchecked", "a refused connection is no verdict on the key");
    } finally {
      await wrongKey.close();
      await nobody.close();
      await stub.close();
    }
  });
});
