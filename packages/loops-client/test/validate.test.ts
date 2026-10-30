import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  resetWarnings,
  toWorldEvent,
  validateAgents,
  validateBoardResponse,
  validateCommentsResponse,
  validateDmMessagesResponse,
  validateDmThreadsResponse,
  validateEnvelope,
  validateLoopsSnapshot,
  validateMilestonesResponse,
  validatePendingRequests,
  validatePrincipals,
  validateProgressResponse,
  validateProjectGroupsResponse,
  validateProjectOut,
  validateProjectsResponse,
  validateReleasesResponse,
  validateTeamSnapshot,
  validateTicket,
  validateWatchdogResponse,
} from "../src/validate.ts";
import type { Result } from "../src/validate.ts";
import { groupOf, sortProjectGroups } from "../src/groups.ts";

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

/** Captures console.warn for one test. */
function capturingWarnings(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  resetWarnings();
  try {
    run();
  } finally {
    console.warn = original;
    resetWarnings();
  }
  return lines;
}

test("a card with an unknown ticket status warns once and passes through (loops readiness)", () => {
  const board = fixture("board.json");
  const columns = board.columns as { status: string; tickets: Record<string, unknown>[] }[];
  const card = { ...columns[2]!.tickets[0], status: "doing" };
  const input = { columns: [{ status: "in_progress", tickets: [card, { ...card, id: "tk_2", key: "CL-2" }] }] };
  const warnings = capturingWarnings(() => {
    const out = value(validateBoardResponse(input));
    assert.equal(out.columns[0]?.tickets[0]?.status, "doing");
    assert.equal(out.columns[0]?.tickets.length, 2);
    value(validateBoardResponse(input));
  });
  assert.equal(warnings.length, 1, warnings.join("\n"));
  assert.match(warnings[0]!, /unknown ticket status "doing"/);
  assert.equal(failure(validateBoardResponse({ columns: [{ status: 7, tickets: [] }] })).path, "$.columns[0].status");
});

test("a grill ticket is known (CL-245); an unknown kind warns once and never drops the snapshot", () => {
  const grill = value(validateTicket(fixture("ticket-grill.json")));
  assert.equal(grill.kind, "grill");
  const board = fixture("board.json");
  const columns = board.columns as { status: string; tickets: Record<string, unknown>[] }[];
  const card = { ...columns[2]!.tickets[0], kind: "epic" };
  const warnings = capturingWarnings(() => {
    assert.equal(value(validateTicket({ ...fixture("ticket.json"), kind: "epic" })).kind, "epic");
    const out = value(validateBoardResponse({ columns: [{ status: "in_progress", tickets: [card] }] }));
    assert.equal(out.columns[0]?.tickets[0]?.kind, "epic");
    const created = value(validateEnvelope({ ...fixture("envelope-ticket-moved.json"), type: "ticket.created", payload: { kind: "epic", status: "backlog", assigneeId: null } }));
    const typed = value(toWorldEvent(created)!);
    if (typed.type === "ticket.created") assert.equal(typed.payload.kind, "epic");
  });
  assert.equal(warnings.length, 1, warnings.join("\n"));
  assert.match(warnings[0]!, /unknown ticket kind "epic"/);
});

test("an event type events.md does not list warns once; a listed one the world skips is quiet", () => {
  const base = fixture("envelope-ticket-moved.json");
  const warnings = capturingWarnings(() => {
    assert.equal(toWorldEvent(value(validateEnvelope({ ...base, type: "label.created" }))), null);
    assert.equal(toWorldEvent(value(validateEnvelope({ ...base, type: "widget.spun" }))), null);
    assert.equal(toWorldEvent(value(validateEnvelope({ ...base, type: "widget.spun", seq: 4712 }))), null);
  });
  assert.equal(warnings.length, 1, warnings.join("\n"));
  assert.match(warnings[0]!, /unknown event type "widget.spun"/);
});

test("GET /api/delegations/pending (CL-240) validates", () => {
  const out = value(validatePendingRequests(fixture("pending-requests.json")));
  assert.equal(out.requests[0]?.action, "agents.create");
  assert.equal(failure(validatePendingRequests({ requests: [{ id: "dg_1" }] })).path, "$.requests[0].messageId");
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

test("GET /api/agents at 4cdcd383: the lane is typed, the external bot and the flags are read, the extras are optional", () => {
  // loops:.../contracts/agents.py (AgentLane, LaneDesired, LaneObserved, AgentDetailOut), contracts/computers.py (ComputerOut).
  const out = value(validateAgents(fixture("agents.json")));
  assert.equal(out.lanesAuthority, "db");
  assert.equal(out.agentHome, null);
  const [crLead, gMan, world, oldLead, marky] = out.agents;
  assert.equal(crLead?.lane?.desired.model, "claude-fable-5-1");
  assert.equal(crLead?.lane?.observed?.model, "claude-opus-5-5");
  assert.deepEqual(crLead?.lane?.drift, ["model", "permissionMode"]);
  assert.equal(crLead?.lane?.observed?.source, "probe");
  assert.deepEqual(crLead?.computer, { name: "This computer", kind: "this" });
  assert.equal(gMan?.lane, null);
  assert.equal(world?.external, true);
  assert.equal(world?.herdrSession, "external:none");
  assert.equal(oldLead?.disabled, true);
  assert.equal(oldLead?.lane?.lifecycle, "closed");
  assert.equal(oldLead?.lane?.observed, null);
  assert.equal(oldLead?.lane?.drift, null);
  assert.equal(marky?.needsLoginSince, "2026-09-30T20:12:00Z");
  assert.equal(marky?.lane?.restarting, true);
  assert.equal(marky?.lane?.observed?.source, "started");
  assert.equal(marky?.computer?.kind, "remote");
  // The 053b5f47 shape (no computer, external, reader, notPickedUp, needsLoginSince, lanesAuthority) still passes.
  const base = (fixture("agents.json").agents as Record<string, unknown>[])[1]!;
  const { computer: _c, external: _e, reader: _r, notPickedUp: _n, needsLoginSince: _s, ...older } = base;
  assert.equal(value(validateAgents({ agents: [older] })).agents[0]?.external, undefined);
  // A lane that is not an object, or a desired block without its permission mode, is a failure, not a guess.
  assert.equal(failure(validateAgents({ agents: [{ ...base, lane: "la_1" }] })).path, "$.agents[0].lane");
  const lane = (fixture("agents.json").agents as { lane: Record<string, unknown> }[])[0]!.lane;
  assert.equal(failure(validateAgents({ agents: [{ ...base, lane: { ...lane, desired: { model: null, effort: null, account: null } } }] })).path, "$.agents[0].lane.desired.permissionMode");
});

test("a new lane kind, lifecycle, observation source or computer kind passes with one warning each", () => {
  resetWarnings();
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (line: string) => warnings.push(line);
  try {
    const lane = (fixture("agents.json").agents as { lane: Record<string, unknown> }[])[0]!.lane;
    const observed = lane.observed as Record<string, unknown>;
    const odd = { ...lane, kind: "gemini", lifecycle: "parked", observed: { ...observed, kind: "gemini", source: "guessed" } };
    const base = (fixture("agents.json").agents as Record<string, unknown>[])[0]!;
    const out = value(validateAgents({ agents: [{ ...base, lane: odd, computer: { name: "cloud", kind: "virtual" } }, { ...base, lane: odd }] }));
    assert.equal(out.agents[0]?.lane?.kind, "gemini");
    assert.equal(out.agents[0]?.lane?.lifecycle, "parked");
    assert.equal(out.agents[0]?.computer?.kind, "virtual");
    assert.deepEqual(
      warnings.map((w) => w.replace(/ at \$.*$/, "")),
      ["[loops-client] unknown computer kind \"virtual\"", "[loops-client] unknown lane kind \"gemini\"", "[loops-client] unknown observation source \"guessed\"", "[loops-client] unknown lane lifecycle \"parked\""],
    );
  } finally {
    console.warn = original;
  }
});

test("GET /api/team at 4cdcd383: a session names its computer (CL-459); an older snapshot without it passes", () => {
  const snapshot = value(validateTeamSnapshot(fixture("team-snapshot.json")));
  assert.deepEqual(snapshot.sessions[1]?.computer, { name: "buildbox", kind: "remote" });
  assert.equal(snapshot.sessions[1]?.agents[0]?.status, "blocked");
  const sessions = (fixture("team-snapshot.json").sessions as Record<string, unknown>[]).map(({ computer: _c, ...rest }) => rest);
  assert.equal(value(validateTeamSnapshot({ ...fixture("team-snapshot.json"), sessions })).sessions[0]?.computer, undefined);
  assert.equal(failure(validateTeamSnapshot({ ...fixture("team-snapshot.json"), sessions: [{ ...sessions[0], computer: "here" }] })).path, "$.sessions[0].computer");
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

// FUTURE (proposal L22): crewhub-loops has no project groups today; these shapes are what the world would like.

const groupFixture = { id: "pg_studio", slug: "studio", name: "Studio", order: 1, color: "mist", icon: null };

test("project groups (proposal L22): the list validates, colour and icon may be null (or unknown, read as null) but not missing", () => {
  const { groups } = value(validateProjectGroupsResponse({ groups: [groupFixture, { ...groupFixture, id: "pg_x", extra: 1 }] }));
  assert.deepEqual(groups[0], groupFixture);
  assert.equal("extra" in groups[1]!, false);
  // An unknown colour is no colour since round 48 (r48-enums), not a failure: the group keeps its place.
  assert.equal(value(validateProjectGroupsResponse({ groups: [{ ...groupFixture, color: "purple" }] })).groups[0]!.color, null);
  const { icon: _icon, ...withoutIcon } = groupFixture;
  assert.equal(failure(validateProjectGroupsResponse({ groups: [withoutIcon] })).path, "$.groups[0].icon");
  assert.equal(failure(validateProjectGroupsResponse({})).path, "$.groups");
});

test("project groups (proposal L22): a project without groupId is today's shape; groupOf resolves or answers null", () => {
  const today = fixture("projects.json") as { projects: Record<string, unknown>[] };
  const plain = value(validateProjectOut(today.projects[0]));
  assert.equal("groupId" in plain, false);
  const grouped = value(validateProjectOut({ ...today.projects[0], groupId: "pg_studio" }));
  assert.equal(grouped.groupId, "pg_studio");
  assert.equal(failure(validateProjectOut({ ...today.projects[0], groupId: 3 })).path, "$.groupId");

  const groups = [groupFixture as never];
  assert.equal(groupOf(plain, groups), null);
  assert.equal(groupOf({ groupId: null }, groups), null);
  assert.equal(groupOf({ groupId: "pg_gone" }, groups), null);
  assert.equal(groupOf(grouped, groups)?.slug, "studio");
  assert.equal(groupOf(grouped, []), null, "a real crewhub-loops lists no groups");
});

test("project groups (proposal L22): sorted by order, then slug, whatever order they arrive in", () => {
  const g = (slug: string, order: number) => ({ id: `pg_${slug}`, slug, name: slug, order, color: null, icon: null });
  const list = [g("b", 1), g("c", 0), g("a", 1)];
  assert.deepEqual(sortProjectGroups(list).map((x) => x.slug), ["c", "a", "b"]);
  assert.deepEqual(sortProjectGroups([...list].reverse()).map((x) => x.slug), ["c", "a", "b"]);
});

/*
 * Round 48 (r48-enums, r48-live's L1): every enum the live source reads is lenient. One case per field: an unknown value
 * keeps the answer (the snapshot's part, the envelope, the read), as itself where the world only compares it with known
 * values, or as the safe reading where the world looks it up. Each was a failure before.
 */
type Json = Record<string, any>;
const clone = (name: string): Json => JSON.parse(JSON.stringify(fixture(name)));
const groupJson: Json = { id: "pg_1", slug: "core", name: "Core", order: 1, color: "coral", icon: "home" };
const ENUM_CASES: { field: string; read: (input: Json) => Result<unknown>; base: () => Json; set: (input: Json) => void; get: (value: any) => unknown; reading: unknown }[] = [
  { field: "a project's colour", read: validateProjectsResponse, base: () => clone("projects.json"), set: (j) => (j.projects[0].color = "sage"), get: (v) => v.projects[0].color, reading: null },
  { field: "a project's icon", read: validateProjectsResponse, base: () => clone("projects.json"), set: (j) => (j.projects[0].icon = "rocket"), get: (v) => v.projects[0].icon, reading: null },
  { field: "a project's release scheme", read: validateProjectsResponse, base: () => clone("projects.json"), set: (j) => (j.projects[0].releaseScheme = "calver"), get: (v) => v.projects[0].releaseScheme, reading: "calver" },
  { field: "a project's app note", read: validateProjectsResponse, base: () => clone("projects.json"), set: (j) => (j.projects[0].appNote = "shared"), get: (v) => v.projects[0].appNote, reading: "shared" },
  { field: "a project's route source", read: validateProjectsResponse, base: () => clone("projects.json"), set: (j) => (j.projects[0].effectiveRoute.source = "group"), get: (v) => v.projects[0].effectiveRoute.source, reading: "group" },
  { field: "a project lead's principal kind", read: validateProjectsResponse, base: () => clone("projects.json"), set: (j) => (j.projects[0].lead.kind = "service"), get: (v) => v.projects[0].lead.kind, reading: "service" },
  { field: "a group's colour", read: validateProjectGroupsResponse, base: () => ({ groups: [{ ...groupJson }] }), set: (j) => (j.groups[0].color = "sage"), get: (v) => v.groups[0].color, reading: null },
  { field: "a group's icon", read: validateProjectGroupsResponse, base: () => ({ groups: [{ ...groupJson }] }), set: (j) => (j.groups[0].icon = "rocket"), get: (v) => v.groups[0].icon, reading: null },
  { field: "a label's colour", read: validateTicket, base: () => clone("ticket.json"), set: (j) => (j.labels = [{ id: "l1", name: "prop", color: "sage" }]), get: (v) => v.labels[0].color, reading: "mist" },
  { field: "a ticket's priority", read: validateTicket, base: () => clone("ticket.json"), set: (j) => (j.priority = "critical"), get: (v) => v.priority, reading: "critical" },
  { field: "a ticket's stall detail state", read: validateTicket, base: () => clone("ticket.json"), set: (j) => (j.stallDetail.state = "dormant"), get: (v) => v.stallDetail.state, reading: "dormant" },
  { field: "a stall's escalation outcome", read: validateTicket, base: () => clone("ticket.json"), set: (j) => (j.stallDetail.escalationOutcome = "bounced"), get: (v) => v.stallDetail.escalationOutcome, reading: "bounced" },
  { field: "a card's milestone state", read: validateBoardResponse, base: () => clone("board.json"), set: (j) => (j.columns.find((c: Json) => c.tickets.length).tickets[0].milestone.state = "paused"), get: (v) => v.columns.find((c: Json) => c.tickets.length).tickets[0].milestone.state, reading: "paused" },
  { field: "a ticket's release state", read: validateTicket, base: () => clone("ticket.json"), set: (j) => (j.release = { id: "rl_1", number: 1, version: "0.9.0", title: "0.9.0", state: "yanked" }), get: (v) => v.release.state, reading: "yanked" },
  { field: "a ticket creator's principal kind", read: validateTicket, base: () => clone("ticket.json"), set: (j) => (j.createdBy.kind = "service"), get: (v) => v.createdBy.kind, reading: "service" },
  { field: "a board card's stall state", read: validateBoardResponse, base: () => clone("board.json"), set: (j) => (j.columns.find((c: Json) => c.tickets.length).tickets[0].stall = { state: "frozen", quietSince: "2026-09-30T20:00:00Z" }), get: (v) => v.columns.find((c: Json) => c.tickets.length).tickets[0].stall.state, reading: "frozen" },
  { field: "the watchdog's mode", read: validateWatchdogResponse, base: () => clone("watchdog.json"), set: (j) => (j.mode = "escalate"), get: (v) => v.mode, reading: "escalate" },
  { field: "a watchdog item's stall state", read: validateWatchdogResponse, base: () => clone("watchdog.json"), set: (j) => (j.open[0].stall.state = "dormant"), get: (v) => v.open[0].stall.state, reading: "dormant" },
  { field: "a milestone's state", read: validateMilestonesResponse, base: () => clone("milestones.json"), set: (j) => (j.milestones[0].state = "paused"), get: (v) => v.milestones[0].state, reading: "paused" },
  { field: "a release's state", read: validateReleasesResponse, base: () => clone("releases.json"), set: (j) => (j.releases[0].state = "yanked"), get: (v) => v.releases[0].state, reading: "yanked" },
  { field: "a release's app note state", read: validateReleasesResponse, base: () => clone("releases.json"), set: (j) => (j.releases[0].appNote.state = "queued"), get: (v) => v.releases[0].appNote.state, reading: "queued" },
  { field: "a team agent's unsent input", read: validateTeamSnapshot, base: () => clone("team-snapshot.json"), set: (j) => (j.sessions[0].agents[0].unsentInput = "pasted"), get: (v) => v.sessions[0].agents[0].unsentInput, reading: "pasted" },
  { field: "a principal's kind", read: validatePrincipals, base: () => ({ principals: [{ id: "ci", kind: "agent", displayName: "CI" }] }), set: (j) => (j.principals[0].kind = "service"), get: (v) => v.principals[0].kind, reading: "service" },
  { field: "a comment's kind", read: validateCommentsResponse, base: () => clone("comments-progress.json").comments, set: (j) => (j.comments[0].kind = "review"), get: (v) => v.comments[0].kind, reading: "review" },
  { field: "a system comment's code", read: validateCommentsResponse, base: () => clone("comments-progress.json").comments, set: (j) => (j.comments[0].systemCode = "brand_new_code"), get: (v) => v.comments[0].systemCode, reading: "brand_new_code" },
  { field: "a progress line's kind", read: validateProgressResponse, base: () => clone("comments-progress.json").progress, set: (j) => (j.progress[0].kind = "milestone"), get: (v) => v.progress[0].kind, reading: "update" },
  { field: "a progress line's source", read: validateProgressResponse, base: () => clone("comments-progress.json").progress, set: (j) => (j.progress[0].source = "api"), get: (v) => v.progress[0].source, reading: "api" },
  { field: "an envelope's actor kind", read: validateEnvelope, base: () => ({ ...clone("envelope-ticket-moved.json"), seq: 9 }), set: (j) => (j.actor.kind = "service"), get: (v) => v.actor.kind, reading: "service" },
];
for (const c of ENUM_CASES)
  test(`round 48 (r48-enums): an unknown value in ${c.field} keeps the answer, read as ${JSON.stringify(c.reading)}`, () => {
    value(c.read(c.base()));
    const input = c.base();
    c.set(input);
    assert.equal(c.get(value(c.read(input))), c.reading);
  });

test("round 48 (r48-enums): a ticket.progress event of a kind this build does not know is a world event, read as an update", () => {
  const env = value(validateEnvelope({ ...clone("envelope-ticket-moved.json"), seq: 9, type: "ticket.progress", payload: { ticket: "CL-85", agent: "cl-lead", kind: "milestone", text: "half way" } }));
  const event = toWorldEvent(env);
  assert.ok(event?.ok, "an allowlisted payload passes");
  assert.equal((event.value.payload as { kind: string }).kind, "update");
});

test("round 48 (r48-enums): one unknown value in each part keeps the whole snapshot (r48-live L1's six cases)", () => {
  const snapshot = (): Json => ({
    cursor: 5,
    projects: clone("projects.json").projects,
    archivedProjects: [],
    boards: { "crewhub-loops": clone("board.json") },
    team: clone("team-snapshot.json"),
    agents: clone("agents.json").agents,
    principals: [{ id: "cl-lead", kind: "agent", displayName: "CL lead" }],
    watchdog: clone("watchdog.json"),
    milestones: { "crewhub-loops": clone("milestones.json").milestones },
    releases: { "crewhub-loops": clone("releases.json").releases },
  });
  const s = snapshot();
  s.projects[0].icon = "rocket";
  s.projects[0].color = "sage";
  s.boards["crewhub-loops"].columns.find((c: Json) => c.tickets.length).tickets[0].priority = "critical";
  s.principals.push({ id: "ci", kind: "service", displayName: "CI" });
  s.watchdog.mode = "escalate";
  s.quiet = [{ ...clone("envelope-ticket-moved.json"), seq: 4, type: "ticket.quiet", actor: { id: "ci", kind: "service" } }];
  const v = value(validateLoopsSnapshot(s));
  assert.equal(v.projects[0]!.icon, null);
  assert.equal(v.projects[0]!.color, null);
  assert.equal(v.principals[1]!.kind, "service");
  assert.equal(v.quiet![0]!.actor.kind, "service");
});
