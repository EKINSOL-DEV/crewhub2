/** Types for `named-ports.mjs` (a plain-Node module the test preload loads, so TypeScript can import the list). */
export interface NamedPort {
  readonly port: number;
  /** Whose the port is, in the words both rules print. */
  readonly why: string;
}
export const NAMED_PORTS: readonly NamedPort[];
export const APP_PORTS: readonly number[];
export const DEV_LOOPS_PORTS: readonly number[];
export const HOST_DEFAULT_PORT: number;
export const VITE_PORT: number;
export function namedPort(port: number): NamedPort | undefined;
