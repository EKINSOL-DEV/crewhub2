/* The Connect screens' stub host (tools/lib/connectStub.mjs, round 51, review T2): a state change ends every stream it
   serves, the busy state's own stream as well, so an open tab meets the new state at once and `close()` never waits on a
   tab that is still open. */
import assert from "node:assert/strict";
import test from "node:test";
import { createConnectStub } from "../../tools/lib/connectStub.mjs";

const within = <T>(promise: Promise<T>, ms: number): Promise<T | "still open"> =>
  Promise.race([promise, new Promise<"still open">((resolve) => setTimeout(() => resolve("still open"), ms).unref())]);

test("the busy state's stream ends at a state change, and close does not wait on it", async () => {
  const stub = await createConnectStub({ state: "busy" });
  const abort = new AbortController();
  try {
    const response = await fetch(`${stub.url}/world-api/stream`, { signal: abort.signal });
    assert.equal(response.status, 200);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /"stream":"busy"/, "the busy status first");
    // The stub and the loops web page it started listen on ports the OS picked, never a port of the Lead's or the Mac app's.
    for (const url of [stub.url, stub.webUrl()]) {
      const port = Number(new URL(String(url)).port);
      assert.ok(port >= 1024 && ![5180, 8091, 8291, 8292, 8293].includes(port), `${url}`);
    }
    await stub.setState("connect");
    const drain = (async () => {
      for (;;) if ((await reader.read()).done) return "ended";
    })();
    assert.equal(await within(drain, 1500), "ended", "the tab's stream ends when the state changes");
  } finally {
    const closed = await within(stub.close().then(() => "closed"), 3000);
    abort.abort();
    assert.equal(closed, "closed", "close() returns with a tab still connected");
  }
});
