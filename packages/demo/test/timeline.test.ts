import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_BASE_CURSOR, DEMO_SEQ_STRIDE } from "../src/content.ts";
import { DEMO_SEED, SCRIPT_DURATION_MS } from "../src/script.ts";
import { at } from "../src/time.ts";
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

/* Round 60, pk-P1: the storyline's side of the player's seam, each fact through the source's interface. */

/** Every message of a loop with the position a listener reads while it is sent. */
function heardLoop(): { type: string; position: number; now: number; ts: number | null }[] {
  const run = startDemo({ speed: 16 });
  const heard: { type: string; position: number; now: number; ts: number | null }[] = [];
  run.source.start((m) => {
    if (m.type === "snapshot" && heard.length > 0) return;
    const ts = m.type === "event" ? Date.parse(m.envelope.ts) : m.type === "heartbeat" ? Date.parse(m.ts) : null;
    heard.push({ type: m.type, position: run.source.playback.positionMs(), now: run.source.now(), ts });
  });
  run.play(SCRIPT_DURATION_MS - 1_000);
  return heard;
}

test("a heartbeat comes 15 s after the last line, and the clock is at its time while it is sent, as at every event's", () => {
  const heard = heardLoop();
  const stamped = heard.filter((m) => m.ts !== null);
  assert.ok(stamped.length > 250);
  for (const m of stamped) assert.equal(m.now, m.ts, `${m.type} at ${m.position}`);
  const beats = heard.flatMap((m, i) => (m.type === "heartbeat" ? [i] : []));
  assert.ok(beats.length > 0);
  for (const i of beats) {
    const before = heard.slice(0, i).reverse().find((m) => m.type === "event");
    assert.equal(heard[i]?.position, (before?.position as number) + 15_000);
  }
});

test("a line due the moment a heartbeat would be plays instead, and a seek starts the silence afresh", () => {
  const heard = heardLoop();
  const beat = heard.findIndex((m) => m.type === "heartbeat");
  const line = heard.slice(beat).find((m) => m.type === "event");
  assert.ok(line);
  const run = startDemo({ speed: 16, startAt: 1_000 });
  run.source.playback.seek(line.position - 15_000); // from here the silence ends exactly at that line
  const sent = run.messages.length;
  run.play(17_000);
  const after = run.messages.slice(sent).filter((m) => m.type === "event" || m.type === "heartbeat");
  assert.equal(after[0]?.type, "event", "the line, no heartbeat before it");
  assert.equal(after[0]?.type === "event" && Date.parse(after[0].envelope.ts), Date.parse("2026-10-01T08:00:00Z") + line.position);
  assert.ok(!after.some((m) => m.type === "heartbeat" && Date.parse(m.ts) < Date.parse("2026-10-01T08:00:00Z") + line.position), "no heartbeat from before the seek");
});

test("the storyline's speeds are the page's four; another throws and leaves the speed", () => {
  const { source } = startDemo({ speed: 4 });
  assert.throws(() => source.playback.setSpeed(2 as 1), /Unsupported speed 2/);
  assert.equal(source.playback.speed(), 4);
});

test("a read and an outside action go by the clock, between two lines too; an outside action says the state changed", async () => {
  const run = startDemo({ speed: 1 });
  let changes = 0;
  run.source.playback.onChange(() => (changes += 1));
  run.source.playback.seek(at("9:30"));
  run.play(3_700);
  const nowIso = new Date(run.source.now()).toISOString();
  const position = run.source.playback.positionMs();
  assert.equal(position, at("9:30") + 3_700);
  const agents = await run.source.getAgents();
  assert.ok(agents.some((a) => a.lastSeenAt === new Date(run.source.now() - 40_000).toISOString()), "a read's clock is now, not the last line's");
  const sent = run.messages.length;
  changes = 0;
  run.source.act({ type: "probe" });
  assert.equal(changes, 1);
  const line = run.messages.slice(sent).find((m) => m.type === "event");
  assert.equal(line?.type === "event" && line.envelope.ts, nowIso);
});

test("a prop request in the next loop runs as in the first: the on-demand ids start afresh", () => {
  const P = at("2:00");
  const run = startDemo({ speed: 16 });
  const request = () => {
    run.source.playback.seek(P);
    const sent = run.messages.length;
    const made = run.source.createPropRequest("a coffee machine");
    run.play(160_000);
    const base = run.source.now() - run.source.playback.positionMs();
    return { made, lines: envelopes(run.messages.slice(sent)).map((e) => [e.type, Date.parse(e.ts) - base]) };
  };
  const first = request();
  run.source.playback.seek(SCRIPT_DURATION_MS - 500);
  run.play(3_200);
  assert.equal(run.source.playback.loop(), 1);
  assert.deepEqual(request(), first);
});
