/**
 * HostSource: the live crewhub-loops behind the WorldSource seam, read through the world's own host
 * (`apps/host`, `/world-api`). Snapshot first, then events by `seq` over SSE; a `reset` (or, when asked, a gap in
 * `seq`) means `catching-up` and a fresh snapshot; heartbeats keep it `live`; silence makes it `stale`, and only a
 * heartbeat or an event ends that, never the open of a new stream; the host's `status` messages say when loops is down or
 * the key is refused. `now()` is the wall clock; there is no playback.
 *
 * This is the one file in the browser that may fetch (scripts/scan-model-calls.ts, NETWORK_ALLOWLIST): it reads
 * its own host and nothing else. Streams with `fetch` and a line reader over `response.body`: no EventSource, so
 * the cursor and the reconnect are ours. Nothing here ever throws out of the listener.
 */
import type {
  BoardResponse,
  CommentOut,
  MilestoneSummary,
  ProgressItem,
  ProjectGroup,
  ProjectOut,
  ReleaseSummary,
  Ticket,
  WatchdogResponse,
} from "./types.ts";
import type { ConnectionState, ConnectionStatus, HostSourceOptions, LoopsSnapshot, SourceMessage, WorldSource } from "./source.ts";
import { type HostHealth, type HostKeyState, readHostHealth, readHostMessage, worldApiPath } from "./hostWire.ts";
import {
  type Result,
  validateBoardResponse,
  validateCommentsResponse,
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

/** Asks the host for its health. `null` when nothing answers within `timeoutMs` or the answer is not a host's. */
export async function probeHost(baseUrl = "", timeoutMs = 1500): Promise<HostHealth | null> {
  try {
    const response = await fetch(`${baseUrl}${worldApiPath("/health")}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return readHostHealth(await response.json());
  } catch {
    return null;
  }
}

/**
 * Starts the one read of the host's snapshot ahead of the source (`HostSourceOptions.firstSnapshot`): the page calls it
 * the moment the source decision says live, so the host assembles the snapshot while the world's module loads.
 */
export function prefetchSnapshot(baseUrl = ""): Promise<Response> {
  return fetch(`${baseUrl}${worldApiPath("/snapshot")}`, { headers: { accept: "application/json" } });
}

/**
 * The source's test seam (round 59d, C7): what a test turns to run in milliseconds or to pin a fact, never the page.
 * `createHostSource` takes it as its second argument; the page passes `HostSourceOptions` alone.
 */
export interface HostSourceTuning {
  /** The clocks (tests make them short); see `HostSourceTimings`. */
  timings?: Partial<HostSourceTimings>;
  /**
   * Re-snapshot when an event's `seq` skips past `cursor + 1`. Default false: loops filters the stream per
   * principal (events.py), so gaps between the seqs a key may see are normal; continuity is the host's job (it
   * resumes with `after=` and sends `reset` when it cannot prove it). Tests turn it on.
   */
  resnapshotOnGap?: boolean;
}

export function createHostSource(options: HostSourceOptions = {}, tuning: HostSourceTuning = {}): WorldSource {
  const base = options.baseUrl ?? "";
  const extraHeaders = options.headers ?? {};
  /** The snapshot read ahead, taken once by the first `start()`. */
  let ahead = options.firstSnapshot;
  const timings: HostSourceTimings = { ...DEFAULT_TIMINGS, ...stripUndefined(tuning.timings ?? {}) };
  const resnapshotOnGap = tuning.resnapshotOnGap ?? false;

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
  /** The open stream read's own abort (review F3, round 27): a heal ends the read alone; `abort` is the run's. */
  let streamAbort: AbortController | null = null;
  /**
   * Team reads by the order they were asked (round 48, r48-live): `teamAsked` counts the asks, `teamShown` is the newest
   * ask whose word the model has (a snapshot carries the team of its moment, so it counts as every ask before it). An
   * answer of an older ask than that is dropped: the 30 s poll and a `team.updated` can answer out of order.
   */
  let teamAsked = 0;
  let teamShown = 0;

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

  /** `path` is a wire path (`worldApiPath`): `/world-api/…`. */
  const url = (path: string) => `${base}${path}`;
  const get = (path: string, signal?: AbortSignal) =>
    fetch(url(path), { signal: signal ?? null, headers: { ...extraHeaders, accept: "application/json" } });
  const SNAPSHOT = worldApiPath("/snapshot");

  /**
   * Any message from the host: the silence clock starts over. Silence past `staleMs` makes the stream stale and heals it,
   * again each time while it stays stale: a reopened stream that says nothing more is no better than the one before.
   */
  function touched(): void {
    // A stopped source arms nothing (a listener may stop it on the very snapshot that would arm the timer).
    if (!running) return;
    if (staleTimer !== null) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      staleTimer = null;
      if (running && (state === "live" || state === "stale")) {
        setState("stale");
        heal();
      }
    }, timings.staleMs);
  }

  /**
   * A heartbeat or a new event: what ends a stale (w3-6, round 64). The host answers the open of a stream at once from its
   * own memory (a comment, its status, the threads), whatever loops is doing, so an open alone is no reason to say Live.
   */
  function heard(): void {
    if (state === "stale") setState("live");
  }

  /**
   * A stale stream is a dead leg or a silent loops, never a quiet host (a heartbeat comes every 15 s, well inside
   * `staleMs`): a socket left open but dead after a laptop's sleep, a proxy that stopped forwarding, a loops that hangs. The
   * read is ended, and the run reopens the stream at its cursor with the normal back-off (the host replays its buffer or
   * sends `reset`); a run already in its back-off asks now. Called at stale, and when the page comes back into view while
   * stale (a wake is the moment).
   */
  function heal(): void {
    if (!running) return;
    streamAbort?.abort();
    wake?.();
  }

  /** The page's visibility (a browser; nothing in Node): the hook for a heal on a wake. */
  const page = (): { visibilityState?: string; addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void } | undefined =>
    (globalThis as { document?: { visibilityState?: string; addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void } }).document;
  const onVisibility = () => {
    if (page()?.visibilityState === "visible" && state === "stale") heal();
  };

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
    teamShown = teamAsked;
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
      response = await (pending ?? get(SNAPSHOT, signal));
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
      warnOnce(`snapshot:${response.status}`, `GET ${SNAPSHOT} answered ${response.status}`);
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

  /**
   * Reads the stream until it ends. Returns "resnapshot" when a reset or a gap asks for one, "ended" otherwise. The
   * read has an abort of its own, so a heal ends this read and nothing else; the run's abort ends it too.
   */
  async function readStream(signal: AbortSignal): Promise<"resnapshot" | "ended"> {
    const own = new AbortController();
    const forward = () => own.abort();
    signal.addEventListener("abort", forward, { once: true });
    streamAbort = own;
    try {
      return await readStreamWith(own.signal);
    } finally {
      streamAbort = null;
      signal.removeEventListener("abort", forward);
    }
  }

  async function readStreamWith(signal: AbortSignal): Promise<"resnapshot" | "ended"> {
    let response: Response;
    try {
      response = await fetch(url(worldApiPath("/stream", {}, { cursor: String(cursor) })), { signal, headers: { ...extraHeaders, accept: "text/event-stream" } });
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      warnOnce("stream:json", "a stream message is not JSON; skipped");
      return "ok";
    }
    if (parsed === null || typeof parsed !== "object") return "ok";
    touched();
    const result = readHostMessage(parsed);
    if (!result.ok) {
      warnOnce(`stream:${result.path}`, `a stream message does not validate at ${result.path}: ${result.message}; skipped`);
      return "ok";
    }
    const message = result.value;
    switch (message.type) {
      case "status": {
        // The host's own word on its key, when the status carries one (a host from before says nothing: null stays).
        if (message.key !== undefined) setKeyWord(message.key);
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
        heard();
        if (message.seq > cursor) cursor = message.seq;
        send({ type: "heartbeat", seq: message.seq, ts: message.ts });
        return "ok";
      }
      case "reset": {
        setState("catching-up");
        return "resnapshot";
      }
      case "chat":
        send({ type: "chat", chat: message.chat });
        return "ok";
      case "threads":
        send({ type: "threads", threads: message.threads });
        return "ok";
      case "town":
        options.onTown?.(message.rev);
        return "ok";
      case "event": {
        const envelope = message.envelope;
        if (envelope.seq <= cursor) return "ok"; // replayed
        if (resnapshotOnGap && cursor >= 0 && envelope.seq > cursor + 1) {
          console.warn(`[loops-client] seq gap: had ${cursor}, got ${envelope.seq}; re-snapshotting`);
          setState("catching-up");
          return "resnapshot";
        }
        heard();
        cursor = envelope.seq;
        send({ type: "event", envelope });
        if (envelope.type === "team.updated") void readTeam();
        return "ok";
      }
    }
  }

  async function readTeam(): Promise<void> {
    if (!running) return;
    const ask = ++teamAsked;
    try {
      const response = await get(worldApiPath("/team"), abort?.signal);
      if (!response.ok) return;
      const result = validateTeamSnapshot(await response.json());
      if (!result.ok) {
        warnOnce(`team:${result.path}`, `the team snapshot does not validate at ${result.path}: ${result.message}`);
        return;
      }
      if (!running || ask <= teamShown) return;
      teamShown = ask;
      send({ type: "team", team: result.value });
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
    page()?.removeEventListener("visibilitychange", onVisibility);
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

  /** A read of one object through the host (`path` a wire path), validated; `null` on 404, a rejection otherwise. */
  async function read<T>(path: string, validate: (input: unknown) => Result<T>): Promise<T | null> {
    const response = await get(path);
    if (response.status === 404) return null;
    if (response.status === 409) return null; // feature_off: the lists answer []
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
    const result = validate(await response.json());
    if (!result.ok) throw new Error(`GET ${path}: ${result.path}: ${result.message}`);
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
        page()?.addEventListener("visibilitychange", onVisibility);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getTicket: (ref): Promise<Ticket | null> => read(worldApiPath("/tickets/{ref}", { ref }), unwrap("ticket", validateTicket)),
    getProject: (slug): Promise<ProjectOut | null> => read(worldApiPath("/projects/{slug}", { slug }), unwrap("project", validateProjectOut)),
    getBoard: (slug): Promise<BoardResponse | null> => read(worldApiPath("/board/{slug}", { slug }), validateBoardResponse),
    getWatchdog: async (): Promise<WatchdogResponse> => {
      const watchdog = await read(worldApiPath("/watchdog"), validateWatchdogResponse);
      if (watchdog === null) throw new Error(`GET ${worldApiPath("/watchdog")} answered 404`);
      return watchdog;
    },
    getMilestones: async (slug): Promise<MilestoneSummary[]> =>
      (await read(worldApiPath("/projects/{slug}/milestones", { slug }), validateMilestonesResponse))?.milestones ?? [],
    getReleases: async (slug): Promise<ReleaseSummary[]> =>
      (await read(worldApiPath("/projects/{slug}/releases", { slug }), validateReleasesResponse))?.releases ?? [],
    listProjectGroups: async (): Promise<ProjectGroup[]> => (await read(worldApiPath("/project-groups"), validateProjectGroupsResponse))?.groups ?? [],
    getComments: async (ref): Promise<CommentOut[]> =>
      (await read(worldApiPath("/tickets/{ref}/comments", { ref }), validateCommentsResponse))?.comments ?? [],
    getProgress: async (ref): Promise<ProgressItem[]> =>
      (await read(worldApiPath("/tickets/{ref}/progress", { ref }), validateProgressResponse))?.progress ?? [],
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
  return hostRequest("POST", `${baseUrl}${worldApiPath("/connect")}`, JSON.stringify({ key }), timeoutMs);
}

/** `DELETE /world-api/connect`: the host forgets its stored key (the world then asks for one again). Never throws. */
export async function forgetHostKey(baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("DELETE", `${baseUrl}${worldApiPath("/connect")}`, null, timeoutMs);
}

/**
 * `GET /world-api/town` (round 20, the world database): the installation's town as the host has it,
 * `{installation, rev, updatedAt, document}`; 404 `no_town` when the host has none; 503 while the host has no loops or
 * no database. Never throws.
 */
export async function readHostTown(baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("GET", `${baseUrl}${worldApiPath("/town")}`, null, timeoutMs);
}

/**
 * `PUT /world-api/town {document, baseRev}`: a revision over the one the browser read (`baseRev` 0 creates). 200
 * `{rev}`; 409 `town_conflict {rev, document}` when another browser wrote first (the host's town comes back with it,
 * never overwritten). Same origin; the browser sends the Origin header on a PUT by itself. Never throws.
 */
export async function writeHostTown(document: unknown, baseRev: number, baseUrl = "", timeoutMs = 15_000, op: HostTownOp = "commit"): Promise<HostAnswer> {
  return hostRequest("PUT", `${baseUrl}${worldApiPath("/town")}`, JSON.stringify(document === null ? { op, baseRev } : { op, document, baseRev }), timeoutMs);
}

/** One move of the host's town history (round 21): a person's edit, the world's own record, a step back or forward. */
export type HostTownOp = "commit" | "amend" | "undo" | "redo";

/** `GET /world-api/town/backups`: the host's backup copies (`world.db.bak-v<n>`) for a restore. Never throws. */
export async function readHostTownBackups(baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("GET", `${baseUrl}${worldApiPath("/town/backups")}`, null, timeoutMs);
}

/** `GET /world-api/town/backups/{name}`: this installation's town inside one backup copy. Never throws. */
export async function readHostTownBackup(name: string, baseUrl = "", timeoutMs = 10_000): Promise<HostAnswer> {
  return hostRequest("GET", `${baseUrl}${worldApiPath("/town/backups/{name}", { name })}`, null, timeoutMs);
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
