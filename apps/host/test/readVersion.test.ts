/**
 * The upstream's read of loops' version (stream.ts `readVersion`, through `LoopsClient.health()` since round 61 H4):
 * taken on a 200 that carries a version, nothing otherwise, and information only: a health that rejects or an
 * `onVersion` that throws never becomes an unhandled rejection (review-h4 fix 1). A fake client; no stub.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoopsClient } from "../src/loops.ts";
import type { LoopsHealth } from "../src/loopsHealth.ts";
import { createUpstream } from "../src/stream.ts";

/** A client whose stream opens and stays open until aborted, as loops' does; `health` as given. */
function clientWith(health: () => Promise<LoopsHealth | null>): LoopsClient {
  return {
    transport: "tcp",
    get: async () => ({ status: 200, text: "{}", contentType: "application/json" }),
    async getJson<T>(path: string) {
      if (path === "/api/events") return { status: 200, body: { events: [], lastSeq: 5, cursor: null } as T };
      return { status: 200, body: null };
    },
    health,
    async stream(_resume, signal) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
        },
      });
      return new Response(body, { status: 200 });
    },
    scrub: (text) => text,
  };
}

/** One open of the stream with `health` answering so; what `onVersion` heard and what the upstream says. */
async function opened(health: () => Promise<LoopsHealth | null>, onVersion: (version: string) => void = () => {}): Promise<{ heard: string[]; version: string | undefined; unhandled: unknown[] }> {
  const heard: string[] = [];
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", listener);
  const upstream = createUpstream(clientWith(health), {
    retryMs: { min: 10, max: 20 },
    reconnectMs: { min: 10, max: 20 },
    idleMs: 200,
    onVersion: (version) => {
      heard.push(version);
      onVersion(version);
    },
  });
  try {
    await upstream.start();
    // `readVersion` is fire-and-forget on the open: give it its turn.
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { heard, version: upstream.loopsVersion(), unhandled };
  } finally {
    await upstream.stop();
    process.off("unhandledRejection", listener);
  }
}

describe("the version read on the stream's open", () => {
  it("a 200 with a version: taken, said once", async () => {
    const out = await opened(async () => ({ status: 200, ok: true, version: "4cdcd383" }));
    assert.deepEqual(out.heard, ["4cdcd383"]);
    assert.equal(out.version, "4cdcd383");
  });

  it("a 503 that carries a version gives no version (health answered, but not loops up)", async () => {
    const out = await opened(async () => ({ status: 503, ok: false, version: "4cdcd383" }));
    assert.deepEqual(out.heard, []);
    assert.equal(out.version, undefined);
  });

  it("a 200 without a version reports nothing: onVersion is never called with undefined", async () => {
    const out = await opened(async () => ({ status: 200, ok: true }));
    assert.deepEqual(out.heard, []);
    assert.equal(out.version, undefined);
  });

  it("nothing answering is nothing said", async () => {
    const out = await opened(async () => null);
    assert.deepEqual(out.heard, []);
    assert.equal(out.version, undefined);
  });

  it("information only: a health that rejects, or an onVersion that throws, is swallowed, never an unhandled rejection", async () => {
    const rejecting = await opened(() => Promise.reject(new Error("health broke")));
    assert.deepEqual(rejecting.unhandled, [], "a rejecting health()");
    assert.equal(rejecting.version, undefined);
    const throwing = await opened(
      async () => ({ status: 200, ok: true, version: "0.1.0" }),
      () => {
        throw new Error("the listener broke");
      },
    );
    assert.deepEqual(throwing.unhandled, [], "a throwing onVersion");
    assert.equal(throwing.version, "0.1.0", "the version was taken before the listener threw");
  });
});
