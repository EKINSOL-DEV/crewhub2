import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope, TeamSnapshot, TicketCard } from "@crewhub/loops-client";
import { describeWorld } from "../src/describe.ts";
import { emptyMemory } from "../src/memory.ts";
import type { PresentationMemory } from "../src/memory.ts";
import type { AgentKey, RoleId, WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";
import {
  FakeSource,
  ManualScheduler,
  T0,
  agentRef,
  board,
  card,
  envelope,
  lane,
  project,
  registered,
  snapshot,
  team,
  userRef,
} from "./helpers.ts";
import type { WorldInput } from "./helpers.ts";

function world(input: WorldInput) {
  const source = new FakeSource();
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  projection.apply({ type: "snapshot", snapshot: snapshot(input) });
  let memory: PresentationMemory = emptyMemory();
  const reduce = (now = T0, roleOverrides: Record<AgentKey, RoleId> = {}): WorldModel => {
    const result = reduceWorld(projection.facts, memory, { now, mode: "demo", roleOverrides });
    memory = result.memory;
    return result.model;
  };
  const event = (e: Envelope) => projection.apply({ type: "event", envelope: e });
  const teamUpdate = (t: TeamSnapshot) => projection.apply({ type: "team", team: t });
  return { projection, reduce, event, teamUpdate, source };
}

const CL = project("crewhub-loops", "CL", "cl-lead");
const building = (model: WorldModel, slug = "crewhub-loops") => {
  const found = model.buildings.find((b) => b.slug === slug);
  assert.ok(found, `building ${slug}`);
  return found;
};

test("status decides the room and kind decides the look", () => {
  const cards: TicketCard[] = [
    card("t1", "CL-1", "backlog", { kind: "task" }),
    card("t2", "CL-2", "planned", { kind: "feature" }),
    card("t3", "CL-3", "review", { kind: "bug" }),
    card("t4", "CL-4", "done", { kind: "question" }),
    card("t5", "CL-5", "in_progress", { kind: "task", assignee: agentRef("cl-lead") }),
  ];
  const { reduce } = world({ projects: [CL], boards: { "crewhub-loops": board(cards) }, team: team(T0, [lane("cl-lead", "working")]) });
  const objects = building(reduce()).objects;
  const summary = objects.map((o) => [o.key, o.room, o.look]);
  assert.deepEqual(summary, [
    ["CL-1", "storage", "folder"],
    ["CL-2", "planning", "box"],
    ["CL-5", "lead-office", "folder"],
    ["CL-3", "review", "bug-crate"],
    ["CL-4", "dispatch", "envelope"],
  ]);
  assert.equal(objects.find((o) => o.key === "CL-5")?.deskOf, "cl-lead");
});

test("an in-progress ticket without an agent lies in the lead's inbox", () => {
  const { reduce } = world({
    projects: [CL],
    boards: { "crewhub-loops": board([card("t1", "CL-1", "in_progress", { assignee: userRef("nicky", "Nicky") })]) },
  });
  const object = building(reduce()).objects[0];
  assert.equal(object?.room, "lead-office");
  assert.equal(object?.deskOf, null);
  assert.equal(object?.deskInferred, false);
});

test("a worker whose status line names the key gets the desk, labelled inferred", () => {
  const { reduce } = world({
    projects: [CL],
    boards: { "crewhub-loops": board([card("t7", "CL-7", "in_progress", { assignee: agentRef("cl-lead") })]) },
    team: team(T0, [
      lane("cl-lead", "idle"),
      lane("cl-dev-2", "working", { lead: "cl-lead", contextLine: "CL-7: fixing the probe" }),
    ]),
  });
  const b = building(reduce());
  const object = b.objects[0];
  assert.equal(object?.deskOf, "ekinsol/cl-dev-2");
  assert.equal(object?.deskInferred, true);
  assert.equal(object?.room, "workers");
  assert.equal(b.agents.find((a) => a.key === "ekinsol/cl-dev-2")?.deskTicketKey, "CL-7");
});

test("a lead of two projects has one real avatar and one proxy", () => {
  const A = project("alpha", "AL", "g-man");
  const B = project("beta", "BE", "g-man");
  const { reduce, event } = world({ projects: [A, B], team: team(T0, [lane("g-man", "working")]) });
  event(
    envelope(
      "ticket.progress",
      { ticket: "BE-3", agent: "g-man", kind: "update", text: "reviewing the plan" },
      { seq: 101, ts: new Date(T0 - 10_000).toISOString(), project: { slug: "beta", key: "BE" } },
    ),
  );
  const model = reduce();
  const inAlpha = building(model, "alpha").agents.find((a) => a.key === "g-man");
  const inBeta = building(model, "beta").agents.find((a) => a.key === "g-man");
  assert.equal(inBeta?.presence, "real");
  assert.equal(inBeta?.locationInferred, true);
  assert.equal(inBeta?.caption?.text, "reviewing the plan");
  assert.equal(inAlpha?.presence, "proxy");
  assert.equal(inAlpha?.workingIn, "beta");
  assert.equal(inAlpha?.caption, null);
});

test("a stale team snapshot makes every lane unknown and greyed", () => {
  const { reduce } = world({
    projects: [CL],
    team: team(T0 - 301_000, [lane("cl-lead", "working"), lane("cl-dev-1", "working", { lead: "cl-lead" })]),
  });
  const model = reduce();
  assert.equal(model.freshness.stale, true);
  for (const agent of building(model).agents) {
    assert.equal(agent.laneStatus, "unknown");
    assert.equal(agent.posture, "greyed");
  }
});

test("debounce: a working-idle-working flicker within 45 s never changes the posture", () => {
  const { reduce, teamUpdate } = world({ projects: [CL], team: team(T0, [lane("cl-lead", "working")]) });
  const posture = (now: number) => building(reduce(now)).agents[0]?.posture;
  assert.equal(posture(T0), "focused");
  teamUpdate(team(T0 + 10_000, [lane("cl-lead", "idle")]));
  assert.equal(posture(T0 + 10_000), "focused");
  teamUpdate(team(T0 + 20_000, [lane("cl-lead", "working")]));
  assert.equal(posture(T0 + 20_000), "focused");
  // A status that holds for two snapshots does become the posture.
  teamUpdate(team(T0 + 30_000, [lane("cl-lead", "blocked")]));
  assert.equal(posture(T0 + 30_000), "focused");
  teamUpdate(team(T0 + 40_000, [lane("cl-lead", "blocked")]));
  assert.equal(posture(T0 + 40_000), "raised-hand");
});

test("debounce: a status that holds 45 s without a new snapshot becomes the posture", () => {
  const { reduce, teamUpdate } = world({ projects: [CL], team: team(T0, [lane("cl-lead", "working")]) });
  reduce(T0);
  teamUpdate(team(T0 + 1_000, [lane("cl-lead", "idle")]));
  assert.equal(building(reduce(T0 + 1_000)).agents[0]?.posture, "focused");
  assert.equal(building(reduce(T0 + 46_000)).agents[0]?.posture, "relaxed");
});

test("a done lane is relaxed and never a ticket success; only a person's move to done celebrates", () => {
  const cards = [
    card("t1", "CL-1", "review", { assignee: agentRef("cl-lead") }),
    card("t2", "CL-2", "review", { assignee: agentRef("cl-lead") }),
  ];
  const { reduce, event } = world({ projects: [CL], boards: { "crewhub-loops": board(cards) }, team: team(T0, [lane("cl-lead", "done")]) });
  const lead = building(reduce()).agents[0];
  assert.equal(lead?.laneStatus, "done");
  assert.equal(lead?.posture, "relaxed");
  assert.ok(building(reduce()).objects.every((o) => o.celebrateUntil === null));

  const move = (seq: number, id: string, key: string, actor: Envelope["actor"]) =>
    envelope("ticket.moved", { from: "review", to: "done", position: 1 }, { seq, ticket: { id, key, title: key }, actor, ts: new Date(T0).toISOString() });
  event(move(101, "t1", "CL-1", { id: "cl-lead", kind: "agent" }));
  event(move(102, "t2", "CL-2", { id: "nicky", kind: "user" }));
  const objects = building(reduce(T0 + 1_000)).objects;
  assert.equal(objects.find((o) => o.key === "CL-1")?.celebrateUntil, null);
  assert.equal(objects.find((o) => o.key === "CL-2")?.celebrateUntil, T0 + 6_000);
  assert.equal(building(reduce(T0 + 7_000)).objects.find((o) => o.key === "CL-2")?.celebrateUntil, null);
});

test("an override beats the name rule", () => {
  const { reduce } = world({
    projects: [CL],
    team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-2", "working", { lead: "cl-lead" })]),
  });
  const byRule = building(reduce()).agents.find((a) => a.name === "cl-dev-2");
  assert.deepEqual([byRule?.role, byRule?.roleSource, byRule?.room], ["worker", "name-rule", "workers"]);
  const overridden = building(reduce(T0, { "ekinsol/cl-dev-2": "design" })).agents.find((a) => a.name === "cl-dev-2");
  assert.deepEqual([overridden?.role, overridden?.roleSource, overridden?.room], ["design", "override", "design"]);
});

test("name rules and places: design, analyst, postman, town hall", () => {
  const { reduce } = world({
    projects: [CL],
    agents: [registered("cl-lead"), registered("postman", "router"), registered("analyst"), registered("ted")],
    team: team(T0, [
      lane("cl-lead", "working"),
      lane("cl-design-7", "idle", { lead: "cl-lead" }),
      lane("cl-analyst-1", "idle", { lead: "cl-lead" }),
      lane("helper", "idle", { lead: "cl-lead" }),
    ]),
  });
  const model = reduce();
  const roles = Object.fromEntries(building(model).agents.map((a) => [a.name, a.role]));
  assert.deepEqual(roles, { "cl-lead": "lead", helper: "worker", "cl-analyst-1": "analyst", "cl-design-7": "design" });
  assert.deepEqual(model.postOffice.map((a) => a.key), ["postman"]);
  assert.deepEqual(model.townHall.map((a) => [a.key, a.role]), [["ted", "worker"], ["analyst", "analyst"]]);
});

test("a role room stays, dimmed, once its agents leave", () => {
  const { reduce, teamUpdate } = world({
    projects: [CL],
    team: team(T0, [lane("cl-lead", "working"), lane("cl-design-1", "working", { lead: "cl-lead" })]),
  });
  const design = (model: WorldModel) => building(model).rooms.find((r) => r.kind === "design");
  assert.equal(design(reduce())?.present, true);
  assert.equal(building(reduce()).rooms.some((r) => r.kind === "analyst"), false);
  teamUpdate(team(T0 + 30_000, [lane("cl-lead", "working")]));
  const room = design(reduce(T0 + 30_000));
  assert.equal(room?.present, false);
  assert.equal(room?.emptyLabel, "no design agents active");
});

test("stalls light a beacon and the desk; deliveries walk, hand over or park flagged", () => {
  const { reduce, event } = world({
    projects: [CL],
    agents: [registered("cl-lead"), registered("postman", "router")],
    boards: { "crewhub-loops": board([card("t9", "CL-9", "in_progress", { assignee: agentRef("cl-lead") })]) },
    team: team(T0, [lane("cl-lead", "idle"), lane("cl-dev-3", "blocked", { lead: "cl-lead" })]),
  });
  event(
    envelope(
      "ticket.stalled",
      {
        ticket: "CL-9",
        agent: "cl-lead",
        episode: 1,
        reason: "attention",
        quietSince: new Date(T0 - 12 * 60_000).toISOString(),
        quietMinutes: 12,
        members: [{ name: "cl-dev-3", status: "blocked" }],
        nudge: null,
      },
      { seq: 101 },
    ),
  );
  const created = (seq: number, id: string) =>
    envelope("delivery.created", { deliveryId: id, recipientId: "cl-lead", reason: "assigned" }, { seq });
  event(created(102, "dl_walk"));
  event(created(103, "dl_done"));
  event(created(104, "dl_flag"));
  event(envelope("delivery.updated", { deliveryId: "dl_done", state: "forwarded" }, { seq: 105 }));
  event(envelope("delivery.updated", { deliveryId: "dl_flag", state: "unroutable" }, { seq: 106 }));
  const model = reduce();
  const b = building(model);
  assert.deepEqual(b.beacons, [{ ticketKey: "CL-9", agent: "cl-dev-3", text: "attention: cl-dev-3 blocked 12 min" }]);
  assert.deepEqual(b.agents.find((a) => a.key === "cl-lead")?.alerts, ["CL-9 attention"]);
  assert.deepEqual(model.deliveries.map((d) => [d.deliveryId, d.toBuilding]), [["dl_walk", "crewhub-loops"]]);
  assert.deepEqual(b.mailbox.map((l) => [l.deliveryId, l.flagged]), [["dl_flag", true]]);
});

test("the meeting room appears when two principals comment on one ticket within 10 minutes", () => {
  const { reduce, event } = world({ projects: [CL], boards: { "crewhub-loops": board([card("t4", "CL-4", "review")]) } });
  const comment = (seq: number, actor: Envelope["actor"], ts: number) =>
    envelope("comment.created", { commentId: `c${seq}`, parentId: null }, { seq, actor, ts: new Date(ts).toISOString(), ticket: { id: "t4", key: "CL-4", title: "x" } });
  event(comment(101, { id: "nicky", kind: "user" }, T0 - 5 * 60_000));
  assert.equal(building(reduce()).rooms.some((r) => r.kind === "meeting"), false);
  event(comment(102, { id: "cl-lead", kind: "agent" }, T0 - 60_000));
  const meeting = building(reduce()).rooms.find((r) => r.kind === "meeting");
  assert.equal(meeting?.label, "Meeting room: discussing CL-4");
  assert.equal(building(reduce(T0 + 10 * 60_000)).rooms.some((r) => r.kind === "meeting"), false);
});

test("describeWorld has a line for every building, object and agent", () => {
  const archivedProject = project("old-site", "OS", "os-lead", { archivedAt: "2026-09-01T00:00:00Z" });
  const cards = [
    card("t1", "CL-1", "backlog", { held: true }),
    card("t2", "CL-2", "in_progress", { assignee: agentRef("cl-lead"), priority: "urgent" }),
    card("t3", "CL-3", "review", { waitingOn: userRef("nicky", "Nicky"), kind: "bug" }),
  ];
  const { reduce } = world({
    projects: [CL, project("product", "CR", "cr-lead")],
    archivedProjects: [archivedProject],
    agents: [registered("cl-lead"), registered("cr-lead"), registered("postman", "router"), registered("ted")],
    boards: { "crewhub-loops": board(cards), product: board([card("t8", "CR-8", "planned")]) },
    team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-1", "idle", { lead: "cl-lead" })]),
  });
  const model = reduce();
  const lines = describeWorld(model);
  const text = lines.map((l) => l.text).join("\n");
  assert.equal(lines[0]?.kind, "demo");
  for (const b of model.buildings) assert.ok(lines.some((l) => l.section === `${b.name} (${b.key})`), b.slug);
  for (const b of model.buildings) for (const o of b.objects) assert.match(text, new RegExp(`${o.key} "`));
  const agents = [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice];
  for (const a of agents) assert.ok(text.includes(a.displayName), a.key);
  assert.match(text, /in progress/);
  assert.match(text, /worker, from its name/);
  assert.match(text, /OS\) is boarded up/);
  assert.ok(lines.some((l) => l.kind === "inference" && l.text.includes("cl-dev-1")));
});

test("a stall counts its nudges and the text view names them, the dimmed lamp and the room's pile", () => {
  const { reduce, event } = world({
    projects: [CL],
    agents: [registered("cl-lead")],
    boards: {
      "crewhub-loops": board([
        card("t9", "CL-9", "in_progress", { assignee: agentRef("cl-lead") }),
        card("t10", "CL-10", "review", { labels: [{ id: "l1", name: "prop", color: "mist" }] }),
        card("t11", "CL-11", "review"),
      ]),
    },
    team: team(T0, [lane("cl-lead", "idle")]),
  });
  const stalled = (seq: number, nudge: unknown) =>
    envelope(
      "ticket.stalled",
      {
        ticket: "CL-9",
        agent: "cl-lead",
        episode: 1,
        reason: "stalled",
        quietSince: new Date(T0 - 47 * 60_000).toISOString(),
        quietMinutes: 47,
        members: [{ name: "cl-lead", status: "idle" }],
        nudge,
      },
      { seq },
    );
  event(stalled(101, 1));
  event(stalled(102, 2));
  const model = reduce();
  assert.deepEqual(building(model).objects.find((o) => o.key === "CL-9")?.stall, {
    state: "stalled",
    quietSince: new Date(T0 - 47 * 60_000).toISOString(),
    quietMinutes: 47,
    nudges: 2,
  });
  const text = describeWorld(model).map((l) => l.text).join("\n");
  assert.match(text, /CL-9 .*stalled, quiet 47 min, nudged 2 times, the desk lamp dimmed/);
  assert.match(text, /Review room: 2 tickets in the pile\./);
  assert.match(text, /CL-10 .*a star sticker: a prop request/);
});
