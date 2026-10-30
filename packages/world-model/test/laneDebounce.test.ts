/**
 * Plan 7.1's debounce as it holds today, for the fixes round 48 left for later (round 49, r49-tests). M2 would show a
 * known status at once after a stale stretch; M4 would prune the lanes of agents a new snapshot no longer lists. Both
 * must keep what these pin: going stale greys at once, a flicker between two known statuses waits (after a stale
 * stretch too), and an agent a new snapshot lists again keeps its debounce.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TeamSnapshot } from "@crewhub/loops-client";
import { emptyMemory, type PresentationMemory } from "../src/memory.ts";
import type { WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, lane, project, snapshot, team } from "./helpers.ts";

const CL = project("crewhub-loops", "CL", "cl-lead");

function world(status: string) {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [CL], team: team(T0, [lane("cl-lead", status)]) }) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now: number): WorldModel => {
    const result = reduceWorld(projection.facts, memory, { now, mode: "live", roleOverrides: {} });
    memory = result.memory;
    return result.model;
  };
  const posture = (now: number) => reduce(now).buildings[0]?.agents[0]?.posture;
  const teamUpdate = (t: TeamSnapshot) => projection.apply({ type: "team", team: t });
  const resnapshot = (t: TeamSnapshot) => projection.apply({ type: "snapshot", snapshot: snapshot({ projects: [CL], team: t }) });
  return { posture, teamUpdate, resnapshot };
}

test("round 49 (M2 keeps): a shown status greys at once when the team goes stale; after the return a flicker between known statuses still waits", () => {
  const { posture, teamUpdate } = world("working");
  assert.equal(posture(T0), "focused");
  assert.equal(posture(T0 + 300_000), "focused", "300 s old is still fresh");
  assert.equal(posture(T0 + 301_000), "greyed", "stale greys at once, without a debounce");
  // The team comes back: two snapshots that agree show the status, whatever M2 decides for the first one.
  const back = T0 + 310_000;
  teamUpdate(team(back, [lane("cl-lead", "working")]));
  posture(back);
  teamUpdate(team(back + 10_000, [lane("cl-lead", "working")]));
  assert.equal(posture(back + 10_000), "focused");
  // From here it is a change between two known statuses: debounced as before the stale stretch.
  teamUpdate(team(back + 20_000, [lane("cl-lead", "idle")]));
  assert.equal(posture(back + 20_000), "focused");
  teamUpdate(team(back + 30_000, [lane("cl-lead", "working")]));
  assert.equal(posture(back + 30_000), "focused");
  teamUpdate(team(back + 40_000, [lane("cl-lead", "blocked")]));
  assert.equal(posture(back + 40_000), "focused");
  teamUpdate(team(back + 50_000, [lane("cl-lead", "blocked")]));
  assert.equal(posture(back + 50_000), "raised-hand");
});

test("round 49 (M4 keeps): a loops snapshot that lists the agent again keeps its debounce: a flicker across a reconnect stays hidden", () => {
  const { posture, teamUpdate, resnapshot } = world("working");
  assert.equal(posture(T0), "focused");
  // The host's stream comes back with a fresh snapshot (a reconnect); its team caught the lead between two lines.
  resnapshot(team(T0 + 10_000, [lane("cl-lead", "idle")]));
  assert.equal(posture(T0 + 10_000), "focused");
  teamUpdate(team(T0 + 20_000, [lane("cl-lead", "working")]));
  assert.equal(posture(T0 + 20_000), "focused");
  // A status that holds for two snapshots still becomes the posture: the snapshot's team counts as one.
  resnapshot(team(T0 + 30_000, [lane("cl-lead", "blocked")]));
  assert.equal(posture(T0 + 30_000), "focused");
  teamUpdate(team(T0 + 40_000, [lane("cl-lead", "blocked")]));
  assert.equal(posture(T0 + 40_000), "raised-hand");
});

test("round 49: a status one team snapshot carries waits however often the world is reduced (the app reduces every frame)", () => {
  const { posture, teamUpdate } = world("working");
  assert.equal(posture(T0), "focused");
  teamUpdate(team(T0 + 1_000, [lane("cl-lead", "idle")]));
  // A frame every 16 ms for 44 s: one snapshot is one snapshot, and 45 s have not passed.
  for (let now = T0 + 1_000; now < T0 + 45_000; now += 16) assert.equal(posture(now), "focused", `${now - T0} ms in`);
  assert.equal(posture(T0 + 46_000), "relaxed", "45 s of the same status is enough");
  // Back to working: the first snapshot waits through its frames, the second shows it at once.
  teamUpdate(team(T0 + 50_000, [lane("cl-lead", "working")]));
  assert.equal(posture(T0 + 50_000), "relaxed");
  assert.equal(posture(T0 + 50_016), "relaxed");
  teamUpdate(team(T0 + 60_000, [lane("cl-lead", "working")]));
  assert.equal(posture(T0 + 60_000), "focused");
});
