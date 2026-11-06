/**
 * Design choice S4 (`forget`, round 72): in the demo a new snapshot (a seek, a new loop) forgets the role rooms, so
 * they come again as the story brings them; before, a room once seen stayed for the page's life, and after a seek back
 * rooms that appear only later in the story stood there empty ("no worker agents active") before anybody of that role
 * had come. In live mode a new snapshot keeps them (there is no story to replay; memoryPrune.test.ts), and in the demo
 * a team update without a new snapshot keeps them too.
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
const AGENTS = [registered("cl-lead")];
const withWorker = (ts: number) => team(ts, [lane("cl-lead", "working"), lane("cl-dev-1", "working", { lead: "cl-lead" })]);
const leadAlone = (ts: number) => team(ts, [lane("cl-lead", "working")]);

function world(mode: "demo" | "live", input: WorldInput) {
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot(input) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now: number): WorldModel => {
    const result = reduceWorld(projection.facts, memory, { now, mode, roleOverrides: {} });
    memory = result.memory;
    return result.model;
  };
  const teamUpdate = (t: TeamSnapshot) => projection.apply({ type: "team", team: t });
  const resnapshot = (next: WorldInput) => projection.apply({ type: "snapshot", snapshot: snapshot(next) });
  return { reduce, teamUpdate, resnapshot, memory: () => memory };
}

const workersRoom = (model: WorldModel) => model.buildings[0]!.rooms.find((r) => r.kind === "workers");

test("S4: in the demo a seek back to before the worker came forgets the workers room; it comes again with the worker", () => {
  const { reduce, resnapshot, memory } = world("demo", { projects: [CL], agents: AGENTS, team: withWorker(T0) });
  assert.equal(workersRoom(reduce(T0))?.present, true);
  resnapshot({ projects: [CL], agents: AGENTS, team: leadAlone(T0 - 60_000) });
  assert.equal(workersRoom(reduce(T0 - 60_000)), undefined, "no empty workers room before anybody of that role has come");
  assert.equal(memory().roleRooms["crewhub-loops"]?.worker, undefined, "the memory forgot when the worker first came");
  resnapshot({ projects: [CL], agents: AGENTS, team: withWorker(T0) });
  assert.equal(workersRoom(reduce(T0))?.present, true);
});

test("S4: in the demo a team update without a new snapshot keeps a role room its worker left", () => {
  const { reduce, teamUpdate } = world("demo", { projects: [CL], agents: AGENTS, team: withWorker(T0) });
  reduce(T0);
  teamUpdate(leadAlone(T0 + 10_000));
  const room = workersRoom(reduce(T0 + 10_000));
  assert.equal(room?.present, false);
  assert.equal(room?.emptyLabel, "no worker agents active");
});

test("S4: in live mode a new snapshot keeps the role rooms, as before", () => {
  const { reduce, resnapshot } = world("live", { projects: [CL], agents: AGENTS, team: withWorker(T0) });
  reduce(T0);
  resnapshot({ projects: [CL], agents: AGENTS, team: leadAlone(T0 + 10_000) });
  const room = workersRoom(reduce(T0 + 10_000));
  assert.equal(room?.present, false);
  assert.equal(room?.emptyLabel, "no worker agents active");
});
