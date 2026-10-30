/**
 * The fake crewhub-loops against loops' contract: auth and error bodies, the read shapes through the loops-client
 * validators, `from=tail` and the sealed cursor, the NDJSON stream with `after=` or `cursor=`, heartbeats with a
 * cursor, the 429 at the fifth stream, the 410 past the buffer, and what the live round taught (docs/LOOPS_REAL_VS_FAKE.md):
 * per-principal visibility with gaps, person-only moves into Done, archived projects in the log, the empty team
 * snapshot, the reserved labels, `Last-Event-ID` and the two faces of `/api/health`.
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
import { PERSON_DONE_AT, demoScenario } from "@crewhub/demo";
import {
  ADMIN_ONLY_EVENT_TYPES,
  BUILDER_KEY_MESSAGE,
  CURSOR_EXPIRED_MESSAGE,
  INCLUDE_ARCHIVED_MESSAGE,
  MAX_STREAMS_PER_KEY,
  RESERVED_LABELS,
  type LoopsFake,
  createLoopsFake,
} from "../src/index.ts";

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
  assert.equal(agents.agentHome, null);
  assert.ok(agents.agents.some((a: { isCrewhubLead: boolean }) => a.isCrewhubLead));
  // 4cdcd383: lanes with desired and observed values (some drift), computers, and the key's principal as an external bot.
  const laned = agents.agents.filter((a: { lane: unknown }) => a.lane !== null);
  assert.ok(laned.length >= 5, `${laned.length} laned agents`);
  assert.ok(laned.some((a: { lane: { drift: string[] | null } }) => (a.lane.drift ?? []).length > 0), "some lane drifts");
  assert.ok(laned.every((a: { lane: { desired: { permissionMode: string } } }) => typeof a.lane.desired.permissionMode === "string"));
  assert.ok(agents.agents.every((a: { computer: { kind: string } | null }) => a.computer?.kind === "this"));
  const bot = agents.agents.find((a: { id: string }) => a.id === fake.keyName);
  assert.equal(bot?.external, true);
  assert.equal(bot?.lane, null);
  const team = (await get(fake, "/api/team")).body;
  assert.ok(team.sessions.length > 0 && team.sessions.every((s: { computer: { name: string } | null }) => s.computer?.name === "This computer"));
});

test("from=tail, the honest lastSeq of CL-390, GET /api/events paging, the sealed cursor and types validation", async () => {
  // Speed 0: the storyline stands still, so the log holds exactly the moves below and every seq is known.
  const fake = await start({ firstSeq: 4000, speed: 0 });
  const tail = await get(fake, "/api/events?from=tail");
  assert.equal(tail.status, 200);
  assert.deepEqual(tail.body.events, []);
  assert.equal(tail.body.lastSeq, fake.lastSeq());
  assert.ok(tail.body.lastSeq >= 4000);
  assert.match(tail.body.cursor, /^[A-Za-z0-9_-]{40,128}$/, "a sealed-looking opaque cursor");
  // The old tail trick is broken on the real loops: a filter that matches nothing answers `after`, so lastSeq is 0.
  const trick = await get(fake, "/api/events?types=attachment.added&limit=1");
  assert.deepEqual([trick.body.events, trick.body.lastSeq], [[], 0]);
  const bad = await get(fake, "/api/events?types=no.such");
  assert.deepEqual([bad.status, bad.body.error.code], [400, "validation_error"]);
  assert.equal((await get(fake, "/api/events?from=head")).status, 400);
  await fake.moveTicket("CR-21", "planned");
  const moved = fake.lastSeq();
  await fake.moveTicket("CR-21", "in_progress");
  const list = await get(fake, `/api/events?after=${moved - 1}&limit=1`);
  assert.equal(list.body.events.length, 1);
  assert.equal(list.body.lastSeq, list.body.events[0].seq);
  const rest = await get(fake, `/api/events?after=${list.body.lastSeq}&types=ticket.moved`);
  assert.ok(rest.body.events.every((e: Envelope) => e.type === "ticket.moved" && e.seq > list.body.lastSeq));
  assert.equal(rest.body.lastSeq, rest.body.events.at(-1).seq, "the last row returned");
  for (const e of [...list.body.events, ...rest.body.events]) valid(validateEnvelope(e), `#${e.seq}`);
  // The sealed cursor resumes exactly where that answer's judgement ended: nothing before it, everything after.
  const resumed = await get(fake, `/api/events?cursor=${encodeURIComponent(tail.body.cursor)}`);
  assert.equal(resumed.status, 200);
  assert.ok(resumed.body.events.length >= 2 && resumed.body.events[0].seq === tail.body.lastSeq + 1, "the moves after the tail read");
  assert.equal(resumed.body.lastSeq, fake.lastSeq());
  const both = await get(fake, `/api/events?cursor=${encodeURIComponent(tail.body.cursor)}&after=1`);
  assert.deepEqual([both.status, both.body.error.code, both.body.error.message], [400, "validation_error", "Send either cursor or after, not both"]);
  // A token is 34 bytes, 46 base64url chars: the last char carries two bits and four of padding, which the decoder
  // (Node's and loops' urlsafe_b64decode alike) drops. So a token that differs only in its padding bits is the same
  // token and opens, and a "corruption" of the last chars is none one time in 256: the corrupted token below changes
  // a char whose six bits all count, inside the MAC, and the test proves the bytes differ before it asks.
  const padded = tail.body.cursor.slice(0, -1) + otherPadding(tail.body.cursor.at(-1)!);
  assert.notEqual(padded, tail.body.cursor);
  assert.equal((await get(fake, `/api/events?cursor=${encodeURIComponent(padded)}`)).status, 200, "the same bytes under other padding bits");
  const other = await start({ firstSeq: 4000, speed: 0 });
  for (const foreign of ["bogus", corrupted(tail.body.cursor), (await get(other, "/api/events?from=tail")).body.cursor]) {
    assert.ok(!Buffer.from(foreign, "base64url").equals(Buffer.from(tail.body.cursor, "base64url")), "the foreign token is other bytes");
    const gone = await get(fake, `/api/events?cursor=${encodeURIComponent(foreign)}`);
    assert.deepEqual([gone.status, gone.body.error?.code, gone.body.error?.message], [410, "cursor_expired", CURSOR_EXPIRED_MESSAGE], `foreign ${foreign.slice(0, 12)}`);
  }
});

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** The token with one char of its MAC replaced by another: always other bytes, so the seal never matches. */
function corrupted(token: string): string {
  const at = 30; // chars 29–45 encode the 12 MAC bytes; char 30 carries six bits that all count
  return token.slice(0, at) + BASE64URL[(BASE64URL.indexOf(token[at]!) + 1) % 64] + token.slice(at + 1);
}
/** Another last char with the same two significant bits: the same bytes, written differently. */
function otherPadding(last: string): string {
  const index = BASE64URL.indexOf(last);
  return BASE64URL[(index & 0x30) | ((index + 4) & 0x0f)]!;
}

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
  assert.match(String(beat["cursor"]), /^[A-Za-z0-9_-]{40,128}$/, "the heartbeat carries a sealed cursor");
  assert.deepEqual(Object.keys(beat), ["v", "type", "seq", "cursor", "ts"], "ts last, as loops writes it");
  // A fresh stream that has sent nothing yet beats with its `after`.
  const quiet = await fetch(`${fake.url}/api/events/stream?after=${fake.lastSeq()}`, { headers: headers(fake) });
  const [first] = await readLines(quiet, 1, 1000);
  assert.equal(first?.["type"], "heartbeat");
  assert.equal(first?.["seq"], fake.lastSeq());
  // Without `after` the stream starts at the tail: nothing replayed.
  const live = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake) });
  const [onlyBeat] = await readLines(live, 1, 1000);
  assert.equal(onlyBeat?.["type"], "heartbeat");
  // `cursor=` from that heartbeat reopens the stream where it stood: a move after it is replayed, nothing before.
  await fake.moveTicket("CR-22", "review");
  const resumed = await fetch(`${fake.url}/api/events/stream?cursor=${encodeURIComponent(String(onlyBeat?.["cursor"]))}`, { headers: headers(fake) });
  assert.equal(resumed.status, 200);
  const [replayed] = await readLines(resumed, 1, 1000);
  assert.equal(replayed?.["type"], "ticket.moved");
  assert.equal(replayed?.["seq"], Number(onlyBeat?.["seq"]) + 1);
  const both = await fetch(`${fake.url}/api/events/stream?cursor=${encodeURIComponent(String(onlyBeat?.["cursor"]))}&after=1`, { headers: headers(fake) });
  assert.equal(both.status, 400);
  const foreign = await fetch(`${fake.url}/api/events/stream?cursor=not-a-cursor-at-all`, { headers: headers(fake) });
  assert.equal(foreign.status, 410);
  assert.equal((await foreign.json()).error.code, "cursor_expired");
});

test("the fifth open stream of the key is 429 too_many_streams with Retry-After: 5; a closed one frees its slot", async () => {
  const fake = await start({ speed: 0, heartbeatMs: 50 });
  const open: Response[] = [];
  for (let i = 0; i < MAX_STREAMS_PER_KEY; i += 1) {
    const res = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake) });
    assert.equal(res.status, 200, `stream ${i + 1}`);
    open.push(res);
  }
  assert.equal(fake.openStreams(), MAX_STREAMS_PER_KEY);
  const fifth = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake) });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.headers.get("retry-after"), "5");
  assert.deepEqual(await fifth.json(), { error: { code: "too_many_streams", message: "Too many open event streams", detail: null } });
  await open[0]!.body!.cancel();
  for (let i = 0; i < 50 && fake.openStreams() === MAX_STREAMS_PER_KEY; i += 1) await new Promise((r) => setTimeout(r, 20));
  const again = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake) });
  assert.equal(again.status, 200, "the freed slot admits a new stream");
  for (const res of [...open.slice(1), again]) await res.body?.cancel();
});

test("a sealed cursor from before a storyline loop is expired as an after= is: the host re-snapshots (round 48)", async () => {
  // The host resumes with a heartbeat's sealed cursor when no event followed it. At a loop the demo rebuilds its store,
  // so a cursor from the loop before must not open: else the host reconnects without a 410, the tabs hear no reset and
  // keep the old loop's world (seen with a 100 ms heartbeat between the loop's last event and its end).
  const fake = await start({ speed: 16, startAt: demoScenario("small-team").story.durationMs - 8_000 });
  const tail = await get(fake, "/api/events?from=tail");
  const before = fake.lastSeq();
  for (let i = 0; i < 60 && fake.lastSeq() < before + 1000; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(fake.lastSeq() >= before + 1000, "the loop ended");
  const stream = await fetch(`${fake.url}/api/events/stream?cursor=${encodeURIComponent(tail.body.cursor)}`, { headers: headers(fake) });
  const streamBody = stream.status === 200 ? (await stream.body?.cancel(), null) : await stream.json();
  assert.deepEqual([stream.status, streamBody?.error?.code], [410, "cursor_expired"], "the stream");
  const list = await get(fake, `/api/events?cursor=${encodeURIComponent(tail.body.cursor)}`);
  assert.deepEqual([list.status, list.body.error?.code], [410, "cursor_expired"], "the list");
  const fresh = await get(fake, "/api/events?from=tail");
  const open = await fetch(`${fake.url}/api/events/stream?cursor=${encodeURIComponent(fresh.body.cursor)}`, { headers: headers(fake) });
  assert.equal(open.status, 200, "a cursor of the new loop opens");
  await open.body?.cancel();
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

test("GET /api/auth/me answers loops' PrincipalOut for an external bot's key: role lead", async () => {
  const fake = await start();
  const me = await get(fake, "/api/auth/me");
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, {
    principal: { id: fake.keyName, kind: "agent", displayName: fake.keyName, role: "lead", theme: null, themeDefault: "system" },
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

/** Reads NDJSON lines until one satisfies `wanted` (that line is the last returned) or `timeoutMs` passed. */
async function readUntil(res: Response, wanted: (line: Record<string, unknown>) => boolean, timeoutMs: number): Promise<Record<string, unknown>[]> {
  const lines: Record<string, unknown>[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const deadline = Date.now() + timeoutMs;
  let found = false;
  while (!found && Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), deadline - Date.now())),
    ]);
    if (chunk.done) break;
    pending += decoder.decode(chunk.value, { stream: true });
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    for (const part of parts) {
      if (part.trim() === "" || found) continue;
      const line = JSON.parse(part) as Record<string, unknown>;
      lines.push(line);
      if (wanted(line)) found = true;
    }
  }
  await reader.cancel().catch(() => undefined);
  return lines;
}

test("visibility: the key does not see every seq. The install's history hides seq 1 and 2, chat is a gap, from=tail and the heartbeat say the visible tail; visibility: all shows every row", async () => {
  // A fresh install (firstSeq 0) starts with the owner making the key's bot: two admin-only rows the key never sees,
  // then the archived project of the small team as a `project.archived` the key may see.
  const fake = await start({ speed: 0 });
  assert.equal(fake.lastSeq(), 3);
  assert.equal(fake.lastVisibleSeq(), 3);
  const list = await get(fake, "/api/events?after=0");
  assert.deepEqual(list.body.events.map((e: Envelope) => [e.seq, e.type]), [[3, "project.archived"]], "seq 1 and 2 are a gap");
  assert.equal(list.body.lastSeq, 3);
  const tail = await get(fake, "/api/events?from=tail");
  assert.equal(tail.body.lastSeq, 3);
  const all = await start({ speed: 0, visibility: "all" });
  const every = await get(all, "/api/events?after=0");
  assert.deepEqual(every.body.events.map((e: Envelope) => [e.seq, e.type]), [[1, "agent.created"], [2, "agent-membership.updated"], [3, "project.archived"]]);
  assert.ok(every.body.events.slice(0, 2).every((e: Envelope) => ADMIN_ONLY_EVENT_TYPES.includes(e.type) && e.actor.kind === "user"));
  // A restart that keeps the log (firstSeq = the old tail) writes no history again.
  const kept = await start({ speed: 0, firstSeq: 3 });
  assert.deepEqual([kept.lastSeq(), kept.lastVisibleSeq()], [3, 3]);
  // The storyline's chat (3:52 a dm from the person to g-man, 4:21 the reply) is a thread the key is no part of:
  // hidden rows, so the visible seqs have gaps where a fake that hides nothing has `dm.created`.
  const hidden = await start({ speed: 16, startAt: 3 * 60_000 + 50_000 });
  const shown = await start({ speed: 16, startAt: 3 * 60_000 + 50_000, visibility: "all" });
  // Both play the same storyline from the same position, so the same seqs; wait until the reply at 4:21 is in the
  // shown fake's log and the hidden fake has played at least as far (the demo's clock may lag wall time under load).
  let log: Envelope[] = [];
  const pollLog = async () => {
    log = (await get(shown, "/api/events?after=0")).body.events as Envelope[];
    return log.filter((e) => e.type === "dm.created").length >= 2 && hidden.lastSeq() >= shown.lastSeq();
  };
  for (let i = 0; i < 300 && !(await pollLog()); i += 1) await new Promise((r) => setTimeout(r, 50));
  const seen = (await get(hidden, "/api/events?after=0")).body.events as Envelope[];
  assert.ok(log.filter((e) => e.type === "dm.created").length >= 2, `the log holds the chat (${log.map((e) => e.type).join(", ")})`);
  assert.ok(seen.every((e) => !e.type.startsWith("dm.")), "the key sees no chat");
  assert.ok(seen.length > 1 && seen.some((e, i) => i > 0 && e.seq > (seen[i - 1] as Envelope).seq + 1), `gaps in ${seen.map((e) => e.seq).join(" ")}`);
  // `from=tail` and a live stream's first heartbeat say the newest seq the key may see, never a hidden row.
  const tailNow = await get(hidden, "/api/events?from=tail");
  assert.equal(tailNow.body.lastSeq, hidden.lastVisibleSeq());
  assert.ok(hidden.lastVisibleSeq() <= hidden.lastSeq());
  const later = await get(hidden, `/api/events?cursor=${encodeURIComponent(tailNow.body.cursor)}`);
  assert.ok(later.body.events.every((e: Envelope) => e.seq > tailNow.body.lastSeq));
});

test("human_only_done: the storyline's moves into Done are a person's, with the principal; a rejected move too; the fake's agents never move into Done", async () => {
  // The small-team storyline's move of CR-18 into Done by Nicky (PERSON_DONE_AT; the Done moves are all the person's:
  // loops' 403 `human_only_done` for an agent, `domain/tickets.py` `require_human_for_done`, which the demo's script obeys).
  const [minutes, seconds] = (PERSON_DONE_AT["CR-18"] as string).split(":").map(Number) as [number, number];
  const fake = await start({ speed: 16, startAt: (minutes * 60 + seconds) * 1000 - 10_000 });
  const res = await fetch(`${fake.url}/api/events/stream?after=${fake.lastSeq()}`, { headers: headers(fake) });
  // Read until Nicky's move of CR-18.
  const lines = await readUntil(res, (l) => l["type"] === "ticket.moved" && (l["ticket"] as { key: string } | null)?.key === "CR-18" && (l["payload"] as { to: string }).to === "done", 15_000);
  const moves = lines.filter((l) => l["type"] === "ticket.moved") as unknown as Envelope[];
  const done = moves.filter((e) => e.payload["to"] === "done");
  assert.ok(done.length >= 1, `a move into Done arrived (${moves.map((e) => `${e.ticket?.key}→${e.payload["to"]}`).join(", ")})`);
  for (const e of done) assert.deepEqual(e.actor, { id: "nicky", kind: "user" }, `${e.ticket?.key} into Done carries the person`);
  assert.ok(done.some((e) => e.ticket?.key === "CR-18"));
  const principals = (await get(fake, "/api/principals")).body.principals as { id: string; kind: string; displayName: string }[];
  assert.deepEqual(principals.find((p) => p.id === "nicky"), { id: "nicky", kind: "user", displayName: "Nicky" }, "the principal the world names");
  assert.ok(moves.filter((e) => e.actor.kind === "agent").every((e) => e.payload["to"] !== "done"), "no agent moved into Done");
  // The fake's own move is the person's too, and `rejected` turns the work down with the reason in the payload.
  const still = await start({ speed: 0 });
  const stream = await fetch(`${still.url}/api/events/stream?after=${still.lastSeq()}`, { headers: headers(still) });
  await still.moveTicket("CR-19", "done");
  await still.moveTicket("CR-21", "done", { rejected: "The sign already shows the counts." });
  const [approved, rejected] = (await readLines(stream, 2)) as unknown as Envelope[];
  assert.deepEqual([approved?.type, approved?.actor, approved?.payload["to"], approved?.payload["resolution"]], ["ticket.moved", { id: "nicky", kind: "user" }, "done", undefined]);
  assert.deepEqual([rejected?.type, rejected?.actor, rejected?.payload["to"], rejected?.payload["resolution"], rejected?.payload["resolutionReason"]], ["ticket.moved", { id: "nicky", kind: "user" }, "done", "rejected", "The sign already shows the counts."]);
  assert.equal((await get(still, "/api/tickets/CR-21")).body.ticket.resolution, "rejected");
});

test("archived projects: hidden from the list, 403 with loops' words for includeArchived, resolved by slug, and in the log from the start; project.restored at 5:00 and project.archived at 13:44 play on the stream", async () => {
  const fake = await start({ speed: 0 });
  const listed = (await get(fake, "/api/projects")).body.projects.map((p: { slug: string }) => p.slug);
  assert.ok(!listed.includes("ops-tooling"), `ops-tooling is archived and not listed (${listed.join(", ")})`);
  const forbidden = await get(fake, "/api/projects?includeArchived=true");
  assert.deepEqual([forbidden.status, forbidden.body.error], [403, { code: "forbidden", message: INCLUDE_ARCHIVED_MESSAGE, detail: null }]);
  const one = await get(fake, "/api/projects/ops-tooling");
  assert.equal(one.status, 200);
  valid(validateProjectOut(one.body.project), "an archived project");
  assert.equal(typeof one.body.project.archivedAt, "string");
  // The host learns archived slugs from the log: `types=project.archived,project.restored&after=0` names it from the start.
  const history = await get(fake, "/api/events?after=0&types=project.archived,project.restored");
  assert.deepEqual(history.body.events.map((e: Envelope) => [e.type, e.project?.slug, e.payload["new"]]), [["project.archived", "ops-tooling", { archivedAt: one.body.project.archivedAt }]]);
  valid(validateEnvelope(history.body.events[0]), "project.archived");
  // 5:00: the person restores it; the stream says so and the list shows it again.
  const restoring = await start({ speed: 16, startAt: 4 * 60_000 + 58_000 });
  const res = await fetch(`${restoring.url}/api/events/stream?after=${restoring.lastSeq()}`, { headers: headers(restoring) });
  const lines = await readUntil(res, (l) => l["type"] === "project.restored", 15_000);
  assert.deepEqual(lines.map((l) => l["type"]), ["project.restored"], "the restore is the first line after 4:58");
  assert.deepEqual([(lines[0]?.["project"] as { slug: string })?.slug, (lines[0]?.["actor"] as { kind: string })?.kind], ["ops-tooling", "user"]);
  const back = (await get(restoring, "/api/projects")).body.projects.find((p: { slug: string }) => p.slug === "ops-tooling");
  assert.equal(back?.archivedAt, null);
  assert.equal((await get(restoring, "/api/board/ops-tooling")).status, 200);
  // 13:44: archived again; the list drops it, the slug still resolves, archivedAt is set.
  const closing = await start({ speed: 16, startAt: 13 * 60_000 + 42_000 });
  const res2 = await fetch(`${closing.url}/api/events/stream?after=${closing.lastSeq()}&types=project.archived`, { headers: headers(closing) });
  const [archived] = await readUntil(res2, (l) => l["type"] === "project.archived", 15_000);
  assert.deepEqual([archived?.["type"], (archived?.["project"] as { slug: string })?.slug], ["project.archived", "ops-tooling"]);
  assert.ok(!(await get(closing, "/api/projects")).body.projects.some((p: { slug: string }) => p.slug === "ops-tooling"));
  assert.equal(typeof (await get(closing, "/api/projects/ops-tooling")).body.project.archivedAt, "string");
});

test("emptyTeam: GET /api/team is {v:1, ts:'', sessions:[]} as on an instance without a team probe; the validators accept it", async () => {
  const fake = await start({ speed: 0, emptyTeam: true });
  const team = await get(fake, "/api/team");
  assert.deepEqual(team.body, { v: 1, ts: "", sessions: [] });
  valid(validateTeamSnapshot(team.body), "the empty snapshot");
  assert.ok((await get(await start({ speed: 0 }), "/api/team")).body.sessions.length > 0, "the default still serves the demo's snapshot");
});

test("labels: GET /api/labels lists the global labels, all reserved names; a project's list adds its own; an unknown project is 404", async () => {
  const fake = await start({ speed: 0 });
  const globals = (await get(fake, "/api/labels")).body.labels as { name: string; projectId: string | null }[];
  assert.ok(globals.length >= 2);
  assert.ok(globals.every((l) => l.projectId === null && RESERVED_LABELS.includes(l.name)), globals.map((l) => l.name).join(", "));
  const project = (await get(fake, "/api/projects/crewhub/labels")).body.labels as { name: string; projectId: string | null }[];
  assert.ok(globals.every((g) => project.some((l) => l.name === g.name)), "the globals are in a project's list");
  assert.ok(project.some((l) => l.projectId !== null && !RESERVED_LABELS.includes(l.name)), "and the project's own");
  for (const l of project) assert.deepEqual(Object.keys(l).sort(), ["color", "id", "name", "projectId", "revision"]);
  assert.equal((await get(fake, "/api/projects/nope/labels")).status, 404);
});

test("Last-Event-ID: an integer header is after, anything else a sealed cursor (410 when it does not open); the after query wins over the header", async () => {
  const fake = await start({ speed: 0, heartbeatMs: 100 });
  const before = fake.lastSeq();
  await fake.moveTicket("CR-22", "review");
  await fake.moveTicket("CR-22", "in_progress");
  const byHeader = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake, { "last-event-id": String(before) }) });
  const lines = await readLines(byHeader, 3, 1500);
  const events = lines.filter((l) => l["type"] !== "heartbeat");
  assert.deepEqual(events.map((e) => e["seq"]), [before + 1, before + 2], "replayed from the header's position");
  const beat = lines.find((l) => l["type"] === "heartbeat");
  assert.ok(beat, "a heartbeat with a cursor");
  await fake.moveTicket("CR-22", "review");
  const byCursor = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake, { "last-event-id": String(beat?.["cursor"]) }) });
  const [resumed] = await readLines(byCursor, 1, 1000);
  assert.deepEqual([resumed?.["type"], resumed?.["seq"]], ["ticket.moved", before + 3], "the header's cursor resumes where the heartbeat stood");
  const queryWins = await fetch(`${fake.url}/api/events/stream?after=${before + 2}`, { headers: headers(fake, { "last-event-id": String(before) }) });
  const [afterQuery] = await readLines(queryWins, 1, 1000);
  assert.equal(afterQuery?.["seq"], before + 3, "the after query wins over the header");
  const bogus = await fetch(`${fake.url}/api/events/stream`, { headers: headers(fake, { "last-event-id": "not-a-cursor" }) });
  assert.deepEqual([bogus.status, (await bogus.json()).error.code], [410, "cursor_expired"]);
  // The list route reads the header the same way.
  const list = await get(fake, "/api/events", { headers: headers(fake, { "last-event-id": String(before + 1) }) });
  assert.deepEqual(list.body.events.map((e: Envelope) => e.seq), [before + 2, before + 3]);
  const both = await get(fake, "/api/events?cursor=x&after=1", { headers: headers(fake, { "last-event-id": "1" }) });
  assert.equal(both.status, 400, "cursor and after together stay a 400 whatever the header says");
});

test("GET /api/health: anonymous carries the version and no principal or watchdog; with the key the bot is named and the watchdog filled", async () => {
  const fake = await start({ speed: 0 });
  const anonymous = await (await fetch(`${fake.url}/api/health`)).json();
  assert.deepEqual([anonymous.ok, typeof anonymous.version, anonymous.principal, anonymous.watchdog, anonymous.laneWakesForcedOff], [true, "string", null, null, false]);
  assert.deepEqual(Object.keys(anonymous.checks).sort(), ["db", "laneWatch", "socket", "tcp", "uploads"]);
  const named = (await get(fake, "/api/health")).body;
  assert.equal(named.version, anonymous.version);
  assert.deepEqual(named.principal, { id: fake.keyName, kind: "agent", displayName: fake.keyName });
  assert.equal(typeof named.watchdog?.mode, "string");
  const wrong = await fetch(`${fake.url}/api/health`, { headers: { authorization: "Bearer chl_wrong" } });
  assert.equal(wrong.status, 200, "health stays public with a wrong key");
  assert.equal((await wrong.json()).principal, null);
});

test("round 7: ticket.quiet and automation.ran reach the key the loops way; owner-request.updated never does (a person's alone)", async () => {
  // Start just before the storyline's quiet fact (8:10) at 16x: the fact, three runs and the owner's two changes
  // (9:42, 9:50) pass within seven wall seconds. Wait for the state (the last run), never for the clock.
  const startAt = (8 * 60 + 8) * 1000;
  const fake = await start({ startAt, speed: 16, heartbeatMs: 100 });
  const from = fake.lastVisibleSeq();
  const res = await fetch(`${fake.url}/api/events/stream?after=${from}`, { headers: headers(fake) });
  assert.equal(res.status, 200);
  const lines = await readUntil(res, (l) => l["type"] === "automation.ran" && (l["payload"] as { runId: string }).runId === "run_demo_3", 30_000);
  const quiet = lines.filter((l) => l["type"] === "ticket.quiet") as unknown as Envelope[];
  assert.equal(quiet.length, 1, "one quiet fact");
  assert.deepEqual(quiet[0]!.actor, { id: "system", kind: "system" });
  assert.deepEqual(Object.keys(quiet[0]!.payload).sort(), ["minutes", "since", "status", "ticket"]);
  assert.equal(quiet[0]!.ticket?.key, "CR-17");
  const runs = lines.filter((l) => l["type"] === "automation.ran") as unknown as Envelope[];
  assert.deepEqual(runs.map((e) => [e.ticket?.key, e.payload["outcome"], e.actor.kind]), [["CR-20", "ok", "system"], ["CR-21", "ok", "system"], ["CL-76", "failed", "system"]]);
  assert.deepEqual((runs[0]!.payload["automation"] as { name: string }).name, "Label stale bugs");
  const flagged = lines.find((l) => l["type"] === "ticket.updated" && (l["payload"] as { automation?: unknown }).automation !== undefined) as unknown as Envelope | undefined;
  assert.ok(flagged && flagged.seq < runs[0]!.seq, "the automation's label change comes before its run");
  for (const e of [...quiet, ...runs, flagged!]) valid(validateEnvelope(e), `#${e.seq}`);
  // The list route serves the same rows to the key; the owner's event is in the log but never the key's.
  const listed = (await get(fake, `/api/events?after=${from}&types=ticket.quiet,automation.ran,owner-request.updated`)).body;
  assert.deepEqual(listed.events.map((e: Envelope) => e.type), ["ticket.quiet", "automation.ran", "automation.ran", "automation.ran"]);
  const all = await start({ startAt, speed: 16, visibility: "all" });
  const allRes = await fetch(`${all.url}/api/events/stream?after=${all.lastSeq()}`, { headers: headers(all) });
  const owner = await readUntil(allRes, (l) => l["type"] === "owner-request.updated" && (l["payload"] as { state: string }).state === "approved", 30_000);
  const requests = owner.filter((l) => l["type"] === "owner-request.updated") as unknown as Envelope[];
  assert.deepEqual(requests.map((e) => [e.actor.kind, e.payload["state"], e.ticket, e.project]), [["user", "pending", null, null], ["user", "approved", null, null]]);
  assert.ok(fake.lastSeq() >= requests[1]!.seq || (await readUntil(res, (l) => (l["seq"] as number) >= requests[1]!.seq, 30_000)).length >= 0, "the key's fake has played past them too");
  const hidden = (await get(fake, `/api/events?after=${from}&types=owner-request.updated`)).body;
  assert.deepEqual(hidden.events, [], "a lead key never receives the owner's request");
});
