/**
 * The four shapes the world had wrong against crewhub-loops (docs/LOOPS_GAP_ANALYSIS.md, D1, D2, D3 and D5), each fed
 * in the shape loops really sends through the validators and then through the projection and the reducer. The
 * payloads are copied from the loops code and its tests at `f55d1288`; `loops:` is a path in that repository.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateAgents, validateBoardResponse, validateCommentsResponse, validateTicket } from "@crewhub/loops-client";
import type { LabelOut, Result, TicketCard } from "@crewhub/loops-client";
import { describeWorld } from "../src/describe.ts";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { extractPropRequest, propRequestsFromFacts } from "../src/propRequests.ts";
import { reduceWorld } from "../src/reducer.ts";
import { emptyTownDocument } from "../src/townDocument.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, iso, lane, project, snapshot, team, ticketFrom } from "./helpers.ts";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../loops-client/test/fixtures/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;

function value<T>(result: Result<T>): T {
  if (!result.ok) assert.fail(`${result.path}: ${result.message}`);
  return result.value;
}

const CR = project("creator", "CR", "cr-lead");
const IN = project("inbox", "IN", "g-man");
const NICKY = { id: "nicky", kind: "user" as const };
const WHY = "Superseded by CL-30"; // loops:services/api/tests/test_api_reject.py

function world(cards: TicketCard[], extra: { now?: number } = {}) {
  const source = new FakeSource();
  const scheduler = new ManualScheduler();
  const projection = new Projection(source, { scheduler });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({ projects: [CR], boards: { creator: board(cards) }, team: team(T0, [lane("cr-lead", "working")]) }),
  });
  const memory = emptyMemory();
  let seq = 100;
  /** A `ticket.moved` by a person, as `_apply_move` emits it (loops:services/api/src/crewhub_loops/domain/board.py). */
  const move = (id: string, key: string, payload: Record<string, unknown>, ts = T0) => {
    seq += 1;
    const applied = projection.apply({
      type: "event",
      envelope: envelope("ticket.moved", payload, {
        seq,
        ts: iso(ts),
        project: { slug: "creator", key: "CR" },
        ticket: { id, key, title: `Ticket ${key}` },
        actor: NICKY,
      }),
    });
    assert.equal(applied, true);
  };
  const reduce = (now = extra.now ?? T0) => reduceWorld(projection.facts, memory, { now, mode: "demo", roleOverrides: {} }).model;
  const object = (key: string, now?: number) => reduce(now).buildings[0]!.objects.find((o) => o.key === key)!;
  return { source, scheduler, projection, move, reduce, object };
}

test("D1: an agent is placed in the buildings it leads and the ones it is a member of", () => {
  // loops:services/api/src/crewhub_loops/contracts/agents.py (AgentProjects); the answer is the one
  // loops:services/api/tests/test_api_agents_admin.py expects: cr-lead leads `creator` and is a member of `inbox`.
  const { agents } = value(validateAgents(fixture("agents.json")));
  const projection = new Projection(new FakeSource(), { scheduler: new ManualScheduler() });
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({ projects: [CR, IN], agents, team: team(T0, [lane("cr-lead", "working"), lane("g-man", "idle")]) }),
  });
  assert.equal(projection.facts.invalidEvents, 0);
  const model = reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {} }).model;
  const where = (slug: string) => model.buildings.find((b) => b.slug === slug)!.agents.filter((a) => a.key === "cr-lead").map((a) => a.role);
  assert.deepEqual(where("creator"), ["lead"]);
  // A member, not the lead: placed by the name rules (plan 4.2), in the building its membership names.
  assert.deepEqual(where("inbox"), ["worker"]);
  // g-man leads `inbox` in this world's projects (ProjectOut.lead) and is a member of nothing: one building.
  assert.deepEqual(model.buildings.flatMap((b) => b.agents.filter((a) => a.key === "g-man").map(() => b.slug)), ["inbox"]);
});

test("D2: a ticket and its comments with v as the number 1 are read, and the prop in them is found", async () => {
  // loops:services/api/src/crewhub_loops/contracts/richtext.py: `{"v":1,"profile":"ticket","doc":<TipTap JSON>}`;
  // the code node is `codeBlock` with `attrs.language` (loops:services/api/src/crewhub_loops/richtext/profiles.py).
  const lamp = readFileSync(new URL("../../../skills/prop-builder/references/examples/floor-lamp.json", import.meta.url), "utf8");
  const prop: LabelOut = { id: "lb_prop", name: "prop", color: "circle" };
  const { source, scheduler, projection } = world([card("t_41", "CR-41", "review", { labels: [prop] })]);
  const wire = {
    ...ticketFrom(card("t_41", "CR-41", "review", { title: "Prop: a lamp for the lobby", labels: [prop], version: 2 }), "creator", "CR"),
    body: { v: 1, profile: "ticket", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A lamp." }] }] } },
    bodyMarkdown: "A lamp.",
  };
  source.tickets.set("t_41", value(validateTicket(JSON.parse(JSON.stringify(wire)))));
  projection.apply({
    type: "event",
    envelope: envelope("ticket.updated", { changed: ["title"] }, { seq: 101, project: { slug: "creator", key: "CR" }, ticket: { id: "t_41", key: "CR-41", title: "Prop: a lamp for the lobby" } }),
  });
  await scheduler.advance(300);
  // The refetch was not thrown away: the card has the new title.
  assert.equal(projection.facts.cards.t_41?.card.title, "Prop: a lamp for the lobby");

  const comments = value(
    validateCommentsResponse({
      nextCursor: null,
      comments: [
        {
          id: "cm_1", ticketId: "t_41", parentId: null, rootId: "cm_1", author: { id: "cr-lead", kind: "agent", displayName: "CR lead" },
          kind: "normal", systemCode: null, deliveryId: null, bodyMarkdown: null, attachments: [], createdAt: iso(T0), editedAt: null, deletedAt: null,
          body: { v: 1, profile: "ticket", doc: { type: "doc", content: [{ type: "codeBlock", attrs: { language: "json" }, content: [{ type: "text", text: lamp }] }] } },
        },
        {
          // A system comment: `{"v":1,"system":{"code","lead","detail"}}`, no Markdown (loops:.../api/serializers.py, comments_out).
          id: "cm_2", ticketId: "t_41", parentId: null, rootId: "cm_2", author: { id: "system", kind: "system", displayName: "System" },
          kind: "system", systemCode: "uncertain", deliveryId: "dl_1", bodyMarkdown: null, attachments: [], createdAt: iso(T0 + 1000), editedAt: null, deletedAt: null,
          body: { v: 1, system: { code: "uncertain", lead: "cr-lead", detail: null } },
        },
      ],
    }),
  ).comments;
  const extracted = extractPropRequest({ key: "CR-41", labels: [prop] }, comments);
  assert.ok(extracted.ok);
  assert.equal(extracted.prop.id, "user:floor-lamp");
});

test("D3: labelsCleared removes only the labels it names, and the move is not dropped", () => {
  // loops:services/api/tests/test_domain_board.py, test_leaving_in_progress_clears_the_deploy_label_with_history:
  // labels ["awaiting-deploy", "frontend"] become ["frontend"], and `ev["labelsCleared"] == ["awaiting-deploy"]`.
  const labels: LabelOut[] = [
    { id: "lb_d", name: "awaiting-deploy", color: "tangerine" },
    { id: "lb_f", name: "frontend", color: "mist" },
  ];
  const { projection, move, object } = world([card("t_2", "CR-2", "in_progress", { labels, assignee: { id: "cr-lead", kind: "agent", displayName: "CR lead" } })]);
  // A deploy moves its tickets to Review (loops:services/api/src/crewhub_loops/domain/deploys.py, `_move_snapshot`).
  move("t_2", "CR-2", (fixture("envelope-ticket-moved-deploy.json").payload as Record<string, unknown>));
  assert.equal(projection.facts.invalidEvents, 0);
  assert.equal(projection.facts.cards.t_2?.card.status, "review");
  assert.deepEqual(projection.facts.cards.t_2?.card.labels?.map((l) => l.name), ["frontend"]);
  assert.deepEqual(object("CR-2", T0 + 10_000).labels, ["frontend"]);
  assert.equal(object("CR-2", T0 + 10_000).room, "review");
  // The old shape, a boolean, is what loops never sends: it is counted as invalid and changes nothing.
  move("t_2", "CR-2", { from: "review", to: "planned", position: 1, labelsCleared: true });
  assert.equal(projection.facts.invalidEvents, 1);
  assert.equal(projection.facts.cards.t_2?.card.status, "review");
});

test("D5: a rejection goes to Dispatch without a celebration, and says so in the text view", () => {
  // loops:services/api/tests/test_api_reject.py, test_a_person_rejects_with_a_reason: the event payload has
  // `(to, resolution, resolutionReason) == ("done", "rejected", WHY)`.
  const rejected = fixture("envelope-ticket-moved-rejected.json").payload as Record<string, unknown>;
  assert.equal(rejected["resolutionReason"], WHY);
  const { projection, move, object, reduce } = world([card("t_1", "CR-1", "backlog"), card("t_3", "CR-3", "review")]);
  move("t_1", "CR-1", rejected);
  move("t_3", "CR-3", { from: "review", to: "done", position: 2000.0 });
  assert.equal(projection.facts.invalidEvents, 0);
  assert.deepEqual([projection.facts.cards.t_1?.card.resolution, projection.facts.cards.t_1?.card.resolutionReason], ["rejected", WHY]);

  const after = T0 + 5_000; // both drones have landed
  const turnedDown = object("CR-1", after);
  assert.deepEqual([turnedDown.room, turnedDown.status], ["dispatch", "done"]);
  assert.equal(turnedDown.celebrateUntil, null);
  assert.deepEqual(turnedDown.rejected, { reason: WHY });
  assert.ok(turnedDown.turnedDownUntil !== null);
  // A plain Done by a person is celebrated as before.
  const closed = object("CR-3", after);
  assert.ok(closed.celebrateUntil !== null);
  assert.deepEqual([closed.rejected, closed.turnedDownUntil], [null, null]);

  const lines = describeWorld(reduce(after)).map((l) => l.text);
  assert.ok(lines.some((t) => t.includes(`CR-1`) && t.includes(`turned down (closed as won't do: "${WHY}")`)), lines.join("\n"));
  assert.ok(lines.some((t) => t === "CR-1 was just turned down by a person: no celebration."));
  assert.ok(!lines.some((t) => t.startsWith("CR-1 was just moved to done")));
  assert.ok(lines.some((t) => t === "CR-3 was just moved to done by a person."));
  // Later the gesture is over; the object keeps its look.
  assert.equal(object("CR-1", T0 + 60_000).turnedDownUntil, null);
  assert.deepEqual(object("CR-1", T0 + 60_000).rejected, { reason: WHY });
});

test("D5: a Done ticket rejected afterwards (from == to == done), a reorder, a reopen and a plain Done after all", () => {
  // loops:services/api/tests/test_api_reject.py: test_a_done_ticket_can_be_rejected_and_a_reorder_keeps_it,
  // test_reopening_clears_the_resolution_and_the_history_keeps_it,
  // test_an_explicit_null_makes_a_rejected_ticket_a_plain_done. The payload keys are those of `_apply_move`.
  const { projection, move, object } = world([card("t_1", "CR-1", "review")]);
  move("t_1", "CR-1", { from: "review", to: "done", position: 1000.0 }, T0);
  assert.ok(object("CR-1", T0 + 5_000).celebrateUntil !== null);

  const t1 = T0 + 60_000;
  move("t_1", "CR-1", { from: "done", to: "done", position: 1000.0, resolution: "rejected", resolutionReason: WHY }, t1);
  let o = object("CR-1", t1 + 1_000);
  assert.deepEqual([o.rejected, o.celebrateUntil, o.transit], [{ reason: WHY }, null, null]);
  assert.ok(o.turnedDownUntil !== null);

  // A reorder inside Done names no resolution and keeps it: still rejected, no new gesture, no celebration.
  const t2 = t1 + 60_000;
  move("t_1", "CR-1", { from: "done", to: "done", position: 500.0 }, t2);
  o = object("CR-1", t2 + 1_000);
  assert.deepEqual([o.rejected, o.celebrateUntil, o.turnedDownUntil], [{ reason: WHY }, null, null]);

  // An explicit null makes it a plain Done: `resolutionCleared`.
  const t3 = t2 + 60_000;
  move("t_1", "CR-1", { from: "done", to: "done", position: 500.0, resolutionCleared: true }, t3);
  assert.equal(object("CR-1", t3 + 1_000).rejected, null);
  assert.equal(projection.facts.cards.t_1?.card.resolution, null);

  // Rejected again, then reopened: the resolution goes with the status.
  move("t_1", "CR-1", { from: "done", to: "done", position: 500.0, resolution: "rejected", resolutionReason: WHY }, t3 + 1_000);
  move("t_1", "CR-1", { from: "done", to: "planned", position: 1000.0, resolutionCleared: true }, t3 + 2_000);
  o = object("CR-1", t3 + 60_000);
  assert.deepEqual([o.status, o.rejected, o.turnedDownUntil, o.celebrateUntil], ["planned", null, null, null]);
  assert.equal(projection.facts.invalidEvents, 0);
});

test("D5: a rejected card that arrives on a board is drawn as rejected, without a gesture", () => {
  // loops:services/api/tests/test_api_reject.py: the Done column holds `("CR-1", "rejected", WHY)`.
  const wire = { ...card("t_1", "CR-1", "done"), resolution: "rejected", resolutionReason: WHY };
  const cards = value(validateBoardResponse({ columns: [{ status: "done", tickets: [JSON.parse(JSON.stringify(wire))] }] })).columns[0]!.tickets;
  const { object } = world(cards);
  const o = object("CR-1");
  assert.deepEqual([o.rejected, o.turnedDownUntil, o.celebrateUntil], [{ reason: WHY }, null, null]);
});

test("D5: a rejected prop request is not imported; a plain Done after all is", () => {
  const prop: LabelOut = { id: "lb_prop", name: "prop", color: "circle" };
  const doc = emptyTownDocument();
  const requests = (w: ReturnType<typeof world>) => propRequestsFromFacts(w.projection.facts, doc).map((r) => r.ticketKey);

  // Rejected from Review.
  const a = world([card("t_41", "CR-41", "review", { labels: [prop] })]);
  a.move("t_41", "CR-41", { from: "review", to: "done", position: 1000.0, resolution: "rejected", resolutionReason: WHY });
  assert.deepEqual(requests(a), []);
  // A person takes the rejection back inside Done: that is the acceptance.
  a.move("t_41", "CR-41", { from: "done", to: "done", position: 1000.0, resolutionCleared: true });
  assert.deepEqual(requests(a), ["CR-41"]);

  // A plain Done is a request, as before; a reorder inside Done is not a new one.
  const b = world([card("t_41", "CR-41", "review", { labels: [prop] })]);
  b.move("t_41", "CR-41", { from: "review", to: "done", position: 1000.0 });
  assert.deepEqual(requests(b), ["CR-41"]);

  // Already Done and rejected when the world loaded, then reordered by a person: never a request.
  const c = world([card("t_41", "CR-41", "done", { labels: [prop], resolution: "rejected", resolutionReason: WHY })]);
  c.move("t_41", "CR-41", { from: "done", to: "done", position: 500.0 });
  assert.deepEqual(requests(c), []);
});
