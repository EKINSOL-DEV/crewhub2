import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { CrewBar } from "@/panels/crew/CrewBar";
import { agentLiveSessions, agentStatus, agentSpawnSpec } from "@/panels/crew/crew-status";
import { OPEN_CHAT_EVENT, type OpenChatRequest } from "@/panels/sessions/openChat";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { joinSessionsView, sessionKey, useSessionsStore } from "@/stores/sessions";
import { agent, binding, meta, sid } from "./fixtures";

afterEach(() => {
  cleanup();
  clearMocks();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
});

const scout = agent({ id: "ag-1", name: "Scout", is_pinned: true, project_path: "/work/proj" });
const benched = agent({ id: "ag-2", name: "Benched", is_pinned: false });

describe("crew-status derivations", () => {
  const views = joinSessionsView(
    {
      [sessionKey(sid("s-live"))]: meta({ id: sid("s-live"), status: "Working" }),
      [sessionKey(sid("s-perm"))]: meta({ id: sid("s-perm"), status: "WaitingForPermission" }),
      [sessionKey(sid("s-dead"))]: meta({ id: sid("s-dead"), status: "Ended" }),
    },
    {
      "s-live": binding({ session_id: "s-live", agent_id: "ag-1" }),
      "s-perm": binding({ session_id: "s-perm", agent_id: "ag-1" }),
      "s-dead": binding({ session_id: "s-dead", agent_id: "ag-1" }),
    },
    [scout],
    [],
  );

  test("live sessions exclude Ended; status picks the most attention-worthy", () => {
    const live = agentLiveSessions("ag-1", views);
    expect(live.map((v) => v.meta.id.id).sort()).toEqual(["s-live", "s-perm"]);
    expect(agentStatus(live)).toBe("WaitingForPermission"); // 🙋 wins over 🔨
    expect(agentStatus([])).toBeNull();
  });

  test("spawn spec uses agent defaults and falls back to haiku", () => {
    const spec = agentSpawnSpec({ ...scout, default_model: null });
    expect(spec).toMatchObject({ project_path: "/work/proj", model: "haiku", agent_id: "ag-1" });
    expect(agentSpawnSpec(benched)).toHaveProperty("error");
  });
});

test("crew bar shows only pinned agents and flips critters live on engine events (EKI-36 AC)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_agents") return [scout, benched];
    if (cmd === "list_all_sessions") return [meta({ id: sid("s-1"), status: "Idle" })];
    if (cmd === "list_session_bindings") return [binding({ session_id: "s-1", agent_id: "ag-1" })];
    if (cmd === "list_rooms") return [];
    return null;
  });
  render(<CrewBar />);
  await screen.findByTestId("agent-card-ag-1");
  expect(screen.queryByTestId("agent-card-ag-2")).toBeNull();
  expect(screen.getByTestId("status-emoji").dataset.status).toBe("Idle");

  act(() => {
    useSessionsStore.getState().apply({
      type: "Updated",
      data: { meta: meta({ id: sid("s-1"), status: "WaitingForPermission" }) },
    });
  });
  expect(screen.getByTestId("status-emoji").dataset.status).toBe("WaitingForPermission");

  act(() => {
    useSessionsStore.getState().apply({ type: "Removed", data: { id: sid("s-1") } });
  });
  expect(screen.queryByTestId("status-emoji")).toBeNull(); // off duty
});

test("spawn from the bar binds the new session to the agent and opens chat", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "list_agents") return [scout];
    if (cmd === "list_all_sessions") return [];
    if (cmd === "list_session_bindings" || cmd === "list_rooms") return [];
    if (cmd === "spawn_session") return sid("s-new");
    if (cmd === "upsert_session_binding") return binding({ session_id: "s-new", agent_id: "ag-1" });
    return null;
  });
  const opened: OpenChatRequest[] = [];
  const listener = (e: Event) => opened.push((e as CustomEvent<OpenChatRequest>).detail);
  window.addEventListener(OPEN_CHAT_EVENT, listener);
  try {
    render(<CrewBar />);
    fireEvent.click(await screen.findByRole("button", { name: "Spawn" }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toMatchObject({ id: "s-new", provider: "claude-code" });
    const spawn = calls.find((c) => c.cmd === "spawn_session")?.args as {
      providerId: string;
      spec: { model: string; agent_id: string };
    };
    expect(spawn.providerId).toBe("claude-code");
    expect(spawn.spec.agent_id).toBe("ag-1");
    const bound = calls.find((c) => c.cmd === "upsert_session_binding")?.args as {
      input: { session_id: string; agent_id: string };
    };
    expect(bound.input).toMatchObject({ session_id: "s-new", agent_id: "ag-1" });
  } finally {
    window.removeEventListener(OPEN_CHAT_EVENT, listener);
  }
});

test("stop kills every live bound session", async () => {
  const killed: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_agents") return [scout];
    if (cmd === "list_all_sessions")
      return [meta({ id: sid("s-1"), status: "Working" }), meta({ id: sid("s-2"), status: "Idle" })];
    if (cmd === "list_session_bindings")
      return [
        binding({ session_id: "s-1", agent_id: "ag-1" }),
        binding({ session_id: "s-2", agent_id: "ag-1" }),
      ];
    if (cmd === "list_rooms") return [];
    if (cmd === "kill_session") {
      killed.push((args as { id: { id: string } }).id.id);
      return null;
    }
    return null;
  });
  render(<CrewBar />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
  await waitFor(() => expect(killed.sort()).toEqual(["s-1", "s-2"]));
});
