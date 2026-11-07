import assert from "node:assert/strict";
import test from "node:test";
import type { WorldModel } from "@crewhub/world-model";
import { HANDOVER_LEGS, idleChoice, IDLE_BUCKET_MS, isResting, planIdle, planMovement, type MovementIntent } from "../src/world/movement.ts";
import { agent, building, object, world } from "./fixtures.ts";

const T = 5_000_000;
const onDesk = object("t1", "workers", { key: "CR-1", deskOf: "cr/dev-1" });
// Two buildings: CrewHub with two workers, and Ops with only its lead.
const base = world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-2", "workers")], [onDesk]), building("ops")]);
const withObject = (model: WorldModel, o: typeof onDesk): WorldModel => ({
  ...model,
  buildings: model.buildings.map((b) => (b.slug === "cr" ? { ...b, objects: [o] } : b)),
});
const toReview = withObject(base, { ...onDesk, transit: { fromRoom: "workers", toRoom: "review", toDeskOf: null, startedAt: T, until: T + 3000 } });
const town = { reducedMotion: false, entered: null };
const inside = { reducedMotion: false, entered: "cr" };

test("a ticket flying to review sends its agent on the hand-over walk: to the pile and back to the desk", () => {
  const intents = planMovement(base, toReview, inside);
  assert.deepEqual(intents, [
    { type: "errand", agent: "cr/dev-1", building: "cr", reason: "handover", label: "hands CR-1 over to review", legs: HANDOVER_LEGS.map((l) => ({ ...l })) },
  ]);
  assert.deepEqual(intents[0]!.type === "errand" && intents[0]!.legs.map((l) => l.place), [
    { kind: "spot", tag: "review", room: "review" },
    { kind: "desk" },
  ]);
  // The same flight in the next reduction starts nothing new; the landing in review moves nobody.
  assert.deepEqual(planMovement(toReview, toReview, inside), []);
  const landed = withObject(base, { ...onDesk, room: "review", status: "review", deskOf: null });
  assert.deepEqual(planMovement(toReview, landed, inside), []);
  // A ticket landing on another desk calls that agent to it.
  const onDev2 = withObject(base, { ...onDesk, deskOf: "cr/dev-2" });
  assert.deepEqual(planMovement(landed, onDev2, inside), [{ type: "desk", agent: "cr/dev-2", building: "cr" }]);
});

test("reduced motion yields no walks: errands are dropped and every move is a jump", () => {
  const reduced = { reducedMotion: true, entered: "cr" };
  assert.deepEqual(planMovement(base, toReview, reduced), []);
  const other = building("ops", [agent("cr/dev-2", "workers")]);
  const next = world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-9", "workers")]), other]);
  const intents = planMovement(base, next, { reducedMotion: true, entered: null });
  assert.deepEqual(
    intents.map((i) => [i.type, "walk" in i ? i.walk : null]),
    [
      ["enter", false],
      ["switch", false],
    ],
  );
  const gone = world([building("cr", [agent("cr/dev-1", "workers")]), building("ops")]);
  assert.deepEqual(planMovement(base, gone, { reducedMotion: true, entered: "cr" }), [{ type: "leave", agent: "cr/dev-2", building: "cr", walk: false }]);
  const resting = world([building("cr", [agent("cr/dev-1", "workers", { posture: "relaxed", laneStatus: "idle" })])]);
  for (let t = 0; t < 40 * IDLE_BUCKET_MS; t += IDLE_BUCKET_MS / 3)
    assert.deepEqual(planIdle(resting, t, { ...reduced, ambient: "on" }, new Set()), []);
});

test("joins, departures and location switches: walks in the town view, a swap inside a building", () => {
  const ops = building("ops", [agent("cr/dev-2", "workers")]);
  const next = world([building("cr", [agent("cr/dev-1", "workers"), agent("cr/dev-9", "workers")], [onDesk]), ops]);
  assert.deepEqual(planMovement(base, next, town), [
    { type: "enter", agent: "cr/dev-9", building: "cr", walk: true },
    { type: "switch", agent: "cr/dev-2", from: "cr", to: "ops", walk: true },
  ]);
  assert.deepEqual(
    planMovement(base, next, inside).find((i) => i.type === "switch"),
    { type: "switch", agent: "cr/dev-2", from: "cr", to: "ops", walk: false },
  );
  // A new snapshot (seek or loop) places everyone at once instead.
  assert.deepEqual(
    planMovement(base, { ...next, snapshots: 2 }, town).map((i) => i.type),
    ["spawn", "spawn", "spawn", "spawn", "spawn"],
  );
});

test("movement follows the debounced posture, never the raw lane status", () => {
  const at = (laneStatus: "idle" | "working", posture: "relaxed" | "focused") =>
    world([building("cr", [agent("cr/dev-1", "workers", { laneStatus, posture })])]);
  // The lane says idle but the posture has not flipped yet: no wandering.
  const pending = at("idle", "focused");
  const settled = at("idle", "relaxed");
  let due = 0;
  for (let t = 0; t < 40 * IDLE_BUCKET_MS; t += IDLE_BUCKET_MS / 3) {
    assert.deepEqual(planIdle(pending, t, { ...inside, ambient: "on" }, new Set()), []);
    due += planIdle(settled, t, { ...inside, ambient: "on" }, new Set()).length;
  }
  assert.ok(due > 0, "a resting agent wanders now and then");
  // Back to work only once the posture changes, not when the lane does.
  assert.deepEqual(planMovement(settled, at("working", "relaxed"), inside), []);
  assert.deepEqual(planMovement(settled, at("working", "focused"), inside), [{ type: "desk", agent: "cr/dev-1", building: "cr" }]);
});

test("idle variety is seeded by agent and time bucket and skips blocked, stalled and waiting agents", () => {
  const choices = (key: string) => Array.from({ length: 30 }, (_, i) => idleChoice(key, i * IDLE_BUCKET_MS + 10, "on"));
  assert.deepEqual(choices("cr/dev-1"), choices("cr/dev-1"));
  assert.notDeepEqual(choices("cr/dev-1"), choices("cr/dev-2"));
  const on = choices("cr/dev-1").filter(Boolean).length;
  const reduced = Array.from({ length: 30 }, (_, i) => idleChoice("cr/dev-1", i * IDLE_BUCKET_MS + 10, "reduced")).filter(Boolean).length;
  assert.ok(on > reduced, "reduced ambient wanders less");
  assert.equal(idleChoice("cr/dev-1", 10, "off"), null);
  for (const c of choices("cr/dev-1")) if (c) assert.ok(c.at >= Math.floor(c.at / IDLE_BUCKET_MS) * IDLE_BUCKET_MS);

  const relaxed = { posture: "relaxed" as const, laneStatus: "idle" as const };
  const b = building("cr", [agent("a", "workers", relaxed), agent("b", "workers", { ...relaxed, alerts: ["CR-2 waits on Nicky"] })], [
    object("s", "workers", { deskOf: "a", stall: { state: "stalled", quietSince: "", quietMinutes: 30, nudges: 0 } }),
  ]);
  assert.equal(isResting(b.agents.find((a) => a.key === "a")!, b), false, "a stalled ticket on the desk");
  assert.equal(isResting(b.agents.find((a) => a.key === "b")!, b), false, "an alert");
  assert.equal(isResting(agent("c", "workers", { ...relaxed, posture: "raised-hand" }), b), false, "blocked");
  assert.equal(isResting(agent("d", "workers", { ...relaxed, presence: "proxy" }), b), false, "a proxy");
  // Nothing wanders in the town view, and a choice runs once.
  const resting = world([building("cr", [agent("cr/dev-1", "workers", relaxed)])]);
  const due: MovementIntent[] = [];
  const done = new Set<string>();
  for (let t = 0; t < 40 * IDLE_BUCKET_MS; t += 5_000) {
    assert.deepEqual(planIdle(resting, t, { ...town, ambient: "on" }, done), []);
    for (const e of planIdle(resting, t, { ...inside, ambient: "on" }, done)) {
      done.add(e.id);
      due.push(e);
    }
  }
  assert.equal(new Set(due.map((e) => e.type === "errand" && e.legs[0]!.place.kind === "spot" && e.legs[0]!.place.tag)).size, 3, "every idle action shows up");
});
