import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope, TeamSnapshot } from "@crewhub/loops-client";
import { at } from "../src/time.ts";
import { envelopes, firstLoop, playLoop, startDemo } from "./helpers.ts";

const loop = firstLoop(playLoop().messages);
const events = envelopes(loop);
const of = (type: string): Envelope[] => events.filter((e) => e.type === type);
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
