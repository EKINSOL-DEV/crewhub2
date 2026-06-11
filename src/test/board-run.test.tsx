// Run-with-agent tests (T12, EKI-95): the prompt envelope (pure), the
// run-or-self fork, capability-driven spawn (haiku default for one-offs,
// D-M2-7), run_started linkage + optimistic in_progress.
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import { RunWithAgentDialog } from "@/panels/board/RunWithAgentDialog";
import { asPermissionMode, buildRunPrompt } from "@/panels/board/run-prompt";
import { useAgentsStore } from "@/stores/agents";
import { useTasksStore } from "@/stores/tasks";
import { agent, project, room, task } from "./fixtures";

afterEach(() => {
  cleanup();
  clearMocks();
  useTasksStore.getState().reset();
  useAgentsStore.getState().reset();
  resetProjectsForTests();
});

// ── buildRunPrompt (pure, D-M3-6) ────────────────────────────────────────────

test("buildRunPrompt carries id/title/priority/room, description and the acting_as instruction", () => {
  const p = buildRunPrompt(
    task({ id: "t-9", title: "Fix the flaky test", priority: "high", description: "It flakes on CI." }),
    room({ id: "r1", name: "Workshop" }),
    "ag-1",
  );
  expect(p).toContain('CrewHub task t-9 — "Fix the flaky test" (priority high, room Workshop)');
  expect(p).toContain("It flakes on CI.");
  expect(p).toContain('mcp__crewhub__update_task_status (task_id="t-9", acting_as="ag-1")');
  expect(p).toContain('move it to "review" when you believe it is done');
});

test("buildRunPrompt one-off variant omits acting_as (nothing to attribute to)", () => {
  const p = buildRunPrompt(task({ id: "t-9" }), null, null);
  expect(p).not.toContain("acting_as");
  expect(p).toContain('update_task_status (task_id="t-9")');
});

test("asPermissionMode maps unknown strings to Default", () => {
  expect(asPermissionMode("Plan")).toBe("Plan");
  expect(asPermissionMode("yolo")).toBe("Default");
  expect(asPermissionMode(null)).toBe("Default");
});

// ── Dialog flows ─────────────────────────────────────────────────────────────

interface SpawnCall {
  providerId: string;
  spec: Record<string, unknown>;
}

function setupIPC(spawns: SpawnCall[], calls: Array<{ cmd: string; args: unknown }>) {
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "provider_caps") {
      return [{ provider: "claude-code", caps: { spawn: true } }];
    }
    if (cmd === "spawn_session") {
      spawns.push(args as unknown as SpawnCall);
      return { provider: "claude-code", id: "sess-1" };
    }
    if (cmd === "update_task") return (args as { task: ReturnType<typeof task> }).task;
    if (cmd === "list_projects") return [project({ id: "p1", folder_path: "/work/p1", name: "P1" })];
    return null;
  });
}

function seed(t: ReturnType<typeof task>) {
  useTasksStore.getState().dispatch({ kind: "seed", tasks: [t] });
  useProjects.setState({
    projects: [project({ id: "p1", folder_path: "/work/p1", name: "P1" })],
    loaded: true,
  });
}

test("one-off run: haiku default in the spawn spec, run_started linkage, optimistic in_progress", async () => {
  const spawns: SpawnCall[] = [];
  const calls: Array<{ cmd: string; args: unknown }> = [];
  setupIPC(spawns, calls);
  const t = task({ id: "t1", title: "Fix it", status: "todo", project_id: "p1" });
  seed(t);

  render(
    <RunWithAgentDialog
      task={t}
      room={room({ id: "r1", name: "Bay" })}
      onClose={() => {}}
      onError={() => {}}
    />,
  );
  fireEvent.click(screen.getByTestId("choose-run"));
  // no agents seeded → one-off is the selection; model picker shows haiku
  expect(screen.getByTestId("model-haiku")).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByTestId("run-spawn"));

  await waitFor(() => expect(spawns).toHaveLength(1));
  expect(spawns[0]!.spec).toMatchObject({
    project_path: "/work/p1",
    model: "haiku",
    agent_id: null,
    permission_mode: "Default",
  });
  expect(String(spawns[0]!.spec.prompt)).toContain("CrewHub task t1");

  await waitFor(() => expect(calls.some((c) => c.cmd === "record_task_run_started")).toBe(true));
  expect(useTasksStore.getState().byId.get("t1")!.status).toBe("in_progress"); // optimistic
  expect(useTasksStore.getState().links["t1"]).toMatchObject({ agentId: null });
});

test("agent-bound run: agent model/permission_mode/agent_id in the spec, acting_as in the prompt", async () => {
  const spawns: SpawnCall[] = [];
  const calls: Array<{ cmd: string; args: unknown }> = [];
  setupIPC(spawns, calls);
  useAgentsStore.setState({
    agents: [agent({ id: "ag-1", name: "Botje", default_model: "sonnet", permission_mode: "AcceptEdits" })],
    loaded: true,
  });
  const t = task({ id: "t1", status: "todo", project_id: "p1" });
  seed(t);

  render(<RunWithAgentDialog task={t} room={null} onClose={() => {}} onError={() => {}} />);
  fireEvent.click(screen.getByTestId("choose-run"));
  // bound agent is preselected; the prompt preview teaches acting_as
  expect((screen.getByLabelText("Run prompt") as HTMLTextAreaElement).value).toContain('acting_as="ag-1"');
  fireEvent.click(screen.getByTestId("run-spawn"));

  await waitFor(() => expect(spawns).toHaveLength(1));
  expect(spawns[0]!.spec).toMatchObject({
    model: "sonnet",
    agent_id: "ag-1",
    permission_mode: "AcceptEdits",
  });
  expect(useTasksStore.getState().links["t1"]).toMatchObject({ agentId: "ag-1", agentName: "Botje" });
});

test("'do it myself' just moves the card to in_progress — no spawn", async () => {
  const spawns: SpawnCall[] = [];
  const calls: Array<{ cmd: string; args: unknown }> = [];
  setupIPC(spawns, calls);
  const t = task({ id: "t1", status: "todo", project_id: "p1" });
  seed(t);
  const closed: boolean[] = [];

  render(<RunWithAgentDialog task={t} room={null} onClose={() => closed.push(true)} onError={() => {}} />);
  fireEvent.click(screen.getByTestId("choose-self"));

  await waitFor(() => expect(closed).toEqual([true]));
  expect(useTasksStore.getState().byId.get("t1")!.status).toBe("in_progress");
  expect(spawns).toHaveLength(0);
  expect(calls.some((c) => c.cmd === "record_task_run_started")).toBe(false);
});

test("editable prompt preview: edits survive and ride the spawn spec", async () => {
  const spawns: SpawnCall[] = [];
  setupIPC(spawns, []);
  const t = task({ id: "t1", status: "todo", project_id: "p1" });
  seed(t);

  render(<RunWithAgentDialog task={t} room={null} onClose={() => {}} onError={() => {}} />);
  fireEvent.click(screen.getByTestId("choose-run"));
  fireEvent.change(screen.getByLabelText("Run prompt"), { target: { value: "custom marching orders" } });
  fireEvent.click(screen.getByTestId("run-spawn"));
  await waitFor(() => expect(spawns).toHaveLength(1));
  expect(spawns[0]!.spec.prompt).toBe("custom marching orders");
});
