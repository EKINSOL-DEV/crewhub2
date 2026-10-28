/**
 * The caps the scene's code keeps on its own memory, pinned (round 44): no test fed them past their limit before.
 *
 *   - `buildingTemplate.ts` keeps the last 64 templates by their inputs, most recently used last: the same inputs give
 *     the same object; a template used again survives 63 newer ones; an unused one is gone after 64 newer ones.
 *   - `roomDressing.ts` memoises `dressRooms` by seed and template and clears the memo above 256 entries: the same
 *     inputs give the same array until 257 other inputs went through, then a new one.
 *   - `intentPlayer.ts` keeps the last 40 played intents, newest first.
 *
 * Each proof: take the eviction or the `.slice` out of the source and the test fails (the report of round 44 says how).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Intent } from "@crewhub/world-model";
import { buildingTemplate, dressingZones, interiorDefinitions, LOADING } from "../src/world/buildingTemplate.ts";
import { clearIntents, playIntent, playedIntents } from "../src/world/intentPlayer.ts";
import { dressRooms } from "../src/world/roomDressing.ts";
import { agent, building, world } from "./fixtures.ts";

test("buildingTemplate keeps 64 templates, most recently used last", () => {
  const first = building("cap-template-0");
  const t0 = buildingTemplate(first, "classic");
  assert.equal(buildingTemplate(first, "classic"), t0, "the same inputs give the same template object");
  // 63 other buildings, then the first one again: it is the newest entry now.
  for (let i = 1; i <= 63; i++) buildingTemplate(building(`cap-template-${i}`), "classic");
  assert.equal(buildingTemplate(first, "classic"), t0, "63 newer templates do not push it out");
  // 63 more: the first is still among the 64 newest, because its use moved it to the back.
  for (let i = 64; i <= 126; i++) buildingTemplate(building(`cap-template-${i}`), "classic");
  assert.equal(buildingTemplate(first, "classic"), t0, "a template used again survives 63 newer ones (most recently used last)");
  // 64 more without touching it: the oldest goes first, and the first is the oldest.
  for (let i = 127; i <= 190; i++) buildingTemplate(building(`cap-template-${i}`), "classic");
  assert.notEqual(buildingTemplate(first, "classic"), t0, "after 64 newer templates the first is built again");
});

test("dressRooms memoises by seed and template and clears the memo above 256 entries", () => {
  const template = buildingTemplate(building("cap-dressing"), "classic");
  const options = (seed: number) => ({ definitions: interiorDefinitions, seed, zones: dressingZones(template), loading: LOADING });
  const r0 = dressRooms(template, options(1_000_001));
  assert.equal(dressRooms(template, options(1_000_001)), r0, "the same seed and template give the same rooms array");
  // 257 other seeds: whatever the memo held before, it passed 256 entries once and was cleared.
  for (let i = 1; i <= 257; i++) dressRooms(template, options(1_000_001 + i));
  const again = dressRooms(template, options(1_000_001));
  assert.notEqual(again, r0, "after 257 other entries the memo was cleared: the rooms are planned again");
  assert.deepEqual(again, r0, "and planned the same (the dressing is deterministic per seed)");
});

test("the intent player keeps the last 40 played intents, newest first", () => {
  clearIntents();
  const model = world([building("cr", [agent("cr-dev-1", "lobby")])]);
  const intent: Intent = { kind: "goToProp", agent: "cr-dev-1", room: "lobby", tag: "coffee", ttlMs: 90_000 };
  const played = Array.from({ length: 41 }, (_, i) => playIntent(intent, { ...model, now: model.now + i * 1000 }));
  const log = playedIntents();
  assert.equal(log.length, 40, "41 played, 40 kept");
  assert.deepEqual(
    log.map((p) => p.id),
    played
      .slice(1)
      .map((p) => p.id)
      .reverse(),
    "the newest first, the first one played gone",
  );
  assert.equal(log[0]?.at, model.now + 40_000);
  clearIntents();
  assert.equal(playedIntents().length, 0, "the kill switch empties the log");
});

/* Round 45: three more caps, through small seams.
 *   - `state/director.ts` keeps the last 40 plans, newest first (`state/planLog.ts` `logPlans`, the pure step `#onModel` takes).
 *   - `walks.ts` remembers the idle errands done (`#idleDone`) and clears them above 2000 (`idleDoneCount`).
 *   - `personWalks.ts` remembers the visits walked (`#started`), clears them on a new snapshot and above 2000
 *     (`startedCount`); the 2000 is pinned by round 47's test at the end. */
import type { PlanRecord } from "@crewhub/demo";
import type { WorldModel } from "@crewhub/world-model";
import { logPlans } from "../src/state/planLog.ts";
import { IDLE_BUCKET_MS } from "../src/world/movement.ts";
import { PersonWalks } from "../src/world/personWalks.ts";
import { Walks } from "../src/world/walks.ts";

const plan = (id: number): PlanRecord => ({ id, trigger: "scheduled", reason: "interval", building: "cr", at: id * 1000, inputTokens: 1, inputTruncated: false, outputTokens: 1, accepted: [], rejected: [] });

test("the director keeps the last 40 plans, newest first", () => {
  let log: readonly PlanRecord[] = [];
  for (let i = 1; i <= 41; i++) log = logPlans(log, [plan(i)]);
  assert.equal(log.length, 40, "41 planned, 40 kept");
  assert.equal(log[0]!.id, 41, "the newest first");
  assert.equal(log[39]!.id, 2, "the first one planned gone");
  const same = logPlans(log, []);
  assert.equal(same, log, "no plan made, the same log");
  const two = logPlans(log, [plan(42), plan(43)]);
  assert.deepEqual(two.slice(0, 2).map((p) => p.id), [43, 42], "a step's plans land newest first");
  assert.equal(two.length, 40);
});

test("the walks remember the idle errands done and clear them above 2000", () => {
  // Sixty relaxed agents at rest in the entered building: each 90 s bucket offers most of them an errand (one id per
  // agent and bucket); ticking with `now` a bucket further each time runs the idle planner once per call.
  const agents = Array.from({ length: 60 }, (_, i) => agent(`cr-dev-${i}`, "lobby", { posture: "relaxed" }));
  const model = world([building("cr", agents)]);
  const walks = new Walks();
  walks.update(model, { entered: "cr", reducedMotion: false, ambient: "on" });
  let now = model.now;
  let peak = 0;
  let cleared = false;
  for (let k = 0; k < 600 && !cleared; k++) {
    now += IDLE_BUCKET_MS;
    walks.tick(0, now);
    const n = walks.idleDoneCount;
    if (n < peak) cleared = true;
    peak = Math.max(peak, n);
    assert.ok(n <= 2000, `${n} errand ids remembered, over the cap`);
  }
  // The idle chance is low, so a tick adds a few ids (about four of the sixty), and the tick that passes 2000 clears in the
  // same call: the last count seen before the clear sits just under 2000.
  assert.ok(peak > 1980, `the errands done reached the cap (${peak} seen before the clear, just under 2000)`);
  assert.ok(cleared, "above 2000 the set was cleared");
});

test("the person walks remember a visit once, and forget the visits on a new snapshot", () => {
  const visit = (id: string): WorldModel["buildings"][number]["visits"][number] => ({ id, personId: "nicky", displayName: "Nicky", ticketId: id, ticketKey: id.toUpperCase(), movedAt: 1, startedAt: 1, until: 60_000, from: { room: "review", deskOf: null }, rejected: false, phase: "carrying" });
  const withVisits = (snapshots: number, ids: string[]) => world([{ ...building("cr", [agent("cr-dev-1", "lobby")]), visits: ids.map(visit) }], { snapshots });
  const walks = new Walks();
  const people = new PersonWalks(walks.nav);
  const options = { entered: "cr", reducedMotion: false };
  const first = withVisits(1, ["v1", "v2"]);
  walks.update(first, { ...options, ambient: "on" });
  people.update(first, options);
  assert.equal(people.startedCount, 1, "one visit at a time: the first started");
  people.update(first, options);
  assert.equal(people.startedCount, 1, "the same model again starts nothing new");
  const next = withVisits(2, []);
  walks.update(next, { ...options, ambient: "on" });
  people.update(next, options);
  assert.equal(people.startedCount, 0, "a new snapshot forgets the visits walked");
});

/* Round 47: the 2000 on `#started`, pinned after all. A visit starts one at a time, but no simulation is needed: leaving
   and entering the building again (or reduced motion on and off) drops the walker without forgetting its visit, and the
   next update starts the next visit not yet walked. 2,100 queued visits and 2,050 such toggles start one each. */
test("the person walks forget the visits walked above 2000", () => {
  const visit = (id: string): WorldModel["buildings"][number]["visits"][number] => ({ id, personId: "nicky", displayName: "Nicky", ticketId: id, ticketKey: id.toUpperCase(), movedAt: 1, startedAt: 1, until: 60_000, from: { room: "review", deskOf: null }, rejected: false, phase: "carrying" });
  const model = world([{ ...building("cr", [agent("cr-dev-1", "lobby")]), visits: Array.from({ length: 2100 }, (_, i) => visit(`v${i}`)) }], { snapshots: 1 });
  const walks = new Walks();
  const people = new PersonWalks(walks.nav);
  walks.update(model, { entered: "cr", reducedMotion: false, ambient: "on" });
  let peak = 0;
  let drops = 0;
  let last = 0;
  for (let k = 0; k < 2050; k++) {
    // Half the toggles leave the building, half turn reduced motion on: both end the walk and keep the visit walked.
    people.update(model, k % 2 ? { entered: null, reducedMotion: false } : { entered: "cr", reducedMotion: true });
    people.update(model, { entered: "cr", reducedMotion: false });
    const n = people.startedCount;
    assert.ok(n <= 2000, `${n} visits remembered, over the cap`);
    if (n < last) drops++;
    else assert.equal(n, last + 1, "one new visit started per toggle");
    peak = Math.max(peak, n);
    last = n;
  }
  assert.equal(peak, 2000, "the visits walked reached the cap");
  assert.equal(drops, 1, "above 2000 the set was cleared, once");
  assert.equal(last, 2050 - 2001, "and counting started again from the clear");
});
