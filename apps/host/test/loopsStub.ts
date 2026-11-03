/**
 * A tiny crewhub-loops for the host's tests: loops' routes and shapes for the reads the host makes, bearer auth,
 * `GET /api/events?from=tail` with a sealed-looking cursor (CL-406), an NDJSON stream with `after=` or `cursor=`,
 * heartbeats that carry a cursor, 429 `too_many_streams` on demand, 410 for a cursor that does not open or a too-old
 * `after`, and the honest `lastSeq` of CL-390 (a filter that matches nothing answers `after`, so the old tail trick
 * says 0). It records every request it sees with its time, and the most streams that were ever open at once.
 * On 127.0.0.1 port 0: loopback to the test itself, no network; or on a Unix socket (`socketPath`) for the host's
 * socket transport. (The full fake is `packages/loops-fake`.)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface StubRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  /** `Date.now()` when the request arrived. */
  at: number;
  /** The `Host` header as sent (the socket transport must send `127.0.0.1`). */
  host: string | undefined;
  /** The `Cookie` header as sent (a person's session), if any. */
  cookie?: string;
  /** The body of a POST (the sign-in), as sent: the tests prove where a password went and where it did not. */
  body?: string;
}

export interface Envelope {
  v: 1;
  seq: number;
  ts: string;
  type: string;
  project: { slug: string; key: string } | null;
  ticket: { id: string; key: string; title: string } | null;
  actor: { id: string; kind: string };
  recipientIds: string[];
  payload: Record<string, unknown>;
}

export interface StubOptions {
  key?: string;
  /** Pages for a paged list route, keyed by path: each entry is one page body in order. */
  pages?: Record<string, unknown[]>;
  /** Plain bodies by path (`/api/team` …); a function answers per request. */
  routes?: Record<string, unknown | ((url: URL) => { status: number; body: unknown })>;
  /** Events already in the log. */
  events?: Envelope[];
  /** `after` below this answers 410 cursor_expired. */
  minAfter?: number;
  /** Error bodies echo the Authorization header (a hostile server): the host must still never leak the key. */
  echoAuth?: boolean;
  /** A fixed port (the restart case); default 0. */
  port?: number;
  /**
   * Behaves like a loops before CL-406: no `from=tail` (the parameter is ignored and a page of events comes back),
   * no `cursor` anywhere, and the old `types=attachment.added` trick answers the real tail.
   */
  older?: boolean;
  /** Answers 429 `too_many_streams` with this `Retry-After` to the next `count` stream requests. */
  busy?: { count: number; retryAfter: string };
  /** What `GET /api/health` says as `version`; default "053b5f47". Another one on a stub reopened on the same port is loops upgraded. */
  version?: string;
  /** Listen on this Unix socket instead of TCP; `url` is then empty and `socketPath` set. */
  socketPath?: string;
  /** `GET /api/events` (the page read, not the tail) with `after` below this answers 410 `cursor_expired`: the fake after a restart. */
  logMinAfter?: number;
  /**
   * `ticket=` on `GET /api/events` (crewhub-loops main, CL-494 step 3): that ticket's events only (by id or key), 404 for
   * a ref that names no ticket. Default on; off (and on an `older` stub) the parameter is ignored, as loops 4cdcd383 does.
   */
  ticketFilter?: boolean;
  /** The chat the key reads where loops lets it (`keyReadsChat`): the threads list, `GET /api/dm/messages/{id}` by id. */
  dm?: { threads?: unknown[]; messages?: Record<string, Record<string, unknown>> };
  /** A loops whose key may read the chat (a viewer key): `GET /api/dm/threads` and a message by id answer the key. Default: 403 for the key. */
  keyReadsChat?: boolean;
  /** crewhub-loops main (#959): the public `GET /api/health` refuses a limited key (403 with an Authorization header); keyless it answers as ever. */
  healthRefusesKey?: boolean;
  /** With `keyReadsChat`, what `GET /api/dm/threads` answers the key instead of 200 (a viewer with no maker, 403; the chat switched off, 409). */
  threadsStatus?: number;
}

/** A stub-wide outage: every request answers `status` (health too unless `healthOk`), or never answers (`hang`). */
export interface Outage {
  status: number;
  /** The keyless `GET /api/health` keeps answering 200: loops is up but in trouble (a 5xx) or refusing the key. */
  healthOk?: boolean;
  /** Requests are left open without an answer (a timeout for the caller). */
  hang?: boolean;
}

export interface LoopsStub {
  /** `http://127.0.0.1:<port>`, or "" for a stub on a socket. */
  url: string;
  port: number;
  /** The socket the stub listens on, or null for TCP. */
  socketPath: string | null;
  key: string;
  requests: StubRequest[];
  /** Open stream connections right now. */
  openStreams(): number;
  /** Streams opened since start. */
  streamsOpened(): number;
  /** The most streams that were ever open at the same time: the host must keep this at 1. */
  maxConcurrentStreams(): number;
  lastSeq(): number;
  emit(event: Omit<Envelope, "v" | "seq" | "ts"> & { seq?: number }): Envelope;
  heartbeat(): void;
  /** Ends every open stream (loops' 300 s end). */
  endStreams(): void;
  /** Starts (or with null ends) an outage: see `Outage`. Open streams are ended when one starts. */
  outage(outage: Outage | null): void;
  /** The key is revoked: every keyed request answers 401 `invalid_api_key` from now on, and open streams end (loops' 60 s re-check). */
  revoke(on?: boolean): void;
  close(): Promise<void>;
}

export const DEFAULT_KEY = "chl_test_secret_key_0123456789abcdef";

const error = (code: string, message: string) => ({ error: { code, message, detail: null } });

export function envelope(seq: number, type: string, extra: Partial<Envelope> = {}): Envelope {
  return {
    v: 1,
    seq,
    ts: new Date(1_760_000_000_000 + seq * 1000).toISOString(),
    type,
    project: { slug: "atlas", key: "AT" },
    ticket: { id: "tk_1", key: "AT-1", title: "First" },
    actor: { id: "lead-1", kind: "agent" },
    recipientIds: [],
    payload: {},
    ...extra,
  };
}

export async function createLoopsStub(options: StubOptions = {}): Promise<LoopsStub> {
  const key = options.key ?? DEFAULT_KEY;
  let revoked = false;
  let outage: Outage | null = null;
  const hanging = new Set<ServerResponse>();
  const requests: StubRequest[] = [];
  const events: Envelope[] = [...(options.events ?? [])];
  const streams = new Set<ServerResponse>();
  let opened = 0;
  let maxConcurrent = 0;
  let busyLeft = options.busy?.count ?? 0;
  const pageIndex: Record<string, number> = {};
  const lastSeq = () => (events.length === 0 ? 0 : (events[events.length - 1] as Envelope).seq);
  const older = options.older === true;
  /** A sealed-looking cursor: `(S, W)` plus noise, URL-safe; the stub opens its own and nothing else. */
  const seal = (seen: number, checked: number) => `s${seen}w${Math.max(seen, checked)}x${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  const open = (token: string): { seen: number; checked: number } | null => {
    const match = /^s(\d+)w(\d+)x[a-z0-9]+$/.exec(token);
    if (match === null) return null;
    const seen = Number(match[1]);
    const checked = Number(match[2]);
    if (checked > lastSeq()) return null; // a watermark above the tail: a restored backup
    return { seen, checked };
  };
  const withCursor = (body: Record<string, unknown>, seen: number, checked: number) => (older ? body : { ...body, cursor: seal(seen, checked) });

  function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization;
    const record: StubRequest = { method: req.method ?? "", path: url.pathname + url.search, authorization: auth, at: Date.now(), host: req.headers.host };
    if (req.headers.cookie !== undefined) record.cookie = req.headers.cookie;
    requests.push(record);
    const detail = options.echoAuth ? ` (auth: ${auth ?? "none"})` : "";
    const publicHealth = url.pathname === "/api/health" && req.method === "GET" && auth === undefined && options.routes?.["/api/health"] === undefined;
    if (outage !== null && !(publicHealth && outage.healthOk === true)) {
      if (outage.hang === true) {
        hanging.add(res);
        res.on("close", () => hanging.delete(res));
        return;
      }
      return send(res, outage.status, error(outage.status === 401 ? "invalid_api_key" : "unavailable", `Outage ${outage.status}${detail}`));
    }
    // Health is public on crewhub-loops (the discovery probes it without a key); everything else needs the key.
    if (publicHealth) {
      return send(res, 200, { ok: true, version: options.version ?? "053b5f47", checks: {}, principal: null, watchdog: null });
    }
    if (auth === undefined) return send(res, 401, error("unauthenticated", `No credentials${detail}`));
    if (req.headers.cookie !== undefined) return send(res, 400, error("ambiguous_auth", `Send one or the other${detail}`));
    if (revoked || auth !== `Bearer ${key}`) return send(res, 401, error("invalid_api_key", `Unknown key${detail}`));
    if (req.method !== "GET") return send(res, 405, error("method_not_allowed", "GET only"));
    const p = url.pathname;
    const given = options.routes?.[p];
    if (p === "/api/health" && given === undefined && options.healthRefusesKey === true && auth !== undefined) return send(res, 403, error("forbidden", `A public route refuses a limited key${detail}`));
    if (p === "/api/health" && given === undefined) return send(res, 200, { ok: true, version: options.version ?? "053b5f47", checks: {}, principal: { id: "crewhub-world", kind: "agent", displayName: "World" } });
    // An external bot's key: role lead (a `routes` entry for the path overrides it, e.g. a probe or a reader).
    if (p === "/api/auth/me" && given === undefined) return send(res, 200, { principal: { id: "crewhub-world", kind: "agent", displayName: "World", role: "lead" } });
    // A viewer key's loops (L1): the key's own agent entry says `viewer: true`; the host's probe reads it there.
    if (p === "/api/agents" && options.keyReadsChat) {
      const listed = ((given as { agents?: Record<string, unknown>[] } | undefined)?.agents ?? []).filter((a) => a["id"] !== "crewhub-world");
      return send(res, 200, { agents: [...listed, { id: "crewhub-world", displayName: "World", role: "lead", external: true, viewer: true, herdrSession: null, disabled: false, lastSeenAt: null, keys: null, isCrewhubLead: false, projects: { lead: [], member: [] } }] });
    }
    if (p === "/api/dm/threads" && given === undefined && options.keyReadsChat && options.threadsStatus !== undefined) return send(res, options.threadsStatus, error("forbidden", `No chat for this key${detail}`));
    if (p === "/api/dm/threads" && given === undefined) return options.keyReadsChat ? send(res, 200, { threads: options.dm?.threads ?? [] }) : send(res, 403, error("forbidden", `Not a participant${detail}`));
    const keyMessage = /^\/api\/dm\/messages\/([^/]+)$/.exec(p);
    if (keyMessage !== null && given === undefined) {
      if (!options.keyReadsChat) return send(res, 403, error("forbidden", `Not a participant${detail}`));
      const message = options.dm?.messages?.[decodeURIComponent(keyMessage[1] as string)];
      return message === undefined ? send(res, 404, error("not_found", "No such message")) : send(res, 200, { message });
    }
    if (p === "/api/events") {
      const token = url.searchParams.get("cursor");
      if (token !== null && url.searchParams.has("after")) return send(res, 400, error("validation_error", "Send either cursor or after, not both"));
      let after = Number(url.searchParams.get("after") ?? "0");
      if (token !== null) {
        const opened = older ? null : open(token);
        if (opened === null) return send(res, 410, error("cursor_expired", `The cursor cannot be used${detail}`));
        after = opened.checked;
      }
      if (url.searchParams.get("from") === "tail" && !older) return send(res, 200, withCursor({ events: [], lastSeq: lastSeq() }, lastSeq(), lastSeq()));
      if (url.searchParams.get("types") === "attachment.added") {
        // CL-390: `lastSeq` is the last row returned, else the `after` sent: a filter that matches nothing says `after`.
        return send(res, 200, withCursor({ events: [], lastSeq: older ? lastSeq() : after }, after, lastSeq()));
      }
      // `types` is a comma list (or repeated), `limit` 1..500 with 500 the default (routers/events.py); `lastSeq` is
      // the last row returned, else the `after` sent.
      if (options.logMinAfter !== undefined && token === null && after < options.logMinAfter) return send(res, 410, error("cursor_expired", `after=${after} is below the log's floor${detail}`));
      const types = url.searchParams.getAll("types").flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v !== "");
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "500") || 500));
      // `ticket=` (loops main): only that ticket's events; a ref no event and no board names is the ticket routes' 404.
      const ticketRef = url.searchParams.get("ticket");
      const filterByTicket = ticketRef !== null && options.ticketFilter !== false && !older;
      if (filterByTicket && !events.some((e) => e.ticket?.id === ticketRef || e.ticket?.key === ticketRef)) return send(res, 404, error("not_found", `No ticket ${ticketRef}${detail}`));
      const page = events.filter((e) => e.seq > after && (types.length === 0 || types.includes(e.type)) && (!filterByTicket || e.ticket?.id === ticketRef || e.ticket?.key === ticketRef)).slice(0, limit);
      const seen = page.length === 0 ? after : (page[page.length - 1] as Envelope).seq;
      return send(res, 200, withCursor({ events: page, lastSeq: seen }, seen, lastSeq()));
    }
    if (p === "/api/events/stream") {
      const token = url.searchParams.get("cursor");
      if (token !== null && url.searchParams.has("after")) return send(res, 400, error("validation_error", "Send either cursor or after, not both"));
      let after = Number(url.searchParams.get("after") ?? String(lastSeq()));
      if (token !== null) {
        const opened = older ? null : open(token);
        if (opened === null) return send(res, 410, error("cursor_expired", `The cursor cannot be used${detail}`));
        after = opened.checked;
      }
      if (options.minAfter !== undefined && after < options.minAfter) return send(res, 410, error("cursor_expired", `after=${after} is gone${detail}`));
      if (busyLeft > 0) {
        busyLeft -= 1;
        res.writeHead(429, { "content-type": "application/json", "retry-after": options.busy?.retryAfter ?? "5" });
        res.end(JSON.stringify(error("too_many_streams", "Too many open event streams")));
        return;
      }
      opened += 1;
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.flushHeaders();
      for (const e of events) if (e.seq > after) res.write(`${JSON.stringify(e)}\n`);
      streams.add(res);
      maxConcurrent = Math.max(maxConcurrent, streams.size);
      res.on("close", () => streams.delete(res));
      return;
    }
    const pages = options.pages?.[p];
    if (pages !== undefined) {
      const index = pageIndex[p] ?? 0;
      const cursor = url.searchParams.get("cursor");
      const at = cursor === null ? 0 : Number(cursor.replace("page-", ""));
      const page = pages[at];
      pageIndex[p] = index + 1;
      if (page === undefined) return send(res, 404, error("not_found", `No such page${detail}`));
      return send(res, 200, page);
    }
    const route = options.routes?.[p];
    if (route === undefined) return send(res, 404, error("not_found", `Not found${detail}`));
    if (typeof route === "function") {
      const answer = (route as (url: URL) => { status: number; body: unknown })(url);
      return send(res, answer.status, answer.body);
    }
    return send(res, 200, route);
  }

  const server: Server = createServer(handle);
  const socketPath = options.socketPath ?? null;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if (socketPath !== null) server.listen(socketPath, resolve);
    else server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const port = socketPath === null ? (server.address() as AddressInfo).port : 0;

  return {
    url: socketPath === null ? `http://127.0.0.1:${port}` : "",
    port,
    socketPath,
    key,
    requests,
    openStreams: () => streams.size,
    streamsOpened: () => opened,
    maxConcurrentStreams: () => maxConcurrent,
    lastSeq,
    emit(event) {
      const seq = event.seq ?? lastSeq() + 1;
      const full = envelope(seq, event.type, { ...event, seq });
      events.push(full);
      for (const res of streams) res.write(`${JSON.stringify(full)}\n`);
      return full;
    },
    heartbeat() {
      const line = JSON.stringify(withCursor({ v: 1, type: "heartbeat", seq: lastSeq() }, lastSeq(), lastSeq()));
      // `ts` last, as loops writes it
      const beat = JSON.parse(line) as Record<string, unknown>;
      beat.ts = new Date().toISOString();
      const text = JSON.stringify(beat);
      for (const res of streams) res.write(`${text}\n`);
    },
    endStreams() {
      for (const res of streams) res.end();
      streams.clear();
    },
    outage(next) {
      outage = next;
      if (next !== null) {
        for (const res of streams) res.destroy();
        streams.clear();
      } else {
        for (const res of hanging) res.destroy();
        hanging.clear();
      }
    },
    revoke(on = true) {
      revoked = on;
      if (!on) return; // the bot re-enabled: the key answers again
      for (const res of streams) res.end();
      streams.clear();
    },
    async close() {
      for (const res of streams) res.destroy();
      streams.clear();
      for (const res of hanging) res.destroy();
      hanging.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

/** A small installation: two active projects (one with milestones on), one archived, people, agents, team, watchdog. */
export function installation(): Required<Pick<StubOptions, "routes" | "pages">> {
  const lead = { id: "lead-1", kind: "agent", displayName: "Lead One" };
  const project = (slug: string, key: string, extra: Record<string, unknown> = {}) => ({
    id: `pr_${slug}`,
    slug,
    key,
    name: slug,
    lead,
    counts: { backlog: 1, planned: 0, in_progress: 1, review: 0, done: 0 },
    effectiveRoute: { agent: lead.id },
    archivedAt: null,
    ...extra,
  });
  const board = (key: string) => ({
    columns: ["backlog", "planned", "in_progress", "review", "done"].map((status) => ({
      status,
      tickets:
        status === "in_progress"
          ? [{ id: `tk_${key}`, key: `${key}-1`, title: "First", kind: "task", status, priority: "normal", position: 1, version: 1, updatedAt: "2026-10-07T10:00:00Z", statusChangedAt: "2026-10-07T10:00:00Z" }]
          : [],
    })),
  });
  const features = (milestones: boolean, releases: boolean) => ({
    features: [
      { key: "milestones", label: "Milestones", type: "bool", value: milestones, default: false, revision: 1 },
      { key: "releases", label: "Releases", type: "bool", value: releases, default: false, revision: 1 },
    ],
  });
  const milestone = (n: number) => ({ id: `ms_${n}`, key: `AT-M${n}`, number: n, title: `M${n}`, state: "active", project: { slug: "atlas", key: "AT" }, position: n, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", revision: 1 });
  return {
    routes: {
      "/api/projects": (url: URL) =>
        url.searchParams.get("includeArchived") === "true"
          ? { status: 403, body: error("forbidden", "includeArchived is for admins") }
          : { status: 200, body: { projects: [project("atlas", "AT"), project("beacon", "BC")] } },
      "/api/projects/old": { project: project("old", "OLD", { archivedAt: "2026-09-01T00:00:00Z" }) },
      "/api/board/atlas": board("AT"),
      "/api/board/beacon": board("BC"),
      "/api/projects/atlas/features": features(true, false),
      "/api/projects/beacon/features": features(false, true),
      "/api/projects/beacon/releases": (_url: URL) => ({ status: 409, body: error("feature_off", "Releases are off") }),
      "/api/principals": { principals: [lead, { id: "nicky", kind: "user", displayName: "Nicky" }] },
      "/api/agents": { agents: [{ id: "lead-1", displayName: "Lead One", role: "lead", herdrSession: null, disabled: false, lastSeenAt: null, keys: null, isCrewhubLead: true, projects: { lead: [{ slug: "atlas", key: "AT" }], member: [] } }] },
      "/api/team": { v: 1, ts: "2026-10-07T10:00:00Z", sessions: [] },
      "/api/watchdog": { mode: "observe", open: [] },
      "/api/tickets/AT-1": { ticket: { id: "tk_AT", key: "AT-1", title: "First", secret: "none" } },
      "/api/tickets/AT-1/comments": { comments: [], nextCursor: null },
    },
    pages: {
      "/api/projects/atlas/milestones": [
        { milestones: [milestone(1), milestone(2)], nextCursor: "page-1" },
        { milestones: [milestone(3)], nextCursor: null },
      ],
    },
  };
}
