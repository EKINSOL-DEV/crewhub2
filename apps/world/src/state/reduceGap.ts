/* How long the world runtime (state/world.ts) waits before its next reduction. Pure, so a node test can pin it. */

/**
 * Under a heavy stream (the stress town at 16x) a reduction and what follows it (React, the scene's sync) cost several
 * milliseconds, many times a second. Reductions are spaced by this many times the last one's cost, so the pipeline
 * keeps to a small share of the main thread: no wait at 1x, a few frames at 16x. Never longer than REDUCE_GAP_MAX_MS.
 */
export const REDUCE_GAP_PER_MS = 20;
export const REDUCE_GAP_MAX_MS = 200;

/** The milliseconds still to wait before the next reduction (0 or less: reduce on the next frame). */
export function reduceWait(lastReduce: number, cost: number, now: number): number {
  return lastReduce + Math.min(REDUCE_GAP_MAX_MS, cost * REDUCE_GAP_PER_MS) - now;
}
