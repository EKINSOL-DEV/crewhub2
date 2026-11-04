import type { Envelope } from "./types.ts";
import type { ChatLine, ChatThreadFact } from "./source.ts";
import { type Result, knownOr, lenientOneOf, validateEnvelope, warnOnce } from "./validate.ts";

/**
 * The wire between the world's host (`apps/host`) and the page, defined once: the browser routes under `/world-api`,
 * the health answer, and the kinds of message the host's stream carries, each with its reader. The host writes through
 * this module (its route table and its health and message types are these); the page's live source
 * (`hostSource.ts`) and the stubs that stand in for a host (the tests' hand hosts, `tools/lib/connectStub.mjs`) read
 * through it, so one table and one set of readers pin the contract (`apps/host/test/wire.test.ts` runs the real host
 * and the stubs against them). Pure: no fetch, no node, no DOM.
 */

// --- Routes. ---

export const WORLD_API_PREFIX = "/world-api";

/** A path segment of a loops ref or slug: a ticket key (`CL-85`, `CL-111.2`), an id (`tk_…`), a slug. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** Whether a string is one path segment of a loops ref or slug (the shape every remembered slug must have, review F8). */
export const isSegment = (value: unknown): value is string => typeof value === "string" && SEGMENT.test(value);

/** Query parameters a browser may pass through, per route kind. */
const PAGE_QUERY = ["limit", "cursor"] as const;

export interface WorldRoute {
  /** The browser path under `/world-api`, e.g. `/tickets/{ref}`; `{x}` stands for one segment. */
  pattern: string;
  /** `local`: the host answers itself; `loops`: passed through to the loops path with the same segments. */
  kind: "local" | "loops";
  loopsPattern?: string;
  /** Query parameters the host passes on; any other is dropped. */
  query: readonly string[];
  /** The methods the route answers; GET when absent. Only `/connect` and `/town` take a write, both local; the key never writes to loops, the town is the host's own database (worldDb.ts). The sign-in road's `/session` went in round 19. */
  methods?: readonly string[];
}

/**
 * Routes the browser may ask the host for (`/world-api` + pattern): the host matches against this table
 * (`allowList.ts`), the page builds its paths from it (`worldApiPath`), the stubs answer by it.
 */
const ROUTES = [
  { pattern: "/health", kind: "local", query: [] },
  { pattern: "/snapshot", kind: "local", query: [] },
  { pattern: "/stream", kind: "local", query: ["cursor"] },
  { pattern: "/project-groups", kind: "local", query: [] },
  { pattern: "/connect", kind: "local", query: [], methods: ["POST", "DELETE"] },
  // The dev server of this checkout tells the host its loopback origin (devOrigin.ts); a program's request, never a page's.
  { pattern: "/dev-origin", kind: "local", query: [], methods: ["POST"] },
  // The page exchanges a one-time token for this tab's bearer (round 27, pairing.ts); before the pairing gate.
  { pattern: "/pair", kind: "local", query: [], methods: ["POST"] },
  { pattern: "/town", kind: "local", query: [], methods: ["GET", "PUT"] },
  { pattern: "/town/export", kind: "local", query: [] },
  { pattern: "/town/backups", kind: "local", query: [] },
  { pattern: "/town/backups/{name}", kind: "local", query: [] },
  { pattern: "/tickets/{ref}", kind: "loops", loopsPattern: "/api/tickets/{ref}", query: [] },
  { pattern: "/tickets/{ref}/comments", kind: "loops", loopsPattern: "/api/tickets/{ref}/comments", query: PAGE_QUERY },
  { pattern: "/tickets/{ref}/progress", kind: "loops", loopsPattern: "/api/tickets/{ref}/progress", query: PAGE_QUERY },
  { pattern: "/projects/{slug}", kind: "loops", loopsPattern: "/api/projects/{slug}", query: [] },
  { pattern: "/projects/{slug}/milestones", kind: "loops", loopsPattern: "/api/projects/{slug}/milestones", query: PAGE_QUERY },
  { pattern: "/projects/{slug}/releases", kind: "loops", loopsPattern: "/api/projects/{slug}/releases", query: PAGE_QUERY },
  { pattern: "/board/{slug}", kind: "loops", loopsPattern: "/api/board/{slug}", query: [] },
  { pattern: "/watchdog", kind: "loops", loopsPattern: "/api/watchdog", query: [] },
  { pattern: "/team", kind: "loops", loopsPattern: "/api/team", query: [] },
] as const satisfies readonly WorldRoute[];
export const WORLD_ROUTES: readonly WorldRoute[] = ROUTES;

/** A pattern of the table: the only paths the page may build (`worldApiPath`), checked by `npm run typecheck`. */
export type WorldRoutePattern = (typeof ROUTES)[number]["pattern"];

/** Fills `{name}` segments of a pattern with encoded values. */
export function fillPattern(pattern: string, values: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(values[name] ?? ""));
}

/**
 * The path the page asks its host for: `/world-api` + the pattern with its segments filled and encoded, and the query
 * the route takes. A query parameter the route does not pass on is the page's own error, thrown here (the host would
 * drop it silently and answer something else than the page meant).
 */
export function worldApiPath(pattern: WorldRoutePattern, params: Record<string, string> = {}, query: Record<string, string> = {}): string {
  const route = WORLD_ROUTES.find((r) => r.pattern === pattern) as WorldRoute;
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (!route.query.includes(name)) throw new Error(`${WORLD_API_PREFIX}${pattern} takes no query parameter ${name}`);
    search.set(name, value);
  }
  const qs = search.toString();
  return `${WORLD_API_PREFIX}${fillPattern(pattern, params)}${qs === "" ? "" : `?${qs}`}`;
}

// --- Health: `GET /world-api/health`. ---

/** The host's old tri-state word on loops: `unauthorized` for no key and for a rejected key alike (`HostKeyState` tells them apart). */
export type LoopsState = "ok" | "down" | "unauthorized";
export const LOOPS_STATES = ["ok", "down", "unauthorized"] as const satisfies readonly LoopsState[];

/** How the host found crewhub-loops (spec addendum "a smooth connection", part 1). */
export interface HostDiscovery {
  /** `searching`: nothing answers yet; the host looks again every 5 s. */
  state: "found" | "searching";
  /** What found it: the env URL or socket (the scripted road), or the Mac app's socket or port from its data folder. */
  via?: "env-url" | "env-socket" | "app-socket" | "app-port";
  /** The URL or socket path (paired browsers only; absent before pairing). */
  target?: string;
}

export const HOST_KEY_STATES = ["none", "unchecked", "checking", "rejected", "ok"] as const;

/**
 * The host's key: none yet (the Connect screen), being checked, rejected by loops, ok, or `unchecked`: the host holds a
 * key but crewhub-loops has not answered about it (down, restarting, a 5xx, a timeout); it is checked again when loops
 * answers. Only a definite 401 or 403 from a loops whose health answers makes a key `rejected`; a rejected key stays on
 * disk with its reason until a new one is pasted or it is forgotten.
 */
export interface HostKeyState {
  state: (typeof HOST_KEY_STATES)[number];
  /** The key's agent name (`agent-<name>.key`, or the principal loops answered); paired browsers only. */
  name?: string;
  /** Where the key came from: the environment's file, the host's stored key, or the old default file. Paired only. */
  source?: "env" | "stored" | "default";
  /** Why loops rejected it, in words a person can act on (a probe or reader key, an unknown key). Never the key. */
  reason?: string;
  /** When the host re-checks a rejected key with loops by itself (ISO time): a bot re-enabled in loops comes back then. */
  recheckAt?: string;
}

/**
 * The chat's road (round 12; one road since round 19): present as `key` when this crewhub-loops lets the world's own key
 * read the chat (a viewer key, `world/viewer-key`), so the agents' answers come as bubbles over the key's own stream;
 * `unknown` (round 29) while the host cannot say yet (no link to loops, the key unchecked or being checked), so the
 * page decides no road on it; absent when the host knows the key does not read the chat (an older loops, a plain
 * external bot's key, loops' chat bubbles feature off): no bubbles over the key, and the world says the ways. The
 * sign-in road (`signed-out`, `signed-in`, `expired`, a person's session kept by the host) went with the switch to the
 * viewer key (decision 9).
 */
export interface HostSessionState {
  state: "key" | "unknown";
}

/** The host's one upstream stream. */
export interface HostStreamState {
  /**
   * `idle`: no stream (no loops found or no key yet); `busy`: loops refused the stream with 429 `too_many_streams`
   * (four streams per key: another host or tab uses this key; the host retries after `Retry-After`); the rest as
   * `HostHealth.loops`.
   */
  state: "idle" | "ok" | "down" | "unauthorized" | "busy";
  /** Why the stream is not ok, in words a person can act on (`busy`: "stream budget exhausted (429): …"). */
  reason?: string;
  /** The last `seq` the host holds (paired only). */
  cursor?: number;
  /** When the last event arrived, ISO 8601 (paired only). */
  lastEventAt?: string;
  /** Reconnects since the host started (loops' 300 s end counts). */
  reconnects: number;
}

/**
 * Where the host's list of archived projects (closed buildings) comes from: `list`, loops listed them itself (a key that
 * may ask `includeArchived`); `log`, read from loops' event log in this run; `remembered`, from the host's own file of an
 * earlier run (this loops would not let the host read its log from the start); `none`, nothing known yet. The stream's
 * own `project.archived` and `project.restored` events count on top of any of them.
 */
export interface HostArchiveState {
  source: "list" | "log" | "remembered" | "none";
  /** How many projects the host knows as archived. */
  count: number;
  /** When the list was learnt or last changed, ISO 8601. */
  at?: string;
  /** The slugs (paired browsers only). */
  slugs?: string[];
}

/**
 * The host's last snapshot assembly, so the page can say "Reading 12 projects from crewhub-loops…" while the first
 * snapshot loads: `idle` before any, `reading` with the reads done so far (and the project count once the list is
 * in), `ready` with what it cost, `failed` with the reason the snapshot route answered.
 */
export type HostSnapshotState =
  | { state: "idle" }
  | { state: "reading"; reads: number; projects?: number }
  | { state: "ready"; projects: number; reads: number; ms: number }
  | { state: "failed"; reason: string };

/** The honest states of the connection (spec addendum "a smooth connection", part 4). Before pairing: states only. */
export interface HostConnection {
  discovery: HostDiscovery;
  key: HostKeyState;
  stream: HostStreamState;
  /** Absent on a host from before the archive memory. */
  archived?: HostArchiveState;
  /** Absent on a host from before the step list. */
  snapshot?: HostSnapshotState;
  /** The chat's road: `key` when the world's key reads the chat on this loops (bubbles); absent when it does not. */
  session?: HostSessionState;
}

/** `GET /world-api/health`. Never the key. */
export interface HostHealth {
  loops: LoopsState;
  /** The key's agent name; `""` while the host has no key (then `connection.key.state` is `none`). */
  keyName: string;
  /** Always false since the builder-key fallback went; kept for hosts from before. */
  sharedKey: boolean;
  /** Discovery, key and stream states; absent on a host from before the smooth connection. */
  connection?: HostConnection;
  loopsCommit?: string;
  /** The version the host read first in this run, when loops answered another since (loops updated under the host). */
  loopsCommitBefore?: string;
  cursor?: number;
  /** The origin of crewhub-loops' web app (the API's URL; on the Mac both share 8091), for the sign-in link. */
  loopsWebUrl?: string;
  /** How the host reaches loops: `tcp` (the URL) or `unix` (the app's socket). Absent on a host from before the seam. */
  transport?: "tcp" | "unix";
  /** Whether this browser carries a valid pairing cookie (plan 3.5). Absent on a host from before pairing. */
  paired?: boolean;
  /** `off` only in development; then every request counts as paired. */
  pairing?: "on" | "off";
  /** How many days a pairing may go unused before the host refuses it (round 27); 0 never. */
  pairingIdleDays?: number;
  /** The id of the checkout the host runs from (apps/host `checkout.ts`): a dev server refuses another checkout's host. */
  checkout?: string;
  /** The loopback origins this checkout's dev server told the host this run (`devOrigin.ts`); absent when none, and on a host from before. */
  devOrigins?: string[];
}

/**
 * What a current host writes (`host.ts`, the health route): the page's `HostHealth` with the fields every host since the
 * smooth connection and pairing sends. The page reads `HostHealth`, since a host from before may lack them.
 */
export type HostHealthSent = HostHealth & Required<Pick<HostHealth, "loopsWebUrl" | "paired" | "pairing" | "connection">>;


// --- The readers: strict, and never the key. ---

/** A chat line from the host, strictly: the ids and the text as non-empty strings, the name when given. */
export function readChatLine(value: unknown): ChatLine | null {
  const raw = value as Partial<Record<keyof ChatLine, unknown>> | null | undefined;
  if (!raw || typeof raw.agentId !== "string" || raw.agentId === "" || typeof raw.text !== "string" || raw.text === "" || typeof raw.at !== "string" || typeof raw.messageId !== "string" || typeof raw.threadId !== "string") return null;
  const out: ChatLine = { agentId: raw.agentId, text: raw.text, at: raw.at, messageId: raw.messageId, threadId: raw.threadId };
  if (typeof raw.agentName === "string" && raw.agentName !== "") out.agentName = raw.agentName;
  return out;
}

/** The thread facts from the host, strictly: a list; each row with its agent id, a stamp and a count, or it is dropped. */
export function readThreadFacts(value: unknown): ChatThreadFact[] | null {
  if (!Array.isArray(value)) return null;
  const out: ChatThreadFact[] = [];
  for (const row of value as Partial<Record<keyof ChatThreadFact, unknown>>[]) {
    if (!row || typeof row.agentId !== "string" || row.agentId === "" || typeof row.lastMessageAt !== "string" || typeof row.unreadCount !== "number" || !Number.isInteger(row.unreadCount) || row.unreadCount < 0) continue;
    out.push({ agentId: row.agentId, lastMessageAt: row.lastMessageAt, unreadCount: row.unreadCount });
  }
  return out;
}

const oneOf = <T extends string>(value: unknown, values: readonly T[]): T | undefined => (values.includes(value as T) ? (value as T) : undefined);

/** The `connection` object of a health answer, or null when it is missing or malformed (an older host). Never the key. */
export function readConnection(value: unknown): HostConnection | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as { discovery?: Partial<HostDiscovery>; key?: Partial<HostKeyState>; stream?: Partial<HostStreamState>; archived?: Partial<HostArchiveState>; snapshot?: unknown; session?: unknown };
  const discoveryState = oneOf(raw.discovery?.state, ["found", "searching"]);
  const keyState = oneOf(raw.key?.state, HOST_KEY_STATES);
  const streamState = oneOf(raw.stream?.state, ["idle", "ok", "down", "unauthorized", "busy"]);
  if (discoveryState === undefined || keyState === undefined || streamState === undefined) return null;
  const discovery: HostDiscovery = { state: discoveryState };
  const via = oneOf(raw.discovery?.via, ["env-url", "env-socket", "app-socket", "app-port"]);
  if (via !== undefined) discovery.via = via;
  if (typeof raw.discovery?.target === "string") discovery.target = raw.discovery.target;
  const key: HostKeyState = { state: keyState };
  if (typeof raw.key?.name === "string") key.name = raw.key.name;
  const source = oneOf(raw.key?.source, ["env", "stored", "default"]);
  if (source !== undefined) key.source = source;
  if (typeof raw.key?.reason === "string") key.reason = raw.key.reason;
  if (typeof raw.key?.recheckAt === "string") key.recheckAt = raw.key.recheckAt;
  const stream: HostStreamState = { state: streamState, reconnects: typeof raw.stream?.reconnects === "number" ? raw.stream.reconnects : 0 };
  if (typeof raw.stream?.cursor === "number") stream.cursor = raw.stream.cursor;
  if (typeof raw.stream?.lastEventAt === "string") stream.lastEventAt = raw.stream.lastEventAt;
  if (typeof raw.stream?.reason === "string") stream.reason = raw.stream.reason;
  const out: HostConnection = { discovery, key, stream };
  const archiveSource = oneOf(raw.archived?.source, ["list", "log", "remembered", "none"]);
  if (archiveSource !== undefined) {
    const archived: HostArchiveState = { source: archiveSource, count: typeof raw.archived?.count === "number" ? raw.archived.count : 0 };
    if (typeof raw.archived?.at === "string") archived.at = raw.archived.at;
    if (Array.isArray(raw.archived?.slugs)) archived.slugs = raw.archived.slugs.filter((s): s is string => typeof s === "string");
    out.archived = archived;
  }
  const snapshot = readSnapshotState(raw.snapshot);
  if (snapshot !== null) out.snapshot = snapshot;
  const session = readSessionState(raw.session);
  if (session !== null) out.session = session;
  return out;
}

/** The host's `connection.session`, strictly: `key` only; anything else (a host from before with a sign-in state) is dropped. */
export function readSessionState(value: unknown): HostSessionState | null {
  const raw = value as { state?: unknown } | null | undefined;
  const state = oneOf(raw?.state, ["key", "unknown"]);
  return state === undefined ? null : { state };
}

/** The `snapshot` of a connection, or null when it is missing or malformed. */
export function readSnapshotState(value: unknown): HostSnapshotState | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as { state?: unknown; reads?: unknown; projects?: unknown; ms?: unknown; reason?: unknown };
  const count = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  switch (raw.state) {
    case "idle":
      return { state: "idle" };
    case "reading": {
      const projects = count(raw.projects);
      return { state: "reading", reads: count(raw.reads) ?? 0, ...(projects === undefined ? {} : { projects }) };
    }
    case "ready":
      return { state: "ready", projects: count(raw.projects) ?? 0, reads: count(raw.reads) ?? 0, ms: count(raw.ms) ?? 0 };
    case "failed":
      return { state: "failed", reason: typeof raw.reason === "string" ? raw.reason : "" };
    default:
      return null;
  }
}


/**
 * The health answer, strictly: a host's when `loops` is one of its three words and `keyName` a string; the rest only in
 * the shapes the page knows (`loopsWebUrl` an http(s) URL, `checkout` hex, `connection` through `readConnection`,
 * `devOrigins` strings). Anything else is dropped (never the key). `null` for an answer that is not a host's.
 */
export function readHostHealth(value: unknown): HostHealth | null {
  const body = value as Partial<HostHealth> | null;
  if (body === null || typeof body !== "object") return null;
  const loops = oneOf(body.loops, LOOPS_STATES);
  if (loops === undefined || typeof body.keyName !== "string") return null;
  const health: HostHealth = { loops, keyName: body.keyName, sharedKey: body.sharedKey === true };
  if (typeof body.loopsCommit === "string") health.loopsCommit = body.loopsCommit;
  if (typeof body.loopsCommitBefore === "string") health.loopsCommitBefore = body.loopsCommitBefore;
  if (typeof body.cursor === "number") health.cursor = body.cursor;
  if (typeof body.loopsWebUrl === "string" && /^https?:\/\//.test(body.loopsWebUrl)) health.loopsWebUrl = body.loopsWebUrl;
  if (body.transport === "tcp" || body.transport === "unix") health.transport = body.transport;
  if (typeof body.paired === "boolean") health.paired = body.paired;
  if (body.pairing === "on" || body.pairing === "off") health.pairing = body.pairing;
  if (typeof body.pairingIdleDays === "number" && body.pairingIdleDays >= 0) health.pairingIdleDays = body.pairingIdleDays;
  if (typeof body.checkout === "string" && /^[0-9a-f]{6,64}$/.test(body.checkout)) health.checkout = body.checkout;
  if (Array.isArray(body.devOrigins)) health.devOrigins = body.devOrigins.filter((origin): origin is string => typeof origin === "string");
  const connection = readConnection(body.connection);
  if (connection !== null) health.connection = connection;
  return health;
}

// --- The stream: `GET /world-api/stream`, one JSON message per Server-Sent Event. ---

export type HostMessage =
  /**
   * `stream: "busy"` with the reason when loops refused the stream with 429 (`loops` stays `down` for the world from before).
   * `key` is the host's own word on its key (`HostConnection.key.state`: none, unchecked, checking, rejected, ok), stamped by
   * the host on every status it sends a tab: `loops` keeps one legacy word, "unauthorized", for no key and for a rejected
   * key alike, so after a Forget in another tab a tab hears `unauthorized, key none` and shows the Connect screen, and for a
   * key loops revoked `unauthorized, key rejected`. The upstream itself sends no key; the host adds it (a host from before
   * round 11 sends none).
   */
  | { type: "status"; loops: LoopsState; stream?: "busy"; reason?: string; key?: HostKeyState["state"] }
  | { type: "event"; envelope: Envelope }
  | { type: "heartbeat"; seq: number; ts: string }
  /** An agent's message to the person, read by the host with its own key where loops lets it (apps/host chatPath.ts): a bubble. */
  | { type: "chat"; chat: ChatLine }
  /** The installation's town document changed on the host (round 20, worldDb.ts): the browsers refetch `/world-api/town`. */
  | { type: "town"; rev: number }
  /** The chat threads' facts (round 24), where loops lets the key read the chat: the whole list, at attach and after a `dm.*` event. */
  | { type: "threads"; threads: ChatThreadFact[] }
  | { type: "reset"; reason: "gone" | "reconnected" | "cursor" };

const RESET_REASONS = ["gone", "reconnected", "cursor"] as const;
/** A `loops` word this page does not know is read as `down` (a newer host): the world from before took it so. */
const loopsWord = knownOr(LOOPS_STATES, "host loops state", "down");
/** A reset's reason is for the log: a word this page does not know passes through (and one missing is read as `gone`, below). */
const resetReason = lenientOneOf(RESET_REASONS, "reset reason");
const fail = (path: string, message: string): Result<never> => ({ ok: false, path, message });
const okAs = (message: HostMessage): Result<HostMessage> => ({ ok: true, value: message });

/**
 * One message of the host's stream, strictly: the kinds above in their shapes, or why not (the path names the field).
 * Lenient only where a word may be newer than this page (`loops`, a reset's reason), on a `key` word it does not know,
 * which is dropped as the status stands (the world from before ignored it the same way), and on a reset without a
 * reason: a reset is the host's "continuity broke" signal and the page re-snapshots on it whatever the reason, which it
 * never reads, so a missing one is read as `gone` (said once) rather than losing the signal.
 */
export function readHostMessage(value: unknown): Result<HostMessage> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("$", "expected a message object");
  const raw = value as Record<string, unknown>;
  switch (raw.type) {
    case "status": {
      const loops = loopsWord(raw.loops, "$.loops");
      if (!loops.ok) return loops;
      const out: HostMessage = { type: "status", loops: loops.value };
      if (raw.stream === "busy") out.stream = "busy";
      if (typeof raw.reason === "string") out.reason = raw.reason;
      const key = oneOf(raw.key, HOST_KEY_STATES);
      if (key !== undefined) out.key = key;
      return okAs(out);
    }
    case "event": {
      const result = validateEnvelope(raw.envelope);
      return result.ok ? okAs({ type: "event", envelope: result.value }) : fail(`$.envelope${result.path.slice(1)}`, result.message);
    }
    case "heartbeat":
      if (typeof raw.seq !== "number") return fail("$.seq", "expected a number");
      if (typeof raw.ts !== "string") return fail("$.ts", "expected a string");
      return okAs({ type: "heartbeat", seq: raw.seq, ts: raw.ts });
    case "chat": {
      const chat = readChatLine(raw.chat);
      return chat === null ? fail("$.chat", "expected a chat line: agentId, text, at, messageId and threadId as strings") : okAs({ type: "chat", chat });
    }
    case "town":
      return typeof raw.rev === "number" && Number.isInteger(raw.rev) && raw.rev >= 0 ? okAs({ type: "town", rev: raw.rev }) : fail("$.rev", "expected a whole number from 0 up");
    case "threads": {
      const threads = readThreadFacts(raw.threads);
      return threads === null ? fail("$.threads", "expected a list of thread facts") : okAs({ type: "threads", threads });
    }
    case "reset": {
      if (typeof raw.reason !== "string") {
        warnOnce("stream:$.reason", `a reset without a reason (${JSON.stringify(raw.reason)}) is read as gone: the page re-snapshots`);
        return okAs({ type: "reset", reason: "gone" });
      }
      const reason = resetReason(raw.reason, "$.reason");
      return reason.ok ? okAs({ type: "reset", reason: reason.value }) : reason;
    }
    default:
      return fail("$.type", `unknown message type ${JSON.stringify(raw.type)}`);
  }
}
