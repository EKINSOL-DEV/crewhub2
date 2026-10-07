/**
 * A fake crewhub-loops: an HTTP server on 127.0.0.1 that answers the routes the world's host reads, in loops'
 * shapes (`docs/integrators/read-model.md`, `events.md` at 053b5f47), from the demo's own scripted source played
 * on wall time. Bearer-key auth, loops' error bodies, `GET /api/events` with the tail recipe, the NDJSON stream
 * with `after=`, heartbeats, and a 410 `cursor_expired` for an `after` older than the buffer it keeps.
 *
 * Nothing here talks to a real crewhub-loops; it is for tests and for running the world in live mode before the
 * install. It reads the demo through `DemoSource` and renumbers the demo's `seq` into one continuous log
 * (`firstSeq`), so a restart that keeps the log and a fresh install can both be played.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type DemoSource, type ScenarioId, DEMO_PERSON, createDemoSource } from "@crewhub/demo";
import type { Envelope, LoopsSnapshot, PlaybackSpeed, PrincipalRef, TicketStatus } from "@crewhub/loops-client";
import { TICKET_STATUSES } from "@crewhub/loops-client";

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
  /** Silence on a stream before a heartbeat line. Default 15000, as loops. */
  heartbeatMs?: number;
  /** How many envelopes the fake keeps for `after=`; an older `after` answers 410. Default 2000. */
  bufferSize?: number;
  /**
   * The tail of the log when the fake starts: the first event gets `firstSeq + 1`. A restart that keeps the log
   * passes the old fake's `lastSeq()`; a lower value plays a fresh install. Default 0.
   */
  firstSeq?: number;
}

export interface LoopsFake {
  readonly url: string;
  readonly port: number;
  readonly key: string;
  readonly keyName: string;
  /** The tail of the log: the seq of the last event, or `firstSeq` before the first. */
  lastSeq(): number;
  /** Moves a ticket as a person would (`ticket.moved` on the stream; the board and ticket reads follow). */
  moveTicket(ref: string, status: string): Promise<void>;
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
  "policy.created", "feature.updated", "delegation.consumed",
];

/** What the fake reports as loops' version: the reference commit the shapes were checked against. */
export const FAKE_LOOPS_VERSION = "0.0.0+fake.053b5f47";
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_BUFFER = 2000;
/** A demo loop resets the storyline; the fake moves the log past the gap so every older cursor is expired. */
const LOOP_STRIDE = 1000;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;
const EVENTS_LIMIT_MAX = 500;
const SESSION_COOKIE = "chl_session";

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFound = () => new ApiError(404, "not_found", "Not found");
const invalid = (message: string) => new ApiError(400, "validation_error", message);

function encode(line: unknown): string {
  return `${JSON.stringify(line)}\n`;
}

interface OpenStream {
  res: ServerResponse;
  lastSent: number;
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

export async function createLoopsFake(options: LoopsFakeOptions = {}): Promise<LoopsFake> {
  const key = options.key ?? `chl_${randomBytes(24).toString("hex")}`;
  const keyName = options.keyName ?? "crewhub-world";
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const bufferSize = Math.max(1, options.bufferSize ?? DEFAULT_BUFFER);
  const principal: PrincipalRef = { id: keyName, kind: "agent", displayName: keyName };

  // The log: the demo's envelopes renumbered into one continuous sequence from `firstSeq`.
  let seq = options.firstSeq ?? 0;
  /** The oldest `after` the buffer can still answer: anything lower is 410. */
  let floor = seq;
  const buffer: Envelope[] = [];
  const streams = new Set<OpenStream>();
  let snapshots = 0;

  const source: DemoSource = createDemoSource({
    scheduler: {
      now: () => Date.now(),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    },
    epochMs: Date.now(),
    ...(options.scenario === undefined ? {} : { scenario: options.scenario }),
    ...(options.speed === undefined ? {} : { speed: options.speed }),
  });

  function append(envelope: Envelope): void {
    seq += 1;
    const renumbered: Envelope = { ...envelope, seq };
    buffer.push(renumbered);
    if (buffer.length > bufferSize) {
      buffer.splice(0, buffer.length - bufferSize);
      floor = Math.max(floor, (buffer[0] as Envelope).seq - 1);
    }
    for (const stream of streams) writeLine(stream, renumbered, renumbered.seq);
  }

  /** A demo loop rebuilt the storyline: the log jumps and every cursor from before is expired. */
  function loopReset(): void {
    seq += LOOP_STRIDE;
    floor = seq;
    buffer.length = 0;
    for (const stream of [...streams]) endStream(stream);
  }

  const stop = source.start((message) => {
    if (message.type === "event") append(message.envelope);
    else if (message.type === "snapshot") {
      snapshots += 1;
      if (snapshots > 1) loopReset();
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
      const line = { v: 1, type: "heartbeat", seq: stream.lastSent, ts: new Date().toISOString() };
      writeLine(stream, line, stream.lastSent);
    }, heartbeatMs);
  }

  function endStream(stream: OpenStream): void {
    if (stream.closed) return;
    stream.closed = true;
    if (stream.timer !== null) clearTimeout(stream.timer);
    streams.delete(stream);
    stream.res.end();
  }

  function openStream(res: ServerResponse, after: number): void {
    res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache", "x-accel-buffering": "no" });
    res.flushHeaders();
    const stream: OpenStream = { res, lastSent: after, timer: null, closed: false };
    streams.add(stream);
    for (const envelope of buffer) if (envelope.seq > after) writeLine(stream, envelope, envelope.seq);
    armHeartbeat(stream);
    res.on("close", () => endStream(stream));
  }

  // Request parsing

  function authenticate(req: IncomingMessage): PrincipalRef | null {
    const header = req.headers.authorization;
    const cookies = req.headers.cookie ?? "";
    const hasSession = cookies.split(";").some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
    if (header === undefined) {
      if (hasSession) throw new ApiError(401, "unauthenticated", "Authentication required");
      return null;
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
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) throw invalid("Invalid after");
    if (value < floor) throw new ApiError(410, "cursor_expired", "The cursor is older than the retained log");
    return value;
  }

  // Routes

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<unknown> {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "api") throw notFound();
    const at = (...expected: string[]) =>
      parts.length === expected.length + 1 && expected.every((p, i) => p === "*" || parts[i + 1] === p);
    const known =
      at("health") || at("auth", "me") || at("projects") || at("projects", "*") || at("projects", "*", "features") ||
      at("projects", "*", "milestones") || at("projects", "*", "releases") || at("board", "*") || at("tickets", "*") ||
      at("tickets", "*", "comments") || at("tickets", "*", "progress") || at("team") || at("agents") ||
      at("principals") || at("watchdog") || at("events") || at("events", "stream");
    if (!known) throw notFound();
    if (req.method !== "GET" && req.method !== "HEAD") throw new ApiError(405, "method_not_allowed", "Method not allowed");

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
        version: FAKE_LOOPS_VERSION,
        checks: { db: true, uploads: true, socket: false, tcp: true, laneWatch: { state: "off" } },
        principal: caller,
        watchdog: caller === null ? null : { mode: (await source.getWatchdog()).mode, stopped: false },
      };
    }
    const caller = authenticate(req);
    if (caller === null) throw new ApiError(401, "unauthenticated", "Authentication required");

    const slug = parts[2] ?? "";
    const ref = parts[2] ?? "";
    if (at("auth", "me")) return { principal: { ...caller, role: "probe", theme: "system", themeDefault: true } };
    if (at("projects")) {
      if (url.searchParams.get("includeArchived") === "true") throw new ApiError(403, "forbidden", "Archived projects are for admins");
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
    if (at("tickets", "*", "comments") || at("tickets", "*", "progress")) {
      if ((await source.getTicket(ref)) === null) throw notFound();
      if (parts[3] === "comments") {
        const paged = page(await source.getComments(ref), url);
        return { comments: paged.items, nextCursor: paged.nextCursor };
      }
      const paged = page(await source.getProgress(ref), url);
      return { progress: paged.items, nextCursor: paged.nextCursor };
    }
    if (at("team")) return (await snapshotOf()).team;
    if (at("agents")) return { agents: await source.getAgents(), lanesAuthority: "db" };
    if (at("principals")) return { principals: (await snapshotOf()).principals };
    if (at("watchdog")) return source.getWatchdog();
    if (at("events")) {
      const types = typesOf(url);
      const after = afterOf(url) ?? 0;
      const limit = intQuery(url, "limit", 1, EVENTS_LIMIT_MAX, EVENTS_LIMIT_MAX);
      const matching = buffer.filter((e) => e.seq > after && (types.length === 0 || types.includes(e.type)));
      const events = matching.slice(0, limit);
      const lastSeq = events.length === limit ? (events[events.length - 1] as Envelope).seq : Math.max(after, seq);
      return { events, lastSeq };
    }
    // The stream: `after` replays `seq > after` from the buffer, then live; without it, live from the tail.
    typesOf(url);
    const after = afterOf(url) ?? seq;
    if (req.method === "HEAD") throw new ApiError(405, "method_not_allowed", "Method not allowed");
    openStream(res, after);
    return undefined;
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
        res.writeHead(api.status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
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
    async moveTicket(ref, status) {
      if (!(TICKET_STATUSES as readonly string[]).includes(status)) throw new Error(`Unknown status ${status}`);
      if ((await source.getTicket(ref)) === null) throw new Error(`Unknown ticket ${ref}`);
      source.act({ type: "move", by: DEMO_PERSON, ticket: ref, to: status as TicketStatus });
    },
    async close() {
      stop();
      for (const stream of [...streams]) endStream(stream);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
