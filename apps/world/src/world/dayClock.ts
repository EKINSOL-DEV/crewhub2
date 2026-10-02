/* The day-night drift's clock: the time of day as a fraction of one day, from the source clock (never the wall clock),
   so it pauses, seeks and speeds up with the playback. One day lasts one loop of the demo script: the morning opens
   the loop, the afternoon's work runs into dusk around the release, the evening's lanterns light the late loop and dawn
   comes back just before the loop starts again. At 1x a day takes 16 minutes, at 4x 4 minutes, at 16x one minute; every
   loop starts from the same morning. Pure. */
import type { GraphicsQuality } from "@crewhub/world-style";

/** One day of the drift: one loop of the demo script (packages/demo `SCRIPT_DURATION_MS`, 16:00). */
export const DAY_LENGTH_MS = 16 * 60_000;

/** The time of day at `sinceStartMs` of source time after the first loop's start: 0 is the morning, wrapped to [0, 1). */
export function dayPhase(sinceStartMs: number, dayLengthMs = DAY_LENGTH_MS): number {
  const u = (sinceStartMs % dayLengthMs) / dayLengthMs;
  return u < 0 ? u + 1 : u;
}

/**
 * The phase the light shows, or null for the theme's fixed look: the setting off, reduced motion (the light never moves
 * on its own) or Fast graphics (no drift work at all).
 */
export function driftPhase(options: { dayNight: boolean; reducedMotion: boolean; quality: GraphicsQuality; sinceStartMs: number }): number | null {
  if (!options.dayNight || options.reducedMotion || options.quality === "fast") return null;
  return dayPhase(options.sinceStartMs);
}

/**
 * The fastest the light drifts, in demo speed: at 1x and 4x the day follows the clock exactly (16 and 4 minutes a day);
 * at 16x it would turn in a minute, a dusk in seven seconds, with lanterns and shadows ticking, so the light keeps
 * drifting at 4x and falls behind the clock, still moving forward. A little slack absorbs timer jitter.
 */
export const MAX_DRIFT_SPEED = 4.4;

/** The light's own phase, and the source and wall clocks (ms) it was last moved at. */
export interface DriftFollow {
  phase: number | null;
  clock: number;
  wall: number;
}

/**
 * Moves the shown phase towards `target` (the clock's phase, or null for the fixed look). Forward play moves it forward
 * by at most `MAX_DRIFT_SPEED` days per day of real time; a seek, a jump back or the first phase snaps to the target, as
 * a viewer who scrubs means to see that time. Returns the new state; pure.
 */
export function followPhase(previous: DriftFollow, target: number | null, clock: number, wall: number, dayLengthMs = DAY_LENGTH_MS): DriftFollow {
  if (target === null || previous.phase === null) return { phase: target, clock, wall };
  const elapsedClock = clock - previous.clock,
    elapsedWall = Math.max(0, wall - previous.wall);
  // More source time than 16x play explains (with slack), or time going back: a seek.
  const seek = elapsedClock < 0 || elapsedClock > elapsedWall * 32 + 2000;
  if (seek) return { phase: target, clock, wall };
  const ahead = target - previous.phase - Math.floor(target - previous.phase);
  const step = Math.min(ahead, (elapsedWall * MAX_DRIFT_SPEED) / dayLengthMs);
  return { phase: wrap(previous.phase + step), clock, wall };
}

const wrap = (u: number) => {
  const w = u - Math.floor(u);
  return w >= 1 ? 0 : w;
};
