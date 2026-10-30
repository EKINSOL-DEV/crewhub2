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
