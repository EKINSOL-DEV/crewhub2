// M4 T2: the flavor ticker (who/when it asks for a thought), the
// speech-vs-thought precedence in Characters (speech always wins), and the
// HUD's 💭 run-count chip. `@/game/flavor/engine` is mocked wholesale below
// — real Haiku runs have no place in a unit test, and every other test file
// touching this feature (engine.test.ts) already covers the store itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Agent, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import type { Character } from "@/game/sim/characters";
import { HudOverlay } from "@/game/hud/HudOverlay";
import { useFlavorTicker } from "./use-flavor-ticker";

const { mockInit, mockMaybeThink, mockThoughts } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockMaybeThink: vi.fn(),
  mockThoughts: {} as Record<string, { text: string; ts: number }>,
}));

const MOCK_THOUGHT_TTL_MS = 30_000;

vi.mock("@/game/flavor/engine", () => ({
  useFlavor: Object.assign(
    (selector: (s: { thoughts: Record<string, { text: string; ts: number }> }) => unknown) =>
      selector({ thoughts: mockThoughts }),
    {
      getState: () => ({
        init: mockInit,
        maybeThink: mockMaybeThink,
        thoughts: mockThoughts,
        runs: 0,
        enabled: true,
      }),
    },
  ),
  // Mirrors engine.ts's real thoughtFor closely enough for the precedence
  // test below — a pure TTL-filtered read off the same mocked thoughts map.
  thoughtFor: (key: string, nowMs: number) => {
    const t = mockThoughts[key];
    if (!t || nowMs - t.ts > MOCK_THOUGHT_TTL_MS) return null;
    return t;
  },
}));

function character(overrides: Partial<Character> = {}): Character {
  return {
    key: "claude:abc",
    name: "Ada",
    status: "Working",
    activity: "refactoring the parser",
    color: "#fff",
    isSubagent: false,
    parentKey: null,
    agentId: null,
    ...overrides,
  };
}

describe("useFlavorTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInit.mockClear();
    mockMaybeThink.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls init once on mount when enabled", () => {
    renderHook(() => useFlavorTicker([character()], true));
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled — no init, no maybeThink even after 15s", () => {
    renderHook(() => useFlavorTicker([character()], false));
    expect(mockInit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(15_000));
    expect(mockMaybeThink).not.toHaveBeenCalled();
  });

  it("calls maybeThink only for Working/WaitingForInput characters, every 15s", () => {
    const chars = [
      character({ key: "a", status: "Working" }),
      character({ key: "b", status: "WaitingForInput" }),
      character({ key: "c", status: "WaitingForPermission" }),
      character({ key: "d", status: "Idle" }),
    ];
    renderHook(() => useFlavorTicker(chars, true));
    expect(mockMaybeThink).not.toHaveBeenCalled(); // the interval hasn't fired yet

    act(() => vi.advanceTimersByTime(15_000));
    expect(mockMaybeThink).toHaveBeenCalledTimes(2);
    const calledKeys = mockMaybeThink.mock.calls.map((call) => (call[0] as Character).key).sort();
    expect(calledKeys).toEqual(["a", "b"]);
  });

  it("stops ticking once unmounted", () => {
    const { unmount } = renderHook(() => useFlavorTicker([character()], true));
    unmount();
    act(() => vi.advanceTimersByTime(30_000));
    expect(mockMaybeThink).not.toHaveBeenCalled();
  });

  it("keeps the 15s interval running across characters reference changes (regression)", () => {
    // The sessions store replaces its state (and so `characters`' array
    // identity) sub-second while a session is actively Working — this
    // reproduces that by handing the hook a brand-new array, same content,
    // on every rerender, well inside the 15s window.
    const { rerender } = renderHook(({ chars }: { chars: Character[] }) => useFlavorTicker(chars, true), {
      initialProps: { chars: [character()] },
    });

    for (let i = 0; i < 5; i++) {
      act(() => vi.advanceTimersByTime(2_000));
      rerender({ chars: [character()] });
    }
    // 10s have elapsed in 2s slices, each followed by a fresh array
    // reference — if the interval reset on every reference change (the
    // bug), it would never fire.
    expect(mockMaybeThink).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5_000)); // crosses the 15s mark
    expect(mockMaybeThink).toHaveBeenCalledTimes(1);
  });
});

describe("HudOverlay flavor chip", () => {
  it("hides the chip when runs is 0", () => {
    render(<HudOverlay fps={60} bots={3} runs={0} onHire={vi.fn()} />);
    expect(screen.queryByText(/💭/)).not.toBeInTheDocument();
  });

  it("shows the run count when runs is greater than 0", () => {
    render(<HudOverlay fps={60} bots={3} runs={7} onHire={vi.fn()} />);
    expect(screen.getByText("💭 7")).toBeInTheDocument();
  });
});

// --- Speech-vs-thought precedence in Characters -----------------------

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  return {
    ...real,
    Text: () => null,
    Billboard: ({ children }: { children?: React.ReactNode }) => <group>{children}</group>,
  };
});

// SpeechBubble/ThoughtBubble are swapped for tagged markers — geometry
// counting (as characters.smoke.test.tsx does for a single bubble) doesn't
// distinguish "which bubble" cleanly once both are in play.
vi.mock("@/game/chat/SpeechBubble", () => ({
  SpeechBubble: ({ text }: { text: string }) => <group name={`speech:${text}`} />,
}));
vi.mock("@/game/flavor/ThoughtBubble", () => ({
  ThoughtBubble: ({ text }: { text: string }) => <group name={`thought:${text}`} />,
}));

vi.mock("@/game/chat/use-speech-bubbles", () => ({
  useGameSpeechBubbles: () => ({ "claude:both": { text: "hello crew", ts: 0 } }),
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
  view("both", { status: "Working" }),
  view("onlyThought", { status: "Working" }),
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
  // M5 T5: use-sim.ts now reads useProjectsStore(selector) (folderByProjectId
  // join), not just .getState() — mirrors the useAgentsStore mock above.
  useProjectsStore: Object.assign(
    (selector: (s: { projects: import("@/ipc/bindings").Project[] }) => unknown) =>
      selector({ projects: [] }),
    { getState: () => ({ load: vi.fn() }) },
  ),
}));

import { Characters } from "@/game/characters/Characters";

describe("thought/speech precedence in Characters", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockThoughts)) delete mockThoughts[k];
    // Fresh (well within the 30s TTL) thoughts for both bots.
    mockThoughts["claude:both"] = { text: "pondering something", ts: Date.now() };
    mockThoughts["claude:onlyThought"] = { text: "quietly wondering", ts: Date.now() };
  });

  it("shows speech over thought when both are present, and thought alone otherwise", async () => {
    const renderer = await ReactThreeTestRenderer.create(<Characters />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(20, 0.1);
    });

    const speechMarkers = renderer.scene.findAll(
      (n) => typeof n.props.name === "string" && n.props.name.startsWith("speech:"),
    );
    const thoughtMarkers = renderer.scene.findAll(
      (n) => typeof n.props.name === "string" && n.props.name.startsWith("thought:"),
    );

    // "both" has speech + thought — speech wins, no thought bubble for it.
    expect(speechMarkers).toHaveLength(1);
    // "onlyThought" has no speech — its thought bubble shows.
    expect(thoughtMarkers).toHaveLength(1);
    expect(thoughtMarkers[0]?.props.name).toBe("thought:quietly wondering");

    await renderer.unmount();
  });
});
