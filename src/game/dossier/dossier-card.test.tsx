// DossierCard jsdom tests (M9 T2). Stores are mocked wholesale (chat-window/
// hq-card convention) so this is a unit test of the card's rendering/wiring,
// not an integration test of the store stitch (that's data.test.ts's job).
// useBuildMode stays real (it's a tiny, IPC-free store) so the "Forked from"
// re-target can be asserted end to end, same as hq-card.test.tsx does for
// its own shortcut buttons.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Agent, Project, Room, SessionBinding, SessionMeta } from "@/ipc/bindings";
import { registerLiveBots } from "@/game/sim/live-bots";
import type { SimBot } from "@/game/sim/sim";
import type { StoredSessionMeta } from "@/stores/sessions";

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

const {
  sessionsState,
  bindingsState,
  roomsState,
  agentsState,
  projectsState,
  biosState,
  cameraModeState,
  openSpy,
  followBotSpy,
  exitSpy,
  ensureSpy,
  regenerateSpy,
} = vi.hoisted(() => ({
  sessionsState: { current: {} as Record<string, StoredSessionMeta> },
  bindingsState: { current: {} as Record<string, SessionBinding> },
  roomsState: { current: [] as Room[] },
  agentsState: { current: [] as Agent[] },
  projectsState: { current: [] as Project[] },
  biosState: { bios: {} as Record<string, string>, loading: null as string | null },
  // Round 2: ExitZoomButton (GamePanel.tsx) subscribes to camera mode — real
  // mode shape isn't needed here, just enough to drive "active or not".
  cameraModeState: { current: { kind: "free" } as { kind: string } },
  openSpy: vi.fn(),
  followBotSpy: vi.fn(),
  exitSpy: vi.fn(),
  ensureSpy: vi.fn(),
  regenerateSpy: vi.fn(),
}));

// data.ts (real, unmocked) imports `shortId` from this same module — preserve
// the rest of the module and only swap the store hook out.
vi.mock("@/stores/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/sessions")>();
  return {
    ...actual,
    useSessionsStore: Object.assign(
      (selector: (s: { sessions: Record<string, StoredSessionMeta> }) => unknown) =>
        selector({ sessions: sessionsState.current }),
      { getState: () => ({ sessions: sessionsState.current }) },
    ),
  };
});

vi.mock("@/stores/bindings", () => ({
  useBindingsStore: Object.assign(
    (selector: (s: { bindings: Record<string, SessionBinding>; rooms: Room[] }) => unknown) =>
      selector({ bindings: bindingsState.current, rooms: roomsState.current }),
    { getState: () => ({ bindings: bindingsState.current, rooms: roomsState.current }) },
  ),
}));

vi.mock("@/stores/agents", () => ({
  useAgentsStore: Object.assign(
    (selector: (s: { agents: Agent[] }) => unknown) => selector({ agents: agentsState.current }),
    {
      getState: () => ({ agents: agentsState.current }),
    },
  ),
}));

vi.mock("@/stores/projects", () => ({
  useProjectsStore: Object.assign(
    (selector: (s: { projects: Project[] }) => unknown) => selector({ projects: projectsState.current }),
    { getState: () => ({ projects: projectsState.current }) },
  ),
}));

vi.mock("./bio", () => ({
  BIO_DISABLED_PLACEHOLDER: "Flavor text is off, so this one's a mystery for now.",
  useBios: Object.assign(
    (
      selector: (s: {
        bios: Record<string, string>;
        loading: string | null;
        ensure: typeof ensureSpy;
        regenerate: typeof regenerateSpy;
      }) => unknown,
    ) => selector({ ...biosState, ensure: ensureSpy, regenerate: regenerateSpy }),
    { getState: () => ({ ...biosState, ensure: ensureSpy, regenerate: regenerateSpy }) },
  ),
}));

vi.mock("@/game/chat/store", () => ({
  useGameChats: { getState: () => ({ open: openSpy }) },
}));

// Callable (ExitZoomButton's subscription) AND .getState() (the Follow
// footer button, and ExitZoomButton's own exit() call) — same
// Object.assign convention as every other store mock in this file.
vi.mock("@/game/engine/camera/director", () => ({
  useCameraDirector: Object.assign(
    (selector: (s: { mode: { kind: string } }) => unknown) => selector({ mode: cameraModeState.current }),
    { getState: () => ({ followBot: followBotSpy, exit: exitSpy, mode: cameraModeState.current }) },
  ),
}));

import { playSfx } from "@/game/audio/sfx";
import { useBuildMode } from "@/game/build/mode";
import { DossierCard } from "./DossierCard";

function meta(id: string, over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: { provider: "claude", id },
    origin: "Managed",
    project_path: "/tmp/proj",
    model: "sonnet",
    status: "Working",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 128_000, output_tokens: 42_000, cache_read_tokens: 0 },
    git_branch: "main",
    last_activity_ms: Date.now(),
    ...over,
  };
}

function binding(sessionId: string, over: Partial<SessionBinding> = {}): SessionBinding {
  return {
    session_id: sessionId,
    agent_id: null,
    room_id: null,
    display_name: null,
    pinned: false,
    updated_at: 0,
    ...over,
  };
}

function agent(id: string, over: Partial<Agent> = {}): Agent {
  return {
    id,
    name: "Robo",
    icon: null,
    color: "#ff0000",
    avatar: null,
    default_model: "opus",
    project_path: "/tmp/proj",
    permission_mode: "Default",
    system_prompt: null,
    persona_json: null,
    is_pinned: false,
    auto_spawn: false,
    bio: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function room(id: string, over: Partial<Room> = {}): Room {
  return {
    id,
    project_id: null,
    name: "War Room",
    icon: null,
    color: null,
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function project(id: string, over: Partial<Project> = {}): Project {
  return {
    id,
    name: "Crewhub",
    description: null,
    icon: null,
    color: null,
    folder_path: "/tmp/proj",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

beforeEach(() => {
  sessionsState.current = {};
  bindingsState.current = {};
  roomsState.current = [];
  agentsState.current = [];
  projectsState.current = [];
  biosState.bios = {};
  biosState.loading = null;
  cameraModeState.current = { kind: "free" };
  useBuildMode.setState({ roomCard: null });
  vi.mocked(playSfx).mockClear();
  openSpy.mockClear();
  followBotSpy.mockClear();
  exitSpy.mockClear();
  ensureSpy.mockClear();
  regenerateSpy.mockClear();
});

afterEach(() => {
  cleanup();
  registerLiveBots(null);
});

describe("DossierCard", () => {
  it("renders nothing when the key resolves to no data, and auto-closes instead of trapping the slot", () => {
    const onClose = vi.fn();
    const { container } = render(<DossierCard dossierKey="claude:ghost" onClose={onClose} />);
    expect(container).toBeEmptyDOMElement();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // M9 fix round 1: a "Forked from" click can land on a key with no data at
  // all (an unknown/ended parent no longer in the live sessions map) — the
  // card must not sit open-but-invisible forever. Wired through the real
  // mode.ts store (like GameShell does) so "closes" means the single-open
  // slot itself actually clears, not just that a callback fired.
  it("retargeting to an unknown key closes the card and clears mode.ts's single-open slot", () => {
    useBuildMode.getState().openRoomCard({ kind: "dossier", key: "claude:ghost" });
    render(<DossierCard dossierKey="claude:ghost" onClose={() => useBuildMode.getState().closeRoomCard()} />);
    expect(useBuildMode.getState().roomCard).toBeNull();
  });

  it("renders every joined field for a fully-populated bot, and hides rows with no data", () => {
    sessionsState.current = {
      "claude:child": meta("child", { parent: { provider: "claude", id: "parent" } }),
    };
    bindingsState.current = {
      child: binding("child", { agent_id: "ag1", room_id: "r1", display_name: "Ada" }),
    };
    roomsState.current = [room("r1", { name: "The Foundry" })];
    agentsState.current = [
      agent("ag1", { name: "Ada", color: "#7dd3fc", system_prompt: "You are a meticulous refactorer." }),
    ];
    projectsState.current = [project("p1", { name: "Crewhub", folder_path: "/tmp/proj" })];
    const bots = new Map<string, SimBot>([
      [
        "claude:child",
        { key: "claude:child", x: 0, z: 0, facing: 0, motion: "dance", deskId: null, path: [], age: 0 },
      ],
    ]);
    registerLiveBots(bots);

    render(<DossierCard dossierKey="claude:child" onClose={vi.fn()} />);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByTestId("dossier-card-status")).toHaveTextContent("Working");
    expect(screen.getByText("sonnet")).toBeInTheDocument(); // Model
    expect(screen.getByText("Crewhub")).toBeInTheDocument(); // Project
    expect(screen.getByText("/tmp/proj")).toBeInTheDocument(); // Project folder subtitle
    expect(screen.getByText("The Foundry")).toBeInTheDocument(); // Room (explicit binding beats the project-name fallback)
    expect(screen.getByText("main")).toBeInTheDocument(); // Branch
    expect(screen.getByText("128k in · 42k out")).toBeInTheDocument(); // Usage
    expect(screen.getByText("Managed")).toBeInTheDocument(); // Origin
    expect(screen.getByText("claude:parent")).toBeInTheDocument(); // Forked from
    expect(screen.getByText("You are a meticulous refactorer.")).toBeInTheDocument(); // Crew role
    expect(screen.getByText("dancing")).toBeInTheDocument(); // Currently
    expect(screen.getByText(/ago$/)).toBeInTheDocument(); // Status since

    // No activity_detail on this fixture — that row (and its label) must
    // not render at all.
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
  });

  it("hides every info row for a bare-minimum session with nothing joined", () => {
    sessionsState.current = {
      "codex:abcdef1234567890": meta("abcdef1234567890", {
        origin: "External",
        model: null,
        git_branch: null,
      }),
    };
    render(<DossierCard dossierKey="codex:abcdef1234567890" onClose={vi.fn()} />);
    for (const label of ["Model", "Room", "Branch", "Activity", "Forked from", "Crew role", "Currently"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // Usage is always present on a SessionMeta fixture, and Origin/Status
    // since are always populated for a live session — those DO show.
    expect(screen.getByText("Origin")).toBeInTheDocument();
    expect(screen.getByText("External")).toBeInTheDocument();
  });

  it("shows the loading placeholder while the bio hasn't resolved yet", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    expect(screen.getByTestId("dossier-card-bio")).toHaveTextContent("🤖 …");
    expect(ensureSpy).toHaveBeenCalledWith(expect.objectContaining({ key: "claude:s1" }));
  });

  it("shows the resolved bio text once cached", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    biosState.bios = { "claude:s1": "Ada debugs by moonlight." };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    expect(screen.getByTestId("dossier-card-bio")).toHaveTextContent("Ada debugs by moonlight.");
  });

  it("shows a dash when the cached bio is the flavor-disabled placeholder", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    biosState.bios = { "claude:s1": "Flavor text is off, so this one's a mystery for now." };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    expect(screen.getByTestId("dossier-card-bio")).toHaveTextContent("—");
  });

  it("looks the bio up by the bound agent's id, not the session key", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    bindingsState.current = { s1: binding("s1", { agent_id: "ag1" }) };
    agentsState.current = [agent("ag1")];
    biosState.bios = { "agent:ag1": "A bio cached under the crew id." };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    expect(screen.getByTestId("dossier-card-bio")).toHaveTextContent("A bio cached under the crew id.");
  });

  it("the 🔄 button calls regenerate with the current dossier info", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    biosState.bios = { "claude:s1": "stale bio" };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dossier-card-bio-regenerate"));
    expect(regenerateSpy).toHaveBeenCalledWith(expect.objectContaining({ key: "claude:s1" }));
  });

  it("disables the 🔄 button while any bio generation is in flight", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    biosState.bios = { "claude:s1": "stale bio" };
    biosState.loading = "claude:s1";
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    expect(screen.getByTestId("dossier-card-bio-regenerate")).toBeDisabled();
  });

  it("a live session dossier shows Chat, not Hire", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    expect(screen.getByTestId("dossier-card-chat")).toBeInTheDocument();
    expect(screen.queryByTestId("dossier-card-hire")).not.toBeInTheDocument();
  });

  it("the Chat footer button opens the chat for this bot's key", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dossier-card-chat"));
    expect(openSpy).toHaveBeenCalledWith("claude:s1");
  });

  // M9 fix round 1: 💬 Chat is a dead button for resting crew (ChatWindows.tsx
  // filters `agent:`-keyed chats out of its own render), so their dossier
  // shows 👥 Hire instead, preselected to the same agent — the same
  // destination a resting-crew character click already routes to
  // (GameShell.selectCharacter).
  describe("resting crew (agent:-keyed dossier)", () => {
    it("shows Hire, not Chat", () => {
      agentsState.current = [agent("ag1", { name: "Turing" })];
      render(<DossierCard dossierKey="agent:ag1" onClose={vi.fn()} />);
      expect(screen.getByTestId("dossier-card-hire")).toBeInTheDocument();
      expect(screen.queryByTestId("dossier-card-chat")).not.toBeInTheDocument();
    });

    it("clicking Hire opens the hire arm preselected to this agent, and plays a cue", () => {
      agentsState.current = [agent("ag1", { name: "Turing" })];
      render(<DossierCard dossierKey="agent:ag1" onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId("dossier-card-hire"));
      expect(useBuildMode.getState().roomCard).toEqual({ kind: "hire", agentId: "ag1" });
      expect(playSfx).toHaveBeenCalledWith("click");
    });

    it("does not close the card", () => {
      agentsState.current = [agent("ag1", { name: "Turing" })];
      const onClose = vi.fn();
      render(<DossierCard dossierKey="agent:ag1" onClose={onClose} />);
      fireEvent.click(screen.getByTestId("dossier-card-hire"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("the Follow footer button follows this bot's key and plays a cue", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dossier-card-follow"));
    expect(followBotSpy).toHaveBeenCalledWith("claude:s1");
    expect(playSfx).toHaveBeenCalledWith("click");
  });

  it("neither footer button closes the card", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    const onClose = vi.fn();
    render(<DossierCard dossierKey="claude:s1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("dossier-card-chat"));
    fireEvent.click(screen.getByTestId("dossier-card-follow"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking 'Forked from' re-targets the dossier card to the parent's key", () => {
    sessionsState.current = {
      "claude:child": meta("child", { parent: { provider: "claude", id: "parent" } }),
    };
    render(<DossierCard dossierKey="claude:child" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dossier-card-row-forked-from"));
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:parent" });
  });

  it("Escape closes the card", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    const onClose = vi.fn();
    render(<DossierCard dossierKey="claude:s1" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the ✕ button closes the card", () => {
    sessionsState.current = { "claude:s1": meta("s1") };
    const onClose = vi.fn();
    render(<DossierCard dossierKey="claude:s1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Round 2: the shared "🎥 Exit zoom" header action (GamePanel.tsx's
  // ExitZoomButton), only present while the camera is focused/following.
  describe("🎥 Exit zoom header action", () => {
    it("is absent while the camera is free", () => {
      sessionsState.current = { "claude:s1": meta("s1") };
      render(<DossierCard dossierKey="claude:s1" onClose={vi.fn()} />);
      expect(screen.queryByTestId("game-panel-exit-zoom")).not.toBeInTheDocument();
    });

    it("appears while following, and clicking it calls exit() without closing the card itself", () => {
      cameraModeState.current = { kind: "follow" };
      sessionsState.current = { "claude:s1": meta("s1") };
      const onClose = vi.fn();
      render(<DossierCard dossierKey="claude:s1" onClose={onClose} />);
      const button = screen.getByTestId("game-panel-exit-zoom");
      fireEvent.click(button);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      // GameShell's own focus-coupled effect is what closes the card in the
      // real app (see GameShell.tsx) — this unit test only proves the
      // button's own contract: it calls exit(), nothing more.
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("resting crew (agent:-keyed, no live session) render a Resting status chip", () => {
    agentsState.current = [agent("ag1", { name: "Turing" })];
    render(<DossierCard dossierKey="agent:ag1" onClose={vi.fn()} />);
    // "Turing" appears twice (header name + Crew role's name fallback,
    // since this fixture has no system_prompt) — scope to the header.
    expect(screen.getByTestId("dossier-card-header")).toHaveTextContent("Turing");
    expect(screen.getByTestId("dossier-card-status")).toHaveTextContent("Resting");
  });
});
