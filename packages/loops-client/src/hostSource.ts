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
import type { ConnectionState, ConnectionStatus, HostSourceOptions, LoopsSnapshot, SourceMessage, WorldSource } from "./source.ts";
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

/** `GET /world-api/health`. Never the key. */
export interface HostHealth {
  loops: "ok" | "down" | "unauthorized";
  keyName: string;
  /** True when the host fell back to the shared builder key. */
  sharedKey: boolean;
  loopsCommit?: string;
  cursor?: number;
  /** The origin of crewhub-loops' web app (the API's URL; on the Mac both share 8091), for the sign-in link. */
  loopsWebUrl?: string;
  /** Whether this browser carries a valid pairing cookie (plan 3.5). Absent on a host from before pairing. */
  paired?: boolean;
  /** `off` only in development; then every request counts as paired. */
  pairing?: "on" | "off";
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
}

const DEFAULT_TIMINGS: HostSourceTimings = { staleMs: 40_000, teamPollMs: 30_000, retryMinMs: 500, retryMaxMs: 10_000 };
const PREFIX = "/world-api";

/** What the host puts on the stream (ready-team-map: "Host → browser"). */
type StreamMessage =
  | { type: "status"; loops: HostHealth["loops"] }
  | { type: "event"; envelope: unknown }
  | { type: "heartbeat"; seq: number; ts: string }
  | { type: "reset"; reason: string };

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
    if (typeof body.cursor === "number") health.cursor = body.cursor;
    if (typeof body.loopsWebUrl === "string" && /^https?:\/\//.test(body.loopsWebUrl)) health.loopsWebUrl = body.loopsWebUrl;
    if (typeof body.paired === "boolean") health.paired = body.paired;
    if (body.pairing === "on" || body.pairing === "off") health.pairing = body.pairing;
    return health;
  } catch {
    return null;
  }
}

export function createHostSource(options: HostSourceOptions = {}): WorldSource {
  const base = options.baseUrl ?? "";
  const extraHeaders = options.headers ?? {};
  const timings: HostSourceTimings = { ...DEFAULT_TIMINGS, ...stripUndefined(options.timings ?? {}) };
  const resnapshotOnGap = options.resnapshotOnGap ?? false;

  const listeners = new Set<(message: SourceMessage) => void>();
  const changeListeners = new Set<() => void>();
  let state: ConnectionState = "connecting";
  let running = false;
  let abort: AbortController | null = null;
  let cursor = -1;
  let haveSnapshot = false;
  let retryMs = timings.retryMinMs;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  let teamTimer: ReturnType<typeof setInterval> | null = null;
  let wake: (() => void) | null = null;

  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    for (const listener of [...changeListeners]) {
      try {
        listener();
      } catch (error) {
        console.warn("[loops-client] a connection listener threw", error);
      }
    }
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

  /** One snapshot read; false when it failed (the state says why) and the loop should back off. */
  async function loadSnapshot(signal: AbortSignal): Promise<boolean> {
    let response: Response;
    try {
      response = await get("/snapshot", signal);
    } catch {
      if (haveSnapshot) setState("stale");
      return false;
    }
    if (response.status === 503) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setState(body?.error === "unauthorized" ? "unauthorized" : "loops-down");
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
    const snapshot: LoopsSnapshot = { ...result.value, groups: result.value.groups ?? [] };
    cursor = snapshot.cursor;
    haveSnapshot = true;
    retryMs = timings.retryMinMs;
    send({ type: "snapshot", snapshot });
    setState("live");
    touched();
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
      }
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
        if (message.loops === "ok") {
          if (state === "loops-down" || state === "unauthorized") {
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

  async function run(signal: AbortSignal): Promise<void> {
    let needSnapshot = true;
    while (!signal.aborted) {
      if (needSnapshot) {
        if (!(await loadSnapshot(signal))) {
          await sleep(retryMs, signal);
          retryMs = Math.min(timings.retryMaxMs, retryMs * 2);
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
      if (state === "live" || state === "catching-up") setState("stale");
      await sleep(retryMs, signal);
      retryMs = Math.min(timings.retryMaxMs, retryMs * 2);
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
        void run(abort.signal);
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
