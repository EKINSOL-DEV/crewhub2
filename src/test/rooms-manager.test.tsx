// Rooms manager + rule editor + auto chip (M3 T8, EKI-87): CRUD round-trips,
// guarded delete with task fate, up/down ordering, live rule preview, and the
// sessions panel's `auto` chip for rule-assigned bindings.
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { resetProjectsForTests } from "@/app/project-filter";
import type { NewRoom, NewRoomRule, Room, RoomRule, Task } from "@/ipc/bindings";
import { RoomsManager } from "@/panels/projects/RoomsManager";
import { SessionsPanel } from "@/panels/sessions/SessionsPanel";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { resetRoomsForTests, useRoomsStore } from "@/stores/rooms";
import { useSessionsStore } from "@/stores/sessions";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { binding, meta, room, seedWorkspace, sid } from "./fixtures";

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  resetRoomsForTests();
  resetProjectsForTests();
  resetWorkspaceForTests();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
});

/** Stateful rooms+rules IPC backend: enough for CRUD round-trips. */
function mockRoomBackend(opts?: { rooms?: Room[]; rules?: RoomRule[]; tasks?: Task[] }) {
  const rooms = [...(opts?.rooms ?? [])];
  const rules = [...(opts?.rules ?? [])];
  const calls: Array<{ cmd: string; args: unknown }> = [];
  let n = 0;
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    switch (cmd) {
      case "list_rooms":
        return [...rooms];
      case "create_room": {
        const input = (args as { input: NewRoom }).input;
        const created = room({
          id: `room-${++n}`,
          name: input.name,
          project_id: input.project_id,
          icon: input.icon,
          color: input.color,
          is_hq: input.is_hq ?? false,
        });
        rooms.push(created);
        return created;
      }
      case "update_room": {
        const next = (args as { room: Room }).room;
        const idx = rooms.findIndex((r) => r.id === next.id);
        if (idx >= 0) rooms[idx] = next;
        return next;
      }
      case "delete_room": {
        const idx = rooms.findIndex((r) => r.id === (args as { id: string }).id);
        if (idx >= 0) rooms.splice(idx, 1);
        return idx >= 0;
      }
      case "list_room_rules":
        // evaluator order: priority desc, oldest→newest (rowid asc)
        return [...rules].sort((a, b) => b.priority - a.priority);
      case "create_room_rule": {
        const input = (args as { input: NewRoomRule }).input;
        const created: RoomRule = {
          id: `rule-${++n}`,
          room_id: input.room_id,
          rule_type: input.rule_type,
          rule_value: input.rule_value,
          priority: input.priority ?? 0,
        };
        rules.push(created);
        return created;
      }
      case "update_room_rule": {
        const next = (args as { rule: RoomRule }).rule;
        const idx = rules.findIndex((r) => r.id === next.id);
        if (idx >= 0) rules[idx] = next;
        return next;
      }
      case "delete_room_rule": {
        const idx = rules.findIndex((r) => r.id === (args as { id: string }).id);
        if (idx >= 0) rules.splice(idx, 1);
        return idx >= 0;
      }
      case "list_tasks":
        return opts?.tasks ?? [];
      case "update_task":
        return (args as { task: Task }).task;
      default:
        return null;
    }
  });
  return { rooms, rules, calls };
}

function task(id: string, roomId: string): Task {
  return {
    id,
    project_id: "p-1",
    room_id: roomId,
    title: id,
    description: null,
    status: "todo",
    priority: "medium",
    assignee_agent_id: null,
    created_by: "human",
    created_at: 0,
    updated_at: 0,
  };
}

test("room CRUD round-trip with HQ badge (EKI-87)", async () => {
  const { calls } = mockRoomBackend();
  render(<RoomsManager projectId="p-1" projectName="Proj" />);
  await useRoomsStore.getState().load();

  fireEvent.click(screen.getByTestId("add-room-p-1"));
  fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "The Lab" } });
  fireEvent.click(screen.getByLabelText(/HQ \(the cross-project home base\)/));
  fireEvent.click(screen.getByText("Add room"));

  await screen.findByText("The Lab");
  expect(screen.getByTitle("HQ — the cross-project home base")).toBeInTheDocument();
  const created = calls.find((c) => c.cmd === "create_room")?.args as { input: NewRoom };
  expect(created.input).toMatchObject({ project_id: "p-1", name: "The Lab", is_hq: true });

  // edit: rename sticks
  fireEvent.click(screen.getByLabelText("Edit The Lab"));
  fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "The Lounge" } });
  fireEvent.click(screen.getByText("Save"));
  await screen.findByText("The Lounge");
});

test("up/down reorder writes sequential sort orders", async () => {
  const { calls } = mockRoomBackend({
    rooms: [
      room({ id: "r-a", name: "Alpha", project_id: "p-1", sort_order: 0 }),
      room({ id: "r-b", name: "Beta", project_id: "p-1", sort_order: 1 }),
    ],
  });
  render(<RoomsManager projectId="p-1" projectName="Proj" />);
  await useRoomsStore.getState().load();
  await screen.findByText("Alpha");

  expect(screen.getByLabelText("Move Alpha up")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Move Beta up"));
  await waitFor(() => {
    const writes = calls.filter((c) => c.cmd === "update_room").map((c) => (c.args as { room: Room }).room);
    expect(writes.map((r) => [r.id, r.sort_order])).toEqual([
      ["r-b", 0],
      ["r-a", 1],
    ]);
  });
  // re-rendered in the new order
  await waitFor(() => {
    const rows = screen.getAllByTestId(/room-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["room-row-r-b", "room-row-r-a"]);
  });
});

test("delete is guarded when tasks reference the room and offers move-first", async () => {
  const { calls } = mockRoomBackend({
    rooms: [
      room({ id: "r-doom", name: "Doomed", project_id: "p-1" }),
      room({ id: "r-safe", name: "Safe", project_id: "p-1", sort_order: 1 }),
    ],
    tasks: [task("t-1", "r-doom"), task("t-2", "r-doom")],
  });
  render(<RoomsManager projectId="p-1" projectName="Proj" />);
  await useRoomsStore.getState().load();
  await screen.findByText("Doomed");

  fireEvent.click(screen.getByLabelText("Delete Doomed"));
  const guard = await screen.findByTestId("room-delete-guard-r-doom");
  await within(guard).findByText(/invisible on every board/);
  expect(within(guard).getByText("2")).toBeInTheDocument();

  fireEvent.change(within(guard).getByLabelText("Move tasks to room"), { target: { value: "r-safe" } });
  fireEvent.click(within(guard).getByText("Move tasks & delete"));

  await waitFor(() => {
    const moved = calls.filter((c) => c.cmd === "update_task").map((c) => (c.args as { task: Task }).task);
    expect(moved.map((t) => [t.id, t.room_id])).toEqual([
      ["t-1", "r-safe"],
      ["t-2", "r-safe"],
    ]);
    expect(calls.some((c) => c.cmd === "delete_room")).toBe(true);
  });
  await waitFor(() => expect(screen.queryByText("Doomed")).toBeNull());
});

test("rule editor: add + edit + delete round-trip, live preview names room and rule", async () => {
  mockRoomBackend({
    rooms: [
      room({ id: "r-lab", name: "Lab", project_id: "p-1" }),
      room({ id: "r-zen", name: "Zen", project_id: "p-1", sort_order: 1 }),
    ],
    rules: [{ id: "rule-zen", room_id: "r-zen", rule_type: "origin", rule_value: "managed", priority: 9 }],
  });
  render(<RoomsManager projectId="p-1" projectName="Proj" />);
  await useRoomsStore.getState().load();
  await screen.findByText("Lab");

  fireEvent.click(screen.getByLabelText("Rules for Lab"));
  const editor = await screen.findByTestId("rule-editor-r-lab");

  // add a path_pattern rule — the documented glob dialect is in the hint
  fireEvent.click(within(editor).getByText("Add rule"));
  fireEvent.change(within(editor).getByLabelText("Rule type"), { target: { value: "path_pattern" } });
  expect(
    within(editor).getByText(/\* matches any run \(even \/\), \? exactly one character/),
  ).toBeInTheDocument();
  fireEvent.change(within(editor).getByLabelText("Rule value"), { target: { value: "/work/crew*" } });
  fireEvent.change(within(editor).getByLabelText("Rule priority"), { target: { value: "5" } });
  fireEvent.click(within(editor).getByText("Add"));
  await waitFor(() => expect(within(editor).getByDisplayValue("/work/crew*")).toBeInTheDocument());

  // live preview: external session under /work/crewhub2 → Lab via the new rule
  fireEvent.change(within(editor).getByLabelText("Test project path"), {
    target: { value: "/work/crewhub2" },
  });
  const result = await within(editor).findByTestId("rule-preview-result");
  expect(result.textContent).toMatch(/lands in Lab/);
  expect(result.textContent).toMatch(/path_pattern · \/work\/crew\*/);

  // cross-room honesty: a managed probe is outranked by Zen's priority-9 rule
  fireEvent.change(within(editor).getByLabelText("Test origin"), { target: { value: "managed" } });
  await waitFor(() =>
    expect(within(editor).getByTestId("rule-preview-result").textContent).toMatch(
      /lands in Zen.*a different room outranks this one/,
    ),
  );

  // no match is honest too
  fireEvent.change(within(editor).getByLabelText("Test origin"), { target: { value: "external" } });
  fireEvent.change(within(editor).getByLabelText("Test project path"), { target: { value: "/elsewhere" } });
  await waitFor(() =>
    expect(within(editor).getByTestId("rule-preview-result").textContent).toMatch(/no rule matches/),
  );

  // delete the rule
  const row = within(editor).getByDisplayValue("/work/crew*").closest("div");
  fireEvent.click(within(row as HTMLElement).getByText("✕"));
  await waitFor(() => expect(within(editor).queryByDisplayValue("/work/crew*")).toBeNull());
});

describe("sessions panel `auto` chip (EKI-87, D-M3-10)", () => {
  const m = meta({ id: sid("sess-auto"), origin: "External", project_path: "/work/crewhub2" });

  function mockSessionsWorld(bindings: ReturnType<typeof binding>[], rules: RoomRule[]) {
    mockIPC((cmd) => {
      if (cmd === "list_all_sessions") return [m];
      if (cmd === "list_session_bindings") return bindings;
      if (cmd === "list_agents") return [];
      if (cmd === "list_rooms") return [room({ id: "r-lab", name: "Lab" })];
      if (cmd === "list_room_rules") return rules;
      return null;
    });
  }

  test("rule-assigned binding shows the chip with the rule tooltip", async () => {
    mockSessionsWorld(
      [binding({ session_id: "sess-auto", room_id: "r-lab" })],
      [{ id: "rule-1", room_id: "r-lab", rule_type: "keyword", rule_value: "crewhub", priority: 0 }],
    );
    render(<SessionsPanel />);
    const chip = await screen.findByTestId("auto-chip-sess-auto");
    expect(chip).toHaveTextContent("auto");
    expect(chip).toHaveAttribute("title", "Routed by rule — keyword · crewhub");
  });

  test("manual binding (named) renders no chip — it is just a normal binding", async () => {
    mockSessionsWorld(
      [binding({ session_id: "sess-auto", room_id: "r-lab", display_name: "My pick" })],
      [{ id: "rule-1", room_id: "r-lab", rule_type: "keyword", rule_value: "crewhub", priority: 0 }],
    );
    render(<SessionsPanel />);
    await screen.findByTestId("session-row-sess-auto");
    expect(screen.queryByTestId("auto-chip-sess-auto")).toBeNull();
  });
});
