/** Demo time: the script starts at this instant (loop 0) and each loop starts one duration later. */
export const DEMO_EPOCH_MS = Date.parse("2026-10-01T08:00:00.000Z");

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** "m:ss" or "m:ss.s" from the script start, in ms. */
export function at(clock: string): number {
  const match = /^(\d+):(\d{2}(?:\.\d+)?)$/.exec(clock);
  if (match === null) throw new Error(`Bad script time "${clock}"`);
  return Math.round((Number(match[1]) * 60 + Number(match[2])) * SECOND);
}
