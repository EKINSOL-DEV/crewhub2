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

test("the team-and-projects.md snapshot validates; v as the number 1 and the string '1' both pass", () => {
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
  const agents = value(validateAgents(fixture("agents.json"))).agents;
  assert.deepEqual(agents[0]?.projects, ["crewhub-loops"]);
  assert.equal(agents[1]?.projects, undefined);
});

test("a full ticket without createdBy is rejected", () => {
  const input = { ...fixture("ticket.json") };
  delete input.createdBy;
  assert.equal(failure(validateTicket(input)).path, "$.createdBy");
});

test("null where the schema does not allow it is rejected", () => {
  assert.equal(failure(validateTicket({ ...fixture("ticket.json"), priority: null })).path, "$.priority");
});
