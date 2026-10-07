/**
 * A tiny crewhub-loops for the host's tests: loops' routes and shapes for the reads the host makes, bearer auth,
 * an NDJSON stream with `after=`, heartbeats and 410 for a too-old cursor. It records every request it sees.
 * On 127.0.0.1 port 0: loopback to the test itself, no network. (The full fake is `packages/loops-fake`.)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface StubRequest {
  method: string;
  path: string;
  authorization: string | undefined;
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
}

export interface LoopsStub {
  url: string;
  port: number;
  key: string;
  requests: StubRequest[];
  /** Open stream connections right now. */
  openStreams(): number;
  /** Streams opened since start. */
  streamsOpened(): number;
  lastSeq(): number;
  emit(event: Omit<Envelope, "v" | "seq" | "ts"> & { seq?: number }): Envelope;
  heartbeat(): void;
  /** Ends every open stream (loops' 300 s end). */
  endStreams(): void;
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
  const requests: StubRequest[] = [];
  const events: Envelope[] = [...(options.events ?? [])];
  const streams = new Set<ServerResponse>();
  let opened = 0;
  const pageIndex: Record<string, number> = {};
  const lastSeq = () => (events.length === 0 ? 0 : (events[events.length - 1] as Envelope).seq);

  function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization;
    requests.push({ method: req.method ?? "", path: url.pathname + url.search, authorization: auth });
    const detail = options.echoAuth ? ` (auth: ${auth ?? "none"})` : "";
    if (auth === undefined) return send(res, 401, error("unauthenticated", `No credentials${detail}`));
    if (req.headers.cookie !== undefined) return send(res, 400, error("ambiguous_auth", `Send one or the other${detail}`));
    if (auth !== `Bearer ${key}`) return send(res, 401, error("invalid_api_key", `Unknown key${detail}`));
    if (req.method !== "GET") return send(res, 405, error("method_not_allowed", "GET only"));
    const p = url.pathname;
    if (p === "/api/health") return send(res, 200, { ok: true, version: "053b5f47", checks: {}, principal: { id: "crewhub-world", kind: "agent", displayName: "World" } });
    if (p === "/api/auth/me") return send(res, 200, { principal: { id: "crewhub-world", kind: "agent", displayName: "World", role: "probe" } });
    if (p === "/api/events") {
      const after = Number(url.searchParams.get("after") ?? "0");
      if (url.searchParams.get("types") === "attachment.added") return send(res, 200, { events: [], lastSeq: lastSeq() });
      return send(res, 200, { events: events.filter((e) => e.seq > after), lastSeq: lastSeq() });
    }
    if (p === "/api/events/stream") {
      const after = Number(url.searchParams.get("after") ?? String(lastSeq()));
      if (options.minAfter !== undefined && after < options.minAfter) return send(res, 410, error("cursor_expired", `after=${after} is gone${detail}`));
      opened += 1;
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.flushHeaders();
      for (const e of events) if (e.seq > after) res.write(`${JSON.stringify(e)}\n`);
      streams.add(res);
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
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    key,
    requests,
    openStreams: () => streams.size,
    streamsOpened: () => opened,
    lastSeq,
    emit(event) {
      const seq = event.seq ?? lastSeq() + 1;
      const full = envelope(seq, event.type, { ...event, seq });
      events.push(full);
      for (const res of streams) res.write(`${JSON.stringify(full)}\n`);
      return full;
    },
    heartbeat() {
      const line = JSON.stringify({ v: 1, type: "heartbeat", seq: lastSeq(), ts: new Date().toISOString() });
      for (const res of streams) res.write(`${line}\n`);
    },
    endStreams() {
      for (const res of streams) res.end();
      streams.clear();
    },
    async close() {
      for (const res of streams) res.destroy();
      streams.clear();
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
