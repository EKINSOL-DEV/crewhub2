/**
 * The world-model projection and reducer consume the demo exactly as they would the host: this
 * plays a full loop through them and checks nothing is rejected or skipped.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Projection, describeWorld, emptyMemory, reduceWorld } from "@crewhub/world-model";
import { SCRIPT_DURATION_MS } from "../src/script.ts";
import { createDemoSource } from "../src/source.ts";
import { createManualScheduler } from "../src/scheduler.ts";

test("a full loop through the projection and the reducer: no invalid or skipped event", async () => {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: 16 });
  const projection = new Projection(source, { coalesceMs: 0 });
  let memory = emptyMemory();
  let lines = 0;
  source.start((message) => projection.apply(message));
  for (let wall = 0; wall < SCRIPT_DURATION_MS / 16 - 1_000; wall += 2_000) {
    scheduler.advance(2_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} });
    memory = result.memory;
    lines = describeWorld(result.model).length;
  }
  const facts = projection.facts;
  assert.equal(facts.invalidEvents, 0);
  assert.equal(facts.skippedEvents, 0);
  assert.ok(facts.cursor > 4_900);
  assert.deepEqual(facts.order, ["crewhub", "crewhub-loops", "marketing"]);
  assert.ok(lines > 20);
  projection.dispose();
});
