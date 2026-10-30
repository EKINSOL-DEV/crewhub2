/** Types for `no-app-reach.mjs` (a plain-Node preload, so the TypeScript test can import its rules). */
export const APP_DATA: string;
export const CONFIG_DIR: string;
export const LOOPS_CONFIG: string;
export const APP_PORTS: number[];
export const MARK: symbol;
export function refusesPath(input: unknown): string | null;
export function connectTarget(args: unknown[]): { port?: number; host?: string; path?: string };
export function refusesConnect(args: unknown[]): string | null;
