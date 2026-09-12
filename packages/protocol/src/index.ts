/** Draft application contract. This is not the Herdr wire protocol. */
export const PROTOCOL_VERSION = 1 as const;

export type SessionStatus =
  | "idle"
  | "working"
  | "needs-input"
  | "completed"
  | "unknown";

export interface SessionSummary {
  /** Opaque bridge-scoped identity; never use a display name as an identifier. */
  id: string;
  providerId: string;
  displayName: string;
  projectName: string;
  status: SessionStatus;
  activity: string;
  capabilities: {
    readOutput: boolean;
    sendPrompt: boolean;
    interrupt: boolean;
  };
}

export interface SessionSnapshot {
  protocolVersion: typeof PROTOCOL_VERSION;
  bridgeId: string;
  source: "mock" | "live";
  /** Availability is separate from the last observed agent status. */
  connection: "connected" | "disconnected";
  sessions: readonly SessionSummary[];
}
