// Demo characters (M1 T8): six deterministic fake bots covering every
// status so the world is verifiable without a live Claude Code session.
// Wired in behind `?demo` in GameShell, bypassing the store join entirely.
import { CHARACTER_PALETTE, type Character } from "./characters";

/**
 * Shared groupKey (M5 T5): a demo scene has no real project behind it, so
 * there's nothing for `folderByProjectId` (use-sim.ts) to join against. The
 * sim's project-room desk matching (M5 T2) requires a bot's groupKey to
 * equal some building's groupKey before it'll ever claim a desk — with real
 * per-project keys, unlinked demo pavilions would leave every demo bot
 * wandering outside, killing the "arrived and settled" demo charm. Simplest
 * fix that doesn't touch sim.ts's matching rules: give every demo character
 * AND every demo-mode building (see use-sim.ts's `isDemo` branch, which
 * annotates ALL buildings with this same key, real project links included)
 * this one fake shared "project" so they all match each other.
 */
export const DEMO_GROUP = "demo";

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
      groupKey: DEMO_GROUP,
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
      groupKey: DEMO_GROUP,
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
      groupKey: DEMO_GROUP,
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
      groupKey: DEMO_GROUP,
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
      groupKey: DEMO_GROUP,
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
      groupKey: DEMO_GROUP,
    },
  ];
}
