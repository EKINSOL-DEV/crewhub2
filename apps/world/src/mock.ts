import { PROTOCOL_VERSION, type SessionSnapshot, type SessionStatus } from "@crewhub/protocol";

const phases: readonly { status: SessionStatus; activity: string }[] = [
  { status: "idle", activity: "Ready for a task" },
  { status: "working", activity: "Preparing a first draft" },
  { status: "needs-input", activity: "Waiting for your direction" },
  { status: "completed", activity: "A result is ready to inspect" },
];

/** Deterministic fixture: no timers, processes, sockets, network, or model calls. */
export function createMockSnapshot(step = 0): SessionSnapshot {
  const phase = phases[((step % phases.length) + phases.length) % phases.length]!;
  return {
    protocolVersion: PROTOCOL_VERSION,
    bridgeId: "demo-local",
    source: "mock",
    connection: "connected",
    sessions: [
      {
        id: "demo-session-1",
        providerId: "mock",
        displayName: "Scout",
        projectName: "First room",
        ...phase,
        capabilities: { readOutput: false, sendPrompt: false, interrupt: false },
      },
    ],
  };
}
