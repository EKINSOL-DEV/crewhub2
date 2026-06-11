// Meeting output + action items tests (Lane G T11, EKI-14 part 2 + EKI-19):
// output_md through shared Markdown, honest ended-early states, per-turn
// drill-down at transcript offsets, action-item convert (room picker when the
// meeting has none — the room_id lesson), board deep-link, execute via the M3
// RunWithAgentDialog, and the completion confetti (reduced-motion: skipped).
// Closes with the §3.6 flagship path: output → convert → board → run-with-agent.
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import { useState } from "react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { leaves } from "@/app/layout-tree";
import MeetingsPanel from "@/panels/meetings/MeetingsPanel";
import { ActionItemsList } from "@/panels/meetings/ActionItemsList";
import { MeetingDetail } from "@/panels/meetings/MeetingDetail";
import { MeetingOutput } from "@/panels/meetings/MeetingOutput";
import { useAgentsStore } from "@/stores/agents";
import { useMeetingsStore, useStandupsStore } from "@/stores/meetings";
import { resetProjectsForTests } from "@/stores/projects";
import { resetRoomsForTests, useRoomsStore } from "@/stores/rooms";
import { useSessionsStore } from "@/stores/sessions";
import { useTasksStore } from "@/stores/tasks";
import { useWorkspace } from "@/stores/workspace";
import { agent, project, room, seedWorkspace, task } from "./fixtures";
import { actionItem, meeting, meetingConfigJson, participant, turn } from "./meetings-fixtures";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

function boardLeaves() {
  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return tab ? leaves(tab.root).filter((l) => l.kind === "board") : [];
}

type IpcHandlers = Record<string, (args: unknown) => unknown>;

function mockMeetingsIPC(handlers: IpcHandlers = {}) {
  mockIPC((cmd, args) => {
    if (cmd in handlers) return handlers[cmd]!(args);
    if (cmd === "list_meetings" || cmd === "list_meeting_turns" || cmd === "list_action_items") return [];
    if (cmd === "list_standups" || cmd === "list_standup_entries") return [];
    if (cmd === "list_agents" || cmd === "list_rooms" || cmd === "list_room_rules") return [];
    if (cmd === "list_projects" || cmd === "list_all_sessions" || cmd === "list_doc_tree") return [];
    if (cmd === "list_tasks" || cmd === "list_session_bindings" || cmd === "list_task_events") return [];
    return null;
  });
}

beforeEach(() => {
  mockMatchMedia(false);
  seedWorkspace();
});

afterEach(() => {
  cleanup();
  clearMocks();
  vi.unstubAllGlobals();
  useMeetingsStore.getState().reset();
  useStandupsStore.getState().reset();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useTasksStore.getState().reset();
  resetRoomsForTests();
  resetProjectsForTests();
});

const TWO = [participant("a-1", "Botje"), participant("a-2", "Scout")];

const completeMeeting = (over: Partial<ReturnType<typeof meeting>> = {}) =>
  meeting({
    id: "m-1",
    title: "Ship plan",
    state: "complete",
    started_at: 1_000,
    completed_at: 90_000,
    output_md: "## Summary\n\nWe ship on Friday.\n\n## Decisions\n\n- haiku everywhere",
    config_json: meetingConfigJson(TWO),
    ...over,
  });

// ── Output rendering ─────────────────────────────────────────────────────────

test("output_md renders through shared Markdown", () => {
  render(<MeetingOutput meeting={completeMeeting()} turns={[]} />);
  expect(screen.getByTestId("output-md")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
  expect(screen.getByText("We ship on Friday.")).toBeInTheDocument();
});

test("cancelled meeting is honest: ⚠️ ended early, no fake output", () => {
  const m = completeMeeting({ state: "cancelled", output_md: null, completed_at: null, cancelled_at: 5_000 });
  render(<MeetingOutput meeting={m} turns={[]} />);
  expect(screen.getByTestId("ended-early")).toHaveTextContent(/ended early — here's what we had/);
  expect(screen.getByTestId("no-output")).toHaveTextContent(/no synthesis was written/);
});

test("errored meeting surfaces the error message", () => {
  const m = completeMeeting({ state: "error", output_md: null, error_message: "provider went away" });
  render(<MeetingOutput meeting={m} turns={[]} />);
  expect(screen.getByTestId("ended-early")).toHaveTextContent("provider went away");
});

test("turn drill-down: skipped turns carry the 💤 note; clicking reads at the offset", async () => {
  const turns = [
    turn({
      id: "t-0",
      meeting_id: "m-1",
      round_num: 0,
      turn_index: 0,
      agent_id: "a-1",
      session_id: "sess-1",
      transcript_offset: 7,
      completed_at: 5_000,
    }),
    turn({
      id: "t-1",
      meeting_id: "m-1",
      round_num: 0,
      turn_index: 1,
      agent_id: "a-2",
      completed_at: null, // skipped — meeting completed past it
    }),
  ];
  let readOffset: number | null = null;
  mockMeetingsIPC({
    get_session_transcript: (args) => {
      readOffset = (args as { offset: number }).offset;
      return {
        items: [{ seq: 7, item: { kind: "AssistantText", data: { text: "ship friday", ts: 0 } } }],
        total: 9,
      };
    },
  });
  render(<MeetingOutput meeting={completeMeeting()} turns={turns} />);
  expect(within(screen.getByTestId("drill-turn-t-0")).getByText("Botje")).toBeInTheDocument();
  expect(screen.getByTestId("drill-turn-t-1")).toHaveTextContent(/💤 skipped — timed out/);

  fireEvent.click(screen.getByTestId("drill-turn-t-0"));
  await screen.findByText("ship friday");
  expect(readOffset).toBe(7);
});

// ── Action items (EKI-19) ────────────────────────────────────────────────────

test("convert uses the meeting's room directly when it has one", async () => {
  const m = completeMeeting({ room_id: "r-1" });
  let convertedWith: string | null = null;
  mockMeetingsIPC({
    convert_action_item: (args) => {
      convertedWith = (args as { roomId: string | null }).roomId;
      return task({ id: "task-1", room_id: "r-1" });
    },
    list_action_items: () => [
      actionItem({
        id: "ai-1",
        meeting_id: "m-1",
        text: "ship it",
        task_id: convertedWith ? "task-1" : null,
      }),
    ],
  });
  render(
    <ActionItemsList
      meeting={m}
      items={[actionItem({ id: "ai-1", meeting_id: "m-1", text: "ship it" })]}
      onError={() => {}}
    />,
  );
  fireEvent.click(screen.getByTestId("item-convert-ai-1"));
  await waitFor(() => expect(convertedWith).toBe("r-1"));
});

test("no meeting room → the room picker asks first (the room_id lesson, in copy)", async () => {
  useRoomsStore.setState({
    rooms: [room({ id: "r-9", name: "Workshop" })],
    rules: [],
    loaded: true,
  });
  let convertedWith: string | null = null;
  mockMeetingsIPC({
    convert_action_item: (args) => {
      convertedWith = (args as { roomId: string | null }).roomId;
      return task({ id: "task-1", room_id: "r-9" });
    },
  });
  const m = completeMeeting({ room_id: null });
  render(
    <ActionItemsList
      meeting={m}
      items={[actionItem({ id: "ai-1", meeting_id: "m-1", text: "ship it" })]}
      onError={() => {}}
    />,
  );
  fireEvent.click(screen.getByTestId("item-convert-ai-1"));
  const picker = screen.getByTestId("room-picker-ai-1");
  expect(picker).toHaveTextContent(/tasks without a room don't show on any board/);
  fireEvent.click(screen.getByTestId("room-picker-go-ai-1"));
  await waitFor(() => expect(convertedWith).toBe("r-9"));
});

test("converted items show assignee avatar, deep-link to the board task, and execute", async () => {
  useAgentsStore.setState({ agents: [agent({ id: "a-1", name: "Botje", icon: "🦾" })], loaded: true });
  mockMeetingsIPC({
    get_task: () => task({ id: "task-1", title: "ship it", room_id: "r-1" }),
  });
  const item = actionItem({
    id: "ai-1",
    meeting_id: "m-1",
    text: "ship it",
    assignee_agent_id: "a-1",
    priority: "high",
    task_id: "task-1",
  });
  render(<ActionItemsList meeting={completeMeeting({ room_id: "r-1" })} items={[item]} onError={() => {}} />);

  expect(screen.getByTestId("item-assignee-ai-1")).toHaveTextContent("🦾 Botje");
  expect(screen.getByTestId("item-priority-ai-1")).toHaveTextContent("🔥");

  fireEvent.click(screen.getByTestId("item-open-task-ai-1"));
  const boards = boardLeaves();
  expect(boards).toHaveLength(1);
  expect(boards[0]!.params).toMatchObject({ task: "task-1" });

  fireEvent.click(screen.getByTestId("item-execute-ai-1"));
  const dialog = await screen.findByTestId("run-with-agent-dialog");
  expect(within(dialog).getByText(/ship it/)).toBeInTheDocument();
});

test("zero items never block: the honest fallback line renders", () => {
  render(<ActionItemsList meeting={completeMeeting()} items={[]} onError={() => {}} />);
  expect(screen.getByTestId("no-action-items")).toHaveTextContent(/no action items parsed/);
});

// ── Completion confetti (Gavel Drop's finale) ────────────────────────────────

function DetailHost({ initial }: { initial: ReturnType<typeof meeting> }) {
  const [m, setM] = useState(initial);
  return (
    <>
      <button
        type="button"
        data-testid="advance"
        onClick={() => setM({ ...m, state: "complete", completed_at: 9_000, output_md: "## Summary" })}
      />
      <MeetingDetail meeting={m} onError={() => {}} />
    </>
  );
}

test("confetti fires on the live synthesis→complete transition, not on opening a finished meeting", async () => {
  mockMeetingsIPC();
  render(
    <DetailHost initial={completeMeeting({ state: "synthesis", output_md: null, completed_at: null })} />,
  );
  expect(screen.queryByTestId("confetti")).toBeNull();
  fireEvent.click(screen.getByTestId("advance"));
  await screen.findByTestId("confetti");

  cleanup();
  mockMeetingsIPC();
  render(<MeetingDetail meeting={completeMeeting()} onError={() => {}} />);
  expect(screen.queryByTestId("confetti")).toBeNull(); // already complete — no burst
});

test("reduced-motion: completion renders no confetti at all", async () => {
  mockMatchMedia(true);
  mockMeetingsIPC();
  render(
    <DetailHost initial={completeMeeting({ state: "synthesis", output_md: null, completed_at: null })} />,
  );
  fireEvent.click(screen.getByTestId("advance"));
  await screen.findByTestId("meeting-output");
  expect(screen.queryByTestId("confetti")).toBeNull();
});

// ── §3.6 flagship (vitest variant): meeting → output → convert → board → run ─

function PanelHost() {
  const [params, setParams] = useState<Record<string, string>>({ meeting: "m-1" });
  return <MeetingsPanel leafId="leaf-1" params={params} setParams={setParams} />;
}

test("flagship: completed meeting renders output + items; convert lands on the board; run-with-agent spawns", async () => {
  let converted = false;
  let spawned = false;
  const boardTask = task({ id: "task-1", title: "ship it", room_id: "r-1", project_id: "p-1" });
  mockMeetingsIPC({
    list_meetings: () => [completeMeeting({ room_id: "r-1" })],
    get_meeting: () => completeMeeting({ room_id: "r-1" }),
    list_meeting_turns: () => [
      turn({ id: "t-0", meeting_id: "m-1", round_num: 0, turn_index: 0, completed_at: 5_000 }),
    ],
    list_action_items: () => [
      actionItem({
        id: "ai-1",
        meeting_id: "m-1",
        text: "ship it",
        task_id: converted ? "task-1" : null,
      }),
    ],
    convert_action_item: () => {
      converted = true;
      return boardTask;
    },
    list_tasks: () => (converted ? [boardTask] : []),
    get_task: () => boardTask,
    list_agents: () => [agent({ id: "a-1", name: "Botje" })],
    list_projects: () => [project({ id: "p-1", folder_path: "/work/proj" })],
    provider_caps: () => [{ provider: "claude-code", caps: { spawn: true } }],
    spawn_session: () => {
      spawned = true;
      return { provider: "claude-code", id: "run-sess-1" };
    },
    update_task: (args) => (args as { task: ReturnType<typeof task> }).task,
    record_task_run_started: () => null,
  });

  render(<PanelHost />);

  // output + action item visible
  await screen.findByTestId("meeting-output");
  expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
  const itemRow = await screen.findByTestId("action-item-ai-1");
  expect(itemRow).toHaveTextContent("ship it");

  // convert → task_id backfill → board affordances appear
  fireEvent.click(screen.getByTestId("item-convert-ai-1"));
  await screen.findByTestId("item-open-task-ai-1");
  expect(converted).toBe(true);

  // deep-link to the board task
  fireEvent.click(screen.getByTestId("item-open-task-ai-1"));
  expect(boardLeaves()[0]!.params).toMatchObject({ task: "task-1" });

  // execute → M3 RunWithAgentDialog → run spawns a session
  fireEvent.click(screen.getByTestId("item-execute-ai-1"));
  await screen.findByTestId("run-with-agent-dialog");
  fireEvent.click(screen.getByTestId("choose-run"));
  fireEvent.click(await screen.findByTestId("run-spawn"));
  await waitFor(() => expect(spawned).toBe(true));
});

// ── History → detail integration (panel-level) ──────────────────────────────

test("MeetingChanged completing the meeting swaps Round Table for the output view", async () => {
  let current = meeting({
    id: "m-1",
    state: "synthesis",
    config_json: meetingConfigJson(TWO),
  });
  mockMeetingsIPC({
    list_meetings: () => [current],
    get_meeting: () => current,
  });
  render(<PanelHost />);
  await screen.findByTestId("round-table");
  expect(screen.getByTestId("gavel")).toBeInTheDocument();

  current = { ...current, state: "complete", completed_at: 9_000, output_md: "## Summary\n\ndone." };
  await act(async () => {
    await useMeetingsStore.getState().reconcile("m-1");
  });
  await screen.findByTestId("meeting-output");
  expect(screen.queryByTestId("round-table")).toBeNull();
  expect(screen.getByTestId("confetti")).toBeInTheDocument(); // live completion celebrates
});
