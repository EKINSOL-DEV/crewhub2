/**
 * DemoSource: the scripted crewhub-loops behind the WorldSource seam. It plays the storyline on
 * demo time (script start 2026-10-01T08:00:00Z plus the position, one duration later per loop),
 * sends a snapshot first and after every reset (a loop or a seek), then envelopes, heartbeats
 * after 15 s of silence, and team re-reads. Wall time comes from the injected scheduler.
 */
import type {
  BoardResponse,
  CommentOut,
  DeliveryOut,
  DmMessage,
  DmThread,
  MilestoneSummary,
  PlaybackControls,
  PlaybackSpeed,
  ProgressItem,
  ProjectOut,
  ReleaseSummary,
  SourceMessage,
  Ticket,
  WatchdogResponse,
  WorldSource,
} from "@crewhub/loops-client";
import { applyAction } from "./actions.ts";
import { DEMO_BASE_CURSOR, DEMO_SEQ_STRIDE } from "./content.ts";
import { type ScriptEntry, DEMO_SEED, SCRIPT_DURATION_MS, buildPropRequest, buildScript } from "./script.ts";
import type { Scheduler } from "./scheduler.ts";
import { type DemoState, DemoReads, initialState } from "./store.ts";
import { DEMO_EPOCH_MS, SECOND, iso } from "./time.ts";

const HEARTBEAT_MS = 15 * SECOND;
const TICK_MS = 100;
/** A long pause of the wall clock (a sleeping tab) plays at most this much wall time at once. */
const MAX_WALL_STEP_MS = 5 * SECOND;
/** Ids of on-demand actions start here, far above the script's. */
const EXTRA_FIRST_ID = 100_000;

export interface DemoSourceOptions {
  /** Seeds the timing jitter. Same seed, byte-identical envelopes. Default DEMO_SEED. */
  seed?: number;
  scheduler: Scheduler;
  /** Script position to start at, ms. Default 0. */
  startAt?: number;
  /** Initial speed. Default 1. */
  speed?: PlaybackSpeed;
}

export interface DemoSource extends WorldSource {
  readonly mode: "demo";
  readonly playback: PlaybackControls;
  /**
   * Build mode's "Request a prop" (demo only): runs the scripted prop flow for `thing` from the
   * current position. The ticket appears one second of demo time later; a seek before that
   * point or the next loop drops it again.
   */
  createPropRequest(thing: string): { title: string; startsAtMs: number };
  /** Chat reads for phase 2 (`GET /api/dm/threads`, `GET /api/dm/threads/{agent}/messages`). */
  getDmThreads(): Promise<DmThread[]>;
  getDmMessages(agentId: string): Promise<DmMessage[]>;
  /** `GET /api/deliveries` as the router or an admin sees it. */
  getDeliveries(): Promise<DeliveryOut[]>;
}

export function createDemoSource(options: DemoSourceOptions): DemoSource {
  const seed = options.seed ?? DEMO_SEED;
  const scheduler = options.scheduler;
  const script = buildScript(seed);

  let timeline: ScriptEntry[] = script;
  let loop = 0;
  let resets = 0;
  let position = clampPosition(options.startAt ?? 0);
  let speed: PlaybackSpeed = options.speed ?? 1;
  let state: DemoState;
  let reads: DemoReads;
  let next = 0;
  let lastLineAt = position;
  let lastWall = scheduler.now();
  let interval: unknown = null;
  let nextExtraId = EXTRA_FIRST_ID;
  const listeners = new Set<(message: SourceMessage) => void>();
  const changeListeners = new Set<() => void>();

  const base = () => DEMO_EPOCH_MS + loop * SCRIPT_DURATION_MS;
  const send = (message: SourceMessage) => {
    for (const listener of [...listeners]) listener(message);
  };
  const changed = () => {
    for (const listener of [...changeListeners]) listener();
  };
  const current = (): DemoReads => {
    state.now = base() + position;
    return reads;
  };

  /** Rebuilds the store for this loop and plays the timeline silently up to `to`. */
  function rebuild(to: number): void {
    state = initialState(base(), DEMO_BASE_CURSOR + resets * DEMO_SEQ_STRIDE);
    resets += 1;
    reads = new DemoReads(state);
    next = 0;
    while (next < timeline.length && (timeline[next] as ScriptEntry).at <= to) {
      const entry = timeline[next] as ScriptEntry;
      state.now = base() + entry.at;
      applyAction(state, entry.action, entry.id);
      next += 1;
    }
    position = to;
    lastLineAt = to;
  }

  function sendSnapshot(): void {
    send({ type: "snapshot", snapshot: current().snapshot() });
  }

  /** Plays forward to `target` (may pass the loop end), sending every line on the way. */
  function playTo(target: number): void {
    for (;;) {
      const entry = timeline[next];
      const heartbeatAt = lastLineAt + HEARTBEAT_MS;
      const due = Math.min(entry?.at ?? Infinity, heartbeatAt, SCRIPT_DURATION_MS);
      if (due > target) break;
      if (entry !== undefined && entry.at === due) {
        state.now = base() + entry.at;
        position = entry.at;
        next += 1;
        for (const out of applyAction(state, entry.action, entry.id)) {
          if (out.type === "event") {
            lastLineAt = entry.at;
            send({ type: "event", envelope: structuredClone(out.envelope) });
          } else {
            send({ type: "team", team: out.team });
          }
        }
      } else if (due === heartbeatAt) {
        lastLineAt = heartbeatAt;
        position = heartbeatAt;
        send({ type: "heartbeat", seq: state.seq, ts: iso(base() + heartbeatAt) });
      } else {
        target -= SCRIPT_DURATION_MS;
        loop += 1;
        timeline = script;
        nextExtraId = EXTRA_FIRST_ID;
        rebuild(0);
        sendSnapshot();
      }
    }
    position = target;
  }

  function tick(): void {
    const wall = scheduler.now();
    const step = Math.min(MAX_WALL_STEP_MS, Math.max(0, wall - lastWall));
    lastWall = wall;
    if (speed === 0 || step === 0) return;
    playTo(position + step * speed);
    changed();
  }

  rebuild(position);

  const playback: PlaybackControls = {
    durationMs: SCRIPT_DURATION_MS,
    positionMs: () => position,
    speed: () => speed,
    setSpeed(value) {
      if (![0, 1, 4, 16].includes(value)) throw new Error(`Unsupported speed ${value}`);
      lastWall = scheduler.now();
      speed = value;
      changed();
    },
    seek(to) {
      rebuild(clampPosition(to));
      lastWall = scheduler.now();
      if (listeners.size > 0) sendSnapshot();
      changed();
    },
    loop: () => loop,
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };

  const answer = <T>(value: T): Promise<T> => Promise.resolve(value);

  return {
    mode: "demo",
    playback,
    now: () => base() + position,
    start(listener) {
      listeners.add(listener);
      listener({ type: "snapshot", snapshot: current().snapshot() });
      if (interval === null) {
        lastWall = scheduler.now();
        interval = scheduler.setInterval(tick, TICK_MS);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && interval !== null) {
          scheduler.clearInterval(interval);
          interval = null;
        }
      };
    },
    getTicket: (ref): Promise<Ticket | null> => answer(current().ticket(ref)),
    getProject: (slug): Promise<ProjectOut | null> => answer(current().project(slug)),
    getBoard: (slug): Promise<BoardResponse | null> => answer(current().board(slug)),
    getWatchdog: (): Promise<WatchdogResponse> => answer(current().watchdog()),
    getMilestones: (slug): Promise<MilestoneSummary[]> => answer(current().milestones(slug)),
    getReleases: (slug): Promise<ReleaseSummary[]> => answer(current().releases(slug)),
    getComments: (ref): Promise<CommentOut[]> => answer(current().comments(ref)),
    getProgress: (ref): Promise<ProgressItem[]> => answer(current().progress(ref)),
    getDmThreads: () => answer(current().dmThreads()),
    getDmMessages: (agentId) => answer(current().dmMessages(agentId)),
    getDeliveries: () => answer(current().deliveries()),
    createPropRequest(thing) {
      const text = thing.trim().replace(/\s+/g, " ").slice(0, 80) || "a small crate";
      const entries = buildPropRequest(text, position, nextExtraId, seed);
      nextExtraId += 1000;
      const pending = timeline.slice(next);
      const played = timeline.slice(0, next);
      timeline = [...played, ...[...pending, ...entries].sort((a, b) => a.at - b.at || a.id - b.id)];
      return { title: `Prop: ${text}`, startsAtMs: entries[0]?.at ?? position };
    },
  };
}

function clampPosition(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(Math.max(0, Math.round(ms)), SCRIPT_DURATION_MS - 1);
}
