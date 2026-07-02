// R3F render smoke (M1 T7): @react-three/test-renderer builds the three.js
// scene graph without a real WebGL context, so this runs under jsdom.
//
// drei's <Text> (troika) suspends forever in jsdom and <Billboard> just wraps
// children in a group irrelevant to this assertion — both stubbed the same
// way world-scene.smoke.test.tsx stubs them. Stores are mocked wholesale:
// this test only cares that two sim bots (one Working, one
// WaitingForPermission) turn into two robots with the right status bulb.
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Agent, SessionEvent, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  return {
    ...real,
    Text: () => null,
    Billboard: ({ children }: { children?: React.ReactNode }) => <group>{children}</group>,
  };
});

// Speech bubbles (M2 T2): rather than mock the real Tauri event bridge, we
// stub the thin `onEngineEvent` wrapper and hand-fire events at the captured
// handler — the bubble's own SpeechBubble geometry (a RoundedBox, unstubbed
// above) is what proves a bubble mounted.
let engineHandler: ((ev: SessionEvent) => void) | null = null;
vi.mock("@/ipc/events", () => ({
  onEngineEvent: vi.fn((handler: (ev: SessionEvent) => void) => {
    engineHandler = handler;
    return Promise.resolve(() => {});
  }),
}));

function meta(id: string, over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: { provider: "claude", id },
    origin: "Managed",
    project_path: "/tmp/proj",
    model: null,
    status: "Working",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    // useSim() joins against real Date.now() (see use-sim.ts) — a fixed past
    // timestamp would fall outside toCharacters()'s 5-minute active window.
    last_activity_ms: Date.now(),
    ...over,
  };
}

function view(id: string, over: Partial<SessionMeta> = {}): SessionView {
  return {
    key: `claude:${id}`,
    meta: meta(id, over),
    binding: null,
    agent: null,
    room: null,
    displayName: id,
  };
}

const VIEWS: SessionView[] = [
  view("working", { status: "Working" }),
  view("waiting", { status: "WaitingForPermission" }),
];

vi.mock("@/stores/sessions", () => ({
  useSessionsView: () => VIEWS,
  useSessionsStore: { getState: () => ({ init: vi.fn() }) },
  sessionKey: (id: { provider: string; id: string }) => `${id.provider}:${id.id}`,
}));
vi.mock("@/stores/agents", () => ({
  useAgentsStore: Object.assign((selector: (s: { agents: Agent[] }) => unknown) => selector({ agents: [] }), {
    getState: () => ({ init: vi.fn() }),
  }),
}));
vi.mock("@/stores/bindings", () => ({
  useBindingsStore: { getState: () => ({ init: vi.fn() }) },
}));
vi.mock("@/stores/projects", () => ({
  useProjectsStore: { getState: () => ({ load: vi.fn() }) },
}));

import { Characters, BULB } from "./Characters";

/** #rrggbb -> 0xrrggbb, matching how three.js normalizes `Color.set()` input. */
function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

describe("Characters smoke", () => {
  it("mounts one robot per sim bot, colored by status", async () => {
    const renderer = await ReactThreeTestRenderer.create(<Characters />);
    // A few sim ticks so both bots settle into their status motion (raise-hand
    // needs a tick past spawn; walk-in-to-desk needs several) before we assert.
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(20, 0.1);
    });

    const meshes = renderer.scene.findAllByType("Mesh");
    // 2 robots * >=14 meshes each (see robot.smoke.test.tsx) — comfortably 28.
    expect(meshes.length).toBeGreaterThanOrEqual(28);

    const bulbColors = new Set(
      renderer.scene
        .findAllByType("MeshToonMaterial")
        .map((m) => (m.instance as unknown as { color?: { getHex: () => number } }).color?.getHex())
        .filter((c): c is number => c === hex(BULB.Working) || c === hex(BULB.WaitingForPermission)),
    );
    expect(bulbColors.has(hex(BULB.Working))).toBe(true);
    expect(bulbColors.has(hex(BULB.WaitingForPermission))).toBe(true);

    await renderer.unmount();
  });

  it("stays bubble-free until an AssistantText event arrives, then floats one", async () => {
    engineHandler = null;
    const renderer = await ReactThreeTestRenderer.create(<Characters />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(20, 0.1);
    });
    // Flush the hook's onEngineEvent().then(...) microtask so it captures the handler.
    await ReactThreeTestRenderer.act(async () => {
      await Promise.resolve();
    });
    expect(engineHandler).not.toBeNull();

    const before = renderer.scene.findAllByType("Mesh").length;

    const event: SessionEvent = {
      type: "Item",
      data: {
        id: { provider: "claude", id: "working" },
        seq: 1,
        item: { kind: "AssistantText", data: { text: "hello crew", ts: 0 } } as never,
      },
    };
    await ReactThreeTestRenderer.act(async () => {
      engineHandler!(event);
    });

    const after = renderer.scene.findAllByType("Mesh").length;
    expect(after).toBeGreaterThan(before); // the bubble's RoundedBox backdrop mounted

    await renderer.unmount();
  });
});
