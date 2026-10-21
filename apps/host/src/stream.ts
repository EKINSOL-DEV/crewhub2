/**
 * The one upstream stream: the host follows `GET /api/events/stream` once for every browser tab, keeps a ring buffer
 * of the last envelopes for catch-up, and tells the tabs when continuity broke (`reset`). It follows loops' own
 * client rules (events.md "How to resume", CL-378, CL-406): `GET /api/events?from=tail` first; the sealed `cursor` a
 * heartbeat carried is sent back only while no event followed it, else `after=<last seq>`; after loops' 300 s end a
 * short jittered pause, on errors a backoff, on 429 `Retry-After`, on 410 a reset. Exactly one stream is open at any
 * time. While loops is down the host beats itself every `heartbeatMs`.
 */
import type { Envelope } from "@crewhub/loops-client";
import { type LoopsClient, type StreamResume, isUnauthorized } from "./loops.ts";
import { SnapshotError, readTail } from "./snapshot.ts";

export type LoopsState = "ok" | "down" | "unauthorized";

/** Why the stream is `busy`: loops admits four streams per key. */
export const BUSY_REASON = "stream budget exhausted (429): another host or tab uses this key";

export type HostMessage =
  /** `stream: "busy"` with the reason when loops refused the stream with 429 (`loops` stays `down` for the world from before). */
  | { type: "status"; loops: LoopsState; stream?: "busy"; reason?: string }
  | { type: "event"; envelope: Envelope }
  | { type: "heartbeat"; seq: number; ts: string }
  | { type: "reset"; reason: "gone" | "reconnected" | "cursor" };

export interface UpstreamOptions {
  bufferSize?: number;
  /** Backoff after an error (loops away, a 5xx, a stream that closed without a line): doubling from min to max. */
  retryMs?: { min: number; max: number };
  heartbeatMs?: number;
  /** No line for this long and the connection is dropped and reopened (loops beats every 15 s). */
  idleMs?: number;
  /** The pause after a normal end (loops closes every stream after 300 s): min to max with jitter (CL-378). Default 1.5 to 3 s. */
  reconnectMs?: { min: number; max: number };
  /** Server-side logging; never the key. */
  log?: (line: string) => void;
  /** The jitter's randomness, in [0, 1). Tests fix it. */
  random?: () => number;
  /**
   * Does loops answer its health (keyless `GET /api/health`) right now? Asked before a 401 or 403 counts as
   * `unauthorized`: from a loops that does not answer its health (restarting) it is `down` instead, and the key stays
   * what it was. Default: a 401/403 counts.
   */
  healthy?: () => Promise<boolean>;
}

export interface Upstream {
  state(): LoopsState;
  /** The last seq the host applied; -1 before the first connection. */
  cursor(): number;
  /** The loops version from `GET /api/health`, when known. */
  loopsVersion(): string | undefined;
  /** Slugs the host saw archived through `project.archived` events since it started. */
  archivedSlugs(): ReadonlySet<string>;
  /** Connection attempts after the first one (loops' 300 s end counts, so does every retry while down). */
  reconnects(): number;
  /** The reason while loops refuses the stream with 429 `too_many_streams`; null otherwise. */
  busy(): string | null;
  /** When the last event arrived (loops' `ts`), ISO 8601; undefined before the first. */
  lastEventAt(): string | undefined;
  /**
   * Subscribes a browser tab. `cursor` is the tab's last seq: envelopes after it still in the buffer are replayed,
   * or a `reset` is sent when the buffer no longer reaches back that far. Returns unsubscribe.
   */
  subscribe(cursor: number | null, listener: (message: HostMessage) => void): () => void;
  /** Starts following loops (idempotent). Resolves once the first connection attempt finished, either way. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

const DEFAULT_BUFFER = 2000;
/** CL-378: never reconnect at once after a normal end. */
const DEFAULT_RECONNECT_MS = { min: 1500, max: 3000 };
/** Loops' `Retry-After` on 429 is 5 s; a missing or unreadable header counts as that. */
const DEFAULT_RETRY_AFTER_MS = 5000;
const RETRY_AFTER_MAX_MS = 60_000;
/** A sealed cursor is opaque URL-safe text (`api/cursor.py`); anything else is never stored or sent back. */
const SEALED = /^[A-Za-z0-9_-]{16,512}$/;

/** How one connection attempt ended. */
type Outcome =
  /** The stream was open and loops ended it (300 s, a credential re-check, a stop) or the idle guard dropped it. */
  | { kind: "ended" }
  /** 410 `cursor_expired`: the tabs were reset, the host continues from the tail. */
  | { kind: "gone" }
  /** 429 `too_many_streams`: wait `waitMs` and try again. */
  | { kind: "busy"; waitMs: number }
  /** A network error, a 5xx, 401/403, or a stream that closed without a single line: back off. */
  | { kind: "error" };

export function createUpstream(client: LoopsClient, options: UpstreamOptions = {}): Upstream {
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER;
  const retry = options.retryMs ?? { min: 1000, max: 30_000 };
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const idleMs = options.idleMs ?? 45_000;
  const reconnect = options.reconnectMs ?? DEFAULT_RECONNECT_MS;
  const log = options.log ?? (() => {});
  const random = options.random ?? Math.random;
  const healthy = options.healthy ?? (async () => true);

  let state: LoopsState = "down";
  let cursor = -1;
  /** The newest sealed cursor loops gave (opaque, never parsed), and the host's position when it arrived. */
  let sealed: string | null = null;
  let sealedAt = -1;
  /** Every envelope with seq > bufferFrom that the host received is in `buffer`, oldest first. */
  let bufferFrom = -1;
  const buffer: Envelope[] = [];
  let version: string | undefined;
  let attempts = 0;
  let lastEventAt: string | undefined;
  let busyReason: string | null = null;
  const archived = new Set<string>();
  const listeners = new Set<(message: HostMessage) => void>();
  /** Clients that subscribed with a cursor before the host knew its own: judged at the first connection. */
  const pending = new Map<(message: HostMessage) => void, number>();
  let stopped = false;
  let started: Promise<void> | null = null;
  let abort: AbortController | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let wake: (() => void) | null = null;

  const broadcast = (message: HostMessage) => {
    for (const listener of [...listeners]) listener(message);
  };
  /** A 401/403 is `unauthorized` only from a loops whose health answers; else it is `down` (restarting, a proxy). */
  const refusedState = async (): Promise<LoopsState> => {
    if (await healthy()) return "unauthorized";
    log("loops refused the key (401 or 403) but its health does not answer: down, not a verdict on the key");
    return "down";
  };
  const setState = (next: LoopsState) => {
    const wasBusy = busyReason !== null;
    busyReason = null;
    if (state === next && !wasBusy) return;
    state = next;
    log(`loops ${next}`);
    broadcast({ type: "status", loops: next });
  };
  /** 429: the world from before sees `down`; the connection states say `busy` and why. */
  const setBusy = () => {
    const changed = busyReason === null || state !== "down";
    busyReason = BUSY_REASON;
    state = "down";
    if (changed) broadcast({ type: "status", loops: "down", stream: "busy", reason: BUSY_REASON });
  };
  const clearBuffer = (from: number) => {
    buffer.length = 0;
    bufferFrom = from;
    cursor = from;
  };
  const reset = (reason: "gone" | "reconnected", from: number) => {
    clearBuffer(from);
    broadcast({ type: "reset", reason });
  };
  /** The token loops gave for exactly `at` (a tail read, or a heartbeat with nothing after it). */
  const seal = (token: string | null, at: number) => {
    sealed = token !== null && SEALED.test(token) ? token : null;
    sealedAt = at;
  };

  function apply(line: Record<string, unknown>): void {
    if (line.type === "heartbeat") {
      const seq = typeof line.seq === "number" ? line.seq : cursor;
      if (seq > cursor) cursor = seq;
      // CL-406: the heartbeat's cursor is "everything up to now is judged" for this position; an event voids it.
      if (typeof line.cursor === "string") seal(line.cursor, cursor);
      broadcast({ type: "heartbeat", seq: cursor, ts: typeof line.ts === "string" ? line.ts : new Date().toISOString() });
      return;
    }
    if (typeof line.seq !== "number" || typeof line.type !== "string") return;
    const envelope = line as unknown as Envelope;
    if (envelope.seq <= cursor) return;
    cursor = envelope.seq;
    lastEventAt = typeof envelope.ts === "string" ? envelope.ts : new Date().toISOString();
    sealed = null;
    buffer.push(envelope);
    while (buffer.length > bufferSize) {
      const dropped = buffer.shift() as Envelope;
      bufferFrom = dropped.seq;
    }
    if (envelope.type === "project.archived" && envelope.project !== null) archived.add(envelope.project.slug);
    if (envelope.type === "project.restored" && envelope.project !== null) archived.delete(envelope.project.slug);
    // Every type passes, the ones events.md at 053b5f47 did not list too: the browser's validators judge the payload.
    broadcast({ type: "event", envelope });
  }

  /** Reads NDJSON lines until the body ends or the signal fires. Returns how many lines arrived. */
  async function follow(response: Response, signal: AbortSignal): Promise<number> {
    if (response.body === null) return 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let lines = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const armIdle = () => {
      if (idle !== null) clearTimeout(idle);
      idle = setTimeout(() => abort?.abort(), idleMs);
    };
    armIdle();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || signal.aborted) break;
        armIdle();
        pending += decoder.decode(value, { stream: true });
        let at = pending.indexOf("\n");
        while (at !== -1) {
          const text = pending.slice(0, at).trim();
          pending = pending.slice(at + 1);
          if (text !== "") {
            lines += 1;
            try {
              apply(JSON.parse(text) as Record<string, unknown>);
            } catch {
              log("loops stream: unreadable line skipped");
            }
          }
          at = pending.indexOf("\n");
        }
      }
    } finally {
      if (idle !== null) clearTimeout(idle);
      reader.releaseLock();
    }
    return lines;
  }

  async function readVersion(): Promise<void> {
    try {
      const { status, body } = await client.getJson<{ version?: unknown }>("/api/health");
      if (status === 200 && typeof body?.version === "string") version = body.version;
    } catch {
      // health is information only
    }
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });
  const jitter = ({ min, max }: { min: number; max: number }) => min + (max - min) * random();

  /** Loops' `Retry-After` in ms (seconds in the header), or the default when it is missing or unreadable. */
  function retryAfterMs(response: Response): number {
    const header = response.headers.get("retry-after");
    const seconds = header === null ? Number.NaN : Number(header.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_AFTER_MS;
    return Math.min(RETRY_AFTER_MAX_MS, Math.max(1000, seconds * 1000));
  }

  /** Closes a response's body so the socket is gone before the next stream opens (one upstream stream, always). */
  async function discard(response: Response): Promise<void> {
    try {
      await response.body?.cancel();
    } catch {
      // already closed
    }
  }

  /** One connection attempt. `ready` is called once the attempt's outcome is known for the first time. */
  async function attempt(ready: () => void): Promise<Outcome> {
    // Before every connection the tail says where the log stands for this key: the first position, a restore
    // (`lastSeq` below our cursor), and the sealed cursor of "now" when we have none of our own.
    const wasDown = state !== "ok";
    let tail: { lastSeq: number; cursor: string | null };
    try {
      tail = await readTail(client);
    } catch (error) {
      setState(error instanceof SnapshotError && error.reason === "unauthorized" ? await refusedState() : "down");
      ready();
      return { kind: "error" };
    }
    if (cursor === -1) {
      clearBuffer(tail.lastSeq);
      seal(tail.cursor, cursor);
      for (const [listener, from] of pending) if (listeners.has(listener) && from !== tail.lastSeq) listener({ type: "reset", reason: "cursor" });
      pending.clear();
    } else if (tail.lastSeq < cursor) {
      log(`loops tail ${tail.lastSeq} is below the cursor ${cursor}: a restored or fresh database`);
      reset("reconnected", tail.lastSeq);
      seal(tail.cursor, cursor);
    }
    const resume: StreamResume = sealed !== null && sealedAt === cursor ? { cursor: sealed } : { after: cursor };
    abort = new AbortController();
    let response: Response;
    try {
      response = await client.stream(resume, abort.signal);
    } catch (error) {
      if (!stopped) log(`loops stream: ${client.scrub(error instanceof Error ? error.message : "connection failed")}`);
      setState("down");
      ready();
      return { kind: "error" };
    }
    if (response.status === 410) {
      await discard(response);
      log("loops stream: 410 cursor_expired, the tabs re-snapshot from the tail");
      sealed = null;
      reset("gone", tail.lastSeq);
      setState("ok");
      ready();
      return { kind: "gone" };
    }
    if (response.status === 429) {
      const waitMs = retryAfterMs(response);
      await discard(response);
      log(`loops stream: 429 too_many_streams, retry in ${Math.round(waitMs / 1000)} s`);
      setBusy();
      ready();
      return { kind: "busy", waitMs };
    }
    if (response.status !== 200) {
      await discard(response);
      setState(isUnauthorized(response.status) ? await refusedState() : "down");
      ready();
      return { kind: "error" };
    }
    if (wasDown) void readVersion();
    setState("ok");
    ready();
    let lines = 0;
    try {
      lines = await follow(response, abort.signal);
    } catch {
      // the connection broke; the loop reconnects from the cursor
    }
    await discard(response);
    // A 200 that closed without a single line is a broken road (a proxy, a half-started loops), not a normal end.
    return lines > 0 || stopped ? { kind: "ended" } : { kind: "error" };
  }

  async function run(first: () => void): Promise<void> {
    let delay = retry.min;
    let firstDone = false;
    const done = () => {
      if (!firstDone) {
        firstDone = true;
        first();
      }
    };
    while (!stopped) {
      attempts += 1;
      const outcome = await attempt(done);
      if (stopped) break;
      if (outcome.kind === "ended" || outcome.kind === "gone") {
        // loops ends every stream after 300 s: reconnect from the cursor after a short jittered pause, never at once
        delay = retry.min;
        await sleep(jitter(reconnect));
        continue;
      }
      if (outcome.kind === "busy") {
        await sleep(outcome.waitMs);
        continue;
      }
      await sleep(state === "unauthorized" ? retry.max : delay);
      delay = Math.min(retry.max, delay * 2);
    }
    done();
  }

  return {
    state: () => state,
    cursor: () => cursor,
    loopsVersion: () => version,
    archivedSlugs: () => archived,
    reconnects: () => Math.max(0, attempts - 1),
    lastEventAt: () => lastEventAt,
    busy: () => busyReason,
    subscribe(from, listener) {
      listener(busyReason === null ? { type: "status", loops: state } : { type: "status", loops: state, stream: "busy", reason: busyReason });
      if (from !== null) {
        if (cursor === -1) pending.set(listener, from);
        else if (from < bufferFrom || from > cursor) listener({ type: "reset", reason: "cursor" });
        else for (const envelope of buffer) if (envelope.seq > from) listener({ type: "event", envelope });
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        pending.delete(listener);
      };
    },
    start() {
      if (started !== null) return started;
      started = new Promise<void>((resolve) => {
        void run(resolve);
      });
      heartbeatTimer = setInterval(() => {
        if (state !== "ok") broadcast({ type: "heartbeat", seq: Math.max(0, cursor), ts: new Date().toISOString() });
      }, heartbeatMs);
      return started;
    },
    async stop() {
      stopped = true;
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      abort?.abort();
      wake?.();
      listeners.clear();
    },
  };
}
