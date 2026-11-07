/** The stress fixture goes through the same seam as the demo: loops shapes the projection accepts, at full size. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceMessage } from "@crewhub/loops-client";
import { Projection, emptyMemory, reduceWorld } from "@crewhub/world-model";
import { createManualScheduler } from "../src/scheduler.ts";
import { STRESS_AGENTS, STRESS_BUILDINGS, createStressSource } from "../src/stress.ts";

test("the stress town: twelve buildings, a hundred agents, and a stream the projection accepts", async () => {
  const scheduler = createManualScheduler();
  const source = createStressSource({ scheduler });
  source.playback.setSpeed(16);
  const projection = new Projection(source, { coalesceMs: 0 });
  source.start((message) => projection.apply(message));
  let memory = emptyMemory();
  let model = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} }).model;
  const keys = new Set<string>();
  for (let wall = 0; wall < 20_000; wall += 1_000) {
    scheduler.advance(1_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} });
    memory = result.memory;
    model = result.model;
    for (const d of model.deliveries) keys.add(d.deliveryId);
  }
  const facts = projection.facts;
  assert.equal(facts.invalidEvents, 0);
  assert.equal(facts.skippedEvents, 0);
  assert.ok(facts.cursor > 1_500, "a steady stream");
  assert.equal(model.buildings.length, STRESS_BUILDINGS);
  const agents = new Set(model.buildings.flatMap((b) => b.agents.map((a) => a.key)));
  assert.equal(agents.size, STRESS_AGENTS);
  assert.equal(model.postOffice.length, 1, "the postman");
  assert.ok(keys.size > 5, "the postman has letters to walk");
  // Rovers belong to two buildings: one real avatar, one proxy.
  const rover = model.buildings.flatMap((b) => b.agents).filter((a) => a.key === "rover-1");
  assert.deepEqual(rover.map((a) => a.presence).sort(), ["proxy", "real"]);
  projection.dispose();
});

test("the stress stream is deterministic: a seek replays the same events", () => {
  const record = (seekTo: number | null) => {
    const scheduler = createManualScheduler();
    const source = createStressSource({ scheduler });
    const messages: SourceMessage[] = [];
    source.start((m) => messages.push(m));
    if (seekTo !== null) source.playback.seek(seekTo);
    source.playback.setSpeed(16);
    scheduler.advance(3_000);
    return messages.filter((m) => m.type === "event").map((m) => m.type === "event" && [m.envelope.type, m.envelope.ts, m.envelope.payload]);
  };
  const straight = record(null);
  assert.ok(straight.length > 50);
  assert.deepEqual(record(null), straight);
  // Seeking to 0 replays the stream from the start.
  assert.deepEqual(record(0), straight);
});

test("the stress snapshot: each column numbered 1 to n, groups in the region of twenty only; a tab that leaves stops nobody else's stream (round 54, r54-mut-demo: stress.ts:181, :368, :454)", () => {
  for (const size of [12, 20] as const) {
    const scheduler = createManualScheduler();
    const source = createStressSource({ scheduler, size });
    const first: SourceMessage[] = [];
    const second: SourceMessage[] = [];
    const leave = source.start((m) => first.push(m));
    source.start((m) => second.push(m));
    const snapshot = first[0];
    assert.ok(snapshot?.type === "snapshot");
    for (const [slug, board] of Object.entries(snapshot.snapshot.boards)) {
      for (const column of board.columns) assert.deepEqual(column.tickets.map((t) => t.position), column.tickets.map((_, i) => i + 1), `${slug} ${column.status}`);
    }
    assert.equal("groups" in snapshot.snapshot, size === 20, `size ${size}`);
    source.playback.setSpeed(16);
    leave();
    const before = second.length;
    scheduler.advance(3_000);
    assert.ok(second.length > before, `size ${size}: the tab that stayed still hears the stream`);
  }
});

test("round 60, pk-P1: the stress stream's clock moves with each line, as the storyline's does: a listener reading it during a line hears that line's time", () => {
  const scheduler = createManualScheduler();
  const source = createStressSource({ scheduler });
  source.playback.setSpeed(16);
  const read: { ts: number; now: number }[] = [];
  source.start((m) => {
    if (m.type === "event") read.push({ ts: Date.parse(m.envelope.ts), now: source.now() });
  });
  scheduler.advance(1_000);
  assert.ok(read.length > 5);
  for (const line of read) assert.equal(line.now, line.ts);
});

test("round 60, pk-P1: a stress seek clamps as the storyline's does: not a finite number is the start, and a listener hears a snapshot, not a RangeError", () => {
  for (const to of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const scheduler = createManualScheduler();
    const source = createStressSource({ scheduler });
    const heard: SourceMessage[] = [];
    source.start((m) => heard.push(m));
    source.playback.seek(60_000);
    source.playback.seek(to);
    assert.equal(source.playback.positionMs(), 0, `seek ${to}`);
    assert.equal(heard.at(-1)?.type, "snapshot");
    assert.equal(source.now(), Date.parse("2026-10-01T08:00:00Z"));
  }
});

/* Round 60, pk-P1: the stream's side of the player's seam. */
const LOOP_MS = 30 * 60_000;
const EPOCH = Date.parse("2026-10-01T08:00:00Z");

test("round 60, pk-P1: the stream's loop end: no line stamped at the end itself, then the next loop's snapshot with its cursor above every seq before", () => {
  const scheduler = createManualScheduler();
  const source = createStressSource({ scheduler });
  source.playback.setSpeed(16);
  const messages: SourceMessage[] = [];
  source.start((m) => messages.push(m));
  source.playback.seek(LOOP_MS - 2_000);
  messages.length = 0;
  scheduler.advance(300); // 4.8 s of demo time: over the end
  assert.equal(source.playback.loop(), 1);
  const at = messages.findIndex((m) => m.type === "snapshot");
  assert.ok(at >= 0);
  const before = messages.slice(0, at).flatMap((m) => (m.type === "event" ? [m.envelope] : []));
  assert.ok(before.length > 0);
  for (const e of before) assert.ok(Date.parse(e.ts) < EPOCH + LOOP_MS, `${e.type} at ${e.ts}`);
  const snapshot = messages[at];
  assert.ok(snapshot?.type === "snapshot");
  assert.ok(snapshot.snapshot.cursor > Math.max(...before.map((e) => e.seq)));
  for (const m of messages.slice(at + 1)) if (m.type === "event") assert.ok(m.envelope.seq > snapshot.snapshot.cursor);
});

test("round 60, pk-P1: a stress snapshot's agents are seen at the clock, between two steps too", () => {
  const scheduler = createManualScheduler();
  const source = createStressSource({ scheduler });
  const messages: SourceMessage[] = [];
  source.start((m) => messages.push(m));
  source.playback.seek(1_000); // between the steps at 800 and 1200
  const snapshot = messages.at(-1);
  assert.ok(snapshot?.type === "snapshot");
  assert.ok(snapshot.snapshot.agents.length > 0);
  for (const agent of snapshot.snapshot.agents) assert.equal(agent.lastSeenAt, new Date(EPOCH + 1_000).toISOString());
});

test("round 60, pk-P1: a seek onto a step replays that step silently: the stream goes on with the next, as if played straight", () => {
  const stream = (seekTo: number | null) => {
    const scheduler = createManualScheduler();
    const source = createStressSource({ scheduler });
    const events: { seq: number; type: string; ts: string }[] = [];
    source.start((m) => m.type === "event" && events.push({ seq: m.envelope.seq, type: m.envelope.type, ts: m.envelope.ts }));
    if (seekTo !== null) source.playback.seek(seekTo);
    source.playback.setSpeed(16);
    scheduler.advance(2_000);
    return events;
  };
  const straight = stream(null);
  const onto = Date.parse(straight[10]?.ts as string) - EPOCH;
  assert.equal(onto % 400, 0);
  const sought = stream(onto);
  assert.ok(sought.length > 0);
  assert.ok(sought.every((e) => Date.parse(e.ts) > EPOCH + onto), "nothing at the step sought onto is sent");
  assert.deepEqual(sought[0], straight.find((e) => Date.parse(e.ts) > EPOCH + onto));
});

test("round 60, pk-P1: the stream names no speeds of its own: any speed plays", () => {
  const scheduler = createManualScheduler();
  const source = createStressSource({ scheduler });
  source.start(() => {});
  source.playback.setSpeed(2 as 1);
  scheduler.advance(100);
  assert.equal(source.playback.positionMs(), 200);
});
