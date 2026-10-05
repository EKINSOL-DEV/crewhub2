import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope, TeamSnapshot } from "@crewhub/loops-client";
import { applyAction } from "../src/actions.ts";
import type { Output } from "../src/actions.ts";
import { initialState, requireTicket } from "../src/store.ts";
import { at } from "../src/time.ts";
import { envelopes, firstLoop, playLoop, startDemo } from "./helpers.ts";

const loop = firstLoop(playLoop().messages);
const events = envelopes(loop);
const of = (type: string): Envelope[] => events.filter((e) => e.type === type);
const T0 = Date.parse("2026-10-01T08:00:00Z");
const values = (type: string, key: string): Set<unknown> => new Set(of(type).map((e) => e.payload[key]));

function includesAll(actual: Set<unknown>, expected: unknown[], what: string): void {
  for (const value of expected) assert.ok(actual.has(value), `${what}: missing ${String(value)}`);
}

test("every event type the world reacts to occurs in one loop", () => {
  includesAll(new Set(events.map((e) => e.type)), [
    "ticket.created", "ticket.moved", "ticket.updated", "ticket.archived", "ticket.unarchived",
    "comment.created", "ticket.progress", "team.updated", "ticket.stalled", "ticket.resumed",
    "delivery.created", "delivery.updated", "dm.created", "dm.answered",
    "milestone.created", "milestone.updated", "milestone.tickets_attached", "milestone.handoff", "milestone.completed",
    "release.created", "release.updated", "release.published",
    "project.archived", "project.restored", "project.updated", "project.reordered",
  ], "types");
});

test("ticket moves cover the whole flow with the right actors", () => {
  const moved = of("ticket.moved");
  const has = (pred: (e: Envelope) => boolean, what: string) => assert.ok(moved.some(pred), what);
  has((e) => e.payload["to"] === "planned" && e.actor.kind === "user", "a person plans a ticket");
  has((e) => e.payload["to"] === "in_progress" && e.actor.kind === "agent" && e.payload["from"] === "planned", "an agent fetches one");
  has((e) => e.payload["to"] === "review" && e.actor.kind === "agent", "an agent sends one to review");
  has((e) => e.payload["to"] === "done" && e.actor.kind === "user", "a person closes one");
  has((e) => e.payload["reason"] === "review_reply" && e.payload["from"] === "review", "a review reply");
  has((e) => e.payload["code"] === "milestone_handoff", "a hand-off move");
  const published = of("release.published")[0];
  assert.ok(published !== undefined);
  has((e) => e.payload["to"] === "review" && e.ticket?.id === published.ticket?.id, "publish moves the carrier to review");
});

test("thin ticket.updated shapes, progress kinds and worker lines all occur", () => {
  const changed = new Set(of("ticket.updated").flatMap((e) => e.payload["changed"] as string[]));
  includesAll(changed, ["assignee", "labels", "waiting_on", "milestone", "relation", "blocked"], "changed");
  assert.ok(of("ticket.updated").some((e) => e.payload["reason"] === "wait_reply"));
  includesAll(values("ticket.progress", "kind"), ["start", "update", "done", "question"], "progress kinds");
  assert.ok(of("ticket.progress").some((e) => /^[a-z]+-[a-z]+-\d: /.test(String(e.payload["text"]))), "a worker line");
  assert.ok(of("ticket.progress").some((e) => String(e.payload["text"]).includes("building the prop")));
  const archived = of("ticket.archived").filter((e) => e.payload["reason"] === "archive_all");
  assert.ok(archived.length > 1 && archived.every((e) => e.payload["batchId"] === archived[0]?.payload["batchId"]));
});

test("watchdog, deliveries and DMs cover every state the world shows", () => {
  includesAll(values("ticket.stalled", "reason"), ["stalled", "attention"], "stall reasons");
  includesAll(values("ticket.resumed", "resolution"), ["activity", "attending"], "resolutions");
  assert.ok(of("ticket.stalled").some((e) => (e.payload["nudge"] as number) > 0 && (e.payload["quietMinutes"] as number) > 20));
  includesAll(values("delivery.created", "reason"), ["new_ticket", "assigned", "comment", "planned", "release", "dm"], "reasons");
  includesAll(values("delivery.updated", "state"), ["claimed", "forwarded", "uncertain", "unroutable"], "states");
  const [message, reply] = of("dm.created");
  assert.equal(message?.actor.id, "nicky");
  assert.equal(message?.recipientIds[0], "g-man");
  assert.equal(reply?.actor.id, "g-man");
  assert.equal(of("dm.answered")[0]?.payload["messageId"], message?.payload["messageId"]);
});

test("two principals comment on one ticket within ten minutes (the meeting inference)", () => {
  const byTicket = new Map<string, Envelope[]>();
  for (const e of of("comment.created").filter((c) => c.actor.kind !== "system")) {
    byTicket.set(e.ticket?.key ?? "", [...(byTicket.get(e.ticket?.key ?? "") ?? []), e]);
  }
  const meeting = [...byTicket.values()].some((list) =>
    list.some((a) => list.some((b) => a.actor.id !== b.actor.id && Math.abs(Date.parse(a.ts) - Date.parse(b.ts)) <= 600_000)),
  );
  assert.ok(meeting);
});

test("the team snapshots show every lane status, a worker coming and going, and a stale episode", () => {
  const teams = loop.flatMap((m) => (m.type === "team" ? [m.team] : []));
  const lanes = (team: TeamSnapshot) => team.sessions.flatMap((s) => s.agents);
  includesAll(new Set(teams.flatMap((t) => lanes(t).map((a) => a.status))), ["working", "idle", "done", "blocked", "unknown"], "statuses");
  const withWorker = teams.map((t) => lanes(t).some((a) => a.name === "cl-dev-3"));
  assert.ok(withWorker.indexOf(true) > 0 && withWorker.lastIndexOf(true) < withWorker.length - 1, "cl-dev-3 appears and leaves");
  assert.ok(lanes(teams.find((t) => lanes(t).some((a) => a.name === "cl-dev-3")) as TeamSnapshot).some((a) => a.name === "cl-dev-3" && a.lead === "cl-lead"));
  assert.ok(lanes(teams[0] as TeamSnapshot).some((a) => a.name === "cr-scout" && a.lead === "cr-lead"));
  // A team message is a re-read at a moment in demo time: the poll message follows the ts of the last line.
  let stale = false;
  let lastTs = 0;
  for (const m of loop) {
    if (m.type === "event") lastTs = Date.parse(m.envelope.ts);
    if (m.type === "team" && lastTs - Date.parse(m.team.ts) > 300_000) stale = true;
  }
  assert.ok(stale, "the snapshot goes older than five minutes");
  assert.ok(Date.parse((teams.at(-1) as TeamSnapshot).ts) - lastTs > -300_000, "and is fresh again before the loop ends");
});

test("while the probe is silent the reads say so: stale monitoring and no agentWorking", async () => {
  const run = startDemo();
  run.play(at("9:00"));
  assert.equal((await run.source.getWatchdog()).monitoring, "ok");
  assert.ok(((await run.source.getBoard("crewhub"))?.columns ?? []).some((c) => c.tickets.some((t) => t.agentWorking)));
  run.play(at("6:00"));
  assert.equal((await run.source.getWatchdog()).monitoring, "unavailable:snapshot_stale");
  const cards = ((await run.source.getBoard("crewhub"))?.columns ?? []).flatMap((c) => c.tickets);
  assert.ok(cards.every((t) => t.agentWorking === false));
  run.play(at("0:50"));
  assert.equal((await run.source.getWatchdog()).monitoring, "ok");
});

test("a person turns one ticket down, in the shape of loops' ticket.moved (CL-89)", async () => {
  // loops:services/api/src/crewhub_loops/domain/board.py, `_apply_move`: `resolution` and `resolutionReason` join
  // the payload of the move that rejects.
  const rejections = of("ticket.moved").filter((e) => "resolution" in e.payload);
  assert.equal(rejections.length, 1);
  const [rejection] = rejections;
  assert.deepEqual(
    [rejection?.ticket?.key, rejection?.actor.kind, rejection?.payload["to"], rejection?.payload["resolution"]],
    ["CR-25", "user", "done", "rejected"],
  );
  assert.equal(typeof rejection?.payload["resolutionReason"], "string");
  const run = startDemo();
  run.play(at("7:00"));
  const done = ((await run.source.getBoard("crewhub"))?.columns ?? []).find((c) => c.status === "done")?.tickets ?? [];
  assert.deepEqual(done.filter((t) => t.resolution === "rejected").map((t) => [t.key, t.resolutionReason]), [
    ["CR-25", rejection?.payload["resolutionReason"]],
  ]);
  assert.equal((await run.source.getTicket("CR-25"))?.resolution, "rejected");
});

test("a ticket that leaves In progress loses only its awaiting-deploy label, named in the payload", () => {
  // loops:services/api/tests/test_domain_board.py, test_leaving_in_progress_clears_the_deploy_label_with_history.
  // The storyline has no such move, so the action is applied to the seed state directly: CL-45 is in progress
  // with the labels api and awaiting-deploy.
  const state = initialState(T0, 0);
  const labels = () => requireTicket(state, "CL-45").labelIds.map((id) => state.labels.find((l) => l.id === id)?.name);
  assert.deepEqual(labels(), ["api", "awaiting-deploy"]);
  const moved = (out: Output[]) => out.flatMap((o) => (o.type === "event" && o.envelope.type === "ticket.moved" ? [o.envelope.payload] : []));
  const toReview = moved(applyAction(state, { type: "move", by: "cl-lead", ticket: "CL-45", to: "review" }, 1));
  assert.deepEqual(toReview.map((p) => [p["from"], p["to"], p["labelsCleared"]]), [["in_progress", "review", ["awaiting-deploy"]]]);
  assert.deepEqual(labels(), ["api"]);
  // A later move has nothing to clear and says nothing.
  const toDone = moved(applyAction(state, { type: "move", by: "nicky", ticket: "CL-45", to: "done" }, 2));
  assert.equal("labelsCleared" in toDone[0]!, false);
  // A Done ticket rejected afterwards: `from == to == "done"`, and a reopen clears the resolution.
  const rejected = moved(applyAction(state, { type: "move", by: "nicky", ticket: "CL-45", to: "done", rejected: "Not this quarter" }, 3));
  assert.deepEqual(rejected.map((p) => [p["from"], p["to"], p["resolution"], p["resolutionReason"]]), [["done", "done", "rejected", "Not this quarter"]]);
  const reopened = moved(applyAction(state, { type: "move", by: "nicky", ticket: "CL-45", to: "planned" }, 4));
  assert.equal(reopened[0]?.["resolutionCleared"], true);
  assert.equal(requireTicket(state, "CL-45").resolution, null);
  assert.throws(() => applyAction(state, { type: "move", by: "cl-lead", ticket: "CL-45", to: "review", rejected: "no" }, 5), /goes with the done status/);
});
