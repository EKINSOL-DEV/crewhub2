// Board panel tests (T10, EKI-93): Quiet Board, columns from store, the
// quick-move menu (the non-drag path ships FIRST, D-M3-1), optimistic
// rollback, the drawer timeline with actor badges and the HQ view.
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { useState } from "react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import BoardPanel from "@/panels/board/BoardPanel";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { useTasksStore } from "@/stores/tasks";
import { agent, project, room, task, taskEvent } from "./fixtures";

function Host({ initial = {} }: { initial?: Record<string, string> }) {
  const [params, setParams] = useState<Record<string, string>>(initial);
  return <BoardPanel leafId="leaf-1" params={params} setParams={setParams} />;
}

type IpcHandlers = Record<string, (args: unknown) => unknown>;

function mockBoardIPC(handlers: IpcHandlers = {}) {
  mockIPC((cmd, args) => {
    if (cmd in handlers) return handlers[cmd]!(args);
    if (cmd === "list_tasks") return [];
    if (cmd === "list_agents" || cmd === "list_rooms" || cmd === "list_session_bindings") return [];
    if (cmd === "list_all_sessions" || cmd === "list_task_events") return [];
    return null;
  });
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

test("Quiet Board: per-column whispers when the whole board is empty", async () => {
  mockBoardIPC();
  render(<Host />);
  await screen.findByTestId("whisper-todo");
  expect(screen.getByTestId("whisper-todo")).toHaveTextContent("🧹 nothing to do…");
  expect(screen.getByTestId("whisper-in_progress")).toHaveTextContent("😴 nobody's busy");
});

test("renders seeded tasks into their columns with chips; blocked column flares", async () => {
  mockBoardIPC({
    list_tasks: () => [
      task({ id: "t1", title: "Fix the flaky test", status: "todo", priority: "urgent", room_id: "r1" }),
      task({ id: "t2", title: "Ship it", status: "blocked", room_id: "r1" }),
    ],
    list_rooms: () => [room({ id: "r1", name: "Workshop" })],
  });
  render(<Host />);
  const todo = await screen.findByTestId("board-column-todo");
  expect(within(todo).getByText("Fix the flaky test")).toBeInTheDocument();
  expect(within(todo).getByTestId("priority-chip")).toHaveTextContent("🚨 urgent");
  expect(within(todo).getByTestId("room-chip")).toHaveTextContent("Workshop");
  const blocked = screen.getByTestId("board-column-blocked");
  expect(within(blocked).getByText("Ship it")).toBeInTheDocument();
  expect(screen.getByTestId("blocked-flare")).toBeInTheDocument(); // loud-blocked lesson
  expect(screen.queryByTestId("whisper-todo")).toBeNull();
});

test("quick-move menu moves the card end-to-end (optimistic + IPC)", async () => {
  const updates: Array<{ id: string; status: string }> = [];
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "todo" })],
    update_task: (args) => {
      const t = (args as { task: ReturnType<typeof task> }).task;
      updates.push({ id: t.id, status: t.status });
      return t;
    },
  });
  render(<Host />);
  await screen.findByText("Fix it");
  fireEvent.click(screen.getByTestId("quick-move-t1"));
  fireEvent.click(screen.getByRole("menuitem", { name: /move to in progress/i }));
  const inProgress = screen.getByTestId("board-column-in_progress");
  expect(within(inProgress).getByText("Fix it")).toBeInTheDocument(); // optimistic
  await waitFor(() => expect(updates).toEqual([{ id: "t1", status: "in_progress" }]));
});

test("failed move rolls back and apologizes", async () => {
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "todo" })],
    update_task: () => {
      throw "db locked";
    },
  });
  render(<Host />);
  await screen.findByText("Fix it");
  fireEvent.click(screen.getByTestId("quick-move-t1"));
  fireEvent.click(screen.getByRole("menuitem", { name: /mark blocked/i }));
  await screen.findByText(/couldn't move that/);
  const todo = screen.getByTestId("board-column-todo");
  expect(within(todo).getByText("Fix it")).toBeInTheDocument(); // rolled back
});

test("card click opens the drawer: timeline shows created/status_changed with actor badges", async () => {
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "in_progress" })],
    list_agents: () => [agent({ id: "ag-1", name: "Botje", icon: "🦾" })],
    list_task_events: () => [
      taskEvent({ id: "e1", task_id: "t1", event_type: "created", actor: "human" }),
      taskEvent({
        id: "e2",
        task_id: "t1",
        event_type: "status_changed",
        actor: "agent:ag-1",
        payload_json: JSON.stringify({ from: "todo", to: "in_progress" }),
      }),
    ],
  });
  render(<Host />);
  fireEvent.click(await screen.findByTestId("task-card-t1"));
  const timeline = await screen.findByTestId("task-timeline");
  await within(timeline).findByText(/created this task/);
  expect(within(timeline).getByText(/moved To do → In progress/)).toBeInTheDocument();
  const badges = within(timeline).getAllByTestId("actor-badge");
  expect(badges[0]).toHaveTextContent("🧑 you");
  expect(badges[1]).toHaveTextContent("Botje");
  expect(badges[1]).toHaveTextContent("via MCP 🔧"); // honest badge (D-M3-4)
});

test("create dialog refuses a roomless task (the v1 room_id lesson)", async () => {
  mockBoardIPC();
  render(<Host />);
  fireEvent.click(await screen.findByTestId("new-task"));
  fireEvent.change(screen.getByLabelText("New task title"), { target: { value: "Roomless" } });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
  await screen.findByText(/needs a room/);
});

test("create dialog files the task into the selected room", async () => {
  const created: unknown[] = [];
  mockBoardIPC({
    list_rooms: () => [room({ id: "r1", name: "Workshop", project_id: "p1" })],
    create_task: (args) => {
      const input = (args as { input: Record<string, unknown> }).input;
      created.push(input);
      return task({ id: "t-new", title: String(input.title), room_id: "r1", project_id: "p1" });
    },
  });
  render(<Host />);
  fireEvent.click(await screen.findByTestId("new-task"));
  fireEvent.change(screen.getByLabelText("New task title"), { target: { value: "Hello" } });
  fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
  await waitFor(() => expect(created).toHaveLength(1));
  expect(created[0]).toMatchObject({ title: "Hello", room_id: "r1", project_id: "p1" });
  await screen.findByText("Hello"); // appears on the board without waiting for an event
});

test("HQ view shows the project chip; room filter narrows", async () => {
  useProjects.setState({
    projects: [project({ id: "p1", folder_path: "/w/p1", name: "Rocket", color: "#ff0000" })],
    loaded: true,
  });
  mockBoardIPC({
    list_tasks: () => [
      task({ id: "t1", title: "In rocket", project_id: "p1", room_id: "r1" }),
      task({ id: "t2", title: "Elsewhere", project_id: null, room_id: "r2" }),
    ],
    list_rooms: () => [room({ id: "r1", name: "Bay" }), room({ id: "r2", name: "Attic" })],
  });
  render(<Host initial={{ hq: "1" }} />);
  await screen.findByText("In rocket");
  expect(screen.getByTestId("hq-toggle")).toHaveTextContent("🌐 all projects");
  expect(screen.getByTestId("project-chip")).toHaveTextContent("Rocket");

  fireEvent.change(screen.getByLabelText("Room filter"), { target: { value: "r2" } });
  await waitFor(() => expect(screen.queryByText("In rocket")).toBeNull());
  expect(screen.getByText("Elsewhere")).toBeInTheDocument();
});
