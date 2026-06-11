// Meetings panel tests (Lane G T10): Quiet Orchestra empty state, the history
// list, the start dialog (validation, D-M4-3 policy prefill + badges, the spec
// it submits), the Round Table live view (arc seats, active pulse vs
// reduced-motion static, ✅/💤 chips), cancel, the MeetingChanged fold moving
// the table, and transcript-offset links opening chat at the right seq.
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import { useState } from "react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import MeetingsPanel from "@/panels/meetings/MeetingsPanel";
import { RoundTable, seatPosition } from "@/panels/meetings/RoundTable";
import { excerptFromItems } from "@/panels/meetings/TurnExcerpt";
import { useAgentsStore } from "@/stores/agents";
import { useMeetingsStore, useStandupsStore } from "@/stores/meetings";
import { resetProjectsForTests } from "@/stores/projects";
import { resetRoomsForTests } from "@/stores/rooms";
import { useSessionsStore } from "@/stores/sessions";
import { agent, chatLeaves, project, room, seedWorkspace } from "./fixtures";
import { meeting, meetingConfigJson, participant, turn } from "./meetings-fixtures";

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

function Host({ initial = {} }: { initial?: Record<string, string> }) {
  const [params, setParams] = useState<Record<string, string>>(initial);
  return <MeetingsPanel leafId="leaf-1" params={params} setParams={setParams} />;
}

type IpcHandlers = Record<string, (args: unknown) => unknown>;

function mockMeetingsIPC(handlers: IpcHandlers = {}) {
  mockIPC((cmd, args) => {
    if (cmd in handlers) return handlers[cmd]!(args);
    if (cmd === "list_meetings" || cmd === "list_meeting_turns" || cmd === "list_action_items") return [];
    if (cmd === "list_standups" || cmd === "list_standup_entries") return [];
    if (cmd === "list_agents" || cmd === "list_rooms" || cmd === "list_room_rules") return [];
    if (cmd === "list_projects" || cmd === "list_all_sessions" || cmd === "list_doc_tree") return [];
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
  resetRoomsForTests();
  resetProjectsForTests();
});

const TWO = [participant("a-1", "Botje"), participant("a-2", "Scout")];

// ── Quiet Orchestra + history list ───────────────────────────────────────────

test("Quiet Orchestra: 🎻 empty state with a start action", async () => {
  mockMeetingsIPC();
  render(<Host />);
  await screen.findByTestId("empty-state");
  expect(screen.getByText(/no meetings yet — gather the crew/)).toBeInTheDocument();
  expect(screen.getByTestId("empty-start-meeting")).toBeInTheDocument();
});

test("history list: state badge, participants, duration; row opens the detail", async () => {
  mockMeetingsIPC({
    list_meetings: () => [
      meeting({
        id: "m-1",
        title: "Ship plan",
        state: "complete",
        started_at: 1_000,
        completed_at: 62_000,
        config_json: meetingConfigJson(TWO),
      }),
    ],
    get_meeting: () => null,
  });
  render(<Host />);
  const row = await screen.findByTestId("meeting-row-m-1");
  expect(within(row).getByText("Ship plan")).toBeInTheDocument();
  expect(within(row).getByTestId("meeting-state-m-1")).toHaveTextContent("✅");
  expect(within(row).getByText(/👥 2 · 1m 1s/)).toBeInTheDocument();
  fireEvent.click(row);
  await screen.findByTestId("meeting-detail-m-1");
});

test("room filter narrows the list", async () => {
  mockMeetingsIPC({
    list_meetings: () => [
      meeting({ id: "m-1", title: "In workshop", room_id: "r-1" }),
      meeting({ id: "m-2", title: "Elsewhere", room_id: "r-2" }),
    ],
    list_rooms: () => [room({ id: "r-1", name: "Workshop" }), room({ id: "r-2", name: "Lounge" })],
  });
  render(<Host />);
  await screen.findByTestId("meeting-row-m-1");
  fireEvent.change(screen.getByLabelText("Room filter"), { target: { value: "r-1" } });
  expect(screen.getByTestId("meeting-row-m-1")).toBeInTheDocument();
  expect(screen.queryByTestId("meeting-row-m-2")).toBeNull();
});

// ── Start dialog ─────────────────────────────────────────────────────────────

test("start dialog: policy badges prefill from model_policy settings (D-M4-3)", async () => {
  mockMeetingsIPC({
    get_setting: (args) => {
      const key = (args as { key: string }).key;
      if (key === "model_policy.meeting_participant") return "haiku";
      if (key === "model_policy.meeting_synthesis") return "opus";
      return null;
    },
  });
  render(<Host />);
  fireEvent.click(await screen.findByTestId("start-meeting"));
  await screen.findByTestId("start-meeting-dialog");
  await waitFor(() => {
    expect(screen.getByTestId("policy-badge-participant")).toHaveTextContent("gathering $ haiku");
    expect(screen.getByTestId("policy-badge-synthesis")).toHaveTextContent("synthesis $$$ opus");
  });
});

test("start dialog validates: topic, ≥2 participants, a project", async () => {
  mockMeetingsIPC({
    list_agents: () => [agent({ id: "a-1", name: "Botje" }), agent({ id: "a-2", name: "Scout" })],
    list_projects: () => [project({ id: "p-1", folder_path: "/work/proj" })],
  });
  render(<Host />);
  fireEvent.click(await screen.findByTestId("start-meeting"));
  await screen.findByTestId("start-meeting-dialog");

  fireEvent.click(screen.getByTestId("start-meeting-go"));
  expect(await screen.findByTestId("start-meeting-error")).toHaveTextContent(/topic/);

  fireEvent.change(screen.getByLabelText("Meeting topic"), { target: { value: "Plan the ship" } });
  fireEvent.click(screen.getByTestId("participant-a-1"));
  fireEvent.click(screen.getByTestId("start-meeting-go"));
  expect(await screen.findByTestId("start-meeting-error")).toHaveTextContent(/at least 2/);

  fireEvent.click(screen.getByTestId("participant-a-2"));
  fireEvent.click(screen.getByTestId("start-meeting-go"));
  expect(await screen.findByTestId("start-meeting-error")).toHaveTextContent(/project/);
});

test("start dialog submits the StartMeetingSpec and opens the live view", async () => {
  let spec: Record<string, unknown> | null = null;
  const started = meeting({ id: "m-7", title: "Plan the ship", state: "gathering" });
  mockMeetingsIPC({
    list_agents: () => [
      agent({ id: "a-1", name: "Botje", system_prompt: "be botje" }),
      agent({ id: "a-2", name: "Scout" }),
    ],
    list_projects: () => [project({ id: "p-1", folder_path: "/work/proj" })],
    start_meeting: (args) => {
      spec = (args as { spec: Record<string, unknown> }).spec;
      return started;
    },
    get_meeting: () => started,
  });
  render(<Host />);
  fireEvent.click(await screen.findByTestId("start-meeting"));
  await screen.findByTestId("start-meeting-dialog");

  fireEvent.change(screen.getByLabelText("Meeting topic"), { target: { value: "Plan the ship" } });
  fireEvent.change(screen.getByLabelText("Meeting goal"), { target: { value: "a plan" } });
  fireEvent.click(screen.getByTestId("participant-a-1"));
  fireEvent.click(screen.getByTestId("participant-a-2"));
  fireEvent.change(screen.getByLabelText("Discussion rounds"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Meeting project"), { target: { value: "p-1" } });
  fireEvent.click(screen.getByTestId("start-meeting-go"));

  await screen.findByTestId("meeting-detail-m-7");
  expect(spec).toMatchObject({
    title: "Plan the ship",
    goal: "a plan",
    project_id: "p-1",
    project_path: "/work/proj",
    rounds: 3,
    participant_model: "haiku", // defaults from the policy, never hardcoded expensive
    synthesis_model: "sonnet",
    participants: [
      { agent_id: "a-1", name: "Botje", persona: "be botje" },
      { agent_id: "a-2", name: "Scout", persona: null },
    ],
  });
});

// ── Round Table ──────────────────────────────────────────────────────────────

const liveMeeting = () =>
  meeting({
    id: "m-1",
    state: "gathering",
    current_round: 0,
    current_turn: 1,
    config_json: meetingConfigJson(TWO),
  });

test("Round Table: seats in an arc, active speaker pulses with typing dots, chips fold", () => {
  useAgentsStore.setState({ agents: [agent({ id: "a-1", name: "Botje", icon: "🦾" })], loaded: true });
  const turns = [
    turn({ id: "t-0", meeting_id: "m-1", round_num: 0, turn_index: 0, completed_at: 5_000 }),
    turn({ id: "t-1", meeting_id: "m-1", round_num: 0, turn_index: 1 }),
  ];
  render(<RoundTable meeting={liveMeeting()} turns={turns} onCancel={() => {}} />);

  expect(screen.getByTestId("round-indicator")).toHaveTextContent("Gathering");
  expect(screen.getByTestId("seat-a-1")).toHaveAttribute("data-active", "false");
  expect(screen.getByTestId("seat-a-2")).toHaveAttribute("data-active", "true");
  expect(screen.getByTestId("typing-dots")).toBeInTheDocument();
  expect(screen.getByTestId("turn-chip-0-0")).toHaveTextContent("✅");
  expect(screen.getByTestId("turn-chip-0-1")).toHaveTextContent("🎙️");
  expect(screen.getByTestId("turn-chip-1-0")).toHaveTextContent("·");
  // two participants seat symmetrically around the table's center
  expect(seatPosition(0, 2).leftPct).toBeLessThan(50);
  expect(seatPosition(1, 2).leftPct).toBeGreaterThan(50);
  expect(seatPosition(0, 1).leftPct).toBeCloseTo(50);
});

test("reduced-motion: static 'speaking' highlight instead of typing dots; gavel is static", () => {
  mockMatchMedia(true);
  render(<RoundTable meeting={liveMeeting()} turns={[]} onCancel={() => {}} />);
  expect(screen.queryByTestId("typing-dots")).toBeNull();
  expect(screen.getByTestId("speaking-static")).toBeInTheDocument();

  cleanup();
  render(<RoundTable meeting={meeting({ id: "m-2", state: "synthesis" })} turns={[]} onCancel={() => {}} />);
  const gavel = screen.getByTestId("gavel");
  expect(gavel).toHaveTextContent("🔨");
  expect(gavel).not.toHaveClass("gavel-drop");
});

test("skipped turn renders 💤 once the meeting moved past it", () => {
  const m = meeting({
    id: "m-1",
    state: "round",
    current_round: 1,
    current_turn: 0,
    config_json: meetingConfigJson(TWO),
  });
  const turns = [
    turn({ id: "t-0", meeting_id: "m-1", round_num: 0, turn_index: 0, completed_at: 5_000 }),
    turn({ id: "t-1", meeting_id: "m-1", round_num: 0, turn_index: 1, completed_at: null }), // skipped
  ];
  render(<RoundTable meeting={m} turns={turns} onCancel={() => {}} />);
  expect(screen.getByTestId("turn-chip-0-1")).toHaveTextContent("💤");
  expect(screen.getByTestId("turn-chip-0-1")).toHaveAttribute("title", expect.stringContaining("skipped"));
});

test("MeetingChanged fold moves the table: reconcile advances the active seat", async () => {
  let current = liveMeeting();
  mockMeetingsIPC({
    get_meeting: () => current,
    list_meetings: () => [current],
    list_meeting_turns: () => [],
  });
  render(<Host initial={{ meeting: "m-1" }} />);
  await screen.findByTestId("meeting-detail-m-1");
  expect(screen.getByTestId("seat-a-2")).toHaveAttribute("data-active", "true");

  current = { ...current, state: "round", current_round: 1, current_turn: 0 };
  await act(async () => {
    await useMeetingsStore.getState().reconcile("m-1");
  });
  expect(screen.getByTestId("round-indicator")).toHaveTextContent("Round 1 of 2");
  expect(screen.getByTestId("seat-a-1")).toHaveAttribute("data-active", "true");
  expect(screen.getByTestId("seat-a-2")).toHaveAttribute("data-active", "false");
});

test("cancel button cancels through the store", async () => {
  let cancelled = false;
  const m = liveMeeting();
  mockMeetingsIPC({
    list_meetings: () => [m],
    get_meeting: () => m,
    cancel_meeting: () => {
      cancelled = true;
      return { ...m, state: "cancelled", cancelled_at: 9_000 };
    },
  });
  render(<Host initial={{ meeting: "m-1" }} />);
  await screen.findByTestId("meeting-detail-m-1");
  fireEvent.click(screen.getByTestId("cancel-meeting"));
  await waitFor(() => expect(cancelled).toBe(true));
});

// ── Turn excerpts: offsets in, chat-at-seq out ───────────────────────────────

test("excerptFromItems folds only text items and truncates honestly", () => {
  const items = [
    { seq: 5, item: { kind: "AssistantText", data: { text: "I think we should ship.", ts: 0 } } },
    { seq: 6, item: { kind: "ToolUse", data: { tool: "Bash", input_json: "{}", tool_use_id: "t", ts: 0 } } },
  ] as Parameters<typeof excerptFromItems>[0];
  expect(excerptFromItems(items)).toBe("I think we should ship.");
  const long = [
    { seq: 1, item: { kind: "AssistantText", data: { text: "x".repeat(2000), ts: 0 } } },
  ] as Parameters<typeof excerptFromItems>[0];
  expect(excerptFromItems(long)).toMatch(/… \[truncated\]$/);
});

test("clicking a turn chip reads the transcript at its offset; open-in-chat anchors the seq", async () => {
  // Live meeting: the Round Table owns the chips (terminal meetings drill
  // down through MeetingOutput instead — covered in meeting-output tests).
  const m = meeting({
    id: "m-1",
    state: "round",
    current_round: 1,
    current_turn: 0,
    config_json: meetingConfigJson(TWO),
  });
  const t0 = turn({
    id: "t-0",
    meeting_id: "m-1",
    round_num: 0,
    turn_index: 0,
    session_id: "sess-77",
    transcript_offset: 42,
    completed_at: 5_000,
  });
  let readOffset: number | null = null;
  mockMeetingsIPC({
    list_meetings: () => [m],
    get_meeting: () => m,
    list_meeting_turns: () => [t0],
    get_session_transcript: (args) => {
      const a = args as { id: { provider: string; id: string }; offset: number };
      expect(a.id.id).toBe("sess-77");
      readOffset = a.offset;
      return {
        items: [{ seq: 42, item: { kind: "AssistantText", data: { text: "my opening take", ts: 0 } } }],
        total: 50,
      };
    },
  });
  render(<Host initial={{ meeting: "m-1" }} />);
  await screen.findByTestId("meeting-detail-m-1");
  fireEvent.click(screen.getByTestId("turn-chip-0-0"));
  await screen.findByText("my opening take");
  expect(readOffset).toBe(42);

  fireEvent.click(screen.getByTestId("turn-open-chat-t-0"));
  const chats = chatLeaves();
  expect(chats).toHaveLength(1);
  // Live meeting → live chat at the seq anchor (history mode is for terminal).
  expect(chats[0]!.params).toMatchObject({ sessionId: "claude-code:sess-77", seq: "42" });
  expect(chats[0]!.params!.mode).toBeUndefined();
});

// ── Standups tab placeholder (T12 replaces it) ───────────────────────────────

test("standups tab shows the honest empty state until T12 lands", async () => {
  mockMeetingsIPC();
  render(<Host />);
  fireEvent.click(await screen.findByTestId("tab-standups"));
  expect(screen.getByText(/the crew sleeps in/)).toBeInTheDocument();
});
