// Lane G test fixtures: tiny builders over the M4 meeting/standup binding types.
import type {
  ActionItem,
  Meeting,
  MeetingTurn,
  ParticipantSpec,
  Standup,
  StandupEntry,
} from "@/ipc/bindings";

export function participant(agent_id: string, name?: string): ParticipantSpec {
  return { agent_id, name: name ?? agent_id, persona: null };
}

export function meetingConfigJson(
  participants: ParticipantSpec[],
  rounds = 2,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    participants,
    rounds,
    turn_timeout_ms: 120_000,
    participant_model: "haiku",
    synthesis_model: "sonnet",
    project_path: "/work/proj",
    context_docs: [],
    parallel: false,
    ...extra,
  });
}

export function meeting(overrides: Partial<Meeting> & { id: string }): Meeting {
  return {
    title: overrides.id,
    goal: null,
    state: "gathering",
    room_id: null,
    project_id: null,
    config_json: meetingConfigJson([participant("a-1", "Botje"), participant("a-2", "Scout")]),
    output_md: null,
    output_path: null,
    current_round: 0,
    current_turn: 0,
    started_at: 1_000,
    completed_at: null,
    cancelled_at: null,
    error_message: null,
    ...overrides,
  };
}

export function turn(
  overrides: Partial<MeetingTurn> & {
    id: string;
    meeting_id: string;
    round_num: number;
    turn_index: number;
  },
): MeetingTurn {
  return {
    agent_id: `a-${overrides.turn_index + 1}`,
    session_id: `sess-${overrides.round_num}-${overrides.turn_index}`,
    transcript_offset: 0,
    started_at: 1_000,
    completed_at: null,
    ...overrides,
  };
}

export function actionItem(overrides: Partial<ActionItem> & { id: string; meeting_id: string }): ActionItem {
  return {
    text: overrides.id,
    assignee_agent_id: null,
    priority: null,
    status: "open",
    task_id: null,
    sort_order: 0,
    created_at: 0,
    ...overrides,
  };
}

export function standup(overrides: Partial<Standup> & { id: string }): Standup {
  return {
    title: "Daily",
    created_by: null,
    created_at: 1_000,
    ...overrides,
  };
}

export function standupEntry(
  overrides: Partial<StandupEntry> & { id: string; standup_id: string; agent_id: string },
): StandupEntry {
  return {
    yesterday: "fixed things",
    today: "fixing more things",
    blockers: null,
    submitted_at: 1_000,
    ...overrides,
  };
}
