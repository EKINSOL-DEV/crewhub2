/**
 * The player: plays a timeline on demo time from an injected scheduler. It owns what every played source shares: the
 * position, the speed, the loop count and the demo clock (the loop's start plus the position), the wall tick (a long
 * pause of the wall clock, a sleeping tab, plays at most MAX_WALL_STEP_MS of wall time at once), the playback
 * controls (`seek` rebuilds the state and sends one snapshot when anyone listens), the listeners with their interval,
 * and the loop: a line due at or before the loop end plays, then the next loop starts from a rebuilt state and a
 * snapshot.
 *
 * Two adapters, so a real seam: the scripted storyline (`source.ts`: entries, heartbeats, the person's chat carried
 * into the next loop) and the stress fixture's PRNG stepper (`stress.ts`). What differs stays in each: the state and
 * its seq offset per reset, which lines are due when, the snapshot, and the speeds `setSpeed` accepts.
 */
import type { PlaybackControls, PlaybackSpeed, SourceMessage } from "@crewhub/loops-client";
import type { Scheduler } from "./scheduler.ts";
import { SECOND } from "./time.ts";

const TICK_MS = 100;
/** A long pause of the wall clock (a sleeping tab) plays at most this much wall time at once. */
const MAX_WALL_STEP_MS = 5 * SECOND;

/** What a played source gives the player: its loop's length, its state, its lines and its snapshot. */
export interface Timeline {
  readonly durationMs: number;
  /** The state of loop `loop`, whose demo time starts at `base`, replayed silently up to `to` (ms into the loop). */
  rebuild(to: number, loop: number, base: number): void;
  /** When the next line of this loop is due (ms into the loop); Infinity when none is left before the loop end. */
  nextAt(): number;
  /** Plays the line due at `nextAt()` and returns what it sends, in order. */
  playNext(base: number): SourceMessage[];
  /** The snapshot that opens a listener's stream and follows every rebuild a listener hears. */
  snapshot(): SourceMessage;
  /** At a loop end, before the next loop's rebuild. */
  beforeLoop?(): void;
}

export interface PlayerOptions {
  scheduler: Scheduler;
  /** Demo time of the first loop's start, ms since the epoch. */
  epochMs: number;
  /** Position to start at, ms into the loop, clamped as `seek` clamps. Default 0. */
  startAt?: number;
  /** Initial speed. Default 1. */
  speed?: PlaybackSpeed;
  /** The speeds `setSpeed` accepts (any other throws); every speed when left out. */
  speeds?: readonly PlaybackSpeed[];
  /**
   * Follow the wall clock through a pause (round 64, w2-3): when a tick finds the wall clock further on than the step
   * it plays (the process slept, a debugger held it), the epoch moves on by the rest, so `now()` and every stamp from
   * it keep pace with the wall clock; the story still plays only its step, in order. The fake sets it (a real
   * crewhub-loops stamps real time); the browser demo leaves it off, so a sleeping tab keeps the story's own times.
   */
  followWall?: boolean;
}

export interface Player {
  readonly playback: PlaybackControls;
  /** `WorldSource.start`: the snapshot at once, then the stream; the wall tick runs while anyone listens. */
  start(listener: (message: SourceMessage) => void): () => void;
  /** Demo time now: the loop's start plus the position. */
  now(): number;
  /** Sends a line played outside the timeline (an outside action, the person's chat) to every listener. */
  send(message: SourceMessage): void;
  /** Tells the playback's `onChange` listeners that the state changed outside a tick. */
  changed(): void;
}

export function createPlayer(timeline: Timeline, options: PlayerOptions): Player {
  const { scheduler, speeds, followWall = false } = options;
  let epochMs = options.epochMs;
  const duration = timeline.durationMs;
  /** A position in the loop: whole ms from 0 to the last ms before the loop end; anything not finite is the start. */
  const clamp = (ms: number) => (Number.isFinite(ms) ? Math.min(Math.max(0, Math.round(ms)), duration - 1) : 0);
  let loop = 0;
  let position = 0;
  let speed: PlaybackSpeed = options.speed ?? 1;
  let lastWall = scheduler.now();
  let interval: unknown = null;
  const listeners = new Set<(message: SourceMessage) => void>();
  const changeListeners = new Set<() => void>();
  const base = () => epochMs + loop * duration;
  const send = (message: SourceMessage) => {
    for (const listener of [...listeners]) listener(message);
  };
  const changed = () => {
    for (const listener of [...changeListeners]) listener();
  };

  function rebuild(to: number): void {
    timeline.rebuild(to, loop, base());
    position = to;
  }

  /** Plays forward to `target` (may pass the loop end), sending every line on the way. */
  function playTo(target: number): void {
    for (;;) {
      const at = timeline.nextAt();
      if (Math.min(at, duration) > target) break;
      if (at <= duration) {
        position = at;
        for (const message of timeline.playNext(base())) send(message);
      } else {
        target -= duration;
        loop += 1;
        timeline.beforeLoop?.();
        rebuild(0);
        send(timeline.snapshot());
      }
    }
    position = target;
  }

  function tick(): void {
    const wall = scheduler.now();
    const gap = Math.max(0, wall - lastWall);
    const step = Math.min(MAX_WALL_STEP_MS, gap);
    lastWall = wall;
    // A pause: the wall clock went further than the step plays. Following it, the clock moves on by the rest.
    if (followWall && gap > step) epochMs += gap - step;
    if (speed === 0 || step === 0) return;
    playTo(position + step * speed);
    changed();
  }

  rebuild(clamp(options.startAt ?? 0));

  const playback: PlaybackControls = {
    durationMs: duration,
    positionMs: () => position,
    speed: () => speed,
    setSpeed(value) {
      if (speeds !== undefined && !speeds.includes(value)) throw new Error(`Unsupported speed ${value}`);
      lastWall = scheduler.now();
      speed = value;
      changed();
    },
    seek(to) {
      rebuild(clamp(to));
      lastWall = scheduler.now();
      if (listeners.size > 0) send(timeline.snapshot());
      changed();
    },
    loop: () => loop,
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };

  return {
    playback,
    start(listener) {
      listeners.add(listener);
      listener(timeline.snapshot());
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
    now: () => base() + position,
    send,
    changed,
  };
}
