// R3F render smoke (M1 T7): @react-three/test-renderer builds the three.js
// scene graph without a real WebGL context, so this runs under jsdom.
//
// drei's <Text> (troika) suspends forever in jsdom and <Billboard> just wraps
// children in a group irrelevant to this assertion — both stubbed the same
// way world-scene.smoke.test.tsx stubs them. Stores are mocked wholesale:
// this test only cares that two sim bots (one Working, one
// WaitingForPermission) turn into two robots with the right status bulb.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Agent, SessionEvent, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { useBuildMode } from "@/game/build/mode";

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

    // Per-bot, not "any material anywhere": each actor is the CharacterActor
    // root <group> (the same one the click test below isolates by its onClick
    // prop), and within it the bulb is the only MeshToonMaterial that sets
    // `emissive` — body/head/arm materials never do — so it can't collide
    // with a character's body color.
    const actors = renderer.scene.findAll((node) => typeof node.props.onClick === "function");
    expect(actors).toHaveLength(VIEWS.length);
    const bulbColors = actors.map((actor) => {
      const bulb = actor
        .findAllByType("MeshToonMaterial")
        .map((m) => m.instance as unknown as { emissiveIntensity: number; color: { getHex: () => number } })
        .find((m) => m.emissiveIntensity === 0.7);
      return bulb?.color.getHex();
    });
    expect(bulbColors[0]).toBe(hex(BULB.Working)); // VIEWS[0] is the "working" bot
    expect(bulbColors[1]).toBe(hex(BULB.WaitingForPermission)); // VIEWS[1] is "waiting"

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

  // M2 T3: robot click -> onSelect(botKey). @react-three/test-renderer has
  // no real raycaster, but it does expose `fireEvent(instance, "click")`,
  // which invokes whatever `onClick` prop it finds on the target instance —
  // exactly CharacterActor's root <group>. Only that group carries an
  // onClick (Robot's internal body/head/arm groups don't), so filtering on
  // the prop isolates one instance per bot without needing a testid.
  it("clicking a robot's root group calls onSelect with its key", async () => {
    const onSelect = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(<Characters onSelect={onSelect} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(20, 0.1);
    });

    const clickable = renderer.scene.findAll((node) => typeof node.props.onClick === "function");
    expect(clickable).toHaveLength(VIEWS.length);

    await renderer.fireEvent(clickable[0]!, "click");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(VIEWS.map((v) => v.key)).toContain(onSelect.mock.calls[0]?.[0]);

    await renderer.unmount();
  });

  // M4 debt sweep: robot-click vs item tool. A robot standing over open
  // ground sits in front of BuildControls' ground-pick plane along the
  // raycast — without a guard, clicking it while placing decor would also
  // place an item underneath (pointerdown reaching the plane behind it)
  // and open its chat/hire dialog (onSelect), neither of which the player
  // wants mid-placement.
  describe("robot click vs. the item build tool", () => {
    beforeEach(() => {
      useBuildMode.setState({ active: false, tool: { kind: "select" }, pendingRoomLink: null });
    });
    afterEach(() => {
      useBuildMode.setState({ active: false, tool: { kind: "select" }, pendingRoomLink: null });
    });

    it("stops pointerdown from reaching the ground plane beneath the robot", async () => {
      const renderer = await ReactThreeTestRenderer.create(<Characters />);
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(20, 0.1);
      });

      const actor = renderer.scene.findAll((node) => typeof node.props.onClick === "function")[0]!;
      const stopPropagation = vi.fn();
      await renderer.fireEvent(actor, "pointerDown", { stopPropagation });
      expect(stopPropagation).toHaveBeenCalledTimes(1);

      await renderer.unmount();
    });

    it("suppresses onSelect on click while the item tool is actively placing decor", async () => {
      useBuildMode.setState({ active: true, tool: { kind: "item", item: "bush" }, pendingRoomLink: null });
      const onSelect = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(<Characters onSelect={onSelect} />);
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(20, 0.1);
      });

      const actor = renderer.scene.findAll((node) => typeof node.props.onClick === "function")[0]!;
      await renderer.fireEvent(actor, "click");
      expect(onSelect).not.toHaveBeenCalled();

      await renderer.unmount();
    });

    it("still selects normally once build mode is inactive again", async () => {
      useBuildMode.setState({ active: true, tool: { kind: "item", item: "bush" }, pendingRoomLink: null });
      const onSelect = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(<Characters onSelect={onSelect} />);
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(20, 0.1);
      });
      useBuildMode.setState({ active: false, tool: { kind: "select" }, pendingRoomLink: null });

      const actor = renderer.scene.findAll((node) => typeof node.props.onClick === "function")[0]!;
      await renderer.fireEvent(actor, "click");
      expect(onSelect).toHaveBeenCalledTimes(1);

      await renderer.unmount();
    });

    it("still selects normally on the select tool while build mode is active", async () => {
      useBuildMode.setState({ active: true, tool: { kind: "select" }, pendingRoomLink: null });
      const onSelect = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(<Characters onSelect={onSelect} />);
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(20, 0.1);
      });

      const actor = renderer.scene.findAll((node) => typeof node.props.onClick === "function")[0]!;
      await renderer.fireEvent(actor, "click");
      expect(onSelect).toHaveBeenCalledTimes(1);

      await renderer.unmount();
    });
  });
});
