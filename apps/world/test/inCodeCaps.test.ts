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
