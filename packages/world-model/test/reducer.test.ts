import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope, TeamSnapshot, TicketCard } from "@crewhub/loops-client";
import { CLOSING_MS } from "../src/archive.ts";
import { describeWorld } from "../src/describe.ts";
import { PERSON_CARRY_MS } from "../src/flights.ts";
import { emptyMemory } from "../src/memory.ts";
import type { PresentationMemory } from "../src/memory.ts";
import type { AgentKey, RoleId, WorldModel } from "../src/model.ts";
import { Projection } from "../src/projection.ts";
import { roleNoun, roleWords } from "../src/roleWords.ts";
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
  // A person carries CL-2 to the Done rack first; the celebration follows the landing (person.test.ts).
  assert.equal(objects.find((o) => o.key === "CL-2")?.celebrateUntil, null);
  assert.equal(objects.find((o) => o.key === "CL-2")?.transit?.carrier, "person");
  assert.equal(building(reduce(T0 + PERSON_CARRY_MS)).objects.find((o) => o.key === "CL-2")?.celebrateUntil, T0 + PERSON_CARRY_MS + 6_000);
  assert.equal(building(reduce(T0 + PERSON_CARRY_MS + 7_000)).objects.find((o) => o.key === "CL-2")?.celebrateUntil, null);
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

test("each role says where it came from: the project lead, the CrewHub lead, the postman, an external bot, a -lead suffix, the naming convention, loops' own role, the team snapshot", () => {
  const { reduce } = world({
    projects: [CL],
    agents: [
      registered("cl-lead"),
      registered("chief", "lead", { isCrewhubLead: true, projects: { lead: [], member: [{ slug: "crewhub-loops", key: "CL" }] } }),
      registered("postman", "router"),
      registered("seed-bot", "lead", { external: true, projects: { lead: [], member: [{ slug: "crewhub-loops", key: "CL" }] } }),
      registered("ux-lead", "lead", { projects: { lead: [], member: [{ slug: "crewhub-loops", key: "CL" }] } }),
      registered("g-man", "lead", { projects: { lead: [], member: [{ slug: "crewhub-loops", key: "CL" }] } }),
      // A name never outranks loops: a router or an external bot named -lead is what loops says it is.
      registered("mail-lead", "router"),
      registered("bot-lead", "lead", { external: true, projects: { lead: [], member: [{ slug: "crewhub-loops", key: "CL" }] } }),
    ],
    team: team(T0, [lane("cl-lead", "working"), lane("cl-dev-2", "working", { lead: "cl-lead" }), lane("cl-design-1", "working", { lead: "cl-lead" }), lane("Ada", "working", { lead: "cl-lead" }), lane("review-lead", "working", { lead: "cl-lead" })]),
  });
  const model = reduce();
  const inBuilding = building(model).agents;
  const of = (name: string) => {
    const a = [...inBuilding, ...model.postOffice, ...model.townHall].find((x) => x.name === name);
    return [a?.role, a?.roleSource, a?.room];
  };
  assert.deepEqual(of("cl-lead"), ["lead", "project-lead", "lead-office"]);
  assert.deepEqual(of("chief"), ["lead", "crewhub-lead", "lead-office"]);
  assert.deepEqual(of("postman"), ["worker", "router", null]);
  assert.deepEqual(of("seed-bot"), ["worker", "external", "workers"]);
  assert.deepEqual(of("ux-lead"), ["lead", "name-suffix", "lead-office"]);
  assert.deepEqual(of("g-man"), ["worker", "loops-role", "workers"]);
  assert.deepEqual(of("cl-dev-2"), ["worker", "name-rule", "workers"]);
  assert.deepEqual(of("cl-design-1"), ["design", "name-rule", "design"]);
  assert.deepEqual(of("Ada"), ["worker", "team-worker", "workers"]);
  // The suffix is for registered agents only, and never over a loops fact.
  assert.deepEqual(of("review-lead"), ["worker", "team-worker", "workers"]);
  assert.deepEqual(of("mail-lead"), ["worker", "router", null]);
  assert.deepEqual(of("bot-lead"), ["worker", "external", "workers"]);
  // The words say the same, and only the name rules are inferences.
  const lines = describeWorld(model);
  const line = (name: string) => lines.find((l) => l.text.startsWith(`${name} is `))!;
  assert.match(line("cl-lead").text, /^cl-lead is lead, the project lead; /);
  assert.match(line("chief").text, /^chief is lead, the CrewHub lead; /);
  assert.match(line("seed-bot").text, /^seed-bot is an external bot; /);
  assert.match(line("ux-lead").text, /^ux-lead is lead, from the -lead in its name; /);
  assert.match(line("g-man").text, /^g-man is worker, a registered agent \(loops role lead\); /);
  assert.match(line("cl-dev-2").text, /^cl-dev-2 is worker, from its name; /);
  assert.match(line("Ada").text, /^Ada is worker, under its lead in the team snapshot; /);
  assert.deepEqual(
    ["cl-lead", "chief", "seed-bot", "ux-lead", "g-man", "cl-dev-2", "Ada"].map((n) => line(n).kind),
    ["fact", "fact", "fact", "inference", "fact", "inference", "fact"],
  );
  assert.match(lines.find((l) => l.text.startsWith("postman is the postman"))?.text ?? "", /^postman is the postman, at the post office: /);
  assert.deepEqual([roleWords("lead", "override", "you"), roleWords("design", "override"), roleNoun("worker", "router"), roleNoun("worker", "external"), roleNoun("lead", "project-lead")], ["lead, set by you", "design, set by a person", "postman", "external bot", "lead"]);
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

test("the source's own principal (the observer) gets no figure and no count, and the text view says it is not shown", () => {
  const w = world({
    projects: [CL],
    agents: [registered("cl-lead"), registered("crewhub-world", "lead", { external: true, herdrSession: "external:none" }), registered("crewhub-world-seed", "lead", { external: true, herdrSession: "external:none" })],
    team: team(T0, [lane("cl-lead", "working")]),
  });
  const shown = () => [...w.reduce().buildings.flatMap((b) => b.agents), ...w.reduce().townHall, ...w.reduce().postOffice].map((a) => a.key).sort();
  assert.deepEqual(shown(), ["cl-lead", "crewhub-world", "crewhub-world-seed"], "without an observer every external bot stands in the town hall");
  assert.equal(w.reduce().observer, null);
  w.projection.apply({ type: "snapshot", snapshot: { ...snapshot({ projects: [CL], agents: [registered("cl-lead"), registered("crewhub-world", "lead", { external: true }), registered("crewhub-world-seed", "lead", { external: true })], team: team(T0, [lane("cl-lead", "working")]) }), observer: "crewhub-world" } });
  const model = w.reduce();
  assert.deepEqual(shown(), ["cl-lead", "crewhub-world-seed"], "the observer is hidden; the other external bot stays");
  assert.equal(model.observer, "crewhub-world");
  const text = describeWorld(model).map((l) => l.text);
  assert.ok(text.includes("crewhub-world (this world's key) is not shown: it is the observer, not a worker."), text.join("\n"));
  assert.ok(!text.some((l) => /crewhub-world is in the/.test(l)));
});

test("a closed building says since when and by whom, and plays a closing or an opening once after the event", () => {
  const archivedProject = project("old-site", "OS", "os-lead", { archivedAt: "2026-09-20T08:00:00Z", archivedBy: userRef("nicky", "Nicky") });
  const { reduce, event } = world({ projects: [CL], archivedProjects: [archivedProject], agents: [registered("cl-lead")] });
  const closed = building(reduce(), "old-site");
  assert.equal(closed.archived, true);
  assert.equal(closed.archivedAt, "2026-09-20T08:00:00Z");
  assert.equal(closed.archivedBy, "Nicky");
  assert.equal(closed.closing, null, "a snapshot plays no closing");
  const text = describeWorld(reduce()).map((l) => l.text).join("\n");
  assert.match(text, /OS\) is boarded up: the project is archived, closed since 20 Sep 2026 \(11 days\)/);
  assert.match(text, /Boarded up: archived, closed since 20 Sep 2026 \(11 days\), by Nicky\. It can still be entered\./);

  // The active building closes: its window starts at the event's time and ends CLOSING_MS later.
  const at = T0 + 60_000;
  event(envelope("project.archived", { changed: ["archivedAt"], old: { archivedAt: null }, new: { archivedAt: new Date(at).toISOString() } }, { seq: 1101, ts: new Date(at).toISOString() }));
  const closing = building(reduce(at + 500));
  assert.equal(closing.archived, true);
  assert.equal(closing.archivedAt, new Date(at).toISOString());
  assert.deepEqual(closing.closing, { kind: "closing", at, until: at + CLOSING_MS });
  assert.match(describeWorld(reduce(at + 500)).map((l) => l.text).join("\n"), /CL\) is closing: the lights go out and the boards come down/);
  assert.equal(building(reduce(at + CLOSING_MS)).closing, null, "the window is over");

  // Restored: an opening, and the building is active again without a date.
  const back = at + 120_000;
  event(envelope("project.restored", { changed: ["archivedAt"], old: {}, new: { archivedAt: null } }, { seq: 1102, ts: new Date(back).toISOString() }));
  const opening = building(reduce(back + 10));
  assert.equal(opening.archived, false);
  assert.equal(opening.archivedAt, null);
  assert.deepEqual(opening.closing, { kind: "opening", at: back, until: back + CLOSING_MS });
  assert.match(describeWorld(reduce(back + 10)).map((l) => l.text).join("\n"), /CL\) opens again: the boards come off/);
});

test("round 33: the freshness cutoff is a team snapshot older than 300 s: at exactly 300 s it is fresh, at 301 s stale", () => {
  const fresh = world({ projects: [CL], team: team(T0 - 300_000, [lane("cl-lead", "working")]) }).reduce();
  assert.equal(fresh.freshness.stale, false);
  assert.equal(fresh.freshness.ageSeconds, 300);
  assert.equal(building(fresh).agents[0]?.laneStatus, "working", "a snapshot 300 s old still tells the lanes");
  const stale = world({ projects: [CL], team: team(T0 - 301_000, [lane("cl-lead", "working")]) }).reduce();
  assert.equal(stale.freshness.stale, true);
  assert.equal(building(stale).agents[0]?.laneStatus, "unknown");
});
