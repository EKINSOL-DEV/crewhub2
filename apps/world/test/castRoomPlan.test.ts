import assert from "node:assert/strict";
import { test } from "node:test";
import { CAST_ROLES, FIGURE_ACTIVITIES } from "../../../packages/world-cast/src/index.ts";
import {
  carryOnState,
  FOLLOW_GAP,
  FURNITURE,
  lineUpSpot,
  LOOP_LENGTH,
  loopSpot,
  MEMBERS,
  memberSpot,
  memberState,
  PREVIEW_STATES,
  previewState,
  ROOM,
  roomOrigin,
  roomPlays,
  walkSpot,
} from "../src/world/castRoomPlan.ts";

const inside = (p: { x: number; z: number }) => p.x > 0 && p.x < ROOM.width && p.z > 0 && p.z < ROOM.depth;

test("every role stands in the room, each member on its own spot inside the walls", () => {
  for (const role of CAST_ROLES) assert.ok(MEMBERS.some((m) => m.role === role), `no ${role} in the room`);
  assert.equal(new Set(MEMBERS.map((m) => m.key)).size, MEMBERS.length);
  const spots = new Set(MEMBERS.map((m) => `${m.home.x},${m.home.z}`));
  assert.equal(spots.size, MEMBERS.length);
  for (const m of MEMBERS) assert.ok(inside(m.home), `${m.key} stands outside the room`);
  for (const piece of FURNITURE) assert.ok(inside(piece), `${piece.key} stands outside the room`);
});

test("the states cover every activity and every signal a figure can show", () => {
  const states = PREVIEW_STATES.map((s) => s.state);
  for (const activity of FIGURE_ACTIVITIES) assert.ok(states.some((s) => s.activity === activity), `no state shows ${activity}`);
  for (const flag of ["waiting", "alert", "proxy", "carrying"] as const) assert.ok(states.some((s) => s[flag]), `no state shows ${flag}`);
  assert.equal(new Set(PREVIEW_STATES.map((s) => s.id)).size, PREVIEW_STATES.length);
});

test("the loop closes, stays inside the room and faces the way of the walk", () => {
  const start = loopSpot(0),
    again = loopSpot(LOOP_LENGTH);
  assert.ok(Math.hypot(start.x - again.x, start.z - again.z) < 1e-9);
  for (let d = 0; d < LOOP_LENGTH; d += 0.25) {
    const here = loopSpot(d),
      ahead = loopSpot(d + 0.05);
    assert.ok(inside(here));
    // Except across a corner, the next spot lies where the figure faces.
    const step = Math.hypot(ahead.x - here.x, ahead.z - here.z);
    if (Math.abs(step - 0.05) < 1e-6) {
      assert.ok(Math.abs(Math.sin(here.heading) * step - (ahead.x - here.x)) < 1e-9);
      assert.ok(Math.abs(Math.cos(here.heading) * step - (ahead.z - here.z)) < 1e-9);
    }
  }
  assert.deepEqual(loopSpot(-LOOP_LENGTH / 2), loopSpot(LOOP_LENGTH / 2));
});

test("walk: every member is on the loop, spread out", () => {
  const spots = MEMBERS.map((m) => walkSpot("walk", m, 3)!);
  assert.ok(spots.every(Boolean));
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z) > 1, "two walkers overlap");
});

test("team: the lead walks, its workers follow in a line one gap apart, the rest keep their places", () => {
  const lead = MEMBERS.find((m) => m.role === "lead")!;
  const followers = MEMBERS.filter((m) => m.follows);
  assert.ok(followers.length >= 3 && followers.every((m) => m.role === "worker"));
  // On a straight stretch of the loop the line is exact.
  const seconds = 4;
  const line = [lead, ...followers].map((m) => walkSpot("team", m, seconds)!);
  for (let i = 1; i < line.length; i++) {
    assert.ok(Math.abs(Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.z - line[i - 1]!.z) - FOLLOW_GAP) < 1e-9);
    assert.equal(line[i]!.heading, line[0]!.heading);
    assert.ok(line[i]!.x < line[i - 1]!.x, "a follower is not behind the one before it");
  }
  for (const m of MEMBERS) if (m !== lead && !m.follows) assert.equal(walkSpot("team", m, seconds), null);
  assert.equal(memberState("team", previewState("blocked"), lead, seconds).activity, "walking");
  assert.equal(memberState("team", previewState("blocked"), MEMBERS.find((m) => m.role === "design")!, seconds).activity, "blocked");
});

test("carry on: each figure goes its own way, the same on every load; the postman does its round with its letters", () => {
  const seen = new Set<string>();
  const postman = MEMBERS.find((m) => m.role === "postman")!;
  for (const m of MEMBERS) {
    for (let t = 0; t < 120; t += 0.5) {
      assert.deepEqual(carryOnState(m, t), carryOnState(m, t));
      if (m !== postman) seen.add(JSON.stringify(memberState("carry-on", previewState("idle"), m, t)));
    }
    assert.equal(walkSpot("carry-on", m, 5) !== null, m === postman);
  }
  assert.ok(seen.size >= 5, "carry on shows too few states");
  // At any moment the room is not in step.
  const now = new Set(MEMBERS.map((m) => JSON.stringify(carryOnState(m, 30))));
  assert.ok(now.size >= 2);
  assert.deepEqual(memberState("carry-on", previewState("idle"), postman, 5), { activity: "walking", waiting: false, alert: false, proxy: false, carrying: true });
});

test("a walk on the spot and something carried show in the line-up, clear of the desks", () => {
  const worker = MEMBERS.find((m) => m.role === "worker")!;
  assert.deepEqual(memberSpot("desks", "working", worker, 0), { spot: worker.home, walking: false });
  for (const state of ["walking", "carrying"] as const) assert.deepEqual(memberSpot("desks", state, worker, 0).spot, lineUpSpot(worker));
  const line = MEMBERS.map(lineUpSpot);
  for (let i = 1; i < line.length; i++) assert.ok(line[i]!.x - line[i - 1]!.x > 1 && inside(line[i]!));
});

test("rooms: one per cast near, a block of states per cast at town distance, never overlapping", () => {
  assert.deepEqual(roomPlays(1, "done", "desks", false), { plays: [{ cast: 0, state: "done", scene: "desks", note: null }], columns: 1 });
  const side = roomPlays(4, "done", "desks", false);
  assert.deepEqual([side.plays.map((p) => p.cast), side.columns], [[0, 1, 2, 3], 2]);
  for (const casts of [1, 4]) {
    const far = roomPlays(casts, "done", "team", true);
    for (let cast = 0; cast < casts; cast++) {
      const own = far.plays.filter((p) => p.cast === cast);
      assert.ok(own.length >= 3);
      assert.deepEqual([own[0]!.state, own[0]!.scene], ["done", "team"]);
      assert.ok(own.every((p) => p.note));
    }
    // A cast's rooms fill whole rows, so a row never mixes casts.
    assert.equal(far.plays.length % far.columns, 0);
    const origins = far.plays.map((_, i) => roomOrigin(i, far.columns));
    for (let i = 0; i < origins.length; i++)
      for (let j = i + 1; j < origins.length; j++)
        assert.ok(Math.abs(origins[i]!.x - origins[j]!.x) >= ROOM.width || Math.abs(origins[i]!.z - origins[j]!.z) >= ROOM.depth);
  }
});
