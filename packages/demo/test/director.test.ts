/** The scripted director feed, driven by models the demo itself produced (and by edited copies of them). */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { DEFAULT_PRESENCE, Projection, effectivePresence, emptyMemory, immovableReason, movedAgents, reduceWorld } from "@crewhub/world-model";
import type { AgentPlacement, PresenceSettings, WorldModel } from "@crewhub/world-model";
import { QUICK_DEBOUNCE_MS, QUICK_MIN_GAP_MS, createDirectorFeed, movementSignals } from "../src/director.ts";
import { createManualScheduler } from "../src/scheduler.ts";
import { DEMO_SEED, SCRIPT_DURATION_MS } from "../src/script.ts";
import { createDemoSource } from "../src/source.ts";
import { SECOND } from "../src/time.ts";

const on: PresenceSettings = { ...DEFAULT_PRESENCE, directorEnabled: true };
/** A fixture: the tags the building template offers per room, standing in for the app's navigation world. */
const FIXTURE_ROOM_PROPS: Readonly<Record<string, readonly string[]>> = {
  lobby: ["mail", "rest", "coffee", "greenery"],
  "lead-office": ["greenery"],
  storage: ["storage"],
  planning: ["planning"],
  review: ["review"],
  dispatch: ["dispatch"],
};
const propTags = (_building: string, room: string) => FIXTURE_ROOM_PROPS[room] ?? [];
const reachable = (q: { kind: string; tag?: string; room?: string }) => q.kind !== "prop" || propTags("", q.room ?? "").includes(q.tag ?? "");

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

const feedOf = (settings: PresenceSettings = on, seed = DEMO_SEED) => createDirectorFeed({ seed, reachable, propTags, settings });
const runAll = (feed = feedOf()) => models.flatMap((m) => feed.step(m));

/** The same facts as a live world would show them: mode "live", the wall clock as `now` (the host's models look like this). */
const WALL_START = Date.UTC(2026, 9, 21, 9, 0, 0);
const liveModels = (): WorldModel[] => models.map((m, i) => ({ ...m, mode: "live", now: WALL_START + i * 10 * SECOND }));

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

test("scripted prop visits name tags the rooms offer, so most intents are accepted", () => {
  const plans = runAll();
  const accepted = plans.flatMap((p) => p.accepted);
  const rejected = plans.flatMap((p) => p.rejected);
  assert.ok(accepted.length > rejected.length * 2, `${accepted.length} accepted vs ${rejected.length} rejected`);
  assert.ok(rejected.every((r) => !/no reachable prop/.test(r.reason)), "no scripted tag is missing from its room");
  const visits = accepted.filter((i) => i.kind === "goToProp");
  assert.ok(visits.length > 0);
  for (const v of visits) assert.ok(propTags("", v.room).includes(v.tag), `${v.tag} is offered in the ${v.room}`);
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

// Round 49 (r48-demo-fake D7): the test above stands for a loop by stepping back to the first model, which the demo
// never does. Its next loop plays the script again one duration later, so the feed's reset sees a seek and never a
// loop. Pinned as the code is now, whichever words D7's fix gives the director.
test("a loop's end does not run the demo's time backwards: the next loop plays one duration later", () => {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: 16 });
  const seen: { now: number; type: string }[] = [];
  source.start((message) => seen.push({ now: source.now(), type: message.type }));
  scheduler.advance((SCRIPT_DURATION_MS + 60 * SECOND) / 16);
  const snapshots = seen.filter((s) => s.type === "snapshot");
  assert.equal(snapshots.length, 2, "one loop's end");
  const back = seen.findIndex((s, i) => i > 0 && s.now < seen[i - 1]!.now);
  assert.equal(back, -1, back < 0 ? "" : `a ${seen[back]!.type} at ${seen[back]!.now} after ${seen[back - 1]!.now}`);
  assert.equal(snapshots[1]!.now - snapshots[0]!.now, SCRIPT_DURATION_MS);
});

test("live mode: the feed plans from the live facts, every accepted intent moves an idle real agent of that building", () => {
  const live = liveModels();
  const feed = feedOf(effectivePresence({ ...DEFAULT_PRESENCE, liveDirectorEnabled: true }, "live"));
  const plans = live.flatMap((m) => feed.step(m));
  assert.ok(plans.length > 3, `expected plans over a live loop, got ${plans.length}`);
  const byNow = new Map(live.map((m) => [m.now, m]));
  for (const plan of plans) {
    assert.ok(plan.at >= WALL_START, "a plan carries the live model's wall-clock time");
    const model = byNow.get(plan.at);
    assert.ok(model, "a plan's time is one of the models it was shown");
    const building = model.buildings.find((b) => b.slug === plan.building);
    assert.ok(building && !building.archived, `plan ${plan.id} is for a live building`);
    for (const intent of plan.accepted) {
      for (const key of movedAgents(intent)) {
        const agent: AgentPlacement | undefined = building.agents.find((a) => a.key === key);
        assert.ok(agent && agent.presence === "real", `${key} is a real agent of ${plan.building}`);
        assert.equal(immovableReason({ agent, building }), null, `${key} was idle when plan ${plan.id} moved it`);
      }
    }
  }
  assert.ok(plans.some((p) => p.rejected.length > 0), "the deliberately invalid intent is rejected in live mode too");
  assert.equal(feed.usage().plansTotal, plans.length);
});

test("live mode: the demo's switch left on makes no live plan; the live opt-in alone does", () => {
  const live = liveModels();
  const demoOnly = feedOf(effectivePresence({ ...DEFAULT_PRESENCE, directorEnabled: true }, "live"));
  assert.deepEqual(live.flatMap((m) => demoOnly.step(m)), []);
  assert.equal(demoOnly.usage().capReached, null);
  const liveOnly = feedOf(effectivePresence({ ...DEFAULT_PRESENCE, liveDirectorEnabled: true }, "live"));
  assert.ok(live.flatMap((m) => liveOnly.step(m)).length > 3);
  // And the same stored settings in demo mode: the live opt-in alone runs nothing there.
  const liveOnlyInDemo = feedOf(effectivePresence({ ...DEFAULT_PRESENCE, liveDirectorEnabled: true }, "demo"));
  assert.deepEqual(runAll(liveOnlyInDemo), []);
});
