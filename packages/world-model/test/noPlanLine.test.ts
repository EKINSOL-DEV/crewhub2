/** The scripted director's empty-plans line says the truth: a plan is promised only while an agent is idle; otherwise
 * who cannot be moved and why, naming the missing or stale team probe behind "status unknown". */
import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_PLAN_YET, NO_PLAN_YET_SCHEDULED, noPlanLine } from "../src/director.ts";
import { agent, building, world } from "./fixtures.ts";

const probed = { teamTs: "2026-10-21T18:00:00Z", ageSeconds: 12, stale: false };

test("with an idle real agent in a building the line promises the next scheduled plan, and a ticket move only when quick plans are on", () => {
  const model = world([building("cr", [agent("cr-dev-1", { posture: "focused" }), agent("cr-dev-2")])], { freshness: probed });
  assert.equal(noPlanLine(model, true), NO_PLAN_YET);
  assert.match(NO_PLAN_YET, /next scheduled interval or a ticket move/);
  assert.equal(noPlanLine(model, false), NO_PLAN_YET_SCHEDULED);
  assert.doesNotMatch(NO_PLAN_YET_SCHEDULED, /ticket move/);
});

test("the real loops without a team probe: every agent status unknown or working, so the line says nobody is idle, counts why and names the missing probe", () => {
  // 8291 on 21 October: four desk agents greyed (no team snapshot), three working, inferred from recent events.
  const model = world([
    building("cr", [agent("a1", { posture: "greyed", laneStatus: "unknown" }), agent("a2", { posture: "greyed", laneStatus: "unknown" }), agent("a3", { posture: "focused", laneStatus: "working" })]),
    building("ops", [agent("b1", { posture: "greyed", laneStatus: "unknown" }), agent("b2", { posture: "greyed", laneStatus: "unknown" }), agent("b3", { posture: "focused" }), agent("b4", { posture: "focused" })]),
  ]);
  assert.equal(model.freshness.teamTs, null);
  const line = noPlanLine(model, true);
  assert.match(line, /^No plan yet: no agent here is idle \(4 status unknown, 3 working\), so the scripted director has nobody to move; it plans when one is\./);
  assert.match(line, /No team probe has reported to this crewhub-loops, so a status stays unknown until one does\./);
  assert.match(line, /A ticket move still brings a quick plan, which then moves nobody\.$/);
  assert.doesNotMatch(line, /next scheduled interval/);
  assert.doesNotMatch(noPlanLine(model, false), /ticket move|quick plan/);
});

test("a stale team snapshot is named with its time; a fresh one adds nothing to the reasons", () => {
  const greyed = [building("cr", [agent("a1", { posture: "greyed" })])];
  const stale = noPlanLine(world(greyed, { freshness: { teamTs: "2026-10-21T17:00:00Z", ageSeconds: 3600, stale: true } }), true);
  assert.match(stale, /\(1 status unknown\)/);
  assert.match(stale, /The team snapshot is stale since 2026-10-21T17:00:00Z, so a status shows as unknown until a fresh one\./);
  assert.doesNotMatch(stale, /No team probe/);
  const fresh = noPlanLine(world([building("cr", [agent("a1", { posture: "focused" }), agent("a2", { posture: "raised-hand" }), agent("a3", { alerts: ["ticket t-1 stalled"] })])], { freshness: probed }), false);
  assert.equal(fresh, "No plan yet: no agent here is idle (1 working, 1 blocked, 1 stalled), so the scripted director has nobody to move; it plans when one is.");
});

test("nobody in any building (or only in an archived one) says so; agents outside the buildings do not count", () => {
  const empty = noPlanLine(world([building("cr", [])], { freshness: probed, townHall: [agent("visitor", { building: null, room: null })] }), true);
  assert.match(empty, /^No plan yet: no agent is in any building, so the scripted director has nobody to move; it plans when one is here and idle\. A ticket move still brings a quick plan, which then moves nobody\.$/);
  const archived = noPlanLine(world([building("old", [agent("a1")], { archived: true }), building("cr", [agent("a2", { posture: "focused" })])], { freshness: probed }), false);
  assert.match(archived, /\(1 working\)/);
  // A proxy (the translucent echo of an agent working elsewhere) is not the director's to move either.
  const ghosts = noPlanLine(world([building("cr", [agent("a1", { presence: "proxy", workingIn: "ops" })])], { freshness: probed }), false);
  assert.match(ghosts, /no agent is in any building/);
});

test("the same words in demo and live mode", () => {
  const buildings = [building("cr", [agent("a1", { posture: "greyed" })])];
  assert.equal(noPlanLine(world(buildings, { mode: "demo" }), true), noPlanLine(world(buildings, { mode: "live" }), true));
  const idle = [building("cr", [agent("a1")])];
  assert.equal(noPlanLine(world(idle, { mode: "demo" }), true), noPlanLine(world(idle, { mode: "live" }), true));
});
