import {
  WorldSimulation,
  type Definitions,
  type WorldLayout,
} from "@crewhub/world-engine";
import {
  PROTOCOL_VERSION,
  type SessionSnapshot,
  type SessionStatus,
} from "@crewhub/protocol";

export const definitions: Definitions = {
  desk: {
    id: "desk",
    label: "Workstation",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["work", "inspect-output"],
    approaches: [{ x: 1, z: 2 }],
  },
  plant: {
    id: "plant",
    label: "Bird of paradise",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["decoration", "greenery"],
    approaches: [],
  },
  bench: {
    id: "bench",
    label: "Oak bench",
    footprint: { width: 3, depth: 1 },
    blocksMovement: true,
    tags: ["rest"],
    approaches: [{ x: 1, z: 1 }],
  },
  lamp: {
    id: "lamp",
    label: "Floor lamp",
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    tags: ["light"],
    approaches: [],
  },
  sofa: {
    id: "sofa",
    label: "Soft landing",
    footprint: { width: 3, depth: 2 },
    blocksMovement: true,
    tags: ["rest", "gather"],
    approaches: [{ x: 1, z: -1 }],
  },
  table: {
    id: "table",
    label: "Coffee table",
    footprint: { width: 2, depth: 2 },
    blocksMovement: true,
    tags: ["gather"],
    approaches: [],
  },
  shelf: {
    id: "shelf",
    label: "Library",
    footprint: { width: 1, depth: 3 },
    blocksMovement: true,
    tags: ["storage"],
    approaches: [{ x: 1, z: 1 }],
  },
};
export const initialLayout: WorldLayout = {
  version: 1,
  grid: { width: 18, depth: 14, cellSize: 0.6 },
  entrance: { x: 10, z: 13 },
  props: [
    {
      id: "desk-moss",
      definitionId: "desk",
      cell: { x: 2, z: 2 },
      rotation: 0,
    },
    { id: "desk-pip", definitionId: "desk", cell: { x: 7, z: 2 }, rotation: 0 },
    {
      id: "desk-orbit",
      definitionId: "desk",
      cell: { x: 12, z: 2 },
      rotation: 0,
    },
    { id: "plant-1", definitionId: "plant", cell: { x: 0, z: 0 }, rotation: 0 },
    {
      id: "plant-2",
      definitionId: "plant",
      cell: { x: 17, z: 0 },
      rotation: 0,
    },
    {
      id: "plant-3",
      definitionId: "plant",
      cell: { x: 17, z: 7 },
      rotation: 0,
    },
    {
      id: "plant-4",
      definitionId: "plant",
      cell: { x: 1, z: 12 },
      rotation: 0,
    },
    {
      id: "plant-5",
      definitionId: "plant",
      cell: { x: 14, z: 11 },
      rotation: 0,
    },
    { id: "library", definitionId: "shelf", cell: { x: 0, z: 5 }, rotation: 0 },
    { id: "lounge", definitionId: "sofa", cell: { x: 3, z: 10 }, rotation: 0 },
    { id: "coffee", definitionId: "table", cell: { x: 4, z: 7 }, rotation: 0 },
    {
      id: "bench-1",
      definitionId: "bench",
      cell: { x: 12, z: 8 },
      rotation: 0,
    },
    { id: "lamp-1", definitionId: "lamp", cell: { x: 1, z: 9 }, rotation: 0 },
  ],
};
export const crew = [
  {
    id: "moss",
    name: "Moss",
    role: "The builder",
    color: "#83a995",
    accent: "#396851",
    tint: "#e2ebe1",
    cell: { x: 3, z: 5 },
    initials: "M",
    task: "Bringing the first room to life",
    description: "Shaping the space, one thoughtful detail at a time.",
    tool: "Designing the room layout",
    skills: ["Build", "Explore"],
  },
  {
    id: "pip",
    name: "Pip",
    role: "The curious one",
    color: "#e6ac7c",
    accent: "#a86632",
    tint: "#f7e9d8",
    cell: { x: 8, z: 5 },
    initials: "P",
    task: "A little direction, please",
    description: "Ready to continue once you choose a direction.",
    tool: "Waiting for your input",
    skills: ["Ask", "Refine"],
  },
  {
    id: "orbit",
    name: "Orbit",
    role: "The detail keeper",
    color: "#b5a5d3",
    accent: "#796395",
    tint: "#ede7f5",
    cell: { x: 13, z: 5 },
    initials: "O",
    task: "The finishing touches",
    description: "A fresh set of eyes on the details that matter.",
    tool: "A review is ready",
    skills: ["Review", "Polish"],
  },
] as const;
export type CrewId = (typeof crew)[number]["id"];
export const statusLabel: Record<SessionStatus, string> = {
  idle: "Taking a breath",
  working: "In the flow",
  "needs-input": "Needs you",
  completed: "All wrapped up",
  unknown: "Status unknown",
};
export const scenarios = [
  {
    name: "A working morning",
    statuses: ["working", "needs-input", "completed"],
  },
  { name: "Deep focus", statuses: ["working", "working", "working"] },
  { name: "A quiet moment", statuses: ["idle", "idle", "idle"] },
  {
    name: "Ready for review",
    statuses: ["completed", "completed", "completed"],
  },
] as const;
export function demoSnapshot(
  scenario: number,
  disconnected: boolean,
): SessionSnapshot {
  const s = scenarios[scenario % scenarios.length]!;
  return {
    protocolVersion: PROTOCOL_VERSION,
    bridgeId: "greenhouse-demo",
    source: "mock",
    connection: disconnected ? "disconnected" : "connected",
    sessions: crew.map((c, i) => ({
      id: c.id,
      providerId: "mock",
      displayName: c.name,
      projectName: "The Greenhouse",
      status: s.statuses[i]!,
      activity: statusLabel[s.statuses[i]!],
      capabilities: { readOutput: false, sendPrompt: false, interrupt: false },
    })),
  };
}
export function createSimulation() {
  return new WorldSimulation(
    initialLayout,
    definitions,
    crew.map((c) => ({ id: c.id, cell: c.cell })),
  );
}
