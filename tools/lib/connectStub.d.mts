/** Types for `connectStub.mjs` (a plain-Node module, so the TypeScript test can import it): the parts a test reaches. */
export const STUB_STATES: readonly string[];

export interface ConnectStub {
  /** `http://127.0.0.1:<port>`, the port the OS picked unless one was asked for. */
  url: string;
  port: number;
  readonly state: string;
  readonly startedAt: number;
  /** A state change ends every stream the stub serves. */
  setState(next: string): Promise<void>;
  /** The loops web page the connected states name; null until one was needed. */
  webUrl(): string | null;
  close(): Promise<void>;
}
export function createConnectStub(options?: { port?: number; state?: string; origin?: string; checkMs?: number; log?: (line: string) => void }): Promise<ConnectStub>;
