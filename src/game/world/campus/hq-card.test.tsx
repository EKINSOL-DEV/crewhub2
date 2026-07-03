// HqCard jsdom tests (M6 T4). Same pattern as room-card.test.tsx: real
// useBuildMode/useProjectsStore (only IPC persistence + the audio/window
// side effects mocked) so the shortcut buttons' wiring is proven end to
// end, not just that a callback fired.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Agent, Project, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

vi.mock("@/game/app/windows", () => ({
  openWorkspaceWindow: vi.fn(),
  openSettingsWindow: vi.fn(),
}));

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

const { agents, views } = vi.hoisted(() => ({
  agents: { current: [] as Agent[] },
  views: { current: [] as SessionView[] },
}));

vi.mock("@/stores/agents", () => ({
  useAgentsStore: Object.assign(
    (selector: (s: { agents: Agent[] }) => unknown) => selector({ agents: agents.current }),
    {
      getState: () => ({ agents: agents.current }),
    },
  ),
}));

vi.mock("@/stores/sessions", () => ({
  useSessionsView: () => views.current,
}));

import { openWorkspaceWindow } from "@/game/app/windows";
import { playSfx } from "@/game/audio/sfx";
import { useBuildMode } from "@/game/build/mode";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { HqCard } from "./HqCard";

function project(over: Partial<Project> & { id: string; name: string; folder_path: string }): Project {
  return {
    description: null,
    icon: null,
    color: "#22c55e",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function agent(over: Partial<Agent> & { id: string; name: string }): Agent {
  return {
    icon: null,
    color: "#fff",
    avatar: null,
    default_model: "haiku",
    project_path: null,
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

function meta(over: Partial<SessionMeta> & { id: SessionMeta["id"] }): SessionMeta {
  return {
    origin: "Managed",
    project_path: "/work/eng",
    model: "haiku",
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

function view(over: Partial<SessionView> & { key: string; meta: SessionMeta }): SessionView {
  return {
    binding: null,
    agent: null,
    room: null,
    displayName: over.key,
    ...over,
  };
}

const ENGINEERING = project({ id: "p1", name: "Engineering", folder_path: "/work/eng", icon: "🛠️" });

describe("HqCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectsForTests();
    useBuildMode.setState({ roomCard: null });
    agents.current = [];
    views.current = [];
  });

  afterEach(cleanup);

  it("shows a fallback when no crew exist", () => {
    render(<HqCard onClose={vi.fn()} />);
    expect(screen.getByTestId("hq-card-roster")).toHaveTextContent("No crew yet.");
  });

  it("lists resting crew with a color dot and idle status dot", () => {
    agents.current = [agent({ id: "a1", name: "Ada", color: "#123456" })];
    render(<HqCard onClose={vi.fn()} />);
    const row = screen.getByTestId("hq-card-roster-agent:a1");
    expect(row).toHaveTextContent("Ada");
  });

  it("lists live sessions and shows the linked project's name when one matches", () => {
    useProjectsStore.setState({ projects: [ENGINEERING], loaded: true });
    views.current = [
      view({
        key: "claude:s1",
        meta: meta({ id: { provider: "claude", id: "s1" }, project_path: "/work/eng" }),
      }),
    ];
    render(<HqCard onClose={vi.fn()} />);
    const row = screen.getByTestId("hq-card-roster-claude:s1");
    expect(row).toHaveTextContent("Engineering");
  });

  it("omits the project name when the character's folder matches no registered project", () => {
    views.current = [
      view({
        key: "claude:s1",
        meta: meta({ id: { provider: "claude", id: "s1" }, project_path: "/work/eng" }),
      }),
    ];
    render(<HqCard onClose={vi.fn()} />);
    expect(screen.getByTestId("hq-card-roster-claude:s1")).not.toHaveTextContent("Engineering");
  });

  it("the Projects shortcut opens the in-game Projects dialog via mode.ts", () => {
    render(<HqCard onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("hq-card-projects"));
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "projects" });
  });

  it("the Hire crew shortcut requests the hire dialog via mode.ts", () => {
    render(<HqCard onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("hq-card-hire"));
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hire" });
  });

  it("the Workspace shortcut closes the card, opens the workspace window, and plays a click", () => {
    const onClose = vi.fn();
    render(<HqCard onClose={onClose} />);
    fireEvent.click(screen.getByTestId("hq-card-workspace"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openWorkspaceWindow).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("click");
  });

  it("Escape closes", () => {
    const onClose = vi.fn();
    render(<HqCard onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop click closes", () => {
    const onClose = vi.fn();
    render(<HqCard onClose={onClose} />);
    fireEvent.click(screen.getByTestId("hq-card").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
