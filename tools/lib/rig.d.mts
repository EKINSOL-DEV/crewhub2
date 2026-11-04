/** Types for `rig.mjs` (a plain-Node module, so the TypeScript test can import it): the parts a test reaches. */
import type { Buffer } from "node:buffer";

/** The built world the host serves when a caller names it and it is there. */
export const DIST: string;
/** Whether a built world stands at `dist` (its index.html). */
export function distBuilt(dist?: string): boolean;
/** The host's timings the tools run with. */
export const TEST_TIMINGS: { retryMs: { min: number; max: number }; reconnectMs: { min: number; max: number }; heartbeatMs: number };

export interface RigLoopsFake {
  url: string;
  port: number;
  key: string;
  keyName: string;
  close(): Promise<void>;
  [more: string]: unknown;
}
export interface RigHost {
  url: string;
  port: number;
  mintPairLink(origin?: string): string;
  close(): Promise<void>;
  [more: string]: unknown;
}
export interface RigWebStub {
  url: string;
  port: number;
  close(): Promise<void>;
  [more: string]: unknown;
}
/** A page as the rig drives it for pairing (a Playwright page, or a stand-in). */
export interface RigPage {
  goto(url: string): Promise<unknown>;
  /** What `pairedTab` (world.mjs) waits with: the tab holds its bearer and the token left the URL. */
  waitForFunction(fn: () => unknown, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
}
export interface Rig {
  readonly fake: RigLoopsFake | null;
  readonly web: RigWebStub | null;
  readonly host: RigHost;
  readonly served: boolean;
  readonly origin: string;
  readonly base: string;
  readonly lines: string[];
  pairLink(): string;
  pair(page: RigPage): Promise<void>;
  restart(patch?: Record<string, unknown>): Promise<RigHost>;
  loopsAgain(options: Record<string, unknown>): Promise<RigLoopsFake>;
  close(): Promise<void>;
}
export interface RigOptions {
  loops: { fake: Record<string, unknown> } | { url: string; key?: string; keyName: string } | { discovery: { appData: string; intervalMs?: number } };
  web?: boolean;
  serve: { dist?: string; origin?: string; hostPort?: number };
  pairing?: "on" | "off" | { secret: Buffer };
  host?: Record<string, unknown>;
  timings?: Record<string, unknown>;
  log?: ((line: string) => void) | null;
  onLoops?: <T>(made: T) => T;
}
export function startRig(options: RigOptions): Promise<Rig>;
