import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_BASE_CURSOR, DEMO_SEQ_STRIDE } from "../src/content.ts";
import { DEMO_SEED, SCRIPT_DURATION_MS } from "../src/script.ts";
import { envelopes, firstLoop, playLoop, startDemo } from "./helpers.ts";

/** Replaces timestamps so two seeds can be compared on facts alone. */
function facts(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value).replace(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/g, '"<ts>"'),
  );
}

test("the same seed sends a byte-identical stream, at any speed", () => {
  const a = JSON.stringify(firstLoop(playLoop({ seed: 7 }).messages));
  const b = JSON.stringify(firstLoop(playLoop({ seed: 7 }).messages));
  const slow = JSON.stringify(firstLoop(playLoop({ seed: 7, speed: 4 }).messages));
  assert.equal(a, b);
  assert.equal(a, slow);
});

test("a different seed changes the timing, not the facts", () => {
  const a = envelopes(firstLoop(playLoop({ seed: DEMO_SEED }).messages));
  const b = envelopes(firstLoop(playLoop({ seed: DEMO_SEED + 1 }).messages));
  assert.notDeepEqual(
    a.map((e) => e.ts),
    b.map((e) => e.ts),
  );
  assert.deepEqual(
    a.map((e) => facts({ ...e, ts: null })),
    b.map((e) => facts({ ...e, ts: null })),
  );
});

test("seq strictly increases across the loop boundary and the new snapshot continues the cursor", () => {
  const { messages } = playLoop();
  const snapshots = messages.flatMap((m) => (m.type === "snapshot" ? [m.snapshot] : []));
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0]?.cursor, DEMO_BASE_CURSOR);
  assert.equal(snapshots[1]?.cursor, DEMO_BASE_CURSOR + DEMO_SEQ_STRIDE);
  let last = -1;
  for (const message of messages) {
    if (message.type === "event") {
      assert.ok(message.envelope.seq > last, `seq ${message.envelope.seq} after ${last}`);
      last = message.envelope.seq;
    } else if (message.type === "snapshot") {
      assert.ok(message.snapshot.cursor >= last);
      last = message.snapshot.cursor;
    } else if (message.type === "heartbeat") {
      assert.equal(message.seq, last, "a heartbeat is never ahead of the last envelope");
    }
  }
  const ts = envelopes(messages).map((e) => Date.parse(e.ts));
  assert.ok(ts.every((t, i) => i === 0 || t >= (ts[i - 1] as number)), "demo time never runs backwards across loops");
});

test("the stream is lively: no silence longer than a heartbeat, and one heartbeat per loop", () => {
  const loop = firstLoop(playLoop().messages);
  const times = envelopes(loop).map((e) => Date.parse(e.ts));
  const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
  assert.ok(Math.max(...gaps) < 25_000);
  assert.ok(times.length > 250, `${times.length} events in a loop`);
  assert.equal(loop.filter((m) => m.type === "heartbeat").length, 1);
});

test("a team re-read arrives every 30 s of demo time, also while the probe is silent", () => {
  const loop = firstLoop(playLoop().messages);
  const teams = loop.filter((m) => m.type === "team");
  assert.ok(teams.length >= SCRIPT_DURATION_MS / 30_000);
});

test("pause stops the clock; speed multiplies it", () => {
  const run = startDemo({ speed: 4 });
  run.scheduler.advance(10_000);
  assert.equal(run.source.playback.positionMs(), 40_000);
  run.source.playback.setSpeed(0);
  const sent = run.messages.length;
  run.scheduler.advance(60_000);
  assert.equal(run.source.playback.positionMs(), 40_000);
  assert.equal(run.messages.length, sent);
  run.source.playback.setSpeed(16);
  run.scheduler.advance(1_000);
  assert.equal(run.source.playback.positionMs(), 56_000);
  assert.equal(run.source.now(), Date.parse("2026-10-01T08:00:56.000Z"));
});

test("the loop counter and the demo clock advance at the loop end", () => {
  const run = playLoop();
  assert.equal(run.source.playback.loop(), 1);
  const position = run.source.playback.positionMs();
  assert.ok(position >= 19_000 && position < 21_000);
  assert.equal(run.source.now(), Date.parse("2026-10-01T08:00:00Z") + SCRIPT_DURATION_MS + position);
});
