/**
 * The scenarios: every one plays a full loop in loops shapes, deterministically, through the same projection and
 * reducer as the default storyline; Fresh install starts without a project and gets its first one from
 * `project.created`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toWorldEvent, validateEnvelope, validateLoopsSnapshot, validateTeamSnapshot } from "@crewhub/loops-client";
import type { Result, SourceMessage } from "@crewhub/loops-client";
import { Projection, describeWorld, emptyMemory, reduceWorld } from "@crewhub/world-model";
import type { WorldModel } from "@crewhub/world-model";
import { createManualScheduler } from "../src/scheduler.ts";
import { type ScenarioId, DEFAULT_SCENARIO, SCENARIO_IDS, demoScenario, demoScenarios, parseScenarioId } from "../src/scenarios.ts";
import { STUDIO_ARCHIVED } from "../src/scenarios/studio.ts";
import { createDemoSource } from "../src/source.ts";
import { at } from "../src/time.ts";
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
      if (message.type === "snapshot") {
        valid(validateLoopsSnapshot(message.snapshot), "snapshot");
        // The world's own key is the observer, as the live host sets it: listed as the external bot it is, hidden by the world.
        assert.equal(message.snapshot.observer, "crewhub-world");
        const bot = message.snapshot.agents.find((a) => a.id === "crewhub-world");
        assert.equal(bot?.external, true);
        assert.equal(bot?.lane, null);
        assert.equal(bot?.herdrSession, "external:none");
      }
      if (message.type === "team") valid(validateTeamSnapshot(message.team), "team");
      if (message.type === "event") {
        valid(validateEnvelope(message.envelope), `${message.envelope.type} #${message.envelope.seq}`);
        const typed = toWorldEvent(message.envelope);
        // `owner-request.updated` is the one type the world knows and skips by design (the owner's alone, CL-298).
        if (message.envelope.type !== "owner-request.updated") assert.notEqual(typed, null, `${message.envelope.type} is on the world's allowlist`);
        if (typed !== null) valid(typed, `${message.envelope.type} #${message.envelope.seq} payload`);
      }
    }
  });

  test(`${id}: the same seed gives a byte-identical stream, and the projection skips nothing`, async () => {
    const duration = demoScenario(id).story.durationMs;
    assert.equal(JSON.stringify(play(id, duration, 7).messages), JSON.stringify(play(id, duration, 7).messages));
    const { projection } = await worldAt(id, duration - 20_000);
    assert.equal(projection.facts.invalidEvents, 0);
    // Skipped by design: `owner-request.updated`, the owner's alone (CL-298); nothing else.
    const byDesign = play(id, duration - 20_000, 7).messages.filter((m) => m.type === "event" && m.envelope.type === "owner-request.updated").length;
    assert.equal(projection.facts.skippedEvents, byDesign);
    projection.dispose();
  });

  // Round 48 (r48-cl88): an event on a ticket makes the page read that ticket `coalesceMs` (250 ms) later. Against the
  // fake, the read goes over the network to a store that the loop's end rebuilds from the seed, while the page only
  // learns of the new loop when its stream comes back. A ticket the loop made itself is gone then: a 404 and the
  // browser's "Failed to load resource" line (small team's 15:56 comment on the 0.9.0 carrier, CL-88, at the stub's 16x).
  // At the fastest speed, every event on such a ticket leaves the read a second of room before the loop ends.
  test(`${id}: at 16x, every event on a ticket the loop made leaves the page's read of it a second before the loop ends`, () => {
    const READ_AFTER_MS = 250; // the projection's default coalesceMs
    const ROOM_MS = 1_000;
    const scheduler = createManualScheduler(1_000);
    const source = createDemoSource({ scheduler, speed: 16, scenario: id });
    const sent: { wall: number; message: SourceMessage }[] = [];
    source.start((message) => sent.push({ wall: scheduler.now(), message }));
    scheduler.advance(Math.ceil((demoScenario(id).story.durationMs + 20_000) / 16));
    const end = sent.findIndex((s, i) => i > 0 && s.message.type === "snapshot");
    assert.ok(end > 0, "the loop ended");
    const loopEnd = sent[end]!.wall;
    const events = sent.slice(0, end).flatMap((s) => (s.message.type === "event" ? [{ wall: s.wall, envelope: s.message.envelope }] : []));
    const made = new Set(events.filter((e) => e.envelope.type === "ticket.created").flatMap((e) => (e.envelope.ticket ? [e.envelope.ticket.id] : [])));
    const names = (e: (typeof events)[number]) => (e.envelope.ticket !== null && made.has(e.envelope.ticket.id)) || ((e.envelope.payload["ticketIds"] as string[] | undefined) ?? []).some((t) => made.has(t));
    const late = events.filter((e) => names(e) && loopEnd - e.wall < READ_AFTER_MS + ROOM_MS);
    assert.deepEqual(late.map((e) => `${e.envelope.type} on ${e.envelope.ticket?.key} ${loopEnd - e.wall} ms before the loop's end`), []);
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

test("Studio: twenty projects in four groups of five, as the future field of proposal L22", async () => {
  const { source, messages } = play("studio", 1_000);
  const first = messages[0];
  assert.ok(first?.type === "snapshot");
  const { projects, archivedProjects, groups } = first.snapshot;
  // Nineteen open and one closed at the start: Translations (Lab) is archived, as OPS is in the small team.
  assert.equal(projects.length, 19);
  assert.deepEqual(archivedProjects.map((p) => [p.key, p.groupId]), [[STUDIO_ARCHIVED.key, "pg_demo_lab"]]);
  assert.deepEqual(groups?.map((g) => [g.slug, g.order]), [["apps", 1], ["platform", 2], ["brand", 3], ["lab", 4]]);
  assert.deepEqual(await source.listProjectGroups(), groups);
  for (const group of groups ?? []) assert.equal([...projects, ...archivedProjects].filter((p) => p.groupId === group.id).length, 5, group.name);
  assert.equal(new Set([...projects, ...archivedProjects].map((p) => p.key)).size, 20);
  // The looks are the town document's, one zone entry per group, each a different district at a glance.
  const zones = demoScenario("studio").townZones;
  assert.deepEqual(zones.map((z) => z.id), groups?.map((g) => g.id));
  assert.equal(new Set(zones.map((z) => z.look?.castId)).size, 4);
  assert.equal(new Set(zones.map((z) => `${z.look?.styleOptions?.["season"]} ${z.look?.styleOptions?.["planting"]}`)).size, 4);
  for (const id of ["fresh", "one", "small-team"] as const) assert.deepEqual(demoScenario(id).townZones, []);
});

test("Studio: the world is twenty buildings in four zones, dressed by the town document's looks", async () => {
  const scheduler = createManualScheduler();
  const source = createDemoSource({ scheduler, speed: 16, scenario: "studio" });
  const projection = new Projection(source, { coalesceMs: 0 });
  source.start((message) => projection.apply(message));
  scheduler.advance(1_000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const { model } = reduceWorld(projection.facts, emptyMemory(), {
    now: source.now(),
    mode: "demo",
    roleOverrides: {},
    zoning: { zones: demoScenario("studio").townZones },
  });
  assert.equal(model.buildings.length, 20);
  assert.deepEqual(model.zones.map((z) => [z.name, z.source, z.look.castId]), [
    ["Apps", "group", "classic-bots"],
    ["Platform", "group", "overgrown-bots"],
    ["Brand", "group", "sprouts"],
    ["Lab", "group", "potlings"],
  ]);
  for (const zone of model.zones) assert.equal(model.buildings.filter((b) => b.zoneId === zone.id).length, 5);
  // The closed building stands in Lab, boarded up, with nobody inside; its lead, whose only project is closed,
  // stands in the town hall; its two workers are not in the snapshot until the restore.
  const shelved = model.buildings.find((b) => b.key === STUDIO_ARCHIVED.key);
  assert.ok(shelved?.archived && shelved.zoneId === "pg_demo_lab" && shelved.agents.length === 0 && shelved.objects.length === 0);
  assert.equal(model.buildings.filter((b) => b.zoneId === "pg_demo_lab" && !b.archived).length, 4);
  const agents = new Set(model.buildings.flatMap((b) => b.agents.map((a) => a.key)));
  assert.equal(agents.size, 73, "nineteen leads and fifty-four workers in the open buildings");
  assert.ok(model.townHall.some((a) => a.key === shelved?.lead.id), "the closed project's lead is in the town hall");
  projection.dispose();
});

test("Studio: the closed project opens at 5:30 and closes again at 14:20, and nothing is written to it meanwhile", async () => {
  const { source, scheduler, messages } = play("studio", 0);
  const content = demoScenario("studio").content;
  const shelved = content.projects.find((p) => p.key === STUDIO_ARCHIVED.key);
  assert.ok(shelved && shelved.archivedAgo !== null);
  assert.ok(!content.lanes.some((l) => l.name.startsWith(`${STUDIO_ARCHIVED.key.toLowerCase()}-dev`)), "its workers are not in the first snapshot");
  const archivedAt = async () => (await source.getProject(shelved.slug))?.archivedAt ?? null;
  assert.ok((await archivedAt()) !== null, "closed at the start");
  scheduler.advance(at("6:00") / 16);
  assert.equal(await archivedAt(), null, "open at 6:00");
  scheduler.advance((at("15:00") - at("6:00")) / 16);
  assert.ok((await archivedAt()) !== null, "closed again at 15:00");
  const events = envelopes(messages);
  const base = Math.min(...events.map((e) => Date.parse(e.ts)));
  const restored = events.find((e) => e.type === "project.restored" && e.project?.key === STUDIO_ARCHIVED.key);
  const archived = events.find((e) => e.type === "project.archived" && e.project?.key === STUDIO_ARCHIVED.key);
  assert.ok(restored && archived && restored.actor.kind === "user" && archived.actor.kind === "user");
  assert.ok(Math.abs(Date.parse(restored.ts) - base - at(STUDIO_ARCHIVED.restoreAt)) < 3_000);
  assert.ok(Math.abs(Date.parse(archived.ts) - base - at(STUDIO_ARCHIVED.archiveAt)) < 3_000);
  // Every event of the project between the two is inside the open window; none before or after.
  const own = events.filter((e) => e.project?.key === STUDIO_ARCHIVED.key && e !== restored && e !== archived);
  assert.ok(own.length >= 5, `the open building is alive (${own.length} events)`);
  for (const e of own) assert.ok(Date.parse(e.ts) > Date.parse(restored.ts) && Date.parse(e.ts) < Date.parse(archived.ts), `${e.type} at ${e.ts} is inside the open window`);
});

test("Studio: a person is needed in at least two groups for almost the whole loop, and the truck comes by", async () => {
  const { source, scheduler, messages } = play("studio", 0);
  const content = demoScenario("studio").content;
  for (let minute = 1; minute <= 14; minute++) {
    scheduler.advance(60_000 / 16);
    const stalled = new Set(((await source.getWatchdog()).open ?? []).map((o) => o.ticket.key.split("-")[0]));
    const groups = new Set<string>();
    for (const project of content.projects) {
      const board = await source.getBoard(project.slug);
      const waits = board?.columns.some((c) => c.tickets.some((t) => t.waitingOnHuman)) ?? false;
      if (waits || stalled.has(project.key)) groups.add(project.groupId ?? "");
    }
    assert.ok(groups.size >= 2, `minute ${minute}: ${groups.size} groups need a person`);
  }
  scheduler.advance((2 * 60_000) / 16);
  const events = envelopes(messages);
  const reasons = new Set(events.filter((e) => e.type === "ticket.stalled").map((e) => (e.payload as { reason: string }).reason));
  assert.deepEqual([...reasons].sort(), ["attention", "stalled"]);
  const batches = new Set(events.filter((e) => e.type === "ticket.archived").map((e) => (e.payload as { batchId: string }).batchId));
  assert.equal(batches.size, 4, "two releases and two archive batches");
  assert.equal(events.filter((e) => e.type === "release.published").length, 1);
  assert.ok(events.filter((e) => e.type === "delivery.created").length > 40, "the postman keeps walking");
});

test("Studio: g-man's answer to \"Where am I needed\" counts what waits on Nicky when it is given (round 48)", async () => {
  // The reply is a fact a visitor can check against the town at that moment: the reviews that wait on a person and the
  // other tickets that do, read from the store as the reply's dm.created goes out.
  const scheduler = createManualScheduler(1_000);
  const source = createDemoSource({ scheduler, speed: 16, scenario: "studio" });
  const content = demoScenario("studio").content;
  let reply: { text: string; boards: Promise<unknown>[] } | null = null;
  source.start((message) => {
    if (reply !== null || message.type !== "event" || message.envelope.type !== "dm.created" || message.envelope.actor.id !== "g-man") return;
    const id = (message.envelope.payload as { messageId?: string }).messageId;
    reply = { text: id ?? "", boards: content.projects.map((p) => source.getBoard(p.slug)) };
  });
  scheduler.advance(at("3:10") / 16);
  assert.ok(reply !== null, "g-man answered");
  const { text: messageId, boards } = reply as { text: string; boards: Promise<unknown>[] };
  const message = (await source.getDmMessages("g-man")).find((m) => m.id === messageId);
  type Card = { status: string; waitingOn?: { kind?: string } | null };
  const tickets = (await Promise.all(boards)).flatMap((b) => ((b as { columns: { tickets: Card[] }[] } | null)?.columns ?? []).flatMap((c) => c.tickets));
  const onPerson = (t: Card) => t.waitingOn?.kind === "user";
  const reviews = tickets.filter((t) => t.status === "review" && onPerson(t)).length;
  const others = tickets.filter((t) => t.status !== "review" && onPerson(t)).length;
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const m = /^(\w+) reviews wait on you, and (\w+) tickets wait on an answer/.exec(message?.bodyText ?? "");
  assert.ok(m, message?.bodyText);
  assert.deepEqual([words.indexOf((m[1] as string).toLowerCase()), words.indexOf(m[2] as string)], [reviews, others], message?.bodyText);
});

test("no scenario but Studio has groups: the future field stays out of the stream", async () => {
  for (const id of ["fresh", "one", "small-team"] as const) {
    const { source, messages } = play(id, 90_000);
    assert.deepEqual(await source.listProjectGroups(), []);
    assert.ok(!JSON.stringify(messages).includes("groupId"));
  }
});

test("small team: the world's key is hidden as the observer and the text view says so; the other external bot stands in the town hall", async () => {
  const { model } = await worldAt("small-team", 0);
  assert.equal(model.observer, "crewhub-world");
  const figures = [...model.townHall, ...model.postOffice, ...model.buildings.flatMap((b) => b.agents)].map((a) => a.name);
  assert.ok(!figures.includes("crewhub-world"), `the observer is no figure: ${figures.join(", ")}`);
  assert.ok(model.townHall.some((a) => a.name === "ci-bot"), `the CI bot stands in the town hall: ${model.townHall.map((a) => a.name).join(", ")}`);
  const text = describeWorld(model).map((line) => line.text);
  assert.ok(text.includes("crewhub-world (this world's key) is not shown: it is the observer, not a worker."), text.filter((l) => /observer|ci-bot|CI bot/i.test(l)).join("\n"));
});
