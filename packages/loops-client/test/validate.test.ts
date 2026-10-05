import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  toWorldEvent,
  validateAgents,
  validateBoardResponse,
  validateCommentsResponse,
  validateDmMessagesResponse,
  validateDmThreadsResponse,
  validateEnvelope,
  validateMilestonesResponse,
  validateProgressResponse,
  validateProjectsResponse,
  validateReleasesResponse,
  validateTeamSnapshot,
  validateTicket,
  validateWatchdogResponse,
} from "../src/validate.ts";
import type { Result } from "../src/validate.ts";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;

function value<T>(result: Result<T>): T {
  if (!result.ok) assert.fail(`${result.path}: ${result.message}`);
  return result.value;
}

function failure<T>(result: Result<T>): { path: string; message: string } {
  if (result.ok) assert.fail("expected a validation failure");
  return result;
}

test("the events.md envelope example validates and types its payload", () => {
  const envelope = value(validateEnvelope(fixture("envelope-ticket-moved.json")));
  assert.equal(envelope.seq, 4711);
  const event = toWorldEvent(envelope);
  assert.ok(event);
  const typed = value(event);
  assert.equal(typed.type, "ticket.moved");
  if (typed.type === "ticket.moved") assert.equal(typed.payload.to, "in_progress");
});

test("an envelope with v 2 fails loudly", () => {
  const input = { ...fixture("envelope-ticket-moved.json"), v: 2 };
  assert.equal(failure(validateEnvelope(input)).path, "$.v");
});

test("an unknown event type is valid as an envelope but not a world event", () => {
  const envelope = value(validateEnvelope({ ...fixture("envelope-ticket-moved.json"), type: "label.created" }));
  assert.equal(toWorldEvent(envelope), null);
});

test("new enum values in event reason, state and resolution are tolerated", () => {
  const base = fixture("envelope-ticket-moved.json");
  const resumed = value(
    validateEnvelope({
      ...base,
      type: "ticket.resumed",
      payload: { ticket: "CL-85", agent: "cl-lead", episode: 3, resolution: "teleported", minutes: 4 },
    }),
  );
  assert.ok(value(toWorldEvent(resumed)!));
  const updated = value(
    validateEnvelope({ ...base, type: "delivery.updated", payload: { deliveryId: "dl_1", state: "requeued" } }),
  );
  assert.ok(value(toWorldEvent(updated)!));
});

test("an allowlisted payload missing a documented key is rejected", () => {
  const envelope = value(
    validateEnvelope({ ...fixture("envelope-ticket-moved.json"), payload: { from: "planned", position: 1 } }),
  );
  assert.equal(failure(toWorldEvent(envelope)!).path, "$.payload.to");
});

test("the team snapshot validates; v is the number 1 (contracts/team.py), the documents' string '1' passes too", () => {
  const snapshot = value(validateTeamSnapshot(fixture("team-snapshot.json")));
  assert.equal(snapshot.sessions[0]?.agents[0]?.contextLine, "CL-85: writing docs");
  assert.ok(value(validateTeamSnapshot({ ...fixture("team-snapshot.json"), v: "1" })));
  assert.equal(failure(validateTeamSnapshot({ ...fixture("team-snapshot.json"), v: 2 })).path, "$.v");
});

test("unknown keys are dropped rather than rejected", () => {
  const input = fixture("projects.json");
  const projects = input.projects as Record<string, unknown>[];
  const withExtra = { ...input, projects: [{ ...projects[0], futureField: 42 }], alsoNew: true };
  const result = value(validateProjectsResponse(withExtra));
  assert.equal("futureField" in (result.projects[0] as object), false);
  assert.equal("alsoNew" in result, false);
});

test("a project missing its lead is rejected with the path", () => {
  const input = fixture("projects.json");
  const project = { ...(input.projects as Record<string, unknown>[])[0] };
  delete project.lead;
  assert.equal(failure(validateProjectsResponse({ projects: [project] })).path, "$.projects[0].lead");
});

test("a card with an unknown ticket status is rejected", () => {
  const board = fixture("board.json");
  const columns = board.columns as { status: string; tickets: Record<string, unknown>[] }[];
  const card = { ...columns[2]!.tickets[0], status: "doing" };
  const bad = { columns: [{ status: "in_progress", tickets: [card] }] };
  const error = failure(validateBoardResponse(bad));
  assert.equal(error.path, "$.columns[0].tickets[0].status");
  assert.match(error.message, /one of backlog/);
});

test("the read-model fixtures follow the schema blocks", () => {
  const board = value(validateBoardResponse(fixture("board.json")));
  assert.equal(board.columns[2]?.tickets[0]?.milestone?.key, "CL-M3");
  assert.equal(value(validateTicket(fixture("ticket.json"))).stallDetail?.quietMinutes, 53);
  assert.equal(value(validateWatchdogResponse(fixture("watchdog.json"))).open?.[0]?.stall.state, "attention");
  assert.equal(value(validateMilestonesResponse(fixture("milestones.json"))).milestones.length, 1);
  assert.equal(value(validateReleasesResponse(fixture("releases.json"))).releases[0]?.state, "published");
  const dm = fixture("dm.json");
  assert.equal(value(validateDmThreadsResponse(dm.threads)).threads[0]?.agentId, "cl-lead");
  assert.equal(value(validateDmMessagesResponse(dm.messages)).messages[0]?.deliveryState, "forwarded");
  const cp = fixture("comments-progress.json");
  assert.equal(value(validateCommentsResponse(cp.comments)).comments[0]?.kind, "normal");
  assert.equal(value(validateProgressResponse(cp.progress)).progress[0]?.worker, "cl-dev-2");
  assert.equal(value(validateCommentsResponse(cp.comments)).comments.length, 3);
});

// The four shapes below are read from the loops code at f55d1288, not from read-model.md (fixtures/README.md).

test("GET /api/agents: projects is {lead, member} of {slug, key}", () => {
  // loops:services/api/src/crewhub_loops/contracts/agents.py (AgentDetailOut, AgentProjects);
  // loops:services/api/tests/test_api_agents_admin.py expects exactly this for cr-lead.
  const agents = value(validateAgents(fixture("agents.json"))).agents;
  assert.deepEqual(agents[0]?.projects, {
    lead: [{ slug: "creator", key: "CR" }],
    member: [{ slug: "inbox", key: "IN" }],
  });
  assert.deepEqual(agents[1]?.projects, { lead: [], member: [] });
  assert.equal(agents[1]?.isCrewhubLead, true);
  // The list of slugs the world assumed before is not what loops sends.
  const old = { agents: [{ ...(fixture("agents.json").agents as Record<string, unknown>[])[0], projects: ["creator"] }] };
  assert.equal(failure(validateAgents(old)).path, "$.agents[0].projects");
});

test("a body's v is the number 1; the string the documents print passes too, 2 fails", () => {
  // loops:services/api/src/crewhub_loops/contracts/richtext.py: RichBody and SystemCommentBody, `v: Literal[1] = 1`.
  // The ticket body is the one loops:services/api/tests/test_api_releases_publish.py sends.
  const body = { v: 1, profile: "ticket", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Notes" }] }] } };
  assert.equal(value(validateTicket({ ...fixture("ticket.json"), body })).body?.v, 1);
  assert.ok(value(validateTicket({ ...fixture("ticket.json"), body: { ...body, v: "1" } })));
  assert.equal(failure(validateTicket({ ...fixture("ticket.json"), body: { ...body, v: 2 } })).path, "$.body.v");

  const comments = fixture("comments-progress.json").comments as { comments: Record<string, unknown>[] };
  const [normal, system, deleted] = value(validateCommentsResponse(comments)).comments;
  assert.equal(normal?.body?.v, 1);
  assert.deepEqual(system?.body, { v: 1, system: { code: "uncertain", lead: "cl-lead", detail: "input box held typed text" } });
  assert.equal(deleted?.body, null);
  const bad = { comments: [{ ...comments.comments[1], body: { v: 2, system: { code: "uncertain", lead: "cl-lead" } } }] };
  assert.equal(failure(validateCommentsResponse(bad)).path, "$.comments[0].body.v");

  const dm = fixture("dm.json").messages as { messages: { body: { v: unknown } }[] };
  assert.equal(value(validateDmMessagesResponse(dm)).messages[0]?.body.v, 1);
});

test("ticket.moved: labelsCleared is a list of label names", () => {
  // loops:services/api/src/crewhub_loops/domain/board.py, `_apply_move`: `"labelsCleared": [AWAITING_DEPLOY_NAME]`.
  const typed = value(toWorldEvent(value(validateEnvelope(fixture("envelope-ticket-moved-deploy.json"))))!);
  assert.equal(typed.type, "ticket.moved");
  if (typed.type === "ticket.moved") assert.deepEqual(typed.payload.labelsCleared, ["awaiting-deploy"]);
  const base = fixture("envelope-ticket-moved-deploy.json");
  const boolean = value(validateEnvelope({ ...base, payload: { ...(base.payload as object), labelsCleared: true } }));
  assert.equal(failure(toWorldEvent(boolean)!).path, "$.payload.labelsCleared");
});

test("ticket.moved: a rejection carries resolution and resolutionReason; a card carries them too", () => {
  // loops:services/api/src/crewhub_loops/domain/board.py, `_apply_move`; the reason is the one of
  // loops:services/api/tests/test_api_reject.py (test_a_person_rejects_with_a_reason).
  const typed = value(toWorldEvent(value(validateEnvelope(fixture("envelope-ticket-moved-rejected.json"))))!);
  if (typed.type !== "ticket.moved") assert.fail("not a ticket.moved");
  assert.deepEqual([typed.payload.to, typed.payload.resolution, typed.payload.resolutionReason], ["done", "rejected", "Superseded by CL-30"]);
  // A reopen: `resolutionCleared`.
  const base = fixture("envelope-ticket-moved-rejected.json");
  const reopened = value(toWorldEvent(value(validateEnvelope({ ...base, payload: { from: "done", to: "planned", position: 1000, resolutionCleared: true } })))!);
  if (reopened.type === "ticket.moved") assert.equal(reopened.payload.resolutionCleared, true);
  // The board card of test_api_reject.py: `(key, resolution, resolutionReason) == ("CR-1", "rejected", WHY)`.
  const card = { ...(fixture("board.json").columns as { tickets: Record<string, unknown>[] }[])[2]!.tickets[0], status: "done", resolution: "rejected", resolutionReason: "Superseded by CL-30" };
  const board = value(validateBoardResponse({ columns: [{ status: "done", tickets: [card] }] }));
  assert.deepEqual([board.columns[0]?.tickets[0]?.resolution, board.columns[0]?.tickets[0]?.resolutionReason], ["rejected", "Superseded by CL-30"]);
  assert.equal(value(validateTicket(fixture("ticket.json"))).resolution, null);
});

test("a full ticket without createdBy is rejected", () => {
  const input = { ...fixture("ticket.json") };
  delete input.createdBy;
  assert.equal(failure(validateTicket(input)).path, "$.createdBy");
});

test("null where the schema does not allow it is rejected", () => {
  assert.equal(failure(validateTicket({ ...fixture("ticket.json"), priority: null })).path, "$.priority");
});
