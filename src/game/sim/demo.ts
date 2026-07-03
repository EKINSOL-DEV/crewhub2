// Demo characters (M1 T8): six deterministic fake bots covering every
// status so the world is verifiable without a live Claude Code session.
// Wired in behind `?demo` in GameShell, bypassing the store join entirely.
import { CHARACTER_PALETTE, type Character } from "./characters";

// nowMs is reserved for future use (e.g. animating demo activity over time).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function demoCharacters(_nowMs: number): Character[] {
  return [
    {
      key: "demo:ada",
      name: "Ada",
      status: "Working",
      activity: "Refactoring the fountain",
      color: CHARACTER_PALETTE[0],
      isSubagent: false,
      parentKey: null,
      agentId: null,
    },
    {
      key: "demo:turing",
      name: "Turing",
      status: "Working",
      activity: "Chasing a flaky test",
      color: CHARACTER_PALETTE[1],
      isSubagent: false,
      parentKey: null,
      agentId: null,
    },
    {
      key: "demo:grace",
      name: "Grace",
      status: "WaitingForPermission",
      activity: "May I rm -rf the plaza?",
      color: CHARACTER_PALETTE[2],
      isSubagent: false,
      parentKey: null,
      agentId: null,
    },
    {
      key: "demo:edsger",
      name: "Edsger",
      status: "WaitingForInput",
      activity: "Which algorithm should win?",
      color: CHARACTER_PALETTE[3],
      isSubagent: false,
      parentKey: null,
      agentId: null,
    },
    {
      key: "demo:linus",
      name: "Linus",
      status: "Idle",
      activity: null,
      color: CHARACTER_PALETTE[4],
      isSubagent: false,
      parentKey: null,
      agentId: null,
    },
    {
      key: "agent:demo-crew",
      name: "Lovelace",
      status: "Idle",
      activity: null,
      color: CHARACTER_PALETTE[5],
      isSubagent: false,
      parentKey: null,
      agentId: "demo-crew",
    },
  ];
}
