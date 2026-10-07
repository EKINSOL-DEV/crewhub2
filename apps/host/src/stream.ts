/**
 * The one upstream stream: the host follows `GET /api/events/stream?after=<cursor>` once for every browser tab,
 * keeps a ring buffer of the last envelopes for catch-up, and tells the tabs when continuity broke (`reset`).
 * Reconnects with backoff when loops goes away; while loops is down the host beats itself every `heartbeatMs`.
 */
import type { Envelope } from "@crewhub/loops-client";
import { type LoopsClient, isUnauthorized } from "./loops.ts";
import { SnapshotError, readTail } from "./snapshot.ts";

export type LoopsState = "ok" | "down" | "unauthorized";

export type HostMessage =
  | { type: "status"; loops: LoopsState }
  | { type: "event"; envelope: Envelope }
  | { type: "heartbeat"; seq: number; ts: string }
  | { type: "reset"; reason: "gone" | "reconnected" | "cursor" };

export interface UpstreamOptions {
  bufferSize?: number;
  retryMs?: { min: number; max: number };
  heartbeatMs?: number;
  /** No line for this long and the connection is dropped and reopened (loops beats every 15 s). */
  idleMs?: number;
  /** Server-side logging; never the key. */
  log?: (line: string) => void;
}

export interface Upstream {
  state(): LoopsState;
  /** The last seq the host applied; -1 before the first connection. */
  cursor(): number;
  /** The loops version from `GET /api/health`, when known. */
  loopsVersion(): string | undefined;
  /** Slugs the host saw archived through `project.archived` events since it started. */
  archivedSlugs(): ReadonlySet<string>;
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

export function createUpstream(client: LoopsClient, options: UpstreamOptions = {}): Upstream {
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER;
  const retry = options.retryMs ?? { min: 1000, max: 30_000 };
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const idleMs = options.idleMs ?? 45_000;
  const log = options.log ?? (() => {});

  let state: LoopsState = "down";
  let cursor = -1;
  /** Every envelope with seq > bufferFrom that the host received is in `buffer`, oldest first. */
  let bufferFrom = -1;
  const buffer: Envelope[] = [];
  let version: string | undefined;
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
  const setState = (next: LoopsState) => {
    if (state === next) return;
    state = next;
    log(`loops ${next}`);
    broadcast({ type: "status", loops: next });
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

  function apply(line: Record<string, unknown>): void {
    if (line.type === "heartbeat") {
      const seq = typeof line.seq === "number" ? line.seq : cursor;
      if (seq > cursor) cursor = seq;
      broadcast({ type: "heartbeat", seq: cursor, ts: typeof line.ts === "string" ? line.ts : new Date().toISOString() });
      return;
    }
    if (typeof line.seq !== "number" || typeof line.type !== "string") return;
    const envelope = line as unknown as Envelope;
    if (envelope.seq <= cursor) return;
    cursor = envelope.seq;
    buffer.push(envelope);
    while (buffer.length > bufferSize) {
      const dropped = buffer.shift() as Envelope;
      bufferFrom = dropped.seq;
    }
    if (envelope.type === "project.archived" && envelope.project !== null) archived.add(envelope.project.slug);
    if (envelope.type === "project.restored" && envelope.project !== null) archived.delete(envelope.project.slug);
    broadcast({ type: "event", envelope });
  }

  /** Reads NDJSON lines until the body ends or the signal fires. */
  async function follow(response: Response, signal: AbortSignal): Promise<void> {
    if (response.body === null) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
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

  /** One connection attempt. Returns true when the stream was open (so the backoff restarts). */
  async function attempt(ready: () => void): Promise<boolean> {
    // Before the first connection, and after loops was away: the tail says whether our cursor still means anything.
    const wasDown = state !== "ok";
    let tail: number;
    try {
      tail = await readTail(client);
    } catch (error) {
      setState(error instanceof SnapshotError && error.reason === "unauthorized" ? "unauthorized" : "down");
      ready();
      return false;
    }
    if (cursor === -1) {
      clearBuffer(tail);
      for (const [listener, from] of pending) if (listeners.has(listener) && from !== tail) listener({ type: "reset", reason: "cursor" });
      pending.clear();
    } else if (tail < cursor) reset("reconnected", tail);
    abort = new AbortController();
    let response: Response;
    try {
      response = await client.stream(cursor, abort.signal);
    } catch (error) {
      if (!stopped) log(`loops stream: ${client.scrub(error instanceof Error ? error.message : "connection failed")}`);
      setState("down");
      ready();
      return false;
    }
    if (response.status === 410) {
      await response.body?.cancel();
      reset("gone", tail);
      setState("ok");
      ready();
      return true;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      setState(isUnauthorized(response.status) ? "unauthorized" : "down");
      ready();
      return false;
    }
    if (wasDown) void readVersion();
    setState("ok");
    ready();
    try {
      await follow(response, abort.signal);
    } catch {
      // the connection broke; the loop reconnects from the cursor
    }
    return true;
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
      const open = await attempt(done);
      if (stopped) break;
      if (open) {
        delay = retry.min;
        if (state === "ok") continue; // loops ended the stream (300 s): reconnect at once from the cursor
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
    subscribe(from, listener) {
      listener({ type: "status", loops: state });
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
