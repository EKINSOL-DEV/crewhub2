/** The scripted director feed, driven by models the demo itself produced (and by edited copies of them). */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { DEFAULT_PRESENCE, Projection, emptyMemory, reduceWorld } from "@crewhub/world-model";
import type { AgentPlacement, PresenceSettings, WorldModel } from "@crewhub/world-model";
import { QUICK_DEBOUNCE_MS, QUICK_MIN_GAP_MS, createDirectorFeed, demoPropTags, movementSignals } from "../src/director.ts";
import { createManualScheduler } from "../src/scheduler.ts";
import { DEMO_SEED, SCRIPT_DURATION_MS } from "../src/script.ts";
import { createDemoSource } from "../src/source.ts";
import { SECOND } from "../src/time.ts";

const on: PresenceSettings = { ...DEFAULT_PRESENCE, directorEnabled: true };
const reachable = (q: { kind: string; tag?: string; room?: string }) => q.kind !== "prop" || demoPropTags(q.room as never).includes(q.tag ?? "");

/** One model every 10 s of demo time over a full loop. */
let models: WorldModel[] = [];
before(async () => {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: 16 });
  const projection = new Projection(source, { coalesceMs: 0 });
  let memory = emptyMemory();
  source.start((message) => projection.apply(message));
  const wallStep = (10 * SECOND) / 16;
  for (let wall = 0; wall < SCRIPT_DURATION_MS / 16 - 1_000; wall += wallStep) {
    scheduler.advance(wallStep);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} });
    memory = result.memory;
    models.push(result.model);
  }
  projection.dispose();
});

const feedOf = (settings: PresenceSettings = on, seed = DEMO_SEED) => createDirectorFeed({ seed, reachable, settings });
const runAll = (feed = feedOf()) => models.flatMap((m) => feed.step(m));

test("the demo gives the feed a loop of models to work with", () => {
  assert.ok(models.length > 50);
  assert.ok(models.some((m) => m.buildings.some((b) => b.agents.some((a) => a.posture === "relaxed"))));
});

test("the feed is deterministic from the seed and differs with another seed", () => {
  const a = runAll();
  const b = runAll();
  assert.ok(a.length > 3, `expected plans over a loop, got ${a.length}`);
  assert.deepEqual(a, b);
  const c = runAll(feedOf(on, DEMO_SEED + 1));
  assert.notDeepEqual(a.map((p) => p.accepted), c.map((p) => p.accepted));
});

test("every plan is logged with its trigger, building and estimated input size, and never exceeds 8 intents", () => {
  for (const plan of runAll()) {
    assert.ok(plan.trigger === "scheduled" || plan.trigger === "quick");
    assert.ok(plan.building.length > 0 && plan.inputTokens > 0 && plan.inputTokens <= DEFAULT_PRESENCE.inputBudget);
    assert.ok(plan.accepted.length <= 8);
  }
});

test("the deliberately invalid intent shows up rejected with a reason", () => {
  const plans = runAll();
  const rejected = plans.flatMap((p) => p.rejected);
  assert.ok(rejected.length > 0, "a rejection is visible in a full loop");
  assert.ok(rejected.every((r) => /working|blocked|stalled|waiting|no meeting|unknown/.test(r.reason)));
});

test("disabled, the feed makes no plan; the kill switch stops it at once", () => {
  const off = feedOf({ ...on, directorEnabled: false });
  assert.deepEqual(runAll(off), []);
  const feed = feedOf();
  const first = models.slice(0, Math.floor(models.length / 2));
  const plansBefore = first.flatMap((m) => feed.step(m)).length;
  assert.ok(plansBefore > 0);
  feed.setSettings({ ...on, directorEnabled: false });
  assert.deepEqual(models.slice(first.length).flatMap((m) => feed.step(m)), []);
});

test("scheduled plans follow the interval: a longer interval makes fewer plans", () => {
  const quick = runAll(feedOf({ ...on, quickPlans: false, intervalMinutes: 2 })).length;
  const slow = runAll(feedOf({ ...on, quickPlans: false, intervalMinutes: 10 })).length;
  assert.ok(quick > slow, `${quick} plans at 2 min vs ${slow} at 10 min`);
  assert.ok(runAll(feedOf({ ...on, quickPlans: false })).every((p) => p.trigger === "scheduled"));
});

/** The same model at another time, with the first placed agent's status set: a movement-relevant fact when it flips. */
function shifted(model: WorldModel, at: number, working: boolean): WorldModel {
  const copy = structuredClone(model);
  copy.now = at;
  const mover = copy.buildings.flatMap((b) => b.agents).find((a: AgentPlacement) => a.presence === "real" && a.posture !== "greyed")!;
  mover.laneStatus = working ? "working" : "idle";
  mover.posture = working ? "focused" : "relaxed";
  return copy;
}

test("a quick plan waits 20 s after the last movement-relevant fact, and at most one per building per minute", () => {
  const base = models.find((m) => m.buildings.some((b) => !b.archived && b.agents.filter((a) => a.presence === "real" && a.posture === "relaxed").length >= 2))!;
  assert.ok(base, "a building with two idle agents exists in the loop");
  const t0 = base.now;
  const feed = feedOf({ ...on, intervalMinutes: 60 });
  const fired: { second: number; trigger: string }[] = [];
  let working = false;
  const flipAt = new Set([1, 3, 5, 40, 42]);
  for (let second = 0; second <= 200; second++) {
    if (flipAt.has(second)) working = !working;
    for (const plan of feed.step(shifted(base, t0 + second * SECOND, working))) fired.push({ second, trigger: plan.trigger });
  }
  assert.deepEqual(fired.map((f) => f.trigger), ["quick", "quick"]);
  assert.equal(fired[0]!.second, 5 + QUICK_DEBOUNCE_MS / SECOND, "20 s after the last fact of the burst");
  assert.equal(fired[1]!.second, fired[0]!.second + QUICK_MIN_GAP_MS / SECOND, "the second burst waits for the minute, then fires");
});

test("movement signals: a ticket move, a status change and a building change", () => {
  const a = models.find((m) => m.buildings.some((b) => b.agents.some((x) => x.presence === "real")))!;
  const flipped = structuredClone(a);
  const b = flipped.buildings.find((x) => x.agents.some((y) => y.presence === "real"))!;
  const agent = b.agents.find((y) => y.presence === "real")!;
  agent.posture = agent.posture === "focused" ? "relaxed" : "focused";
  assert.equal(movementSignals(a, flipped).get(b.slug), `${agent.key} changed status`);
  assert.equal(movementSignals(a, a).size, 0);
});

test("the caps are a hard stop", () => {
  const capped = feedOf({ ...on, quickPlans: false, intervalMinutes: 2, plansPerHour: 2 });
  assert.equal(runAll(capped).length, 2);
  assert.equal(capped.usage().capReached, "hour");
  assert.equal(capped.usage().plansThisHour, 2);
  assert.equal(feedOf().usage().capReached, null);
});

test("time running backwards (a loop or a seek) starts every timer afresh", () => {
  const feed = feedOf({ ...on, quickPlans: false, intervalMinutes: 2 });
  const half = Math.floor(models.length / 2);
  const before = models.slice(0, half).flatMap((m) => feed.step(m));
  assert.ok(before.length > 0);
  assert.deepEqual(feed.step(models[0]!), []);
  // The next 100 s of demo time are inside the 2 min interval that restarted with the jump.
  assert.deepEqual(models.slice(1, 11).flatMap((m) => feed.step(m)), []);
});
