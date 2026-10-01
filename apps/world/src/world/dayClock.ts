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
