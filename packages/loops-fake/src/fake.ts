/**
 * A fake crewhub-loops: an HTTP server on 127.0.0.1 that answers the routes the world's host reads, in loops'
 * shapes (`docs/integrators/read-model.md`, `events.md`; the stream as crewhub-loops 4cdcd383 serves it, see
 * docs/LOOPS_REAL_VS_FAKE.md), from the demo's own scripted source played on wall time. Bearer-key auth, loops'
 * error bodies, `GET /api/events` with `from=tail` and a sealed opaque `cursor` (CL-406), the NDJSON stream with
 * `after=` or `cursor=` or a `Last-Event-ID` header, heartbeats that carry a cursor, 429 `too_many_streams` at the
 * fifth stream of the key, a 410 `cursor_expired` for a cursor that does not open or an `after` older than the buffer
 * it keeps, and the per-principal visibility of a lead agent's key (`api/stream.py` `event_visibility_sql`): chat,
 * lane alerts to other leads and the admin-only types are rows the key never sees, so its `seq` has gaps.
 *
 * Nothing here talks to a real crewhub-loops; it is for tests and for running the world in live mode before the
 * install. It reads the demo through `DemoSource` and renumbers the demo's `seq` into one continuous log
 * (`firstSeq`), so a restart that keeps the log and a fresh install can both be played.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type DemoSource, type ScenarioId, DEMO_PERSON, createDemoSource } from "@crewhub/demo";
import type { CommentOut, Envelope, LoopsSnapshot, PlaybackSpeed, PrincipalRef, TicketStatus } from "@crewhub/loops-client";
import { TICKET_STATUSES } from "@crewhub/loops-client";
import { withKeyBot } from "./lanes.ts";

export interface LoopsFakeOptions {
  /** TCP port on 127.0.0.1; 0 (the default) picks a free one. */
  port?: number;
  /** The one agent key the fake accepts. Generated when absent. */
  key?: string;
  /** The agent the key belongs to (`principal.id`). Default "crewhub-world". */
  keyName?: string;
  /** The demo scenario to play. Default the demo's own default ("small-team"). */
  scenario?: ScenarioId;
  /** Playback speed against wall time: 1 is real time. Default 1. */
  speed?: PlaybackSpeed;
  /** The storyline position to start at, ms into the loop. Default 0. */
  startAt?: number;
  /** Silence on a stream before a heartbeat line. Default 15000, as loops. */
  heartbeatMs?: number;
  /**
   * A stream ends this long after it opened, as loops' `Timing.max_age` (300 s): the response closes without a
   * closing line and the client reconnects with `after=` its last seq. Default 300000; tests use 1–2 s.
   */
  streamMaxMs?: number;
  /**
   * The key behaves like loops' builder key (CL-120): it reads a ticket, its comments and `GET /api/auth/me`, and
   * every other route (health included) answers 403 `forbidden` "This key reads tickets, comments and attachments
   * only". Default false: the key is a probe agent's and reads everything the host reads.
   */
  builderKey?: boolean;
  /** How many envelopes the fake keeps for `after=`; an older `after` answers 410. Default 2000. */
  bufferSize?: number;
  /**
   * The tail of the log when the fake starts: the first event gets `firstSeq + 1`. A restart that keeps the log
   * passes the old fake's `lastSeq()`; a lower value plays a fresh install. Default 0. A fresh install (0) starts its
   * log with the install's history: two admin-only rows for the making of the key's bot (hidden from the key, so
   * its first visible seq is 3, as on a real instance) and a `project.archived` row for every project archived at
   * the start, so a client can learn the archived slugs from the log.
   */
  firstSeq?: number;
  /**
   * What the key is served of the log. `principal` (the default) is loops' rule for a lead agent's key
   * (`api/stream.py` `event_visibility_sql`): no chat it is not part of, no lane alert addressed to another lead, no
   * lane-wake delivery for somebody else, no `host.reported`, `onboarding.updated`, `owner-request.updated`, old
   * agent-action rows or `ADMIN_EVENT_TYPES`; every hidden row is a gap in `seq`. `all` serves every row (an admin's view).
   */
  visibility?: "principal" | "all";
  /**
   * `GET /api/team` answers `{"v":1,"ts":"","sessions":[]}`, as an instance where no team probe has reported (the
   * development instance on 8291), and the demo's team snapshot is never served. Default false.
   */
  emptyTeam?: boolean;
  /** What `GET /api/health` says as `version`; default `FAKE_LOOPS_VERSION`. Another value after a restart on the same port is a loops upgraded under a running host. */
  version?: string;
  /**
   * The person who can sign in (`POST /api/auth/login`, round 12): the demo's person by default, with a password made
   * for this run (`fake.person` says it, for the tools). A session cookie then reads as an admin: every event, the chat.
   */
  person?: { id: string; password: string; displayName: string };
  /** A loops whose viewer key may read the chat (round 12, `world/viewer-key`): the key gets the threads, the messages and the dm.* rows. */
  keyReadsChat?: boolean;
}

export interface LoopsFake {
  readonly url: string;
  readonly port: number;
  readonly key: string;
  readonly keyName: string;
  /** The tail of the log: the seq of the last event, hidden rows included, or `firstSeq` before the first. */
  lastSeq(): number;
  /** The newest seq the key may see: what `from=tail` and a live stream's first heartbeat say (`firstSeq` before the first). */
  lastVisibleSeq(): number;
  /** How many event streams are open right now (a host holds one for all its browser tabs). */
  openStreams(): number;
  /** How many event streams were opened since the fake started (a reconnect after `streamMaxMs` adds one). */
  streamsOpened(): number;
  /**
   * Moves a ticket as the demo person would (`ticket.moved` with `actor.kind: "user"` on the stream; the board and
   * ticket reads follow). Only a person moves into Done in loops (`human_only_done`), and the fake's agents never do.
   * `rejected` turns a move into Done down with that reason (`resolution: "rejected"` in the payload).
   */
  moveTicket(ref: string, status: string, options?: { rejected?: string }): Promise<void>;
  /** The person who can sign in, and the password of this run (a fake's secret, for the tools and the tests). */
  readonly person: { id: string; password: string; displayName: string };
  /** The session cookies handed out and still accepted. */
  sessionsOpen(): number;
  close(): Promise<void>;
}

/** `GET /api/events` and the stream accept these in `types=`; any other value is 400 `validation_error`. */
export const EVENT_TYPES: readonly string[] = [
  "ticket.created", "ticket.updated", "ticket.moved", "comment.created", "comment.updated", "comment.deleted",
  "link.added", "link.updated", "link.removed", "attachment.added", "dm.created", "dm.answered", "delivery.created",
  "delivery.updated", "team.updated", "agent_action.ambiguous", "agent_action.expired", "agent-action.updated",
  "ticket.progress", "ticket.archived", "ticket.unarchived", "release.created", "release.updated", "release.published",
  "release.deleted", "deploy.updated", "ticket.stalled", "ticket.resumed", "project.created", "project.updated",
  "project.reordered", "project.archived", "project.restored", "label.created", "label.updated", "label.deleted",
  "repo.created", "repo.updated", "repo.retired", "repo.unretired", "milestone.created", "milestone.updated",
  "milestone.completed", "milestone.cancelled", "milestone.archived", "milestone.restored", "milestone.deleted",
  "milestone.tickets_attached", "milestone.tickets_detached", "milestone.handoff", "milestone.handoff_withdrawn",
  "lane.alert", "lane-watch.updated", "host.reported", "onboarding.updated", "agent.created", "agent.updated",
  "agent-membership.updated", "agent-right.granted", "agent-right.revoked", "lane.updated", "profile.updated",
  "policy.created", "feature.updated", "delegation.consumed", "automation.ran", "ticket.quiet", "owner-request.updated",
];

/** Written by the administration of agents and rights (CL-124): human admins only, never an agent key (`contracts/events.py`). */
export const ADMIN_EVENT_TYPES: readonly string[] = [
  "agent.created", "agent.updated", "agent-membership.updated", "agent-right.granted", "agent-right.revoked", "lane.updated",
  "profile.updated", "policy.created", "feature.updated", "delegation.consumed",
];
/** Served to human admins only besides `ADMIN_EVENT_TYPES` (`api/stream.py` `event_visibility_sql`); a lead key never sees them. */
export const ADMIN_ONLY_EVENT_TYPES: readonly string[] = [
  ...ADMIN_EVENT_TYPES, "agent_action.ambiguous", "agent_action.expired", "agent-action.updated", "host.reported",
  "onboarding.updated", "owner-request.updated",
];
/** Label names no project label may take (`domain/labels.py` `RESERVED_LABELS`); the globals among them are what `GET /api/labels` lists. */
export const RESERVED_LABELS: readonly string[] = ["smoke", "awaiting-deploy", "release", "tutorial"];
/** Loops' message when a key asks for archived projects (`api/routers/projects.py` `list_projects`). */
export const INCLUDE_ARCHIVED_MESSAGE = "Only an admin lists archived projects";
/** What the fake reports as loops' version: loops says its package version (`0.1.0`); the fake adds the commit it follows. */
export const FAKE_LOOPS_VERSION = "0.1.0+fake.4cdcd383";
const DEFAULT_HEARTBEAT_MS = 15_000;
/** Loops' `Timing.max_age`: a stream ends after 300 s and the client reconnects at its cursor. */
const DEFAULT_STREAM_MAX_MS = 300_000;
/** Loops' message for the builder key on any route outside its table (`auth/builder.py`). */
export const BUILDER_KEY_MESSAGE = "This key reads tickets, comments and attachments only";
const DEFAULT_BUFFER = 2000;
/** Loops admits 4 open streams per principal (`api/stream.py` `MAX_STREAMS_PER_PRINCIPAL`), the fifth is 429. */
export const MAX_STREAMS_PER_KEY = 4;
/** Loops' `Retry-After` on 429 `too_many_streams`. */
export const RETRY_AFTER_S = 5;
/** Loops' message for a sealed cursor that cannot be used (`api/cursor.py` `expired`). */
export const CURSOR_EXPIRED_MESSAGE = "The cursor cannot be used: fetch the events again and continue from there";
/** A demo loop resets the storyline; the fake moves the log past the gap so every older cursor is expired. */
const LOOP_STRIDE = 1000;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;
const EVENTS_LIMIT_MAX = 500;
const SESSION_COOKIE = "chl_session";

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const notFound = () => new ApiError(404, "not_found", "Not found");
const invalid = (message: string) => new ApiError(400, "validation_error", message);

function encode(line: unknown): string {
  return `${JSON.stringify(line)}\n`;
}

/** A small JSON body (the sign-in), or null when it is not JSON; more than 8 kB is refused as loops refuses it. */
function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8192) {
        reject(new ApiError(413, "payload_too_large", "The request body is limited to 8192 bytes"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

interface OpenStream {
  res: ServerResponse;
  /** Who reads it: the key (loops' per-principal view) or a signed-in person (an admin: everything). */
  viewer: "key" | "person";
  /** The `types=` filter, if any. */
  types: string[];
  /** The public position: the seq of the last envelope written, or the start (`S` of CL-406). */
  lastSent: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Ends the stream at `streamMaxMs`, as loops does at 300 s. */
  maxAge: ReturnType<typeof setTimeout>;
  closed: boolean;
}

export async function createLoopsFake(options: LoopsFakeOptions = {}): Promise<LoopsFake> {
  const key = options.key ?? `chl_${randomBytes(24).toString("hex")}`;
  const keyName = options.keyName ?? "crewhub-world";
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const streamMaxMs = Math.max(1, options.streamMaxMs ?? DEFAULT_STREAM_MAX_MS);
  const builderKey = options.builderKey === true;
  const bufferSize = Math.max(1, options.bufferSize ?? DEFAULT_BUFFER);
  const visibility = options.visibility ?? "principal";
  const emptyTeam = options.emptyTeam === true;
  const keyReadsChat = options.keyReadsChat === true;
  const principal: PrincipalRef = { id: keyName, kind: "agent", displayName: keyName };
  const person = options.person ?? { id: "nicky", password: `demo-${randomBytes(9).toString("base64url")}`, displayName: "Nicky" };
  const personPrincipal: PrincipalRef = { id: person.id, kind: "user", displayName: person.displayName };
  /** The session cookies handed out by `POST /api/auth/login` and still accepted (a logout removes one). */
  const sessions = new Set<string>();

  // The log: the demo's envelopes renumbered into one continuous sequence from `firstSeq`. Every row is kept, the
  // hidden ones too (they are the gaps); `visibleTail` is the newest seq the key may see.
  let seq = options.firstSeq ?? 0;
  let visibleTail = seq;
  /** The oldest `after` the buffer can still answer: anything lower is 410. */
  let floor = seq;
  const buffer: Envelope[] = [];
  const streams = new Set<OpenStream>();
  let streamsOpened = 0;
  let snapshots = 0;

  // The sealed cursor (CL-406): `(S, W)` = (the newest seq the caller saw, the tail up to which everything is judged),
  // sealed with a per-fake secret so it is opaque and a token from another fake (another install, a rotated key) does
  // not open. Fixed width, a fresh nonce per token: two tokens for the same state differ, as loops' do.
  const cursorSecret = randomBytes(32);
  function sealCursor(seen: number, checked: number): string {
    const nonce = randomBytes(6);
    const body = Buffer.alloc(16);
    body.writeBigUInt64BE(BigInt(seen), 0);
    body.writeBigUInt64BE(BigInt(Math.max(seen, checked)), 8);
    const mac = createHmac("sha256", cursorSecret).update(nonce).update(body).digest().subarray(0, 12);
    return Buffer.concat([nonce, body, mac]).toString("base64url");
  }
  /** `(S, W)` of a token this fake sealed and whose watermark is not above the log, else the one 410. */
  function openCursor(token: string): { seen: number; checked: number } {
    const expired = () => new ApiError(410, "cursor_expired", CURSOR_EXPIRED_MESSAGE);
    let raw: Buffer;
    try {
      raw = Buffer.from(token, "base64url");
    } catch {
      throw expired();
    }
    if (raw.length !== 34) throw expired();
    const nonce = raw.subarray(0, 6);
    const body = raw.subarray(6, 22);
    const mac = createHmac("sha256", cursorSecret).update(nonce).update(body).digest().subarray(0, 12);
    if (!timingSafeEqual(mac, raw.subarray(22))) throw expired();
    const seen = Number(body.readBigUInt64BE(0));
    const checked = Number(body.readBigUInt64BE(8));
    if (seen > checked || checked > seq) throw expired(); // a watermark above the tail: a restored backup
    return { seen, checked };
  }

  const source: DemoSource = createDemoSource({
    scheduler: {
      now: () => Date.now(),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    },
    epochMs: Date.now(),
    ...(options.scenario === undefined ? {} : { scenario: options.scenario }),
    ...(options.speed === undefined ? {} : { speed: options.speed }),
    ...(options.startAt === undefined ? {} : { startAt: options.startAt }),
  });

  /**
   * Loops' per-principal visibility for a lead agent's key (`api/stream.py` `event_visibility_sql`, the rows of
   * explore-api's event table). The fake's key takes part in no chat thread, so chat is visible only when a row names
   * the key as the thread's agent or the delivery's recipient.
   */
  function visibleToKey(e: Envelope): boolean {
    if (visibility === "all") return true;
    if (!EVENT_TYPES.includes(e.type) || ADMIN_ONLY_EVENT_TYPES.includes(e.type)) return false;
    const p = e.payload;
    const chat = e.type.startsWith("dm.") || (p["dmThreadId"] ?? null) !== null;
    if (chat && !keyReadsChat && p["agentId"] !== keyName && p["recipientId"] !== keyName) return false;
    if (e.type === "lane.alert" && p["leadId"] !== keyName) return false;
    if ((p["laneAlertId"] ?? null) !== null && p["recipientId"] !== keyName) return false;
    return true;
  }

  /** What a reader may see: a person (an admin) everything, the key its own view. */
  const visibleTo = (viewer: "key" | "person", e: Envelope): boolean => (viewer === "person" ? true : visibleToKey(e));

  function append(envelope: Envelope): void {
    seq += 1;
    const renumbered: Envelope = { ...envelope, seq };
    buffer.push(renumbered);
    if (buffer.length > bufferSize) {
      buffer.splice(0, buffer.length - bufferSize);
      floor = Math.max(floor, (buffer[0] as Envelope).seq - 1);
    }
    if (visibleToKey(renumbered)) visibleTail = seq; // else a gap for the key
    for (const stream of streams) {
      if (!visibleTo(stream.viewer, renumbered)) continue;
      if (stream.types.length > 0 && !stream.types.includes(renumbered.type)) continue;
      writeLine(stream, renumbered, renumbered.seq);
    }
  }

  /**
   * A fresh install's log before the storyline: the owner made the key's bot (two admin-only rows, the key's first
   * gap, as seq 1 and 2 were on the development instance) and archived what the scenario starts with archived (a
   * `project.archived` the key may see, so the archived slugs can be learned from the log, as the host does).
   */
  function writeHistory(snapshot: LoopsSnapshot): void {
    const owner = { id: DEMO_PERSON, kind: "user" as const };
    const row = (type: string, ts: string, project: Envelope["project"], payload: Record<string, unknown>): Envelope =>
      ({ v: 1, seq: 0, ts, type, project, ticket: null, actor: owner, recipientIds: [], payload });
    const madeAt = new Date(Date.now() - 60_000).toISOString();
    append(row("agent.created", madeAt, null, { agentId: keyName }));
    append(row("agent-membership.updated", madeAt, null, { agentId: keyName }));
    for (const p of snapshot.archivedProjects) {
      if (typeof p.archivedAt !== "string") continue;
      append(row("project.archived", p.archivedAt, { slug: p.slug, key: p.key }, { changed: ["archivedAt"], old: { archivedAt: null }, new: { archivedAt: p.archivedAt } }));
    }
  }

  /** A demo loop rebuilt the storyline: the log jumps and every cursor from before is expired. */
  function loopReset(): void {
    seq += LOOP_STRIDE;
    visibleTail = seq;
    floor = seq;
    buffer.length = 0;
    for (const stream of [...streams]) endStream(stream);
  }

  const stop = source.start((message) => {
    if (message.type === "event") append(message.envelope);
    else if (message.type === "snapshot") {
      snapshots += 1;
      if (snapshots === 1 && seq === 0) writeHistory(message.snapshot);
      else if (snapshots > 1) loopReset();
    }
  });

  // Streams

  function writeLine(stream: OpenStream, line: unknown, sentSeq: number): void {
    if (stream.closed) return;
    stream.res.write(encode(line));
    stream.lastSent = sentSeq;
    armHeartbeat(stream);
  }

  function armHeartbeat(stream: OpenStream): void {
    if (stream.timer !== null) clearTimeout(stream.timer);
    stream.timer = setTimeout(() => {
      stream.timer = null;
      if (stream.closed) return;
      // CL-406: the heartbeat's cursor says "everything up to the tail is judged" for the public position.
      const line = { v: 1, type: "heartbeat", seq: stream.lastSent, cursor: sealCursor(stream.lastSent, seq), ts: new Date().toISOString() };
      writeLine(stream, line, stream.lastSent);
    }, heartbeatMs);
  }

  function endStream(stream: OpenStream): void {
    if (stream.closed) return;
    stream.closed = true;
    if (stream.timer !== null) clearTimeout(stream.timer);
    clearTimeout(stream.maxAge);
    streams.delete(stream);
    stream.res.end();
  }

  /** `after` is the public position (`S`); `scanFrom` (`W`, a sealed cursor's watermark) is where the replay starts. */
  function openStream(res: ServerResponse, after: number, scanFrom = after, viewer: "key" | "person" = "key", types: string[] = []): void {
    res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "private, no-store", "x-accel-buffering": "no" });
    res.flushHeaders();
    const stream: OpenStream = { res, viewer, types, lastSent: after, timer: null, maxAge: setTimeout(() => endStream(stream), streamMaxMs), closed: false };
    streams.add(stream);
    streamsOpened += 1;
    for (const envelope of buffer) {
      if (envelope.seq <= Math.max(after, scanFrom) || !visibleTo(viewer, envelope)) continue;
      if (types.length > 0 && !types.includes(envelope.type)) continue;
      writeLine(stream, envelope, envelope.seq);
    }
    armHeartbeat(stream);
    res.on("close", () => endStream(stream));
  }

  // Request parsing

  function authenticate(req: IncomingMessage): PrincipalRef | null {
    const header = req.headers.authorization;
    const cookies = req.headers.cookie ?? "";
    const hasSession = cookies.split(";").some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
    if (header === undefined) {
      if (!hasSession) return null;
      const token = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? "";
      if (!sessions.has(token)) throw new ApiError(401, "unauthenticated", "Authentication required");
      return personPrincipal;
    }
    const [scheme, token] = header.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || token !== key) throw new ApiError(401, "invalid_api_key", "Invalid API key");
    if (req.headers.cookie !== undefined) throw new ApiError(400, "ambiguous_auth", "Send either a session cookie or an API key");
    return principal;
  }

  function intQuery(url: URL, name: string, min: number, max: number, fallback: number): number {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw invalid(`Invalid ${name}`);
    return value;
  }

  function page<T>(items: T[], url: URL): { items: T[]; nextCursor: string | null } {
    const limit = intQuery(url, "limit", 1, PAGE_MAX, PAGE_DEFAULT);
    const cursor = url.searchParams.get("cursor");
    let start = 0;
    if (cursor !== null) {
      if (!/^\d+$/.test(cursor)) throw invalid("Invalid cursor");
      start = Number(cursor);
    }
    const slice = items.slice(start, start + limit);
    return { items: slice, nextCursor: start + limit < items.length ? String(start + limit) : null };
  }

  function typesOf(url: URL): string[] {
    const types = url.searchParams.getAll("types").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    for (const type of types) if (!EVENT_TYPES.includes(type)) throw invalid(`Unknown event type ${type}`);
    return types;
  }

  function afterOf(url: URL): number | null {
    const raw = url.searchParams.get("after");
    if (raw === null) return null;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw invalid("Invalid after");
    return afterAt(Number(raw));
  }

  function afterAt(value: number): number {
    if (value < floor) throw new ApiError(410, "cursor_expired", CURSOR_EXPIRED_MESSAGE);
    return value;
  }

  /**
   * Where a read or a stream resumes (`routers/events.py` `resolve_resume` and `open_cursor`): `after=` or
   * `cursor=`, never both (400); else a `Last-Event-ID` header, an integer as `after` and anything else judged as a
   * sealed cursor (the `after` query wins over the header, CL-403). `S` is the public position, `W` where the
   * scanning starts.
   */
  function resumeOf(url: URL, req: IncomingMessage): { after: number | null; scanFrom: number | null } {
    const opened = (token: string) => {
      if (token.length > 512) throw new ApiError(410, "cursor_expired", CURSOR_EXPIRED_MESSAGE);
      const { seen, checked } = openCursor(token);
      return { after: seen, scanFrom: checked };
    };
    const token = url.searchParams.get("cursor");
    if (token !== null) {
      if (url.searchParams.has("after")) throw invalid("Send either cursor or after, not both");
      return opened(token);
    }
    const after = afterOf(url);
    const header = req.headers["last-event-id"];
    if (after !== null || header === undefined) return { after, scanFrom: null };
    const text = String(header).trim();
    if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) return { after: afterAt(Number(text)), scanFrom: null };
    return opened(text);
  }

  // Routes

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<unknown> {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "api") throw notFound();
    const at = (...expected: string[]) =>
      parts.length === expected.length + 1 && expected.every((p, i) => p === "*" || parts[i + 1] === p);
    const known =
      at("health") || at("auth", "me") || at("projects") || at("projects", "*") || at("projects", "*", "features") ||
      at("projects", "*", "milestones") || at("projects", "*", "releases") || at("projects", "*", "labels") || at("labels") ||
      at("board", "*") || at("tickets", "*") ||
      at("tickets", "*", "comments") || at("tickets", "*", "progress") || at("tickets", "*", "grill") || at("team") ||
      at("agents") || at("principals") || at("watchdog") || at("events") || at("events", "stream") ||
      at("delegations", "pending") || at("auth", "login") || at("auth", "logout") || at("dm", "threads") ||
      at("dm", "threads", "*", "messages") || at("dm", "messages", "*");
    if (!known) throw notFound();
    // The person's sign-in (public; loops: no CSRF, an absent Origin is fine) and sign-out (round 12).
    if (at("auth", "login")) {
      if (req.method !== "POST") throw new ApiError(405, "method_not_allowed", "Method not allowed");
      const body = await readJson(req);
      if (body?.["id"] !== person.id || body?.["password"] !== person.password) throw new ApiError(401, "bad_credentials", "Unknown account or wrong password");
      const token = `sess_${randomBytes(16).toString("hex")}`;
      sessions.add(token);
      res.setHeader("set-cookie", [`${SESSION_COOKIE}=${token}; HttpOnly; Max-Age=2592000; Path=/; SameSite=lax`, `chl_device=dev_${randomBytes(6).toString("hex")}; HttpOnly; Max-Age=31536000; Path=/api/auth; SameSite=lax`]);
      return { user: { ...personPrincipal, role: "admin", theme: null, themeDefault: "system", activitySeenSeq: 0, isOwner: true } };
    }
    if (at("auth", "logout")) {
      if (req.method !== "POST") throw new ApiError(405, "method_not_allowed", "Method not allowed");
      const who = authenticate(req);
      if (who === null || who.kind !== "user") throw new ApiError(401, "unauthenticated", "Authentication required");
      const token = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? "";
      sessions.delete(token);
      res.statusCode = 204;
      res.end();
      return undefined;
    }
    if (req.method !== "GET" && req.method !== "HEAD") throw new ApiError(405, "method_not_allowed", "Method not allowed");
    // The builder key (CL-120) opens an exact table of reads and nothing else; of the routes the fake serves, these.
    // Loops' guard refuses it on a public route too, before any handler.
    const builderRead = at("tickets", "*") || at("tickets", "*", "comments") || at("auth", "me");
    if (builderKey && !builderRead && req.headers.authorization !== undefined && authenticate(req) !== null) {
      throw new ApiError(403, "forbidden", BUILDER_KEY_MESSAGE);
    }

    if (at("health")) {
      // Public: with a valid key the caller is named; without credentials it is an anonymous read.
      let caller: PrincipalRef | null = null;
      try {
        caller = authenticate(req);
      } catch (error) {
        if (error instanceof ApiError && error.code === "ambiguous_auth") throw error;
      }
      return {
        ok: true,
        version: options.version ?? FAKE_LOOPS_VERSION,
        laneWakesForcedOff: false,
        checks: { db: true, uploads: true, socket: false, tcp: true, laneWatch: { state: "off" } },
        principal: caller,
        watchdog: caller === null ? null : { mode: (await source.getWatchdog()).mode, stopped: false },
      };
    }
    const caller = authenticate(req);
    if (caller === null) throw new ApiError(401, "unauthenticated", "Authentication required");
    const viewer: "key" | "person" = caller.kind === "user" ? "person" : "key";
    // The chat (dm.py): any principal reads, but a key reads only the threads it is part of; the fake's key is in none.
    const readsChat = viewer === "person" || keyReadsChat;
    if (at("dm", "threads")) return { threads: readsChat ? await source.getDmThreads() : [] };
    if (at("dm", "threads", "*", "messages")) {
      if (!readsChat) throw new ApiError(403, "forbidden", "Not a participant of this thread");
      return { messages: await source.getDmMessages(parts[3] ?? ""), nextCursor: null };
    }
    if (at("dm", "messages", "*")) {
      if (!readsChat) throw new ApiError(403, "forbidden", "Not a participant of this thread");
      for (const thread of await source.getDmThreads()) {
        const message = (await source.getDmMessages(thread.agentId)).find((m) => m.id === parts[3]);
        if (message !== undefined) return { message };
      }
      throw notFound();
    }

    const slug = parts[2] ?? "";
    const ref = parts[2] ?? "";
    // `principal_out`: an agent's `role` is its agent role and its `theme` is null; `themeDefault` is the install's.
    // The world's key is an external bot's (CL-314): loops forces its role to `lead` (the `probe` road is dead, CL-295).
    if (at("auth", "me")) return { principal: { ...caller, role: "lead", theme: null, themeDefault: "system" } };
    if (at("projects")) {
      if (url.searchParams.get("includeArchived") === "true") throw new ApiError(403, "forbidden", INCLUDE_ARCHIVED_MESSAGE);
      const snapshot = await snapshotOf();
      return { projects: snapshot.projects, orderRevision: 3 };
    }
    if (at("projects", "*")) {
      const project = await source.getProject(slug);
      if (project === null) throw notFound();
      return { project, lead: null };
    }
    if (at("projects", "*", "features")) {
      const features = await source.getProjectFeatures(slug);
      if (features === null) throw notFound();
      const flag = (key: string, label: string, value: boolean) => ({
        key, label, type: "bool", value, default: false, options: null, minimum: null, maximum: null, revision: 1, updatedAt: null, updatedBy: null,
      });
      return {
        features: [
          flag("releases", "Releases", features.releases),
          flag("milestones", "Milestones", features.milestones),
          flag("watchdog_nudge", "Watchdog nudges", features.watchdog_nudge),
        ],
      };
    }
    // Labels: the globals (loops' reserved built-ins) alone, or with a project's own (`api/routers/projects.py`).
    if (at("labels")) return { labels: await source.getLabels(null) };
    if (at("projects", "*", "labels")) {
      const labels = await source.getLabels(slug);
      if (labels === null) throw notFound();
      return { labels };
    }
    if (at("projects", "*", "milestones") || at("projects", "*", "releases")) {
      const features = await source.getProjectFeatures(slug);
      if (features === null) throw notFound();
      const feature = parts[3] as "milestones" | "releases";
      if (!features[feature]) throw new ApiError(409, "feature_off", `The project has ${feature} off`);
      if (feature === "milestones") {
        const paged = page(await source.getMilestones(slug), url);
        return { milestones: paged.items, nextCursor: paged.nextCursor };
      }
      const paged = page(await source.getReleases(slug), url);
      return { releases: paged.items, nextCursor: paged.nextCursor };
    }
    if (at("board", "*")) {
      const board = await source.getBoard(slug);
      if (board === null) throw notFound();
      return board;
    }
    if (at("tickets", "*")) {
      const ticket = await source.getTicket(ref);
      if (ticket === null) throw notFound();
      return { ticket };
    }
    if (at("tickets", "*", "grill")) {
      const ticket = await source.getTicket(ref);
      if (ticket === null) throw notFound();
      return { grill: grillOf(ticket.kind === "grill" ? await source.getComments(ref) : []) };
    }
    if (at("delegations", "pending")) return { requests: await source.getPendingDelegations() };
    if (at("tickets", "*", "comments") || at("tickets", "*", "progress")) {
      if ((await source.getTicket(ref)) === null) throw notFound();
      if (parts[3] === "comments") {
        const paged = page(await source.getComments(ref), url);
        return { comments: paged.items, nextCursor: paged.nextCursor };
      }
      const paged = page(await source.getProgress(ref), url);
      return { progress: paged.items, nextCursor: paged.nextCursor };
    }
    // An instance where no team probe has reported answers an empty snapshot with `ts` an empty string (observed on 8291).
    if (at("team") && emptyTeam) return { v: 1, ts: "", sessions: [] };
    if (at("team")) return (await snapshotOf()).team;
    // A viewer key's loops (L1) marks the key's own bot `viewer: true` in the agents list: the host's probe reads it there.
    if (at("agents")) return { agents: withKeyBot(await source.getAgents(), keyName, new Date()).map((a) => (keyReadsChat && a.id === keyName ? { ...a, viewer: true } : a)), lanesAuthority: "db", agentHome: null };
    if (at("principals")) return { principals: (await snapshotOf()).principals };
    if (at("watchdog")) return source.getWatchdog();
    if (at("events")) {
      const types = typesOf(url);
      const resume = resumeOf(url, req);
      const limit = intQuery(url, "limit", 1, EVENTS_LIMIT_MAX, EVENTS_LIMIT_MAX);
      const from = url.searchParams.get("from");
      if (from !== null && from !== "tail") throw invalid("Invalid from");
      // CL-390 `from=tail`: no events, the newest seq this caller may see (not the log's tail when the newest rows
      // are hidden from it) and the sealed cursor of "now", whose watermark is the real tail.
      if (from === "tail") return { events: [], lastSeq: visibleTail, cursor: sealCursor(visibleTail, seq) };
      const start = resume.after ?? 0;
      const scan = Math.max(start, resume.scanFrom ?? start);
      const matching = buffer.filter((e) => e.seq > scan && visibleTo(viewer, e) && (types.length === 0 || types.includes(e.type)));
      const events = matching.slice(0, limit);
      // `lastSeq` is the last row returned, else the `after` sent (CL-390): it never passes a row the filter dropped,
      // so a filter that matches nothing answers `after` (the old tail trick says 0). `from=tail` is the tail.
      const lastSeq = events.length === 0 ? start : (events[events.length - 1] as Envelope).seq;
      const judged = events.length >= limit ? lastSeq : Math.max(seq, lastSeq, scan);
      return { events, lastSeq, cursor: sealCursor(lastSeq, judged) };
    }
    // The stream: `after` replays `seq > after` from the buffer, then live; a sealed `cursor` replays from its
    // watermark; without either, live from the tail (`S` the newest seq the key may see, `W` the real tail). At most
    // MAX_STREAMS_PER_KEY open streams per key.
    const streamTypes = typesOf(url);
    const resume = resumeOf(url, req);
    if (req.method === "HEAD") throw new ApiError(405, "method_not_allowed", "Method not allowed");
    if ([...streams].filter((x) => x.viewer === viewer).length >= MAX_STREAMS_PER_KEY) {
      throw new ApiError(429, "too_many_streams", "Too many open event streams", { "retry-after": String(RETRY_AFTER_S) });
    }
    openStream(res, resume.after ?? (viewer === "person" ? seq : visibleTail), resume.scanFrom ?? resume.after ?? seq, viewer, streamTypes);
    return undefined;
  }

  /**
   * `GET /api/tickets/{ref}/grill` (`domain/grill.py` `read`, `contracts/grill.py` `GrillOut`): the questions are an
   * agent's top-level comments on the ticket, in order; an answer is a person's reply to one. Nothing is `sent` until
   * the person sends the set, which the demo never does.
   */
  function grillOf(comments: CommentOut[]) {
    const live = comments.filter((c) => c.kind === "normal" && !c.deletedAt);
    const questions = live
      .filter((c) => c.author.kind === "agent" && (c.parentId ?? null) === null)
      .map((q, index) => {
        const answer = live.find((c) => c.parentId === q.id && c.author.kind === "user");
        return {
          position: index + 1,
          questionCommentId: q.id,
          question: q.bodyMarkdown ?? "",
          answer: answer?.bodyMarkdown ?? null,
          answerCommentId: answer?.id ?? null,
          answeredAt: answer?.createdAt ?? null,
          sent: false,
        };
      });
    const answered = questions.filter((q) => q.answerCommentId !== null).length;
    return { questions, total: questions.length, answered, unsent: answered };
  }

  /** One read of everything the demo serves at once (a listener's first message is a snapshot). */
  function snapshotOf(): Promise<LoopsSnapshot> {
    return new Promise<LoopsSnapshot>((resolve) => {
      const unsubscribe = source.start((message) => {
        if (message.type === "snapshot") resolve(message.snapshot);
      });
      unsubscribe();
    });
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    route(req, res, url)
      .then((body) => {
        if (body === undefined) return;
        const text = JSON.stringify(body);
        res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
        res.end(req.method === "HEAD" ? undefined : text);
      })
      .catch((error: unknown) => {
        const api = error instanceof ApiError ? error : new ApiError(500, "internal", "Internal error");
        const text = JSON.stringify({ error: { code: api.code, message: api.message, detail: null } });
        res.writeHead(api.status, { "content-type": "application/json", "content-length": Buffer.byteLength(text), ...api.headers });
        res.end(text);
      });
  });
  server.keepAliveTimeout = 1000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    key,
    keyName,
    lastSeq: () => seq,
    lastVisibleSeq: () => visibleTail,
    person,
    sessionsOpen: () => sessions.size,
    openStreams: () => streams.size,
    streamsOpened: () => streamsOpened,
    async moveTicket(ref, status, moveOptions = {}) {
      if (!(TICKET_STATUSES as readonly string[]).includes(status)) throw new Error(`Unknown status ${status}`);
      if ((await source.getTicket(ref)) === null) throw new Error(`Unknown ticket ${ref}`);
      const rejected = moveOptions.rejected;
      source.act({ type: "move", by: DEMO_PERSON, ticket: ref, to: status as TicketStatus, ...(rejected === undefined ? {} : { rejected }) });
    },
    async close() {
      stop();
      for (const stream of [...streams]) endStream(stream);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
