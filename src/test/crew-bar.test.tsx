import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { ProviderCaps } from "@/ipc/bindings";
import { CrewBar } from "@/panels/crew/CrewBar";
import { agentLiveSessions, agentStatus, agentSpawnSpec } from "@/panels/crew/crew-status";
import { pickSpawnProvider, useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { joinSessionsView, sessionKey, useSessionsStore } from "@/stores/sessions";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { agent, binding, chatLeaves, meta, seedWorkspace, sid } from "./fixtures";

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
  resetWorkspaceForTests();
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

describe("pickSpawnProvider (SEAM 4: capability-driven spawn)", () => {
  const caps = (spawn: boolean): ProviderCaps => ({
    spawn,
    resume: false,
    fork: false,
    permissions: false,
    interrupt: false,
    thinking: false,
    subagents: false,
    headless_runs: false,
    hooks: false,
    mcp_registration: false,
  });

  test("picks the first provider with spawn: true", () => {
    expect(
      pickSpawnProvider([
        { provider: "watch-only", caps: caps(false) },
        { provider: "claude-code", caps: caps(true) },
        { provider: "other", caps: caps(true) },
      ]),
    ).toBe("claude-code");
  });

  test("null when no provider can spawn (or the list is empty)", () => {
    expect(pickSpawnProvider([{ provider: "watch-only", caps: caps(false) }])).toBeNull();
    expect(pickSpawnProvider([])).toBeNull();
  });

  test("getSpawnProvider caches the provider_caps round-trip in the agents store", async () => {
    let calls = 0;
    mockIPC((cmd) => {
      if (cmd === "provider_caps") {
        calls++;
        return [{ provider: "fancy", caps: caps(true) }];
      }
      return null;
    });
    expect(await useAgentsStore.getState().getSpawnProvider()).toBe("fancy");
    expect(await useAgentsStore.getState().getSpawnProvider()).toBe("fancy");
    expect(calls).toBe(1);
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

test("spawn from the bar uses the first spawn-capable provider, binds and opens chat", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "list_agents") return [scout];
    if (cmd === "list_all_sessions") return [];
    if (cmd === "list_session_bindings" || cmd === "list_rooms") return [];
    if (cmd === "provider_caps")
      return [
        { provider: "watch-only", caps: { spawn: false } },
        { provider: "fancy-provider", caps: { spawn: true } },
      ];
    if (cmd === "spawn_session") return sid("s-new", "fancy-provider");
    if (cmd === "upsert_session_binding") return binding({ session_id: "s-new", agent_id: "ag-1" });
    return null;
  });
  render(<CrewBar />);
  fireEvent.click(await screen.findByRole("button", { name: "Spawn" }));
  await waitFor(() => expect(chatLeaves()).toHaveLength(1));
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "fancy-provider:s-new" });
  const spawn = calls.find((c) => c.cmd === "spawn_session")?.args as {
    providerId: string;
    spec: { model: string; agent_id: string };
  };
  expect(spawn.providerId).toBe("fancy-provider"); // capability-driven, not hardcoded
  expect(spawn.spec.agent_id).toBe("ag-1");
  const bound = calls.find((c) => c.cmd === "upsert_session_binding")?.args as {
    input: { session_id: string; agent_id: string };
  };
  expect(bound.input).toMatchObject({ session_id: "s-new", agent_id: "ag-1" });
});

test("spawn shows an error when no provider can spawn", async () => {
  const calls: string[] = [];
  mockIPC((cmd) => {
    calls.push(cmd);
    if (cmd === "list_agents") return [scout];
    if (cmd === "list_all_sessions" || cmd === "list_session_bindings" || cmd === "list_rooms") return [];
    if (cmd === "provider_caps") return [{ provider: "watch-only", caps: { spawn: false } }];
    return null;
  });
  render(<CrewBar />);
  fireEvent.click(await screen.findByRole("button", { name: "Spawn" }));
  await waitFor(() => expect(screen.getByTestId("crew-error")).toHaveTextContent(/no.*provider/i));
  expect(calls).not.toContain("spawn_session");
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
