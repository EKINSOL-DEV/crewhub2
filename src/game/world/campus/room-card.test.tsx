// RoomCard jsdom tests (M5 T4). Real useCampusEdits + useProjectsStore
// (only IPC persistence mocked, same pattern as room-link.test.tsx) so picks
// actually land on the store; sessions/agents are mocked wholesale (per the
// HireDialog dispatch convention) to drive the "crew here" join.
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

import { resetCampusEditsForTests, useCampusEdits } from "@/game/build/store";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { RoomCard } from "./RoomCard";

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
const DESIGN = project({ id: "p2", name: "Design", folder_path: "/work/design", color: "#f59e0b" });

describe("RoomCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    resetProjectsForTests();
    useProjectsStore.setState({ projects: [ENGINEERING, DESIGN], loaded: true });
    agents.current = [];
    views.current = [];
  });

  afterEach(cleanup);

  it("shows Unassigned for a plot with no linked project", () => {
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-card-current")).toHaveTextContent("Unassigned");
  });

  it("shows the linked project's icon, name, and folder for a plot", () => {
    useCampusEdits.getState().setPlotProject(0, "p1");
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={vi.fn()} />);
    const current = screen.getByTestId("room-card-current");
    expect(current).toHaveTextContent("Engineering");
    expect(current).toHaveTextContent("/work/eng");
  });

  it("shows the linked project for a placed building", () => {
    const id = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 8, d: 6 }, null);
    useCampusEdits.getState().setBuildingProject(id, "p2");
    render(<RoomCard target={{ kind: "placed", id }} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-card-current")).toHaveTextContent("Design");
  });

  it("assigning a project via the picker calls setPlotProject", () => {
    render(<RoomCard target={{ kind: "plot", plotIndex: 2 }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("room-card-project-p2"));
    expect(useCampusEdits.getState().edits.plotProjects[2]).toBe("p2");
  });

  it('"No project" unlinks a plot', () => {
    useCampusEdits.getState().setPlotProject(0, "p1");
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("room-card-none"));
    expect(useCampusEdits.getState().edits.plotProjects[0]).toBeUndefined();
  });

  it("assigns a placed building via setBuildingProject", () => {
    const id = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 8, d: 6 }, null);
    render(<RoomCard target={{ kind: "placed", id }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("room-card-project-p1"));
    expect(useCampusEdits.getState().edits.buildings[0]!.projectId).toBe("p1");
  });

  it('"No project" unlinks a placed building', () => {
    const id = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 8, d: 6 }, null);
    useCampusEdits.getState().setBuildingProject(id, "p1");
    render(<RoomCard target={{ kind: "placed", id }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("room-card-none"));
    expect(useCampusEdits.getState().edits.buildings[0]!.projectId).toBeNull();
  });

  it("lists bots whose normalized project path matches the linked project's folder", () => {
    useCampusEdits.getState().setPlotProject(0, "p1");
    agents.current = [
      agent({ id: "a1", name: "Ada", project_path: "/work/eng/" }), // trailing slash, resting (no session)
      agent({ id: "a2", name: "Bo", project_path: "/work/design" }),
    ];
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-card-bot-agent:a1")).toHaveTextContent("Ada");
    expect(screen.queryByTestId("room-card-bot-agent:a2")).toBeNull();
  });

  it("also matches live sessions in the target project's folder", () => {
    useCampusEdits.getState().setPlotProject(0, "p1");
    views.current = [view({ key: "claude:s1", meta: meta({ id: { provider: "claude", id: "s1" } }) })];
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-card-bot-claude:s1")).toBeInTheDocument();
  });

  it("shows a fallback when no bots are assigned", () => {
    useCampusEdits.getState().setPlotProject(0, "p1");
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-card-bots")).toHaveTextContent("No bots here yet.");
  });

  it("Escape closes", () => {
    const onClose = vi.fn();
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Docked side panel (side-panel conversion): there's no backdrop left to
  // click — closing is ✕ (GamePanel's own contract, see game-panel.test.tsx)
  // or Escape (above).
  it("the ✕ button closes", () => {
    const onClose = vi.fn();
    render(<RoomCard target={{ kind: "plot", plotIndex: 0 }} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("game-panel-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
