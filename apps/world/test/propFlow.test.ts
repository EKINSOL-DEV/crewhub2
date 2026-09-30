import assert from "node:assert/strict";
import test from "node:test";
import { SCRIPT_DURATION_MS, createDemoSource, createManualScheduler } from "@crewhub/demo";
import { definitions } from "../src/world/definitions.ts";
import {
  applyEdit,
  builtinIds,
  emptyMemory,
  emptyTownDocument,
  extractPropRequest,
  placeFor,
  Projection,
  propRequestsFromFacts,
  reduceWorld,
  type TownDocument,
} from "@crewhub/world-model";

/** The whole prop flow on the demo: a person's Done, the comment's json, the place, the import with provenance. */
test("the demo's done prop tickets import into the town, the broken one as an error", async () => {
  const scheduler = createManualScheduler(1_000);
  const source = createDemoSource({ scheduler, speed: 16 });
  const projection = new Projection(source, { coalesceMs: 0 });
  source.start((message) => projection.apply(message));
  scheduler.advance(Math.ceil((SCRIPT_DURATION_MS - 5_000) / 16));
  await new Promise((resolve) => setTimeout(resolve, 10));

  let doc: TownDocument = emptyTownDocument();
  const context = { knownStyles: ["greenhouse"], builtinIds: builtinIds(definitions) };
  const model = reduceWorld(projection.facts, emptyMemory(), { now: source.now(), mode: "demo", roleOverrides: {} }).model;
  const requests = propRequestsFromFacts(projection.facts, doc);
  assert.deepEqual(requests.map((r) => r.ticketKey).sort(), ["CR-35", "CR-37", "CR-38"]);

  const outcome: Record<string, string> = {};
  for (const request of requests) {
    const ticket = await source.getTicket(request.ticketKey);
    assert.ok(ticket);
    const extracted = extractPropRequest(ticket, await source.getComments(request.ticketKey));
    if (!extracted.ok) {
      outcome[request.ticketKey] = extracted.error;
      continue;
    }
    const place = placeFor(ticket, model);
    const added = applyEdit(doc, { type: "add-user-prop", prop: extracted.prop }, context);
    assert.ok(added.ok);
    doc = added.doc;
    outcome[request.ticketKey] = `${extracted.prop.id} -> ${place.at.building}/${place.at.room} (${place.rule})`;
  }
  assert.equal(outcome["CR-35"], "user:tall-fern -> crewhub/lobby (title)");
  assert.equal(outcome["CR-37"], "user:reading-nook -> crewhub/storage (default)");
  assert.match(outcome["CR-38"] ?? "", /^prop CR-38 is invalid: parts\[1\]\.position\[0\]: part spans x/);
  assert.deepEqual(
    doc.userProps.map((p) => p.provenance),
    requests.filter((r) => r.ticketKey !== "CR-38").map((r) => ({ kind: "ticket", ticketKey: r.ticketKey })),
  );
  // Imported tickets are not listed again.
  assert.deepEqual(propRequestsFromFacts(projection.facts, doc).map((r) => r.ticketKey), ["CR-38"]);
});

test("a prop requested from build mode arrives valid", async () => {
  const scheduler = createManualScheduler(1_000);
  const source = createDemoSource({ scheduler, speed: 16 });
  const projection = new Projection(source, { coalesceMs: 0 });
  source.start((message) => projection.apply(message));
  scheduler.advance(Math.ceil(60_000 / 16));
  source.createPropRequest("a coffee machine");
  scheduler.advance(Math.ceil(200_000 / 16));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const request = propRequestsFromFacts(projection.facts, emptyTownDocument()).find((r) => r.title === "Prop: a coffee machine");
  assert.ok(request);
  const ticket = await source.getTicket(request.ticketKey);
  assert.ok(ticket);
  const extracted = extractPropRequest(ticket, await source.getComments(request.ticketKey));
  assert.ok(extracted.ok, extracted.ok ? "" : extracted.error);
  assert.equal(extracted.prop.id, "user:coffee-machine");
});
