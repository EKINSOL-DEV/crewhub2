/**
 * The scenarios: every one plays a full loop in loops shapes, deterministically, through the same projection and
 * reducer as the default storyline; Fresh install starts without a project and gets its first one from
 * `project.created`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toWorldEvent, validateEnvelope, validateLoopsSnapshot, validateTeamSnapshot } from "@crewhub/loops-client";
import type { Result, SourceMessage } from "@crewhub/loops-client";
import { Projection, emptyMemory, reduceWorld } from "@crewhub/world-model";
import type { WorldModel } from "@crewhub/world-model";
import { createManualScheduler } from "../src/scheduler.ts";
import { type ScenarioId, DEFAULT_SCENARIO, SCENARIO_IDS, demoScenario, demoScenarios, parseScenarioId } from "../src/scenarios.ts";
import { createDemoSource } from "../src/source.ts";
import { envelopes } from "./helpers.ts";

function valid<T>(result: Result<T>, what: string): void {
  assert.ok(result.ok, result.ok ? what : `${what}: ${result.path} ${result.message}`);
}

/** Plays `demoMs` of the scenario at 16x and returns what it sent. */
function play(scenario: ScenarioId, demoMs: number, seed?: number) {
  const scheduler = createManualScheduler(1_000);
  const source = createDemoSource({ scheduler, speed: 16, scenario, ...(seed === undefined ? {} : { seed }) });
  const messages: SourceMessage[] = [];
  source.start((message) => messages.push(message));
  scheduler.advance(Math.ceil(demoMs / 16));
  return { source, scheduler, messages };
}

/** Plays the scenario through the projection and the reducer up to `demoMs`; returns the world then. */
async function worldAt(scenario: ScenarioId, demoMs: number): Promise<{ model: WorldModel; projection: Projection }> {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: 16, scenario });
  const projection = new Projection(source, { coalesceMs: 0 });
  let memory = emptyMemory();
  let model: WorldModel | null = null;
  source.start((message) => projection.apply(message));
  for (let demo = 0; demo <= demoMs; demo += 16_000) {
    scheduler.advance(1_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = reduceWorld(projection.facts, memory, { now: source.now(), mode: "demo", roleOverrides: {} });
    memory = result.memory;
    model = result.model;
  }
  return { model: model as WorldModel, projection };
}

test("the picker lists every scenario once, smallest first, and Small team is the default", () => {
  const scenarios = demoScenarios();
  assert.deepEqual(scenarios.map((s) => s.id), [...SCENARIO_IDS]);
  assert.equal(DEFAULT_SCENARIO, "small-team");
  assert.equal(parseScenarioId("fresh"), "fresh");
  assert.equal(parseScenarioId("nonsense"), "small-team");
  assert.equal(parseScenarioId(null), "small-team");
  // One town document per scenario; the default keeps the store the world always used.
  assert.equal(new Set(scenarios.map((s) => s.townKey)).size, scenarios.length);
  assert.equal(demoScenario("small-team").townKey, "crewhub-world");
  const projects = scenarios.map((s) => s.content.projects.filter((p) => p.archivedAgo === null).length);
  assert.deepEqual(projects, [...projects].sort((a, b) => a - b));
});

for (const id of SCENARIO_IDS) {
  test(`${id}: a loop and the start of the next pass the loops-client validators`, () => {
    const { messages } = play(id, demoScenario(id).story.durationMs + 20_000);
    assert.equal(messages.filter((m) => m.type === "snapshot").length, 2);
    for (const message of messages) {
      if (message.type === "snapshot") valid(validateLoopsSnapshot(message.snapshot), "snapshot");
      if (message.type === "team") valid(validateTeamSnapshot(message.team), "team");
      if (message.type === "event") {
        valid(validateEnvelope(message.envelope), `${message.envelope.type} #${message.envelope.seq}`);
        const typed = toWorldEvent(message.envelope);
        assert.notEqual(typed, null, `${message.envelope.type} is on the world's allowlist`);
        if (typed !== null) valid(typed, `${message.envelope.type} #${message.envelope.seq} payload`);
      }
    }
  });

  test(`${id}: the same seed gives a byte-identical stream, and the projection skips nothing`, async () => {
    const duration = demoScenario(id).story.durationMs;
    assert.equal(JSON.stringify(play(id, duration, 7).messages), JSON.stringify(play(id, duration, 7).messages));
    const { projection } = await worldAt(id, duration - 20_000);
    assert.equal(projection.facts.invalidEvents, 0);
    assert.equal(projection.facts.skippedEvents, 0);
    projection.dispose();
  });
}

test("Fresh install: no project at the start, then the person creates the first one as loops emits it", async () => {
  const { source, messages, scheduler } = play("fresh", 50_000);
  const first = messages[0];
  assert.ok(first?.type === "snapshot");
  assert.deepEqual(first.snapshot.projects, []);
  assert.deepEqual(first.snapshot.archivedProjects, []);
  assert.deepEqual(first.snapshot.boards, {});
  assert.equal(await source.getProject("field-notes"), null);
  assert.deepEqual(first.snapshot.team.sessions[0]?.agents.map((a) => a.name), ["g-man", "postman"]);

  scheduler.advance(20_000 / 16);
  const created = envelopes(messages).filter((e) => e.type === "project.created");
  assert.equal(created.length, 1);
  const event = created[0]!;
  assert.deepEqual(event.project, { slug: "field-notes", key: "FN" });
  assert.deepEqual(event.actor, { id: "nicky", kind: "user" });
  assert.deepEqual(event.payload, {
    slug: "field-notes",
    key: "FN",
    leadId: "fn-lead",
    changed: ["name", "key", "leadId", "color", "icon", "description"],
    old: {},
    new: {
      name: "Field Notes",
      key: "FN",
      leadId: "fn-lead",
      color: "mist",
      icon: "folder",
      description: "A small notes app: the first project of this installation.",
    },
  });
  const project = await source.getProject("field-notes");
  assert.equal(project?.lead.id, "fn-lead");
  assert.equal(project?.revision, 1);
  assert.equal(project?.ticketTotal, 0);
  assert.deepEqual((await source.getBoard("field-notes"))?.columns.map((c) => c.tickets.length), [0, 0, 0, 0, 0]);
});

test("Fresh install: the world has no building, then one; the operator and the postman are there throughout", async () => {
  const before = await worldAt("fresh", 30_000);
  assert.deepEqual(before.model.buildings, []);
  before.projection.dispose();
  const after = await worldAt("fresh", 4 * 60_000);
  assert.deepEqual(after.model.buildings.map((b) => b.slug), ["field-notes"]);
  after.projection.dispose();
});

test("Fresh install: a prop request made before the first project waits for it, and still lands", async () => {
  const { source, scheduler } = play("fresh", 10_000);
  const request = source.createPropRequest("a bench");
  assert.equal(request.project, "Field Notes");
  assert.ok(request.startsAtMs >= demoScenario("fresh").props.fromMs);
  scheduler.advance((5 * 60_000) / 16);
  const board = await source.getBoard("field-notes");
  const titles = board?.columns.flatMap((c) => c.tickets.map((t) => t.title)) ?? [];
  assert.ok(titles.includes("Prop: a bench"), titles.join(", "));
  // The chat works without a project too.
  const message = source.sendDm("g-man", "Hello", "client-1");
  assert.equal(message.author.id, "nicky");
});

test("One project: one building with its lead and two workers", async () => {
  const { model, projection } = await worldAt("one", 60_000);
  assert.deepEqual(model.buildings.map((b) => b.slug), ["pocket-garden"]);
  const { messages } = play("one", 1_000);
  const first = messages[0];
  assert.ok(first?.type === "snapshot");
  const lanes = first.snapshot.team.sessions[0]?.agents ?? [];
  assert.deepEqual(lanes.filter((a) => a.lead === "pg-lead").map((a) => a.name), ["pg-dev-1", "pg-design-1"]);
  projection.dispose();
});

test("no scenario but Studio has groups: the future field stays out of the stream", async () => {
  for (const id of ["fresh", "one", "small-team"] as const) {
    const { source, messages } = play(id, 90_000);
    assert.deepEqual(await source.listProjectGroups(), []);
    assert.ok(!JSON.stringify(messages).includes("groupId"));
  }
});
