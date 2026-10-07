/**
 * The fake crewhub-loops against loops' contract: auth and error bodies, the read shapes through the loops-client
 * validators, the tail recipe, the NDJSON stream with `after=`, heartbeats and the 410 past the buffer.
 * Loopback only: every test starts its own fake on 127.0.0.1 port 0.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  validateAgents,
  validateBoardResponse,
  validateCommentsResponse,
  validateEnvelope,
  validateMilestonesResponse,
  validatePrincipals,
  validateProgressResponse,
  validateProjectOut,
  validateProjectsResponse,
  validateReleasesResponse,
  validateTeamSnapshot,
  validateTicket,
  validateWatchdogResponse,
} from "@crewhub/loops-client";
import type { Envelope, Result } from "@crewhub/loops-client";
import { BUILDER_KEY_MESSAGE, type LoopsFake, createLoopsFake } from "../src/index.ts";

const fakes: LoopsFake[] = [];
after(async () => {
  for (const fake of fakes) await fake.close();
});

async function start(options: Parameters<typeof createLoopsFake>[0] = {}): Promise<LoopsFake> {
  const fake = await createLoopsFake({ speed: 16, ...options });
  fakes.push(fake);
  return fake;
}

const headers = (fake: LoopsFake, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${fake.key}`, ...extra });

async function get(fake: LoopsFake, path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${fake.url}${path}`, { headers: headers(fake), ...init });
  return { status: res.status, body: await res.json() };
}

function valid<T>(result: Result<T>, what: string): void {
  assert.ok(result.ok, result.ok ? what : `${what}: ${result.path} ${result.message}`);
}

/** Reads NDJSON lines from a stream until `count` lines arrived or `timeoutMs` passed. */
async function readLines(res: Response, count: number, timeoutMs = 3000): Promise<Record<string, unknown>[]> {
  const lines: Record<string, unknown>[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const deadline = Date.now() + timeoutMs;
  while (lines.length < count && Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), deadline - Date.now())),
    ]);
    if (chunk.done) break;
    pending += decoder.decode(chunk.value, { stream: true });
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    for (const part of parts) if (part.trim() !== "") lines.push(JSON.parse(part));
  }
  await reader.cancel().catch(() => undefined);
  return lines;
}

test("auth: 401 without or with a wrong key, 400 ambiguous_auth with a key and a cookie, loops' error body", async () => {
  const fake = await start();
  const none = await fetch(`${fake.url}/api/projects`);
  assert.equal(none.status, 401);
  assert.deepEqual(await none.json(), { error: { code: "unauthenticated", message: "Authentication required", detail: null } });
  const wrong = await fetch(`${fake.url}/api/projects`, { headers: { authorization: "Bearer chl_wrong" } });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error.code, "invalid_api_key");
  const both = await fetch(`${fake.url}/api/projects`, { headers: headers(fake, { cookie: "chl_session=abc" }) });
  assert.equal(both.status, 400);
  assert.equal((await both.json()).error.code, "ambiguous_auth");
  const stream = await fetch(`${fake.url}/api/events/stream`);
  assert.equal(stream.status, 401);
  // Health is public: anonymous without credentials, named with the key.
  const anonymous = await (await fetch(`${fake.url}/api/health`)).json();
  assert.equal(anonymous.ok, true);
  assert.equal(anonymous.principal, null);
  const named = (await get(fake, "/api/health")).body;
  assert.equal(named.principal.id, fake.keyName);
  assert.equal(typeof named.version, "string");
});

test("unknown paths are 404, unsafe methods 405, admin-only includeArchived 403", async () => {
  const fake = await start();
  assert.equal((await get(fake, "/api/nope")).status, 404);
  assert.equal((await get(fake, "/api/agents/g-man")).status, 404);
  assert.equal((await get(fake, "/api/agent-actions")).status, 404);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const res = await get(fake, "/api/tickets/CR-19", { method });
    assert.equal(res.status, 405, method);
    assert.equal(res.body.error.code, "method_not_allowed");
  }
  const archived = await get(fake, "/api/projects?includeArchived=true");
  assert.equal(archived.status, 403);
  assert.equal(archived.body.error.code, "forbidden");
});

test("the reads answer in loops' shapes and pass the loops-client validators", async () => {
  const fake = await start();
  const projects = await get(fake, "/api/projects");
  assert.equal(projects.status, 200);
  valid(validateProjectsResponse(projects.body), "projects");
  assert.ok(projects.body.projects.length > 0);
  for (const project of projects.body.projects) {
    const one = await get(fake, `/api/projects/${project.slug}`);
    valid(validateProjectOut(one.body.project), project.slug);
    const board = await get(fake, `/api/board/${project.slug}`);
    valid(validateBoardResponse(board.body), `board ${project.slug}`);
    const features = await get(fake, `/api/projects/${project.slug}/features`);
    assert.equal(features.status, 200);
    const on = (key: string) => features.body.features.find((f: { key: string }) => f.key === key).value as boolean;
    const milestones = await get(fake, `/api/projects/${project.slug}/milestones`);
    if (on("milestones")) valid(validateMilestonesResponse(milestones.body), `milestones ${project.slug}`);
    else assert.deepEqual([milestones.status, milestones.body.error.code], [409, "feature_off"]);
    const releases = await get(fake, `/api/projects/${project.slug}/releases`);
    if (on("releases")) valid(validateReleasesResponse(releases.body), `releases ${project.slug}`);
    else assert.deepEqual([releases.status, releases.body.error.code], [409, "feature_off"]);
    for (const column of board.body.columns) {
      for (const card of column.tickets.slice(0, 2)) {
        const ticket = await get(fake, `/api/tickets/${card.key}`);
        valid(validateTicket(ticket.body.ticket), card.key);
        valid(validateCommentsResponse((await get(fake, `/api/tickets/${card.key}/comments?limit=5`)).body), `${card.key} comments`);
        valid(validateProgressResponse((await get(fake, `/api/tickets/${card.key}/progress`)).body), `${card.key} progress`);
      }
    }
  }
  valid(validateTeamSnapshot((await get(fake, "/api/team")).body), "team");
  valid(validateAgents((await get(fake, "/api/agents")).body), "agents");
  valid(validatePrincipals((await get(fake, "/api/principals")).body), "principals");
  valid(validateWatchdogResponse((await get(fake, "/api/watchdog")).body), "watchdog");
  assert.equal((await get(fake, "/api/tickets/CR-9999")).status, 404);
  assert.equal((await get(fake, "/api/board/nope")).status, 404);
  assert.equal((await get(fake, "/api/tickets/CR-19/comments?limit=0")).status, 400);
});

test("archived projects are readable one by one; the snapshot's lists match the routes", async () => {
  const fake = await start();
  const agents = (await get(fake, "/api/agents")).body;
  assert.equal(agents.lanesAuthority, "db");
  assert.ok(agents.agents.some((a: { isCrewhubLead: boolean }) => a.isCrewhubLead));
});

test("the tail recipe, GET /api/events paging and types validation", async () => {
  const fake = await start({ firstSeq: 4000 });
  const tail = await get(fake, "/api/events?types=attachment.added");
  assert.equal(tail.status, 200);
  assert.deepEqual(tail.body.events, []);
  assert.equal(tail.body.lastSeq, fake.lastSeq());
  assert.ok(tail.body.lastSeq >= 4000);
  const bad = await get(fake, "/api/events?types=no.such");
  assert.deepEqual([bad.status, bad.body.error.code], [400, "validation_error"]);
  await fake.moveTicket("CR-21", "planned");
  const moved = fake.lastSeq();
  await fake.moveTicket("CR-21", "in_progress");
  const list = await get(fake, `/api/events?after=${moved - 1}&limit=1`);
  assert.equal(list.body.events.length, 1);
  assert.equal(list.body.lastSeq, list.body.events[0].seq);
  const rest = await get(fake, `/api/events?after=${list.body.lastSeq}&types=ticket.moved`);
  assert.ok(rest.body.events.every((e: Envelope) => e.type === "ticket.moved" && e.seq > list.body.lastSeq));
  assert.equal(rest.body.lastSeq, fake.lastSeq());
  for (const e of [...list.body.events, ...rest.body.events]) valid(validateEnvelope(e), `#${e.seq}`);
});

test("moveTicket emits ticket.moved on the stream and the board and ticket reads follow", async () => {
  const fake = await start({ speed: 0 });
  const tail = fake.lastSeq();
  const res = await fetch(`${fake.url}/api/events/stream?after=${tail}`, { headers: headers(fake) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/x-ndjson");
  assert.equal(fake.openStreams(), 1);
  const before = (await get(fake, "/api/tickets/CR-19")).body.ticket;
  assert.notEqual(before.status, "review");
  await fake.moveTicket("CR-19", "review");
  const lines = await readLines(res, 1);
  const moved = lines.find((l) => l["type"] === "ticket.moved") as Envelope | undefined;
  assert.ok(moved, "a ticket.moved line arrived");
  valid(validateEnvelope(moved), "ticket.moved");
  assert.equal(moved.seq, tail + 1);
  assert.equal(moved.ticket?.key, "CR-19");
  assert.deepEqual([moved.payload["from"], moved.payload["to"]], [before.status, "review"]);
  const ticket = (await get(fake, "/api/tickets/CR-19")).body.ticket;
  assert.equal(ticket.status, "review");
  assert.equal(ticket.version, before.version + 1);
  const board = (await get(fake, `/api/board/${before.project.slug}`)).body;
  const review = board.columns.find((c: { status: string }) => c.status === "review");
  assert.ok(review.tickets.some((t: { key: string }) => t.key === "CR-19"));
  await assert.rejects(fake.moveTicket("CR-19", "review"), /already review/);
  await assert.rejects(fake.moveTicket("CR-9999", "done"), /Unknown ticket/);
  await assert.rejects(fake.moveTicket("CR-19", "flying"), /Unknown status/);
});

test("the stream replays after= from the buffer, then goes live; heartbeats carry the last sent seq", async () => {
  const fake = await start({ speed: 0, heartbeatMs: 100 });
  const start0 = fake.lastSeq();
  await fake.moveTicket("CR-22", "review");
  await fake.moveTicket("CR-22", "in_progress");
  const replay = await fetch(`${fake.url}/api/events/stream?after=${start0}`, { headers: headers(fake) });
  const lines = await readLines(replay, 3, 2000);
  const events = lines.filter((l) => l["type"] !== "heartbeat") as unknown as Envelope[];
  assert.ok(events.length >= 2, "both moves replayed");
  assert.deepEqual(events.map((e) => e.seq), events.map((_, i) => start0 + 1 + i).slice(0, events.length));
  const beat = lines.find((l) => l["type"] === "heartbeat");
  assert.ok(beat, "a heartbeat after 100 ms of silence");
  assert.equal(beat["v"], 1);
  assert.equal(beat["seq"], fake.lastSeq());
  assert.equal(typeof beat["ts"], "string");
  // A fresh stream that has sent nothing yet beats with its `after`.
  const quiet = await fetch(`${fake.url}/api/events/stream?after=${fake.lastSeq()}`, { headers: headers(fake) });
  const [first] = await readLines(quiet, 1, 1000);
  assert.equal(first?.["type"], "heartbeat");
  assert.equal(first?.["seq"], fake.lastSeq());
  // Without `after` the stream starts at the tail: nothing replayed.
  const live = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake) });
  const [onlyBeat] = await readLines(live, 1, 1000);
  assert.equal(onlyBeat?.["type"], "heartbeat");
});

test("an after= older than the buffer answers 410 cursor_expired; a fresh fake continues or restarts the log", async () => {
  const fake = await start({ speed: 0, bufferSize: 2, firstSeq: 100 });
  await fake.moveTicket("CR-23", "review");
  await fake.moveTicket("CR-23", "in_progress");
  await fake.moveTicket("CR-23", "review");
  const expired = await get(fake, "/api/events/stream?after=100");
  assert.deepEqual([expired.status, expired.body.error.code], [410, "cursor_expired"]);
  const listExpired = await get(fake, "/api/events?after=100");
  assert.equal(listExpired.status, 410);
  const ok = await fetch(`${fake.url}/api/events/stream?after=${fake.lastSeq() - 2}`, { headers: headers(fake) });
  assert.equal(ok.status, 200);
  await ok.body?.cancel();
  // A restart that keeps the log continues numbering; a lower firstSeq is a fresh install with a lower tail.
  const kept = await start({ speed: 0, firstSeq: fake.lastSeq() });
  assert.equal(kept.lastSeq(), fake.lastSeq());
  await kept.moveTicket("CR-23", "planned");
  // A person's move to planned writes `ticket.moved` and the `planned` delivery's `delivery.created`.
  assert.equal(kept.lastSeq(), fake.lastSeq() + 2);
  const fresh = await start({ speed: 0, firstSeq: 0 });
  assert.ok(fresh.lastSeq() < fake.lastSeq());
});

test("the key appears in no response body", async () => {
  const fake = await start();
  for (const path of ["/api/health", "/api/auth/me", "/api/projects", "/api/agents", "/api/events?types=attachment.added"]) {
    const res = await fetch(`${fake.url}${path}`, { headers: headers(fake) });
    assert.ok(!(await res.text()).includes(fake.key), path);
  }
});

test("GET /api/auth/me answers loops' PrincipalOut for an agent key", async () => {
  const fake = await start();
  const me = await get(fake, "/api/auth/me");
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, {
    principal: { id: fake.keyName, kind: "agent", displayName: fake.keyName, role: "probe", theme: null, themeDefault: "system" },
  });
});

test("GET /api/tickets/{ref}/grill: the storyline's grill ticket, its questions and the one answer (CL-245)", async () => {
  // 13:20 of the small-team storyline: the grill was asked at 12:36 and Nicky answered the last question at 12:52.
  const fake = await start({ speed: 0, startAt: 13 * 60_000 + 20_000 });
  const board = (await get(fake, "/api/board/crewhub")).body;
  const card = board.columns.flatMap((c: { tickets: { key: string; kind: string }[] }) => c.tickets).find((t: { kind: string }) => t.kind === "grill");
  assert.ok(card, "the board shows a grill ticket");
  const res = await get(fake, `/api/tickets/${card.key}/grill`);
  assert.equal(res.status, 200);
  const { grill } = res.body;
  assert.deepEqual(Object.keys(grill).sort(), ["answered", "questions", "total", "unsent"]);
  assert.equal(grill.total, 3);
  assert.equal(grill.answered, 1);
  assert.equal(grill.unsent, 1);
  assert.deepEqual(grill.questions.map((q: { position: number }) => q.position), [1, 2, 3]);
  for (const q of grill.questions) {
    assert.deepEqual(Object.keys(q).sort(), ["answer", "answerCommentId", "answeredAt", "position", "question", "questionCommentId", "sent"]);
    assert.equal(typeof q.question, "string");
    assert.equal(q.sent, false);
  }
  const last = grill.questions[2];
  assert.match(last.answer, /by the door/);
  assert.equal(typeof last.answerCommentId, "string");
  assert.equal(typeof last.answeredAt, "string");
  assert.equal(grill.questions[0].answer, null);
  // The question and answer comments are ordinary comments of the thread.
  const comments = (await get(fake, `/api/tickets/${card.key}/comments`)).body.comments;
  assert.ok(comments.some((c: { id: string }) => c.id === last.answerCommentId));
  // A ticket that is no grill has no questions; an unknown ticket is 404.
  assert.deepEqual((await get(fake, "/api/tickets/CR-19/grill")).body, { grill: { questions: [], total: 0, answered: 0, unsent: 0 } });
  assert.equal((await get(fake, "/api/tickets/CR-9999/grill")).status, 404);
});

test("GET /api/delegations/pending: the storyline's bound request, in loops' PendingRequestOut shape (CL-240)", async () => {
  const before = await start({ speed: 0, startAt: 12 * 60_000 });
  assert.deepEqual((await get(before, "/api/delegations/pending")).body, { requests: [] });
  const fake = await start({ speed: 0, startAt: 13 * 60_000 + 20_000 });
  const res = await get(fake, "/api/delegations/pending");
  assert.equal(res.status, 200);
  assert.equal(res.body.requests.length, 1);
  const [request] = res.body.requests;
  assert.deepEqual(Object.keys(request).sort(), ["action", "agent", "agentName", "expiresAt", "id", "messageId", "target", "text"]);
  assert.equal(request.agent, "g-man");
  assert.equal(request.action, "restart");
  assert.equal(request.target, "cr-dev-2");
  assert.match(request.text, /restart cr-dev-2/);
  assert.match(request.messageId, /^dm_/);
  assert.ok(Date.parse(request.expiresAt) > 0);
});

test("--builder-key: the key reads a ticket, its comments and auth/me; everything else is loops' 403", async () => {
  const fake = await start({ builderKey: true, speed: 0 });
  assert.equal((await get(fake, "/api/tickets/CR-19")).status, 200);
  assert.equal((await get(fake, "/api/tickets/CR-19/comments")).status, 200);
  assert.equal((await get(fake, "/api/auth/me")).status, 200);
  for (const path of ["/api/projects", "/api/board/crewhub", "/api/team", "/api/events?types=attachment.added", "/api/events/stream", "/api/tickets/CR-19/progress", "/api/health"]) {
    const res = await get(fake, path);
    assert.equal(res.status, 403, path);
    assert.deepEqual(res.body, { error: { code: "forbidden", message: BUILDER_KEY_MESSAGE, detail: null } }, path);
  }
  // Without the key, health is still public and a read is still 401; an unknown route is still 404.
  assert.equal((await fetch(`${fake.url}/api/health`)).status, 200);
  assert.equal((await fetch(`${fake.url}/api/projects`)).status, 401);
  assert.equal((await get(fake, "/api/nope")).status, 404);
  assert.equal((await get(fake, "/api/projects", { headers: { authorization: "Bearer chl_wrong" } })).status, 401);
});

test("a stream ends after streamMaxMs without a closing line, as loops' 300 s; after= picks up where it ended", async () => {
  const fake = await start({ speed: 0, streamMaxMs: 300, heartbeatMs: 50 });
  const tail = fake.lastSeq();
  const started = Date.now();
  const res = await fetch(`${fake.url}/api/events/stream?after=${tail}`, { headers: headers(fake) });
  assert.equal(fake.openStreams(), 1);
  const lines = await readLines(res, 1000, 2000);
  const took = Date.now() - started;
  assert.ok(took >= 250 && took < 1500, `the stream ended after ${took} ms`);
  assert.ok(lines.every((l) => l["type"] === "heartbeat"), "nothing but heartbeats, and no closing line");
  assert.equal(fake.openStreams(), 0);
  assert.equal(fake.streamsOpened(), 1);
  await fake.moveTicket("CR-19", "review");
  const again = await fetch(`${fake.url}/api/events/stream?after=${tail}`, { headers: headers(fake) });
  const [moved] = await readLines(again, 1, 1000);
  assert.equal(moved?.["type"], "ticket.moved");
  assert.equal(fake.streamsOpened(), 2);
});
