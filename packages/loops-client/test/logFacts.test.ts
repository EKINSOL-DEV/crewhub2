/** `logFacts.ts`: picking the open quiet stretches and the latest runs from log rows, bounded to open tickets. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardResponse, Envelope } from "../src/types.ts";
import { ACTIVITY_TYPES, LOG_RUNS_KEPT, openTicketsOf, quietCandidates, selectLogFacts } from "../src/logFacts.ts";

const ticket = (id: string, key: string, status: string) => ({ id, key, title: key, kind: "task" as const, status: status as BoardResponse["columns"][number]["status"], priority: "normal" as const, position: 1, version: 1, updatedAt: "2026-10-21T08:00:00Z", statusChangedAt: "2026-10-21T08:00:00Z" });
const boards: Record<string, BoardResponse> = {
  cl: { columns: [{ status: "backlog", tickets: [ticket("t0", "CL-0", "backlog")] }, { status: "planned", tickets: [] }, { status: "in_progress", tickets: [ticket("t1", "CL-1", "in_progress")] }, { status: "review", tickets: [ticket("t2", "CL-2", "review")] }, { status: "done", tickets: [ticket("t9", "CL-9", "done")] }] },
};
const env = (seq: number, type: string, id: string | null, payload: Record<string, unknown>, actor: Envelope["actor"] = { id: "system", kind: "system" }): Envelope => ({
  v: 1, seq, ts: `2026-10-21T08:${String(seq).padStart(2, "0")}:00Z`, type, project: { slug: "cl", key: "CL" }, ticket: id === null ? null : { id, key: id.replace("t", "CL-"), title: "" }, actor, recipientIds: [], payload,
});
const quiet = (seq: number, id: string, status: string) => env(seq, "ticket.quiet", id, { status, minutes: 15, since: "2026-10-21T07:00:00Z", ticket: id.replace("t", "CL-") });
const run = (seq: number, id: string | null) => env(seq, "automation.ran", id, { runId: `r${seq}`, automationId: "au", outcome: "ok" });

test("open tickets: planned, in progress and review only, by id, with their slug", () => {
  const open = openTicketsOf(boards);
  assert.deepEqual([...open.keys()], ["t1", "t2"]);
  assert.deepEqual(open.get("t2"), { id: "t2", key: "CL-2", slug: "cl", status: "review" });
});

test("quiet: the newest per open ticket in the status the job saw; a done, backlog or moved ticket has none", () => {
  const open = openTicketsOf(boards);
  const rows = [quiet(1, "t1", "in_progress"), quiet(2, "t2", "planned"), quiet(3, "t9", "done"), quiet(4, "t0", "backlog"), quiet(5, "t1", "in_progress"), quiet(6, "t7", "review")];
  assert.deepEqual(quietCandidates(rows, open).map((q) => q.seq), [5], "t2's stretch was in planned, it is in review now; t9 is done; t0 backlog; t7 unknown");
});

test("a person's or an agent's event after the quiet ends it; a system write (an automation's answer) does not; undecided is not shown", () => {
  const open = openTicketsOf(boards);
  const rows = [quiet(1, "t1", "in_progress"), quiet(2, "t2", "review")];
  const activity = [
    env(3, "ticket.updated", "t1", { changed: ["labels"], automation: { id: "au", name: "A" } }),
    env(4, "comment.created", "t2", { commentId: "c", parentId: null }, { id: "cl-lead", kind: "agent" }),
    env(5, "ticket.updated", "t3", { changed: ["title"] }, { id: "nicky", kind: "user" }),
  ];
  assert.deepEqual(selectLogFacts(rows, activity, open, true).quiet.map((q) => q.ticket?.key), ["CL-1"]);
  assert.deepEqual(selectLogFacts(rows, activity, open, false).quiet, [], "the activity read did not reach the end: nothing is claimed");
  assert.ok((ACTIVITY_TYPES as readonly string[]).includes("comment.created") && !(ACTIVITY_TYPES as readonly string[]).includes("ticket.stalled"));
});

test("runs: on open tickets, the last LOG_RUNS_KEPT, oldest first", () => {
  const open = openTicketsOf(boards);
  const rows = [run(1, "t9"), run(2, null), ...Array.from({ length: LOG_RUNS_KEPT + 3 }, (_, i) => run(10 + i, i % 2 ? "t1" : "t2")), quiet(99, "t1", "in_progress")];
  const { automationRuns } = selectLogFacts(rows, [], open, true);
  assert.equal(automationRuns.length, LOG_RUNS_KEPT);
  assert.equal(automationRuns[0]!.seq, 13);
  assert.equal(automationRuns.at(-1)!.seq, 10 + LOG_RUNS_KEPT + 2);
  assert.ok(automationRuns.every((r) => r.type === "automation.ran" && r.ticket !== null));
});
