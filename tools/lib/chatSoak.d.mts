/** Types for `chatSoak.mjs` (a plain-Node module, so the TypeScript test can import it). */
export const CHAT_OPTIONS: { "dm-every": string; burst: string; "burst-at": string };
export const CHAT_FLAGS: string[];
export const CHAT_USAGE: string;

export interface ChatSettings {
  pairedTab: boolean;
  chatPanel: boolean;
  dmEvery: number | null;
  burst: number;
  burstAt: number | null;
  active: boolean;
}
export function chatSettings(opts: Record<string, unknown>, fail?: (message: string) => never, run?: { minutes: number; every: number } | null): ChatSettings;

export interface DmRead {
  status: number | null;
  at: number;
  ms: number;
  error?: string;
}
export interface DmTally {
  ids: number;
  total: number;
  once: number;
  twice: number;
  more: number;
  ok: number;
  bad: number;
  inFlight: number;
  maxInFlight: number;
  errors: number;
}
export interface DmWindow {
  count: number;
  statuses: Record<string, number>;
  meanMs: number;
  slowestMs: number;
}
export interface DmReadCounter {
  reads: Map<string, DmRead[]>;
  wrap(realFetch: typeof fetch): typeof fetch;
  tally(): DmTally;
  inWindow(from: number, ms: number): DmWindow;
}
export function createDmReadCounter(): DmReadCounter;

export function chatAgents(fake: { url: string; key: string; keyName?: string }, fetchImpl?: typeof fetch): Promise<string[]>;
export function nextDm(agents: string[], sent: number, now?: Date): { agent: string; text: string };
export function pageChatCounter(keep?: number): string;
export const READ_PAGE_CHAT: string;
export const LOST_LINE: RegExp;
export function lostIn(line: string): number;
export interface ChatPoint {
  sent: number;
  burstSent: number;
  reads: DmTally;
  rows: number;
  lost: number;
}
export function formatChat(chat: ChatPoint): string;
