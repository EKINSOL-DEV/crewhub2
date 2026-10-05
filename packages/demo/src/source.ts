/**
 * DemoSource: the scripted crewhub-loops behind the WorldSource seam. It plays the storyline on
 * demo time (script start 2026-10-01T08:00:00Z plus the position, one duration later per loop),
 * sends a snapshot first and after every reset (a loop or a seek), then envelopes, heartbeats
 * after 15 s of silence, and team re-reads. Wall time comes from the injected scheduler.
 */
import type {
  AgentOut,
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
import { type ProjectGroupSeed, DEMO_BASE_CURSOR, DEMO_SEQ_STRIDE } from "./content.ts";
import { type DemoScenario, type ScenarioId, DEFAULT_SCENARIO, demoScenario } from "./scenarios.ts";
import { type ScriptEntry, DEMO_SEED, DM_ENTRY_STRIDE, buildDmExchange, buildPropRequest, buildStory } from "./script.ts";
import type { Scheduler } from "./scheduler.ts";
import { type AgentSummary, type DemoState, DEMO_PERSON, DemoReads, initialState } from "./store.ts";
import { DEMO_EPOCH_MS, SECOND, iso } from "./time.ts";

const HEARTBEAT_MS = 15 * SECOND;
const TICK_MS = 100;
/** A long pause of the wall clock (a sleeping tab) plays at most this much wall time at once. */
const MAX_WALL_STEP_MS = 5 * SECOND;
/** Ids of on-demand actions start here, far above the script's. */
const EXTRA_FIRST_ID = 100_000;
/** Ids of the person's chat actions start here and are never reused, so they survive a loop. */
const CHAT_FIRST_ID = 500_000;

export interface DemoSourceOptions {
  /** Which installation and storyline to play. Default DEFAULT_SCENARIO ("small-team"). */
  scenario?: ScenarioId;
  /** Seeds the timing jitter. Same seed, byte-identical envelopes. Default DEMO_SEED. */
  seed?: number;
  scheduler: Scheduler;
  /** Script position to start at, ms. Default 0. */
  startAt?: number;
  /** Initial speed. Default 1. */
  speed?: PlaybackSpeed;
  /**
   * Demo time of the script start, ms since the epoch. Default DEMO_EPOCH_MS, which keeps tests byte-identical;
   * the world passes the minute the page opened, so relative times ("2 min ago") read naturally.
   */
  epochMs?: number;
}

export interface DemoSource extends WorldSource {
  readonly mode: "demo";
  readonly playback: PlaybackControls;
  /** The scenario this source plays. */
  readonly scenario: DemoScenario;
  /**
   * Build mode's "Request a prop" (demo only): runs the scripted prop flow for `thing` from the
   * current position, or from the moment the scenario's project exists (Fresh install before its first
   * project). The ticket appears one second of demo time later; a seek before that point or the next loop
   * drops it again. `project` is the name of the project the ticket lands in.
   */
  createPropRequest(thing: string): { title: string; startsAtMs: number; project: string };
  /**
   * FUTURE (proposal L22 "project groups"): `GET /api/project-groups`. Crewhub-loops has no groups today; a real
   * source answers []. Only scenarios with groups (Studio) answer more.
   */
  listProjectGroups(): Promise<ProjectGroupSeed[]>;
  /** Chat reads for phase 2 (`GET /api/dm/threads`, `GET /api/dm/threads/{agent}/messages`). */
  getDmThreads(): Promise<DmThread[]>;
  getDmMessages(agentId: string): Promise<DmMessage[]>;
  /** `GET /api/deliveries` as the router or an admin sees it. */
  getDeliveries(): Promise<DeliveryOut[]>;
  /** `GET /api/agents`. */
  getAgents(): Promise<AgentOut[]>;
  /** `GET /api/agents/{name}/summary`; `baseUrl` stands for loops' public URL in the links. */
  getAgentSummary(agentId: string, baseUrl: string): Promise<AgentSummary>;
  /**
   * The demo person sends `text` to `agentId` now (`POST /api/dm/threads/{agent}/messages`):
   * `dm.created` and a `dm` delivery at once, the postman claims and forwards it, and a scripted
   * "(demo reply)" follows a few demo seconds later with `dm.answered`. The same `clientId` twice
   * returns the first message. The exchange survives seeks and carries into the next loop.
   */
  sendDm(agentId: string, text: string, clientId: string): DmMessage;
  /** The demo person has read `agentId`'s thread up to the message with `clientId` (never backwards). */
  markDmRead(agentId: string, clientId: string): void;
}

export function createDemoSource(options: DemoSourceOptions): DemoSource {
  const seed = options.seed ?? DEMO_SEED;
  const scheduler = options.scheduler;
  const scenario = demoScenario(options.scenario ?? DEFAULT_SCENARIO);
  const duration = scenario.story.durationMs;
  const script = buildStory(scenario.story, seed);
  const clampPosition = (ms: number) => (Number.isFinite(ms) ? Math.min(Math.max(0, Math.round(ms)), duration - 1) : 0);

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
  let nextChatId = CHAT_FIRST_ID;
  const listeners = new Set<(message: SourceMessage) => void>();
  const changeListeners = new Set<() => void>();

  const epoch = options.epochMs ?? DEMO_EPOCH_MS;
  const base = () => epoch + loop * duration;
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
    state = initialState(base(), DEMO_BASE_CURSOR + resets * DEMO_SEQ_STRIDE, scenario.content);
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

  /** Applies one entry at its time and sends what it produced. */
  function play(entry: ScriptEntry): void {
    for (const out of applyAction(state, entry.action, entry.id)) {
      if (out.type === "event") {
        lastLineAt = entry.at;
        send({ type: "event", envelope: structuredClone(out.envelope) });
      } else {
        send({ type: "team", team: out.team });
      }
    }
  }

  /** Puts `entry` (at the current position) after the played part of the timeline and plays it now. */
  function playNow(entry: ScriptEntry): void {
    timeline = [...timeline.slice(0, next), entry, ...timeline.slice(next)];
    next += 1;
    state.now = base() + position;
    play(entry);
  }

  /** Plays forward to `target` (may pass the loop end), sending every line on the way. */
  function playTo(target: number): void {
    for (;;) {
      const entry = timeline[next];
      const heartbeatAt = lastLineAt + HEARTBEAT_MS;
      const due = Math.min(entry?.at ?? Infinity, heartbeatAt, duration);
      if (due > target) break;
      if (entry !== undefined && entry.at === due) {
        state.now = base() + entry.at;
        position = entry.at;
        next += 1;
        play(entry);
      } else if (due === heartbeatAt) {
        lastLineAt = heartbeatAt;
        position = heartbeatAt;
        send({ type: "heartbeat", seq: state.seq, ts: iso(base() + heartbeatAt) });
      } else {
        target -= duration;
        loop += 1;
        timeline = merge(script, carryChat(timeline, duration));
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
    durationMs: duration,
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
    scenario,
    listProjectGroups: () => answer(current().projectGroups()),
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
    getAgents: () => answer(current().agents()),
    getAgentSummary: (agentId, baseUrl) => answer(current().agentSummary(agentId, baseUrl)),
    sendDm(agentId, text, clientId) {
      const mine = () =>
        current()
          .dmMessages(agentId)
          .find((m) => m.clientId === clientId && m.author.id === DEMO_PERSON);
      const existing = mine();
      if (existing !== undefined) return existing;
      const replies = current()
        .dmMessages(agentId)
        .filter((m) => m.author.id === DEMO_PERSON).length;
      const [now, ...later] = buildDmExchange({ agent: agentId, from: DEMO_PERSON, text, clientId, replies }, position, nextChatId);
      nextChatId += DM_ENTRY_STRIDE;
      playNow(now as ScriptEntry);
      timeline = [...timeline.slice(0, next), ...merge(timeline.slice(next), later)];
      return mine() as DmMessage;
    },
    markDmRead(agentId, clientId) {
      const thread = state.dmThreads.find((t) => t.agentId === agentId);
      if (thread === undefined) return;
      const before = state.dmReads[thread.id];
      const entry: ScriptEntry = { id: nextChatId, at: position, action: { type: "dmRead", agent: agentId, clientId } };
      applyAction(state, entry.action, entry.id);
      if (state.dmReads[thread.id] === before) return;
      nextChatId += 1;
      timeline = [...timeline.slice(0, next), entry, ...timeline.slice(next)];
      next += 1;
    },
    createPropRequest(thing) {
      const text = thing.trim().replace(/\s+/g, " ").slice(0, 80) || "a small crate";
      const { fromMs, projectName, ...home } = scenario.props;
      const entries = buildPropRequest(text, Math.max(position, fromMs), nextExtraId, seed, home, duration);
      nextExtraId += 1000;
      const pending = timeline.slice(next);
      const played = timeline.slice(0, next);
      timeline = [...played, ...[...pending, ...entries].sort((a, b) => a.at - b.at || a.id - b.id)];
      return { title: `Prop: ${text}`, startsAtMs: entries[0]?.at ?? position, project: projectName };
    },
  };
}

function merge(a: ScriptEntry[], b: ScriptEntry[]): ScriptEntry[] {
  return [...a, ...b].sort((x, y) => x.at - y.at || x.id - y.id);
}

/**
 * The person's chat actions of the loop that ends, for the next loop: what was played lands at
 * its start (in the same order), what was still due keeps its distance past the loop end.
 */
function carryChat(timeline: ScriptEntry[], duration: number): ScriptEntry[] {
  return timeline
    .filter((entry) => entry.id >= CHAT_FIRST_ID)
    .map((entry) => ({ ...entry, at: Math.max(0, entry.at - duration) }));
}
