/**
 * Loops ends every event stream after 300 s (`Timing.max_age`); the fake does the same at `streamMaxMs`. Through
 * the real host (`createHost`) and the real browser-side source (`createHostSource`): a stream that ends in the
 * middle of a storyline loses no event, because the host reconnects at once with `after=` its cursor.
 * Loopback only: the fake and the host start on 127.0.0.1 port 0.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHostSource } from "@crewhub/loops-client";
import type { Envelope, SourceMessage } from "@crewhub/loops-client";
import { createHost } from "../../../apps/host/src/host.ts";
import { createLoopsFake } from "../src/index.ts";

const TIMINGS = { staleMs: 1500, teamPollMs: 60_000, retryMinMs: 50, retryMaxMs: 200 };

async function waitFor(what: string, predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("a stream that ends mid-storyline (streamMaxMs) loses no event: the host reconnects with after= at once", async () => {
  const fake = await createLoopsFake({ speed: 0, heartbeatMs: 100, streamMaxMs: 400 });
  const host = await createHost({ loopsUrl: fake.url, key: fake.key, keyName: fake.keyName, pairing: "off", retryMs: { min: 50, max: 200 }, log: () => undefined });
  const source = createHostSource({ baseUrl: host.url, timings: TIMINGS });
  const connection = source.connection!;
  const received: Envelope[] = [];
  let snapshots = 0;
  const stop = source.start((message: SourceMessage) => {
    if (message.type === "event") received.push(message.envelope);
    else if (message.type === "snapshot") snapshots += 1;
  });
  try {
    await waitFor("a live connection", () => connection.state() === "live", 5000);
    const first = fake.lastSeq();
    // Moves spread over three stream lifetimes: the fake ends its stream every 400 ms.
    const moves: [string, string][] = [["CR-19", "review"], ["CR-21", "review"], ["CR-22", "review"], ["CR-21", "in_progress"], ["CR-22", "in_progress"], ["CR-19", "in_progress"]];
    for (const [ref, status] of moves) {
      await fake.moveTicket(ref, status);
      await new Promise((resolve) => setTimeout(resolve, 230));
    }
    const last = fake.lastSeq();
    assert.ok(last - first >= moves.length, "every move wrote at least one event");
    await waitFor("every move to reach the source", () => received.some((e) => e.seq === last), 5000);
    assert.ok(fake.streamsOpened() >= 3, `the fake opened ${fake.streamsOpened()} streams: the host reconnected after each end`);
    assert.equal(fake.openStreams(), 1, "one upstream stream is open again");
    const seqs = received.map((e) => e.seq).filter((seq) => seq > first);
    assert.deepEqual(seqs, Array.from({ length: last - first }, (_, i) => first + 1 + i), "every seq once, in order, none lost");
    assert.equal(snapshots, 1, "no re-snapshot: the stream end is not a reset");
    assert.equal(connection.state(), "live");
  } finally {
    stop();
    await host.close();
    await fake.close();
  }
});
