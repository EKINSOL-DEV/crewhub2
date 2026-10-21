/**
 * The new loops events in the storyline (spec addendum "the new loops events in the town", CL-312 and CL-298):
 * `ticket.quiet` and `automation.ran` the loops way (actor `system`, the payloads of `automation_quiet.py` and
 * `automation_run.py`), `owner-request.updated` as a person's event; the rules the actions enforce.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope } from "@crewhub/loops-client";
import { toWorldEvent } from "@crewhub/loops-client";
import { applyAction } from "../src/actions.ts";
import { initialState, requireTicket } from "../src/store.ts";
import { MINUTE } from "../src/time.ts";
import { envelopes, firstLoop, playLoop } from "./helpers.ts";

const T0 = Date.parse("2026-10-01T08:00:00Z");

const loop = firstLoop(playLoop().messages);
const events = envelopes(loop);
const of = (type: string): Envelope[] => events.filter((e) => e.type === type);

test("ticket.quiet: actor system, the payload of the quiet job, since at least minutes before, once per stretch, gone at the next change", () => {
  const quiet = of("ticket.quiet");
  assert.equal(quiet.length, 1);
  const e = quiet[0]!;
  assert.deepEqual(e.actor, { id: "system", kind: "system" });
  assert.equal(e.ticket?.key, "CR-17");
  assert.deepEqual(Object.keys(e.payload).sort(), ["minutes", "since", "status", "ticket"]);
  assert.deepEqual([e.payload["status"], e.payload["minutes"], e.payload["ticket"]], ["review", 30, "CR-17"]);
  assert.ok(Date.parse(e.ts) - Date.parse(String(e.payload["since"])) >= 30 * MINUTE, "quiet at least 30 min");
  const world = toWorldEvent(e);
  assert.ok(world?.ok, "the client types it");
  // The next change on CR-17 is cr-lead's comment at 11:20: nothing touches it in between (the dust stays until then).
  const onIt = events.filter((x) => x.ticket?.key === "CR-17" && x.seq > e.seq);
  assert.equal(onIt[0]?.type, "comment.created");
  assert.equal(onIt[0]?.actor.id, "cr-lead");
});

test("the quiet action refuses a ticket that has not been quiet that long, and the same stretch twice", () => {
  const state = initialState(T0, 0);
  const t = requireTicket(state, "CR-17");
  const quietFor = (state.now - t.updatedAt) / MINUTE;
  assert.throws(() => applyAction(state, { type: "quiet", ticket: "CR-17", minutes: Math.ceil(quietFor) + 5 }, 1), /has not been quiet/);
  const out = applyAction(state, { type: "quiet", ticket: "CR-17", minutes: Math.floor(quietFor) }, 2);
  assert.equal(out.length, 1);
  assert.equal(t.version, requireTicket(state, "CR-17").version, "no activity on the ticket");
  assert.throws(() => applyAction(state, { type: "quiet", ticket: "CR-17", minutes: Math.floor(quietFor) }, 3), /announced already/);
});

test("automation.ran: one per run by system, flagged with the automation; the label it adds comes first as a ticket.updated", () => {
  const runs = of("automation.ran");
  assert.deepEqual(runs.map((e) => [e.ticket?.key, e.payload["outcome"]]), [["CR-20", "ok"], ["CR-21", "ok"], ["CL-76", "failed"]]);
  for (const e of runs) {
    assert.deepEqual(e.actor, { id: "system", kind: "system" });
    assert.deepEqual(Object.keys(e.payload).sort(), ["automation", "automationId", "outcome", "runId"]);
    assert.equal((e.payload["automation"] as { id: string }).id, e.payload["automationId"]);
    assert.ok(toWorldEvent(e)?.ok, "the client types it");
  }
  const first = runs[0]!;
  const before = events.find((x) => x.seq === first.seq - 1)!;
  assert.equal(before.type, "ticket.updated");
  assert.equal(before.ticket?.key, "CR-20");
  assert.deepEqual(before.actor, { id: "system", kind: "system" });
  assert.deepEqual(before.payload, { changed: ["labels"], automation: { id: "au_demo_stale", name: "Label stale bugs" } });
  const typed = toWorldEvent(before);
  assert.ok(typed?.ok && typed.value.type === "ticket.updated" && typed.value.payload.automation?.name === "Label stale bugs", "the automation flag survives the validator");
  // The other runs changed nothing: no ticket.updated flagged with their automation.
  const flagged = events.filter((x) => x.type === "ticket.updated" && x.payload["automation"] !== undefined);
  assert.deepEqual(flagged.map((x) => x.ticket?.key), ["CR-20"]);
});

test("owner-request.updated: a person's event with ids and a state word, no ticket, no project; never an agent's", () => {
  const changes = of("owner-request.updated");
  assert.deepEqual(changes.map((e) => e.payload), [
    { userId: "nicky", requestId: "or_demo_1", state: "pending" },
    { userId: "nicky", requestId: "or_demo_1", state: "approved" },
  ]);
  for (const e of changes) {
    assert.deepEqual(e.actor, { id: "nicky", kind: "user" });
    assert.equal(e.ticket, null);
    assert.equal(e.project, null);
    assert.equal(toWorldEvent(e), null, "the world knows the type and skips it");
  }
  const state = initialState(T0, 0);
  assert.throws(() => applyAction(state, { type: "ownerRequest", userId: "cr-lead", requestId: "x", state: "pending" }, 1), /is an agent/);
});
