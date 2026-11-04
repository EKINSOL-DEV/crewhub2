/** Types for `page.mjs` (a plain-Node module, so the TypeScript test can import it): the parts a test reaches. */
export interface ContextOptionsIn {
  width?: number;
  theme?: "light" | "dark";
  dpr?: number;
  reducedMotion?: "reduce" | "no-preference" | null;
}
export function viewportFor(width: number): { viewport: { width: number; height: number }; isMobile?: boolean; hasTouch?: boolean };
export function contextOptions(options?: ContextOptionsIn): Record<string, unknown>;
export interface OpenPageOptions extends ContextOptionsIn {
  origin?: string;
  store?: Record<string, string | null | undefined> | null;
  cpuThrottle?: number;
  problems?: unknown[] | null;
  tag?: string;
  pair?: ((page: unknown) => Promise<void>) | null;
  url?: string | null;
  waitUntil?: string | null;
}
export function openPage(browser: unknown, options?: OpenPageOptions): Promise<unknown>;
export function waitFor(page: unknown, state: "canvas" | "dressed" | "perf" | "first-frame", timeout?: number): Promise<unknown>;
export function screen(p: unknown, which: string, timeout?: number): Promise<unknown>;
export function screenShown(p: unknown, which: string, timeout?: number): Promise<boolean>;
export function connectTitle(p: unknown): Promise<string>;
export function chip(p: unknown): unknown;
export function chipWord(p: unknown): Promise<string | null>;
export function untilChip(p: unknown, wanted: string, timeout?: number): Promise<string | null>;
export function waitChip(p: unknown, which: string, timeout?: number): Promise<unknown>;
export function textView(p: unknown): unknown;
export function readTextView(p: unknown): Promise<string>;
export function trail(p: unknown): unknown;
export function levels(p: unknown): Promise<string | null>;
export function level(p: unknown): Promise<string>;
export function drawn(p: unknown, selector: string): Promise<number>;
export function labels(p: unknown, selector?: string): Promise<number>;
export function announced(p: unknown, key: string, settle?: number): Promise<string>;
