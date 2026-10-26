/* The director's plan log: the last LOG_LIMIT plans, newest first. Its own module so the cap test can load it in node
   (state/director.ts reaches React and the scene); the runtime's `#onModel` takes this step (round 45). */
import type { PlanRecord } from "@crewhub/demo";

export const LOG_LIMIT = 40;

/** The log after `made` landed: a step's plans newest first, then the log so far, the last LOG_LIMIT kept. Pure. */
export function logPlans(log: readonly PlanRecord[], made: readonly PlanRecord[]): readonly PlanRecord[] {
  return made.length > 0 ? [...made].reverse().concat(log).slice(0, LOG_LIMIT) : log;
}
