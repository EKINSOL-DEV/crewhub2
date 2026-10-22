/**
 * HostSource: the live crewhub-loops behind the WorldSource seam, read through the world's own host
 * (`apps/host`, `/world-api`). Snapshot first, then events by `seq` over SSE; a `reset` (or, when asked, a gap in
 * `seq`) means `catching-up` and a fresh snapshot; heartbeats keep it `live`; silence makes it `stale`; the host's `status`
 * messages say when loops is down or the key is refused. `now()` is the wall clock; there is no playback.
 *
 * This is the one file in the browser that may fetch (scripts/scan-model-calls.ts, NETWORK_ALLOWLIST): it reads
 * its own host and nothing else. Streams with `fetch` and a line reader over `response.body`: no EventSource, so
 * the cursor and the reconnect are ours. Nothing here ever throws out of the listener.
 */
import type {
  BoardResponse,
  CommentOut,
  Envelope,
  MilestoneSummary,
  ProgressItem,
  ProjectGroup,
  ProjectOut,
  ReleaseSummary,
  Ticket,
  WatchdogResponse,
} from "./types.ts";
import type { ChatLine, ConnectionState, ConnectionStatus, HostSourceOptions, LoopsSnapshot, SourceMessage, WorldSource } from "./source.ts";
import {
  type Result,
  validateBoardResponse,
  validateCommentsResponse,
  validateEnvelope,
  validateLoopsSnapshot,
  validateMilestonesResponse,
  validateProgressResponse,
  validateProjectGroupsResponse,
  validateProjectOut,
  validateReleasesResponse,
  validateTeamSnapshot,
  validateTicket,
  validateWatchdogResponse,
  warnOnce,
} from "./validate.ts";

/** How the host found crewhub-loops (spec addendum "a smooth connection", part 1). */
export interface HostDiscovery {
  /** `searching`: nothing answers yet; the host looks again every 5 s. */
  state: "found" | "searching";
  /** What found it: the env URL or socket (the scripted road), or the Mac app's socket or port from its data folder. */
  via?: "env-url" | "env-socket" | "app-socket" | "app-port";
  /** The URL or socket path (paired browsers only; absent before pairing). */
  target?: string;
}

/**
 * The host's key: none yet (the Connect screen), being checked, rejected by loops, ok, or `unchecked`: the host holds a
 * key but crewhub-loops has not answered about it (down, restarting, a 5xx, a timeout); it is checked again when loops
 * answers. Only a definite 401 or 403 from a loops whose health answers makes a key `rejected`; a rejected key stays on
 * disk with its reason until a new one is pasted or it is forgotten.
 */
export interface HostKeyState {
  state: "none" | "unchecked" | "checking" | "rejected" | "ok";
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
 * absent when it does not (an older loops, a plain external bot's key): no bubbles, and the world says how to make a
 * viewer key. The sign-in road (`signed-out`, `signed-in`, `expired`, a person's session kept by the host) went with
 * the switch to the viewer key (decision 9).
 */
export interface HostSessionState {
  state: "key";
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
  loops: "ok" | "down" | "unauthorized";
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
  /** The id of the checkout the host runs from (apps/host `checkout.ts`): a dev server refuses another checkout's host. */
  checkout?: string;
}

/** The source's clocks, with their defaults. Tests inject short ones. */
export interface HostSourceTimings {
  /** No message of any kind for this long → `stale`. Default 40 s (two loops heartbeats plus slack). */
  staleMs: number;
  /** `GET /world-api/team` on this timer, as the demo does (an old team snapshot never announces itself). Default 30 s. */
  teamPollMs: number;
  /** Reconnect backoff, doubling from min to max. Defaults 500 ms and 10 s. */
  retryMinMs: number;
  retryMaxMs: number;
  /** The backoff's cap while the source has no snapshot yet (the host is linking): default 2 s. */
  firstRetryMaxMs: number;
}

const DEFAULT_TIMINGS: HostSourceTimings = { staleMs: 40_000, teamPollMs: 30_000, retryMinMs: 500, retryMaxMs: 10_000, firstRetryMaxMs: 2000 };
const PREFIX = "/world-api";

/** What the host puts on the stream (ready-team-map: "Host → browser"). */
type StreamMessage =
  /** `key`: the host's own word on its key (round 11); a host from before sends none. */
  | { type: "status"; loops: HostHealth["loops"]; stream?: HostStreamState["state"]; reason?: string; key?: unknown }
  | { type: "event"; envelope: unknown }
  | { type: "heartbeat"; seq: number; ts: string }
  | { type: "reset"; reason: string }
  /** An agent's message to the person (round 12), read by the host as the signed-in person. */
  | { type: "chat"; chat: unknown }
  /** The installation's town document changed on the host (round 20): the town runtime refetches it. */
  | { type: "town"; rev: unknown };

/** An agent's line as the host sends it (`ChatLine` of the source, the same shape). */
export type HostChatLine = ChatLine;

/** A chat line from the host, strictly: the ids and the text as non-empty strings, the name when given. */
export function readChatLine(value: unknown): ChatLine | null {
  const raw = value as Partial<Record<keyof ChatLine, unknown>> | null | undefined;
  if (!raw || typeof raw.agentId !== "string" || raw.agentId === "" || typeof raw.text !== "string" || raw.text === "" || typeof raw.at !== "string" || typeof raw.messageId !== "string" || typeof raw.threadId !== "string") return null;
  const out: ChatLine = { agentId: raw.agentId, text: raw.text, at: raw.at, messageId: raw.messageId, threadId: raw.threadId };
  if (typeof raw.agentName === "string" && raw.agentName !== "") out.agentName = raw.agentName;
  return out;
}

const oneOf = <T extends string>(value: unknown, values: readonly T[]): T | undefined => (values.includes(value as T) ? (value as T) : undefined);

/** The `connection` object of a health answer, or null when it is missing or malformed (an older host). Never the key. */
export function readConnection(value: unknown): HostConnection | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as { discovery?: Partial<HostDiscovery>; key?: Partial<HostKeyState>; stream?: Partial<HostStreamState>; archived?: Partial<HostArchiveState>; snapshot?: unknown; session?: unknown };
  const discoveryState = oneOf(raw.discovery?.state, ["found", "searching"]);
  const keyState = oneOf(raw.key?.state, ["none", "unchecked", "checking", "rejected", "ok"]);
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

/** The `snapshot` of a connection, or null when it is missing or malformed. */
/** The host's `connection.session`, strictly: `key` only; anything else (a host from before with a sign-in state) is dropped. */
export function readSessionState(value: unknown): HostSessionState | null {
  const raw = value as { state?: unknown } | null | undefined;
  const state = oneOf(raw?.state, ["key"]);
  return state === undefined ? null : { state };
}

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

/** Asks the host for its health. `null` when nothing answers within `timeoutMs` or the answer is not a host's. */
export async function probeHost(baseUrl = "", timeoutMs = 1500): Promise<HostHealth | null> {
  try {
    const response = await fetch(`${baseUrl}${PREFIX}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<HostHealth> | null;
    if (body === null || typeof body !== "object") return null;
    if (!["ok", "down", "unauthorized"].includes(body.loops as string) || typeof body.keyName !== "string") return null;
    const health: HostHealth = { loops: body.loops as HostHealth["loops"], keyName: body.keyName, sharedKey: body.sharedKey === true };
    if (typeof body.loopsCommit === "string") health.loopsCommit = body.loopsCommit;
    if (typeof body.loopsCommitBefore === "string") health.loopsCommitBefore = body.loopsCommitBefore;
    if (typeof body.cursor === "number") health.cursor = body.cursor;
    if (typeof body.loopsWebUrl === "string" && /^https?:\/\//.test(body.loopsWebUrl)) health.loopsWebUrl = body.loopsWebUrl;
    if (body.transport === "tcp" || body.transport === "unix") health.transport = body.transport;
    if (typeof body.paired === "boolean") health.paired = body.paired;
    if (body.pairing === "on" || body.pairing === "off") health.pairing = body.pairing;
    if (typeof body.checkout === "string" && /^[0-9a-f]{6,64}$/.test(body.checkout)) health.checkout = body.checkout;
    const connection = readConnection(body.connection);
    if (connection !== null) health.connection = connection;
    return health;
  } catch {
    return null;
  }
}

/**
 * Starts the one read of the host's snapshot ahead of the source (`HostSourceOptions.firstSnapshot`): the page calls it
 * the moment the source decision says live, so the host assembles the snapshot while the world's module loads.
 */
export function prefetchSnapshot(baseUrl = ""): Promise<Response> {
  return fetch(`${baseUrl}${PREFIX}/snapshot`, { headers: { accept: "application/json" } });
}

export function createHostSource(options: HostSourceOptions = {}): WorldSource {
  const base = options.baseUrl ?? "";
  const extraHeaders = options.headers ?? {};
  /** The snapshot read ahead, taken once by the first `start()`. */
  let ahead = options.firstSnapshot;
  const timings: HostSourceTimings = { ...DEFAULT_TIMINGS, ...stripUndefined(options.timings ?? {}) };
  const resnapshotOnGap = options.resnapshotOnGap ?? false;

  const listeners = new Set<(message: SourceMessage) => void>();
  const changeListeners = new Set<() => void>();
  let state: ConnectionState = "connecting";
  /** The host's word on its key from the last status that carried one; null until then. */
  let keyWord: HostKeyState["state"] | null = null;
  let running = false;
  let abort: AbortController | null = null;
  let cursor = -1;
  let haveSnapshot = false;
  /** The longest pause between two asks. Before the first snapshot the host is most likely still linking, and
   *  unpaired the person is opening a new link: ask again within seconds, never ten seconds later. */
  const retryCap = () => (haveSnapshot && state !== "unpaired" ? timings.retryMaxMs : Math.min(timings.retryMaxMs, timings.firstRetryMaxMs));
  let retryMs = timings.retryMinMs;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  let teamTimer: ReturnType<typeof setInterval> | null = null;
  let wake: (() => void) | null = null;

  const changed = () => {
    for (const listener of [...changeListeners]) {
      try {
        listener();
      } catch (error) {
        console.warn("[loops-client] a connection listener threw", error);
      }
    }
  };
  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    changed();
  };
  const setKeyWord = (next: HostKeyState["state"] | null) => {
    if (keyWord === next) return;
    keyWord = next;
    changed();
  };
  const send = (message: SourceMessage) => {
    for (const listener of [...listeners]) {
      try {
        listener(message);
      } catch (error) {
        console.warn("[loops-client] a source listener threw", error);
      }
    }
  };

  const url = (path: string) => `${base}${PREFIX}${path}`;
  const get = (path: string, signal?: AbortSignal) =>
    fetch(url(path), { signal: signal ?? null, headers: { ...extraHeaders, accept: "application/json" } });

  /** Any message from the host: the stream is alive. Silence past `staleMs` is not. */
  function touched(): void {
    if (staleTimer !== null) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      staleTimer = null;
      if (running && state === "live") setState("stale");
    }, timings.staleMs);
    if (state === "stale") setState("live");
  }

  function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        wake = null;
        resolve();
      }
      wake = done;
      signal.addEventListener("abort", done, { once: true });
    });
  }

  /** The host's 401 for a browser it has not paired (`{"error":"not_paired"}`), as opposed to any other 401. */
  const notPaired = async (response: Response): Promise<boolean> => {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error === "not_paired";
  };

  /** A snapshot that validated: the model's new ground truth; the stream continues at its cursor. */
  function accept(snapshot: LoopsSnapshot): void {
    cursor = snapshot.cursor;
    haveSnapshot = true;
    retryMs = timings.retryMinMs;
    send({ type: "snapshot", snapshot });
    setState("live");
    touched();
  }

  /**
   * One snapshot read (`pending`: the response of the read ahead, in place of a request of its own); false when it
   * failed (the state says why) and the loop should back off.
   */
  async function loadSnapshot(signal: AbortSignal, pending: Promise<Response> | null = null): Promise<boolean> {
    let response: Response;
    try {
      response = await (pending ?? get("/snapshot", signal));
    } catch {
      if (haveSnapshot) setState("stale");
      return false;
    }
    if (response.status === 503) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setState(body?.error === "unauthorized" ? "unauthorized" : "loops-down");
      return false;
    }
    if (response.status === 401 && (await notPaired(response))) {
      setState("unpaired");
      return false;
    }
    if (!response.ok) {
      warnOnce(`snapshot:${response.status}`, `GET ${PREFIX}/snapshot answered ${response.status}`);
      if (haveSnapshot) setState("stale");
      return false;
    }
    const result = validateLoopsSnapshot(await response.json().catch(() => null));
    if (!result.ok) {
      console.warn(`[loops-client] the snapshot does not validate at ${result.path}: ${result.message}`);
      if (haveSnapshot) setState("stale");
      return false;
    }
    accept({ ...result.value, groups: result.value.groups ?? [] });
    return true;
  }

  /** Reads the stream until it ends. Returns "resnapshot" when a reset or a gap asks for one, "ended" otherwise. */
  async function readStream(signal: AbortSignal): Promise<"resnapshot" | "ended"> {
    let response: Response;
    try {
      response = await fetch(url(`/stream?cursor=${cursor}`), { signal, headers: { ...extraHeaders, accept: "text/event-stream" } });
    } catch {
      return "ended";
    }
    if (!response.ok || response.body === null) {
      if (response.status === 503) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState(body?.error === "unauthorized" ? "unauthorized" : "loops-down");
      } else if (response.status === 401 && (await notPaired(response))) setState("unpaired");
      return "ended";
    }
    retryMs = timings.retryMinMs;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let data: string[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let newline = buffered.indexOf("\n");
        while (newline >= 0) {
          let line = buffered.slice(0, newline);
          buffered = buffered.slice(newline + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line === "") {
            if (data.length > 0) {
              const verdict = handleMessage(data.join("\n"));
              data = [];
              if (verdict === "resnapshot") return "resnapshot";
            }
          } else if (line.startsWith(":")) {
            touched(); // a comment line: the host is there
          } else {
            const colon = line.indexOf(":");
            const field = colon < 0 ? line : line.slice(0, colon);
            let value = colon < 0 ? "" : line.slice(colon + 1);
            if (value.startsWith(" ")) value = value.slice(1);
            if (field === "data") data.push(value);
            // `id:` carries the seq too; the JSON is the source of truth. `event:` and `retry:` are not used.
          }
          newline = buffered.indexOf("\n");
        }
      }
    } catch {
      // aborted or the connection dropped
    } finally {
      reader.cancel().catch(() => undefined);
    }
    return "ended";
  }

  /** One `data:` payload. Never throws. */
  function handleMessage(text: string): "resnapshot" | "ok" {
    let message: StreamMessage;
    try {
      message = JSON.parse(text) as StreamMessage;
    } catch {
      warnOnce("stream:json", "a stream message is not JSON; skipped");
      return "ok";
    }
    if (message === null || typeof message !== "object") return "ok";
    touched();
    switch (message.type) {
      case "status": {
        // The host's own word on its key, when the status carries one (a host from before says nothing: null stays).
        const key = oneOf(message.key, ["none", "unchecked", "checking", "rejected", "ok"]);
        if (key !== undefined) setKeyWord(key);
        // A 429 on the host's stream: loops answers reads, so the host says `loops: "down"` for a world from before and
        // `stream: "busy"` for us. Events are missed meanwhile, so `ok` again re-snapshots, as after loops-down.
        if (message.stream === "busy") {
          setState("stream-busy");
          return "ok";
        }
        if (message.loops === "ok") {
          if (state === "loops-down" || state === "unauthorized" || state === "stream-busy") {
            setState("catching-up");
            return "resnapshot";
          }
        } else setState(message.loops === "unauthorized" ? "unauthorized" : "loops-down");
        return "ok";
      }
      case "heartbeat": {
        if (typeof message.seq === "number" && typeof message.ts === "string") {
          if (message.seq > cursor) cursor = message.seq;
          send({ type: "heartbeat", seq: message.seq, ts: message.ts });
        }
        return "ok";
      }
      case "reset": {
        setState("catching-up");
        return "resnapshot";
      }
      case "chat": {
        const chat = readChatLine(message.chat);
        if (chat !== null) send({ type: "chat", chat });
        return "ok";
      }
      case "town": {
        if (typeof message.rev === "number" && Number.isInteger(message.rev) && message.rev >= 0) options.onTown?.(message.rev);
        return "ok";
      }
      case "event": {
        const result: Result<Envelope> = validateEnvelope(message.envelope);
        if (!result.ok) {
          warnOnce(`envelope:${result.path}`, `an envelope does not validate at ${result.path}: ${result.message}; skipped`);
          return "ok";
        }
        const envelope = result.value;
        if (envelope.seq <= cursor) return "ok"; // replayed
        if (resnapshotOnGap && cursor >= 0 && envelope.seq > cursor + 1) {
          console.warn(`[loops-client] seq gap: had ${cursor}, got ${envelope.seq}; re-snapshotting`);
          setState("catching-up");
          return "resnapshot";
        }
        cursor = envelope.seq;
        send({ type: "event", envelope });
        if (envelope.type === "team.updated") void readTeam();
        return "ok";
      }
      default:
        return "ok";
    }
  }

  async function readTeam(): Promise<void> {
    if (!running) return;
    try {
      const response = await get("/team", abort?.signal);
      if (!response.ok) return;
      const result = validateTeamSnapshot(await response.json());
      if (!result.ok) {
        warnOnce(`team:${result.path}`, `the team snapshot does not validate at ${result.path}: ${result.message}`);
        return;
      }
      if (running) send({ type: "team", team: result.value });
    } catch {
      // the host is away; the stream's state says so
    }
  }

  async function run(signal: AbortSignal, needSnapshot: boolean, pending: Promise<Response> | null): Promise<void> {
    while (!signal.aborted) {
      if (needSnapshot) {
        const read = loadSnapshot(signal, pending);
        pending = null;
        if (!(await read)) {
          await sleep(retryMs, signal);
          retryMs = Math.min(retryCap(), retryMs * 2);
          continue;
        }
        needSnapshot = false;
      }
      const verdict = await readStream(signal);
      if (signal.aborted) break;
      if (verdict === "resnapshot") {
        needSnapshot = true;
        continue;
      }
      // The stream ended or could not open: wait, then reconnect at the cursor (the host resets when it cannot continue).
      // After a 401 the next try must re-snapshot: the host that refused the cookie may be a new one with no buffer.
      // And it asks again soon: the back-off that grew while the host was away (a restart) must not keep the Pair
      // screen, or the town after the new link, waiting for it.
      if (state === "unpaired") {
        needSnapshot = true;
        retryMs = timings.retryMinMs;
      }
      if (state === "live" || state === "catching-up") setState("stale");
      await sleep(retryMs, signal);
      retryMs = Math.min(retryCap(), retryMs * 2);
    }
  }

  function stop(): void {
    running = false;
    abort?.abort();
    abort = null;
    if (staleTimer !== null) clearTimeout(staleTimer);
    staleTimer = null;
    if (teamTimer !== null) clearInterval(teamTimer);
    teamTimer = null;
    wake?.();
  }

  const connection: ConnectionStatus = {
    state: () => state,
    key: () => keyWord,
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };

  /** A read of one object through the host, validated; `null` on 404, a rejection otherwise. */
  async function read<T>(path: string, validate: (input: unknown) => Result<T>): Promise<T | null> {
    const response = await get(path);
    if (response.status === 404) return null;
    if (response.status === 409) return null; // feature_off: the lists answer []
    if (!response.ok) throw new Error(`GET ${PREFIX}${path} answered ${response.status}`);
    const result = validate(await response.json());
    if (!result.ok) throw new Error(`GET ${PREFIX}${path}: ${result.path}: ${result.message}`);
    return result.value;
  }
  const unwrap =
    <K extends string, T>(key: K, validate: (input: unknown) => Result<T>) =>
    (input: unknown): Result<T> => {
      const inner = typeof input === "object" && input !== null ? (input as Record<string, unknown>)[key] : undefined;
      return inner === undefined ? { ok: false, path: `$.${key}`, message: "missing required key" } : validate(inner);
    };

  return {
    mode: "live",
    playback: null,
    connection,
    now: () => Date.now(),
    start(listener) {
      listeners.add(listener);
      if (!running) {
        running = true;
        abort = new AbortController();
        cursor = -1;
        haveSnapshot = false;
        retryMs = timings.retryMinMs;
        setState("connecting");
        // The snapshot read ahead: a body that arrived is the first model, now; a pending response is the first read.
        const first = ahead;
        ahead = undefined;
        let needSnapshot = true;
        if (first && "body" in first) {
          const result = validateLoopsSnapshot(first.body);
          if (result.ok) {
            accept({ ...result.value, groups: result.value.groups ?? [] });
            needSnapshot = false;
          } else console.warn(`[loops-client] the snapshot read ahead does not validate at ${result.path}: ${result.message}`);
        }
        void run(abort.signal, needSnapshot, first && "response" in first ? first.response : null);
        teamTimer = setInterval(() => void readTeam(), timings.teamPollMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getTicket: (ref): Promise<Ticket | null> => read(`/tickets/${encodeURIComponent(ref)}`, unwrap("ticket", validateTicket)),
    getProject: (slug): Promise<ProjectOut | null> =>
      read(`/projects/${encodeURIComponent(slug)}`, unwrap("project", validateProjectOut)),
    getBoard: (slug): Promise<BoardResponse | null> => read(`/board/${encodeURIComponent(slug)}`, validateBoardResponse),
    getWatchdog: async (): Promise<WatchdogResponse> => {
      const watchdog = await read("/watchdog", validateWatchdogResponse);
      if (watchdog === null) throw new Error(`GET ${PREFIX}/watchdog answered 404`);
      return watchdog;
    },
    getMilestones: async (slug): Promise<MilestoneSummary[]> =>
      (await read(`/projects/${encodeURIComponent(slug)}/milestones`, validateMilestonesResponse))?.milestones ?? [],
    getReleases: async (slug): Promise<ReleaseSummary[]> =>
      (await read(`/projects/${encodeURIComponent(slug)}/releases`, validateReleasesResponse))?.releases ?? [],
    listProjectGroups: async (): Promise<ProjectGroup[]> =>
      (await read("/project-groups", validateProjectGroupsResponse))?.groups ?? [],
    getComments: async (ref): Promise<CommentOut[]> =>
      (await read(`/tickets/${encodeURIComponent(ref)}/comments`, validateCommentsResponse))?.comments ?? [],
    getProgress: async (ref): Promise<ProgressItem[]> =>
      (await read(`/tickets/${encodeURIComponent(ref)}/progress`, validateProgressResponse))?.progress ?? [],
  };
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

/** What the host answered a connect request with: the status and the JSON body (null when there is none). Never the key. */
export interface HostAnswer {
  /** 0 when nothing answered (no host, a refused connection, a timeout). */
  status: number;
  body: unknown;
}

/**
 * `POST /world-api/connect {key}` (spec addendum "a smooth connection", part 2): hands a pasted access key to the host,
 * which checks it with loops, stores it and switches to it. Same origin, JSON, the pairing cookie travels with it. The
 * key is in the request body and nowhere else: not in the URL, not in the answer, not in a log. Never throws.
 */
export async function connectHost(key: string, baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("POST", `${baseUrl}${PREFIX}/connect`, JSON.stringify({ key }), timeoutMs);
}

/** `DELETE /world-api/connect`: the host forgets its stored key (the world then asks for one again). Never throws. */
export async function forgetHostKey(baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("DELETE", `${baseUrl}${PREFIX}/connect`, null, timeoutMs);
}

/**
 * `GET /world-api/town` (round 20, the world database): the installation's town as the host has it,
 * `{installation, rev, updatedAt, document}`; 404 `no_town` when the host has none; 503 while the host has no loops or
 * no database. Never throws.
 */
export async function readHostTown(baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("GET", `${baseUrl}${PREFIX}/town`, null, timeoutMs);
}

/**
 * `PUT /world-api/town {document, baseRev}`: a revision over the one the browser read (`baseRev` 0 creates). 200
 * `{rev}`; 409 `town_conflict {rev, document}` when another browser wrote first (the host's town comes back with it,
 * never overwritten). Same origin; the browser sends the Origin header on a PUT by itself. Never throws.
 */
export async function writeHostTown(document: unknown, baseRev: number, baseUrl = "", timeoutMs = 15_000, op: HostTownOp = "commit"): Promise<HostAnswer> {
  return hostRequest("PUT", `${baseUrl}${PREFIX}/town`, JSON.stringify(document === null ? { op, baseRev } : { op, document, baseRev }), timeoutMs);
}

/** One move of the host's town history (round 21): a person's edit, the world's own record, a step back or forward. */
export type HostTownOp = "commit" | "amend" | "undo" | "redo";

/** `GET /world-api/town/backups`: the host's backup copies (`world.db.bak-v<n>`) for a restore. Never throws. */
export async function readHostTownBackups(baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("GET", `${baseUrl}${PREFIX}/town/backups`, null, timeoutMs);
}

/** `GET /world-api/town/backups/{name}`: this installation's town inside one backup copy. Never throws. */
export async function readHostTownBackup(name: string, baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("GET", `${baseUrl}${PREFIX}/town/backups/${encodeURIComponent(name)}`, null, timeoutMs);
}

async function hostRequest(method: "GET" | "POST" | "PUT" | "DELETE", url: string, body: string | null, timeoutMs: number): Promise<HostAnswer> {
  try {
    const response = await fetch(url, {
      method,
      body,
      credentials: "same-origin",
      signal: AbortSignal.timeout(timeoutMs),
      headers: body === null ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
    });
    const text = await response.text().catch(() => "");
    let parsed: unknown = null;
    if (text !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    return { status: response.status, body: parsed };
  } catch {
    return { status: 0, body: null };
  }
}
