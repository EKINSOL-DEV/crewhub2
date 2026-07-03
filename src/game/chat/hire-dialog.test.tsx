// HireDialog jsdom tests (M2 T5). Stores/IPC are mocked wholesale (per the
// M2 dispatch), hire.ts itself is real — this exercises the dialog wired to
// the real hire/adopt spec-building + flow logic, the way chat-window.test.tsx
// exercises ChatWindow against mocked stores.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Agent, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";

const { agents, views, spawnSession, getSpawnProvider, upsert } = vi.hoisted(() => ({
  agents: { current: [] as Agent[] },
  views: { current: [] as SessionView[] },
  spawnSession: vi.fn(),
  getSpawnProvider: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/stores/agents", () => ({
  useAgentsStore: Object.assign(
    (selector: (s: { agents: Agent[] }) => unknown) => selector({ agents: agents.current }),
    {
      getState: () => ({ getSpawnProvider }),
    },
  ),
}));

vi.mock("@/stores/bindings", () => ({
  useBindingsStore: { getState: () => ({ upsert }) },
}));

vi.mock("@/stores/sessions", () => ({
  useSessionsView: () => views.current,
}));

vi.mock("@/ipc/bindings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/ipc/bindings")>();
  return { ...real, commands: { ...real.commands, spawnSession } };
});

import { useGameChats } from "./store";
import { HireDialog } from "./HireDialog";

function agent(over: Partial<Agent> & { id: string; name: string }): Agent {
  return {
    icon: null,
    color: "#fff",
    avatar: null,
    default_model: "haiku",
    project_path: "/work/proj",
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
    project_path: "/work/proj",
    model: "haiku",
    status: "Idle",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: 0,
    ...over,
  };
}

const SCOUT = agent({ id: "a-scout", name: "Scout" });

beforeEach(() => {
  agents.current = [SCOUT, agent({ id: "a-nova", name: "Nova" })];
  views.current = [];
  spawnSession.mockReset();
  getSpawnProvider.mockReset();
  upsert.mockReset();
  useGameChats.setState({ chats: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HireDialog", () => {
  it("renders nothing when closed", () => {
    render(<HireDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("hire-dialog")).toBeNull();
  });

  it("lists agents on the hire tab", () => {
    render(<HireDialog open onClose={vi.fn()} />);
    expect(screen.getByTestId("hire-agent-a-scout")).toHaveTextContent("Scout");
    expect(screen.getByTestId("hire-agent-a-nova")).toHaveTextContent("Nova");
  });

  it("preselects the given agent via initialAgentId", () => {
    render(<HireDialog open initialAgentId="a-nova" onClose={vi.fn()} />);
    expect(screen.getByTestId("hire-go")).toHaveTextContent("Hire Nova");
  });

  it("hires the selected agent: spawns, binds, opens the chat, and closes", async () => {
    getSpawnProvider.mockResolvedValue("claude-code");
    spawnSession.mockResolvedValue({ status: "ok", data: { provider: "claude-code", id: "s-new" } });
    upsert.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<HireDialog open initialAgentId="a-scout" onClose={onClose} />);

    fireEvent.click(screen.getByTestId("hire-go"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(spawnSession).toHaveBeenCalledWith(
      "claude-code",
      expect.objectContaining({ agent_id: "a-scout" }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: "s-new", agent_id: "a-scout" }),
    );
    expect(useGameChats.getState().chats).toEqual([{ key: "claude-code:s-new", min: false }]);
  });

  it("shows an inline error and stays open when spawning fails", async () => {
    getSpawnProvider.mockResolvedValue("claude-code");
    spawnSession.mockResolvedValue({ status: "error", error: "no engine" });
    const onClose = vi.fn();
    render(<HireDialog open initialAgentId="a-scout" onClose={onClose} />);

    fireEvent.click(screen.getByTestId("hire-go"));

    expect(await screen.findByTestId("hire-error")).toHaveTextContent("no engine");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adopt tab lists live and takeover-eligible sessions", () => {
    views.current = [
      {
        key: "claude:live-1",
        meta: meta({ id: { provider: "claude", id: "live-1" }, origin: "External", status: "Idle" }),
        binding: null,
        agent: null,
        room: null,
        displayName: "External Rex",
      },
      {
        key: "claude:ended-1",
        meta: meta({ id: { provider: "claude", id: "ended-1" }, origin: "Managed", status: "Ended" }),
        binding: null,
        agent: null,
        room: null,
        displayName: "Ended Fox",
      },
      {
        key: "claude:working-1",
        meta: meta({ id: { provider: "claude", id: "working-1" }, origin: "Managed", status: "Working" }),
        binding: {
          session_id: "working-1",
          agent_id: "a-scout",
          room_id: null,
          display_name: null,
          pinned: false,
          updated_at: 0,
        },
        agent: SCOUT,
        room: null,
        displayName: "Working Owl",
      },
    ];
    render(<HireDialog open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("hire-tab-adopt"));

    expect(screen.getByTestId("adopt-open-claude:live-1")).toBeTruthy();
    expect(screen.getByTestId("adopt-takeover-claude:ended-1")).toBeTruthy();
    expect(screen.getByTestId("adopt-fork-claude:ended-1")).toBeTruthy();
    // A bound, mid-run Managed session isn't actionable here — it already
    // has a robot in the world you can click directly.
    expect(screen.queryByTestId("adopt-row-claude:working-1")).toBeNull();
  });

  it("take over calls spawnSession with resume + fork:false, opens chat, and closes", async () => {
    views.current = [
      {
        key: "claude:ended-1",
        meta: meta({ id: { provider: "claude", id: "ended-1" }, status: "Ended" }),
        binding: null,
        agent: null,
        room: null,
        displayName: "Ended Fox",
      },
    ];
    spawnSession.mockResolvedValue({ status: "ok", data: { provider: "claude", id: "s-resumed" } });
    const onClose = vi.fn();
    render(<HireDialog open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("hire-tab-adopt"));

    fireEvent.click(screen.getByTestId("adopt-takeover-claude:ended-1"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(spawnSession).toHaveBeenCalledWith(
      "claude",
      expect.objectContaining({ resume_session: "ended-1", fork: false }),
    );
    expect(useGameChats.getState().chats).toEqual([{ key: "claude:s-resumed", min: false }]);
  });

  it("open chat on a live session just opens it, without spawning", () => {
    views.current = [
      {
        key: "claude:live-1",
        meta: meta({ id: { provider: "claude", id: "live-1" }, origin: "External", status: "Idle" }),
        binding: null,
        agent: null,
        room: null,
        displayName: "External Rex",
      },
    ];
    const onClose = vi.fn();
    render(<HireDialog open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("hire-tab-adopt"));

    fireEvent.click(screen.getByTestId("adopt-open-claude:live-1"));

    expect(spawnSession).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(useGameChats.getState().chats).toEqual([{ key: "claude:live-1", min: false }]);
  });
});
