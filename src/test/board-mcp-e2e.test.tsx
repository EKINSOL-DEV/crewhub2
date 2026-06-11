// Agent-driven board, component layer (T13, EKI-97 / §3.3b): the board folds
// agent MCP writes through the EXACT same path as human edits — DomainEvent
// TaskChanged ⇒ get_task single-task reconcile (D-M3-2). This test drives the
// store with the same reconciliation a real `mcp__crewhub__create_task` /
// `update_task_status` call produces (the Rust MCP layer is integration-
// tested in src-tauri/src/mcp/tools.rs; the headless fake-claude WDIO
// scenario is the third layer). Attribution renders honestly (D-M3-4).
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { useState } from "react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import BoardPanel from "@/panels/board/BoardPanel";
import { resetProjectsForTests } from "@/app/project-filter";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { useTasksStore } from "@/stores/tasks";
import type { Task, TaskEvent } from "@/ipc/bindings";
import { agent, task, taskEvent } from "./fixtures";

function Host() {
  const [params, setParams] = useState<Record<string, string>>({});
  return <BoardPanel leafId="leaf-1" params={params} setParams={setParams} />;
}

afterEach(() => {
  cleanup();
  clearMocks();
  useTasksStore.getState().reset();
  useAgentsStore.getState().reset();
  useBindingsStore.getState().reset();
  useSessionsStore.getState().reset();
  resetProjectsForTests();
});

/**
 * What the agent "wrote" server-side: get_task and list_task_events answer
 * from here, exactly like the real store would after an MCP mutation.
 */
const serverState: { task: Task | null; events: TaskEvent[] } = { task: null, events: [] };

function mockServer() {
  mockIPC((cmd, args) => {
    if (cmd === "get_task") {
      const id = (args as { id: string }).id;
      return serverState.task && serverState.task.id === id ? serverState.task : null;
    }
    if (cmd === "list_task_events") return serverState.events;
    if (cmd === "list_agents") return [agent({ id: "ag-1", name: "Botje", icon: "🦾" })];
    if (cmd === "list_tasks") return [];
    return [];
  });
}

/** One agent MCP write = one TaskChanged ⇒ one single-task reconcile (G3). */
async function agentWrites(t: Task | null, taskId: string) {
  serverState.task = t;
  await useTasksStore.getState().reconcile(taskId);
}

test("an agent creates and moves a task via MCP: the card appears, moves columns and disappears live", async () => {
  mockServer();
  render(<Host />);
  await screen.findByTestId("whisper-todo"); // board starts quiet

  // mcp__crewhub__create_task (acting_as="ag-1") → TaskChanged
  await agentWrites(
    task({ id: "t-mcp", title: "Filed by Botje", status: "todo", created_by: "agent:ag-1" }),
    "t-mcp",
  );
  const todo = screen.getByTestId("board-column-todo");
  await within(todo).findByText("Filed by Botje");
  expect(within(todo).getByTestId("creator-chip")).toBeInTheDocument(); // honest card chip

  // mcp__crewhub__update_task_status → TaskChanged: card crosses columns live
  await agentWrites(
    task({ id: "t-mcp", title: "Filed by Botje", status: "review", created_by: "agent:ag-1" }),
    "t-mcp",
  );
  const review = screen.getByTestId("board-column-review");
  await within(review).findByText("Filed by Botje");
  expect(within(screen.getByTestId("board-column-todo")).queryByText("Filed by Botje")).toBeNull();

  // deletion reconciles to null → the card drops (same code path)
  await agentWrites(null, "t-mcp");
  await waitFor(() => expect(screen.queryByText("Filed by Botje")).toBeNull());
});

test("agent and human writes are indistinguishable on the board, distinguishable in the timeline", async () => {
  mockServer();
  serverState.events = [
    taskEvent({ id: "e1", task_id: "t-mcp", event_type: "created", actor: "agent:ag-1" }),
    taskEvent({
      id: "e2",
      task_id: "t-mcp",
      event_type: "status_changed",
      actor: "mcp",
      payload_json: JSON.stringify({ from: "todo", to: "in_progress" }),
    }),
    taskEvent({
      id: "e3",
      task_id: "t-mcp",
      event_type: "status_changed",
      actor: "human",
      payload_json: JSON.stringify({ from: "in_progress", to: "done" }),
    }),
  ];
  render(<Host />);
  await screen.findByTestId("whisper-todo");
  await agentWrites(
    task({ id: "t-mcp", title: "Shared card", status: "done", created_by: "agent:ag-1" }),
    "t-mcp",
  );

  fireEvent.click(await screen.findByTestId("task-card-t-mcp"));
  const timeline = await screen.findByTestId("task-timeline");
  const badges = await within(timeline).findAllByTestId("actor-badge");
  // attributed agent: avatar + name + honest "via MCP" badge (D-M3-4)
  expect(badges[0]).toHaveTextContent("🦾");
  expect(badges[0]).toHaveTextContent("Botje");
  expect(badges[0]).toHaveTextContent("via MCP 🔧");
  // unattributed MCP fallback: "an agent", never a claimed identity
  expect(badges[1]).toHaveTextContent("🤖 an agent");
  // the human move renders as plain you — no MCP badge
  expect(badges[2]).toHaveTextContent("🧑 you");
  expect(badges[2]).not.toHaveTextContent("via MCP");
});

test("a concurrent agent move beats an in-flight human move (last-writer, no flicker back)", async () => {
  mockServer();
  let resolveUpdate: (v: unknown) => void = () => {};
  mockIPC((cmd) => {
    if (cmd === "get_task") return serverState.task;
    if (cmd === "update_task") return new Promise((r) => (resolveUpdate = r));
    if (cmd === "list_tasks") return [task({ id: "t1", title: "Contested", status: "todo" })];
    return [];
  });
  render(<Host />);
  await screen.findByText("Contested");

  // human starts an optimistic move to in_progress (IPC hangs)
  void useTasksStore.getState().move("t1", "in_progress");
  await within(screen.getByTestId("board-column-in_progress")).findByText("Contested");

  // an agent moves it to blocked meanwhile — reconcile wins last-writer
  await agentWrites(task({ id: "t1", title: "Contested", status: "blocked" }), "t1");
  await within(screen.getByTestId("board-column-blocked")).findByText("Contested");

  // the human IPC finally settles — the agent's newer write must stay
  resolveUpdate(task({ id: "t1", title: "Contested", status: "in_progress" }));
  await new Promise((r) => setTimeout(r, 0));
  expect(within(screen.getByTestId("board-column-blocked")).getByText("Contested")).toBeInTheDocument();
});
