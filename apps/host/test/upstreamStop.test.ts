import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoopsClient } from "../src/loops.ts";
import { createUpstream } from "../src/stream.ts";

/**
 * A client whose tail read waits until the test lets it answer, and which counts the streams it is asked to open. No
 * network: the upstream's own lifetime is what is under test.
 */
function heldTailClient() {
  let release: () => void = () => undefined;
  const tailHeld = new Promise<void>((resolve) => {
    release = resolve;
  });
  let tailAsked: () => void = () => undefined;
  const tailRead = new Promise<void>((resolve) => {
    tailAsked = resolve;
  });
  let streams = 0;
  const client: LoopsClient = {
    transport: "tcp",
    get: async () => ({ status: 200, text: "{}", contentType: "application/json" }),
    async getJson<T>(path: string) {
      if (path === "/api/events") {
        tailAsked();
        await tailHeld;
        return { status: 200, body: { events: [], lastSeq: 5, cursor: null } as T };
      }
      return { status: 200, body: null };
    },
    getPublicJson: async () => ({ status: 200, body: null }),
    async stream(_resume, signal) {
      streams += 1;
      // A stream that stays open until it is aborted, as loops' does for 300 s.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
        },
      });
      return new Response(body, { status: 200 });
    },
    scrub: (text) => text,
  };
  return { client, release, tailRead, streams: () => streams };
}

describe("the upstream's stop", () => {
  it("opens no stream to loops once it was stopped while the tail read was still out", async () => {
    const held = heldTailClient();
    const upstream = createUpstream(held.client, { retryMs: { min: 10, max: 20 }, reconnectMs: { min: 10, max: 20 }, idleMs: 200 });
    const started = upstream.start();
    await held.tailRead;
    await upstream.stop();
    held.release();
    await started;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(held.streams(), 0, "a stopped upstream opened a stream: it holds one of loops' four stream slots for this key until loops ends it");
  });
});
