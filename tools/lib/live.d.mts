/** Types for `live.mjs` (a plain-Node module, so the TypeScript test can import it): the parts a test reaches. */
export const LIVE_OPTIONS: Record<string, string>;
export const LIVE_USAGE: string;

export interface HostLog {
  /** The last `keep` lines, each with its time of day. */
  lines: string[];
  log(line: string): void;
  /** The agent messages the lost lines counted, over every line logged. */
  lost(): number;
}
export function createHostLog(keep?: number, now?: () => Date): HostLog;
export function startLive(opts: Record<string, unknown>, options?: { preview?: boolean; keyReadsChat?: boolean }): Promise<unknown>;
