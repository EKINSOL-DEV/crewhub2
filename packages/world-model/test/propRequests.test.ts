import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { CommentOut, LabelOut, PrincipalKind } from "@crewhub/loops-client";
import type { PropModel } from "@crewhub/world-engine";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { extractPropRequest, importedPropId, placeFor, propRequestsFromFacts } from "../src/propRequests.ts";
import type { PropTicket } from "../src/propRequests.ts";
import { reduceWorld } from "../src/reducer.ts";
import { emptyTownDocument } from "../src/townDocument.ts";
import { FakeSource, ManualScheduler, T0, board, card, envelope, iso, lane, project, snapshot, team } from "./helpers.ts";

const lampJson = readFileSync(new URL("../../../skills/prop-builder/references/examples/floor-lamp.json", import.meta.url), "utf8");
const lamp = JSON.parse(lampJson) as PropModel;
const PROP_LABEL: LabelOut = { id: "lb_prop", name: "prop", color: "circle" };

let commentId = 0;
function comment(markdown: string | null, extra: Partial<CommentOut> = {}): CommentOut {
  commentId += 1;
  return {
    id: `cm_${commentId}`,
    ticketId: "t_41",
    rootId: `cm_${commentId}`,
    author: { id: "cr-lead", kind: "agent", displayName: "cr-lead" },
    kind: "normal",
    bodyMarkdown: markdown,
    createdAt: iso(T0 + commentId * 1000),
    ...extra,
  };
}
const fenced = (json: string) => `Prop ready for review.\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const ticket = (extra: Partial<PropTicket> = {}): PropTicket => ({
  key: "CR-41",
  title: "Prop: a reading lamp",
  labels: [PROP_LABEL],
  bodyMarkdown: "",
  project: { slug: "crewhub" },
  ...extra,
});

test("the prop is the most recent json block on the ticket, validated", () => {
  const ok = (comments: CommentOut[]) => {
    const result = extractPropRequest(ticket(), comments);
    assert.ok(result.ok, result.ok ? "" : result.error);
    return result;
  };
  const error = (comments: CommentOut[]) => {
    const result = extractPropRequest(ticket(), comments);
    assert.equal(result.ok, false);
    return result.ok ? "" : result.error;
  };

  assert.equal(error([comment("Working on it."), comment(null)]), "prop CR-41 has no json block in its comments");
  assert.match(error([comment(fenced('{ "format": "crewhub-prop/1", '))]), /^prop CR-41 is not valid JSON: /);
  const broken = structuredClone(lamp) as { parts: { size: number[] }[] };
  broken.parts[1]!.size[0] = 9;
  assert.match(error([comment(fenced(JSON.stringify(broken)))]), /^prop CR-41 is invalid: parts\[1\]\.size\[0\]: must be between 0 and 3/);

  const valid = ok([comment("Starting."), comment(fenced(lampJson))]);
  assert.equal(valid.prop.id, "user:floor-lamp");
  assert.deepEqual(valid.prop.provenance, { kind: "ticket", ticketKey: "CR-41" });

  // Two blocks: the last one wins, within one comment and across comments.
  const taller = JSON.stringify({ ...lamp, name: "Tall lamp" });
  assert.equal(ok([comment(`${fenced(lampJson)}\nOr this one:\n${fenced(taller)}`)]).prop.name, "Tall lamp");
  assert.equal(ok([comment(fenced(taller)), comment(fenced(lampJson))]).prop.name, lamp.name);

  // A corrected prop after an invalid one is imported; an invalid one after a valid one is not.
  const corrected = ok([comment(fenced(JSON.stringify(broken))), comment("Fixed the base."), comment(fenced(lampJson))]);
  assert.equal(corrected.prop.id, "user:floor-lamp");
  assert.match(error([comment(fenced(lampJson)), comment(fenced(JSON.stringify(broken)))]), /is invalid: parts\[1\]/);

  // Deleted and system comments are skipped; a tilde fence works too.
  assert.equal(
    ok([comment(`~~~json\n${lampJson}\n~~~`), comment(fenced(JSON.stringify(broken)), { deletedAt: iso(T0) })]).prop.id,
    "user:floor-lamp",
  );
  assert.match(extractPropRequest(ticket({ labels: [] }), [comment(fenced(lampJson))]).ok ? "" : "not a prop", /not a prop/);
});

test("without bodyMarkdown the rich body's json code node is read", () => {
  const rich = {
    v: "1",
    doc: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Prop ready." }] },
        { type: "codeBlock", attrs: { language: "json" }, content: [{ type: "text", text: lampJson }] },
      ],
    },
  };
  const result = extractPropRequest(ticket(), [comment(null, { body: rich })]);
  assert.ok(result.ok);
  assert.equal(result.prop.id, "user:floor-lamp");
});

function world(moveActor: PrincipalKind, labels: LabelOut[] = [PROP_LABEL]) {
  const source = new FakeSource();
  const projection = new Projection(source, { scheduler: new ManualScheduler() });
  const CR = project("crewhub", "CR", "cr-lead");
  projection.apply({
    type: "snapshot",
    snapshot: snapshot({
      projects: [CR],
      boards: { crewhub: board([card("t_41", "CR-41", "review", { title: "Prop: a lamp for the lobby", labels })]) },
      team: team(T0, [lane("cr-lead", "working"), lane("cr-dev-2", "working", { lead: "cr-lead" })]),
    }),
  });
  const actor = moveActor === "user" ? { id: "nicky", kind: "user" as const } : { id: "cr-lead", kind: moveActor };
  projection.apply({
    type: "event",
    envelope: envelope("ticket.moved", { from: "review", to: "done", position: 1 }, {
      project: { slug: "crewhub", key: "CR" },
      ticket: { id: "t_41", key: "CR-41", title: "Prop: a lamp for the lobby" },
      actor,
    }),
  });
  return projection;
}

test("only a person's Done on a prop ticket makes a request, once", () => {
  const requests = propRequestsFromFacts(world("user").facts, emptyTownDocument());
  assert.deepEqual(
    requests.map((r) => [r.ticketKey, r.slug, r.title, r.doneBy]),
    [["CR-41", "crewhub", "Prop: a lamp for the lobby", "nicky"]],
  );
  assert.deepEqual(propRequestsFromFacts(world("agent").facts, emptyTownDocument()), []);
  assert.deepEqual(propRequestsFromFacts(world("system").facts, emptyTownDocument()), []);
  assert.deepEqual(propRequestsFromFacts(world("user", []).facts, emptyTownDocument()), []);

  const imported = { ...emptyTownDocument(), userProps: [{ ...lamp, provenance: { kind: "ticket" as const, ticketKey: "CR-41" } }] };
  assert.deepEqual(propRequestsFromFacts(world("user").facts, imported), []);
});

test("the place comes from a place: line, then the title, else storage", () => {
  const projection = world("user");
  const model = reduceWorld(projection.facts, emptyMemory(), { now: T0, mode: "demo", roleOverrides: {} }).model;
  const placed = (extra: Partial<PropTicket>) => placeFor(ticket(extra), model);

  assert.deepEqual(placed({ title: "Prop: a tall fern for the lobby" }), {
    at: { building: "crewhub", room: "lobby" },
    attachment: null,
    rule: "title",
    note: null,
  });
  assert.equal(placed({ title: "Prop: a bench in the review room" }).at.room, "review");
  assert.equal(placed({ title: "Prop: a lamp for the Lead's office" }).at.room, "lead-office");
  // "lamp" contains no room and "a reading nook" names none: storage.
  assert.deepEqual(placed({ title: "Prop: a reading nook with a lamp" }).rule, "default");
  assert.equal(placed({ title: "Prop: a reading nook with a lamp" }).at.room, "storage");

  const line = placed({ title: "Prop: a fern for the lobby", bodyMarkdown: "A big fern.\nplace: the review room\n" });
  assert.deepEqual([line.rule, line.at.room], ["place-line", "review"]);

  const desk = placed({ bodyMarkdown: "place: desk of cr-dev-2" });
  const dev = model.buildings[0]!.agents.find((a) => a.name === "cr-dev-2");
  assert.ok(dev?.room);
  assert.deepEqual(desk, {
    at: { building: "crewhub", room: dev.room },
    attachment: { kind: "agent", ref: dev.key },
    rule: "place-line",
    note: null,
  });

  const unknown = placed({ title: "Prop: a lamp for the lobby", bodyMarkdown: "place: desk of nobody" });
  assert.deepEqual([unknown.rule, unknown.at.room, unknown.note], ["title", "lobby", 'place: no agent "nobody" in the town']);
  const vague = placed({ bodyMarkdown: "place: somewhere nice" });
  assert.deepEqual([vague.rule, vague.at.room], ["default", "storage"]);
  assert.match(vague.note ?? "", /not a room/);
});

test("an imported prop whose id is taken by another prop gets the ticket key appended", () => {
  const doc = { ...emptyTownDocument(), userProps: [{ ...lamp, provenance: { kind: "local" as const } }] };
  const fromTicket = (key: string) => ({ ...lamp, provenance: { kind: "ticket" as const, ticketKey: key } });
  assert.equal(importedPropId(doc, fromTicket("CR-41")), "user:floor-lamp-cr-41");
  assert.equal(importedPropId(emptyTownDocument(), fromTicket("CR-41")), "user:floor-lamp");
  const again = { ...doc, userProps: [fromTicket("CR-41")] };
  assert.equal(importedPropId(again, fromTicket("CR-41")), "user:floor-lamp");
});
