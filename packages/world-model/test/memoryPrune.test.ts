/**
 * The presentation memory forgets what the facts no longer hold (round 50, r48-model M4): the lane and the place of an
 * agent that is no longer listed, the role rooms of a building that is gone. What is still there is kept as it was: an
 * agent listed again keeps its debounce (round 49's `laneDebounce.test.ts`), and a building keeps a role room whose
 * agents left (design choice S4: a seek does not forget the role rooms of a building that stayed).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TeamSnapshot } from "@crewhub/loops-client";
import { emptyMemory, type PresentationMemory } from "../src/memory.ts";
import type { WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import { FakeSource, ManualScheduler, T0, lane, project, registered, snapshot, team } from "./helpers.ts";
import type { WorldInput } from "./helpers.ts";

const CL = project("crewhub-loops", "CL", "cl-lead");
const CR = project("creator", "CR", "cr-lead");
const AGENTS = [registered("cl-lead"), registered("cr-lead")];

function world(input: WorldInput) {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot(input) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now: number): WorldModel => {
    const result = reduceWorld(projection.facts, memory, { now, mode: "live", roleOverrides: {} });
    memory = result.memory;
    return result.model;
  };
  const teamUpdate = (t: TeamSnapshot) => projection.apply({ type: "team", team: t });
  const resnapshot = (next: WorldInput) => projection.apply({ type: "snapshot", snapshot: snapshot(next) });
  return { reduce, teamUpdate, resnapshot, memory: () => memory };
}

const workers = (n: number, from = 1) => Array.from({ length: n }, (_, i) => lane(`cl-dev-${from + i}`, "working", { lead: "cl-lead" }));

test("round 50 (M4): a worker whose session ended is forgotten, lane and place; the agents still listed keep theirs", () => {
  const { reduce, teamUpdate, memory } = world({ projects: [CL], agents: AGENTS, team: team(T0, [lane("cl-lead", "working"), ...workers(2)]) });
  reduce(T0);
  const keys = Object.keys(memory().lanes).sort();
  assert.equal(keys.length, 4, keys.join(", "));
  assert.ok(keys.includes("ekinsol/cl-dev-2"), keys.join(", "));
  const lead = structuredClone(memory().lanes["cl-lead"]);
  // A place is remembered only for an agent with two homes; these stand for the ones such workers would have.
  memory().locations["ekinsol/cl-dev-1"] = "crewhub-loops";
  memory().locations["ekinsol/cl-dev-2"] = "crewhub-loops";
  teamUpdate(team(T0 + 10_000, [lane("cl-lead", "working"), ...workers(1)]));
  reduce(T0 + 10_000);
  assert.equal(memory().lanes["ekinsol/cl-dev-2"], undefined);
  assert.equal(memory().locations["ekinsol/cl-dev-2"], undefined);
  assert.ok(memory().lanes["ekinsol/cl-dev-1"]);
  assert.ok(memory().locations["ekinsol/cl-dev-1"]);
  assert.deepEqual(memory().lanes["cl-lead"], lead, "a listed agent's lane is kept as it was");
});

test("round 50 (M4): workers coming and going all day leave a memory the size of the team, not of the day", () => {
  const { reduce, teamUpdate, memory } = world({ projects: [CL], agents: AGENTS, team: team(T0, [lane("cl-lead", "working")]) });
  for (let i = 0; i < 200; i += 1) {
    const now = T0 + (i + 1) * 10_000;
    teamUpdate(team(now, [lane("cl-lead", "working"), ...workers(3, i * 3 + 1)]));
    reduce(now);
  }
  // The two registered leads and the three workers of the last team snapshot.
  assert.equal(Object.keys(memory().lanes).length, 5);
});

test("round 50 (M4): a worker that comes back is seen afresh, its status at once, not the status it left with", () => {
  const { reduce, teamUpdate } = world({ projects: [CL], agents: AGENTS, team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-1", "blocked", { lead: "cl-lead" })]) });
  const posture = (model: WorldModel) => model.buildings[0]!.agents.find((a) => a.key === "ekinsol/cl-dev-1")?.posture;
  assert.equal(posture(reduce(T0)), "raised-hand");
  teamUpdate(team(T0 + 10_000, [lane("cl-lead", "working")]));
  assert.equal(posture(reduce(T0 + 10_000)), undefined);
  teamUpdate(team(T0 + 20_000, [lane("cl-lead", "working"), lane("cl-dev-1", "working", { lead: "cl-lead" })]));
  assert.equal(posture(reduce(T0 + 20_000)), "focused");
});

test("round 50 (M4): a building that is gone loses its role rooms; one that stayed keeps a role room its workers left (S4)", () => {
  const start: WorldInput = { projects: [CL, CR], agents: AGENTS, team: team(T0, [lane("cl-lead", "working"), lane("cr-lead", "working"), ...workers(1), lane("cr-dev-1", "working", { lead: "cr-lead" })]) };
  const { reduce, resnapshot, memory } = world(start);
  reduce(T0);
  assert.deepEqual(Object.keys(memory().roleRooms).sort(), ["creator", "crewhub-loops"]);
  assert.ok(memory().roleRooms["crewhub-loops"]?.worker !== undefined);
  // A seek back to before `creator` existed, and before the CL worker came: CL keeps its workers room, creator goes.
  resnapshot({ projects: [CL], agents: AGENTS, team: team(T0 + 10_000, [lane("cl-lead", "working")]) });
  const model = reduce(T0 + 10_000);
  assert.deepEqual(Object.keys(memory().roleRooms), ["crewhub-loops"]);
  const room = model.buildings[0]!.rooms.find((r) => r.kind === "workers");
  assert.equal(room?.present, false);
  assert.equal(room?.emptyLabel, "no worker agents active");
});
