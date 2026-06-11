// Meetings & standups store (Lane G — T10/T12, EKI-14/EKI-21): two refetch
// folds over the frozen M4 surface. Meetings seed from list_meetings and
// reconcile on DomainEvent::MeetingChanged → get_meeting + list_meeting_turns
// (M3's reconcile-by-refetch discipline — events carry ids, never payloads);
// standups seed from list_standups and reconcile on StandupChanged →
// get_standup + list_standup_entries (run_standup returns the row immediately,
// entries stream in). Pure selectors first — the zustand stores just host them.
import { create } from "zustand";
import {
  commands,
  type ActionItem,
  type Meeting,
  type MeetingTurn,
  type ParticipantSpec,
  type SessionId,
  type SessionMeta,
  type Standup,
  type StandupEntry,
  type StartMeetingSpec,
  type Task,
} from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";

// ── Model policy (D-M4-3): data, not code — defaults never hardcode expensive ─

export const MODEL_POLICY_KEYS = {
  participant: "model_policy.meeting_participant",
  synthesis: "model_policy.meeting_synthesis",
  standup: "model_policy.standup",
} as const;

export const MODEL_POLICY_DEFAULTS = {
  participant: "haiku",
  synthesis: "sonnet",
  standup: "haiku",
} as const;

export interface ModelPolicy {
  participant: string;
  synthesis: string;
  standup: string;
}

/** Read the policy keys from settings KV; absent keys fall back to the cheap defaults. */
export async function readModelPolicy(): Promise<ModelPolicy> {
  const read = async (key: string, fallback: string) => {
    try {
      const res = await commands.getSetting(key);
      return res.status === "ok" && res.data ? res.data : fallback;
    } catch {
      return fallback; // backend unavailable (unit tests) — defaults hold
    }
  };
  return {
    participant: await read(MODEL_POLICY_KEYS.participant, MODEL_POLICY_DEFAULTS.participant),
    synthesis: await read(MODEL_POLICY_KEYS.synthesis, MODEL_POLICY_DEFAULTS.synthesis),
    standup: await read(MODEL_POLICY_KEYS.standup, MODEL_POLICY_DEFAULTS.standup),
  };
}

// ── Pure meeting selectors ───────────────────────────────────────────────────

export const MEETING_STATES = ["gathering", "round", "synthesis", "complete", "cancelled", "error"] as const;

export type MeetingState = (typeof MEETING_STATES)[number];

export function isTerminalState(state: string): boolean {
  return state === "complete" || state === "cancelled" || state === "error";
}

/** UI-side mirror of the engine's `MeetingConfig` (stored verbatim in config_json). */
export interface MeetingConfig {
  participants: ParticipantSpec[];
  rounds: number;
  participant_model: string | null;
  synthesis_model: string | null;
  context_docs: string[];
}

/** Parse-tolerant: any malformed/missing config renders as an empty 2-round meeting. */
export function parseMeetingConfig(json: string | null): MeetingConfig {
  const fallback: MeetingConfig = {
    participants: [],
    rounds: 2,
    participant_model: null,
    synthesis_model: null,
    context_docs: [],
  };
  if (!json) return fallback;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const participants = Array.isArray(raw.participants)
      ? raw.participants.flatMap((p): ParticipantSpec[] => {
          if (typeof p !== "object" || p === null) return [];
          const o = p as Record<string, unknown>;
          if (typeof o.agent_id !== "string" || typeof o.name !== "string") return [];
          return [
            { agent_id: o.agent_id, name: o.name, persona: typeof o.persona === "string" ? o.persona : null },
          ];
        })
      : [];
    return {
      participants,
      rounds: typeof raw.rounds === "number" && raw.rounds >= 0 ? raw.rounds : 2,
      participant_model: typeof raw.participant_model === "string" ? raw.participant_model : null,
      synthesis_model: typeof raw.synthesis_model === "string" ? raw.synthesis_model : null,
      context_docs: Array.isArray(raw.context_docs)
        ? raw.context_docs.filter((d): d is string => typeof d === "string")
        : [],
    };
  } catch {
    return fallback;
  }
}

/**
 * The meeting's cursor for chip math: gathering is round 0, discussion rounds
 * are 1..N, synthesis/complete are past every turn. Cancelled/error keep the
 * last persisted position — turns at/after it never ran (pending, not 💤).
 */
export function meetingPosition(m: Meeting): { round: number; turn: number } {
  if (m.state === "synthesis" || m.state === "complete") {
    return { round: Number.POSITIVE_INFINITY, turn: 0 };
  }
  if (m.state === "gathering") return { round: 0, turn: m.current_turn ?? 0 };
  // "round" plus the cancelled/error freeze-frame: trust the persisted cursor.
  return { round: m.current_round ?? 0, turn: m.current_turn ?? 0 };
}

export type TurnChip = "done" | "active" | "skipped" | "pending";

/**
 * Lane-0 contract: a turn with `completed_at` NULL that the meeting moved past
 * was SKIPPED (timeout + 1 retry exhausted) — the 💤 chip. The current turn of
 * a live meeting pulses; everything ahead is pending.
 */
export function turnChip(turn: MeetingTurn, meeting: Meeting): TurnChip {
  if (turn.completed_at !== null) return "done";
  const pos = meetingPosition(meeting);
  const before = turn.round_num < pos.round || (turn.round_num === pos.round && turn.turn_index < pos.turn);
  if (before) return "skipped";
  const atCursor = turn.round_num === pos.round && turn.turn_index === pos.turn;
  if (atCursor && (meeting.state === "gathering" || meeting.state === "round")) return "active";
  return "pending";
}

/** Find the persisted turn row for one (round, participant) cell, if it exists yet. */
export function turnAt(turns: MeetingTurn[], round: number, index: number): MeetingTurn | null {
  return turns.find((t) => t.round_num === round && t.turn_index === index) ?? null;
}

/** Newest first: running meetings float, then by started_at descending. */
export function sortMeetings(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort((a, b) => {
    const liveA = isTerminalState(a.state) ? 0 : 1;
    const liveB = isTerminalState(b.state) ? 0 : 1;
    if (liveA !== liveB) return liveB - liveA;
    return (b.started_at ?? 0) - (a.started_at ?? 0);
  });
}

export interface MeetingFilter {
  roomId: string | null;
  projectId: string | null;
}

export function meetingMatchesFilter(m: Meeting, f: MeetingFilter): boolean {
  if (f.roomId && m.room_id !== f.roomId) return false;
  if (f.projectId && m.project_id !== f.projectId) return false;
  return true;
}

/** Wall-clock duration until completion/cancellation — null while running. */
export function meetingDurationMs(m: Meeting): number | null {
  const end = m.completed_at ?? m.cancelled_at;
  if (m.started_at === null || end === null || end < m.started_at) return null;
  return end - m.started_at;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export const MEETING_STATE_BADGES: Record<MeetingState, { emoji: string; label: string }> = {
  gathering: { emoji: "🎤", label: "gathering" },
  round: { emoji: "🔁", label: "in discussion" },
  synthesis: { emoji: "⚖️", label: "synthesizing" },
  complete: { emoji: "✅", label: "complete" },
  cancelled: { emoji: "🛑", label: "cancelled" },
  error: { emoji: "⚠️", label: "error" },
};

export function meetingStateBadge(state: string): { emoji: string; label: string } {
  return MEETING_STATE_BADGES[state as MeetingState] ?? { emoji: "❓", label: state };
}

/** Stage line for the live view: "🎤 Gathering" / "🔁 Round 1 of 2" / "⚖️ Synthesis". */
export function roundLabel(m: Meeting, rounds: number): string {
  switch (m.state) {
    case "gathering":
      return "🎤 Gathering — opening takes";
    case "round":
      return `🔁 Round ${m.current_round ?? 1} of ${rounds}`;
    case "synthesis":
      return "⚖️ Synthesis — the scribe is writing";
    case "complete":
      return "✅ Complete";
    case "cancelled":
      return "🛑 Cancelled";
    case "error":
      return "⚠️ Ended with an error";
    default:
      return m.state;
  }
}

/**
 * meeting_turns stores the provider's RAW session id (the orchestrator is
 * provider-neutral); the UI re-pairs it with a provider by finding the live
 * meta, falling back to whatever provider the rest of the metas use.
 */
export function resolveTurnSession(rawId: string | null, metas: SessionMeta[]): SessionId | null {
  if (!rawId) return null;
  const live = metas.find((m) => m.id.id === rawId);
  if (live) return live.id;
  const provider = metas[0]?.id.provider ?? "claude-code";
  return { provider, id: rawId };
}

// ── Meetings store ───────────────────────────────────────────────────────────

export type MeetingResult = { status: "ok"; data: Meeting } | { status: "error"; error: string };
export type ConvertResult = { status: "ok"; data: Task } | { status: "error"; error: string };

interface MeetingsState {
  meetings: Map<string, Meeting>;
  /** Persisted turn rows by meeting id (rows exist from each turn's start — persist-then-act). */
  turns: Map<string, MeetingTurn[]>;
  actionItems: Map<string, ActionItem[]>;
  loaded: boolean;

  init: () => Promise<void>;
  reseed: () => Promise<void>;
  /** MeetingChanged fold: get_meeting (+turns; +items once terminal). null ⇒ deleted. */
  reconcile: (meetingId: string) => Promise<void>;
  loadTurns: (meetingId: string) => Promise<void>;
  loadActionItems: (meetingId: string) => Promise<void>;
  start: (spec: StartMeetingSpec) => Promise<MeetingResult>;
  cancel: (meetingId: string) => Promise<string | null>;
  /** 16.3: one click onto the M3 task surface; task_id lands on the item row. */
  convertActionItem: (itemId: string, meetingId: string, roomId: string | null) => Promise<ConvertResult>;
  reset: () => void;
}

let meetingsStarted = false;

export const useMeetingsStore = create<MeetingsState>((set, get) => ({
  meetings: new Map(),
  turns: new Map(),
  actionItems: new Map(),
  loaded: false,

  reseed: async () => {
    try {
      const res = await commands.listMeetings(null);
      if (res.status === "ok" && Array.isArray(res.data)) {
        set({ meetings: new Map(res.data.map((m) => [m.id, m])) });
      }
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },

  reconcile: async (meetingId) => {
    try {
      const res = await commands.getMeeting(meetingId);
      if (res.status !== "ok") return;
      const meetings = new Map(get().meetings);
      if (res.data === null) {
        meetings.delete(meetingId);
        const turns = new Map(get().turns);
        const actionItems = new Map(get().actionItems);
        turns.delete(meetingId);
        actionItems.delete(meetingId);
        set({ meetings, turns, actionItems });
        return;
      }
      const meeting = res.data as Meeting;
      meetings.set(meetingId, meeting);
      set({ meetings });
      await get().loadTurns(meetingId);
      // Action items only exist after synthesis — refetch once terminal.
      if (meeting.state === "complete") await get().loadActionItems(meetingId);
    } catch {
      // backend unavailable (unit tests) — store stays drivable via setState
    }
  },

  loadTurns: async (meetingId) => {
    try {
      const res = await commands.listMeetingTurns(meetingId);
      if (res.status === "ok" && Array.isArray(res.data)) {
        const turns = new Map(get().turns);
        turns.set(meetingId, res.data);
        set({ turns });
      }
    } catch {
      // backend unavailable (unit tests)
    }
  },

  loadActionItems: async (meetingId) => {
    try {
      const res = await commands.listActionItems(meetingId);
      if (res.status === "ok" && Array.isArray(res.data)) {
        const actionItems = new Map(get().actionItems);
        actionItems.set(meetingId, res.data);
        set({ actionItems });
      }
    } catch {
      // backend unavailable (unit tests)
    }
  },

  init: async () => {
    if (meetingsStarted) return;
    meetingsStarted = true;
    await get().reseed();
    try {
      await onDomainEvent((e) => {
        if (e.type === "MeetingChanged") void get().reconcile(e.data.meeting_id);
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },

  start: async (spec) => {
    try {
      const res = await commands.startMeeting(spec);
      if (res.status === "error") return res;
      const meetings = new Map(get().meetings);
      meetings.set(res.data.id, res.data);
      set({ meetings });
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },

  cancel: async (meetingId) => {
    try {
      const res = await commands.cancelMeeting(meetingId);
      if (res.status === "error") return res.error;
      const meetings = new Map(get().meetings);
      meetings.set(res.data.id, res.data);
      set({ meetings });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  convertActionItem: async (itemId, meetingId, roomId) => {
    try {
      const res = await commands.convertActionItem(itemId, roomId);
      if (res.status === "error") return res;
      await get().loadActionItems(meetingId); // task_id backfilled server-side
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },

  reset: () => {
    meetingsStarted = false;
    set({ meetings: new Map(), turns: new Map(), actionItems: new Map(), loaded: false });
  },
}));

// ── Pure standup selectors ───────────────────────────────────────────────────

/** The engine's honest no-answer marker (D-M4-7) — rendered as cold coffee. */
export const STANDUP_NO_RESPONSE = "(no response 🤷)";

export function isNoResponse(entry: StandupEntry): boolean {
  return entry.blockers === STANDUP_NO_RESPONSE && entry.yesterday === null && entry.today === null;
}

export function sortStandups(standups: Standup[]): Standup[] {
  return [...standups].sort((a, b) => b.created_at - a.created_at);
}

/** The deep-link payload for Lane H's schedule editor (params only — D-M4-5 standup spec). */
export function standupRunSpecParams(agentIds: string[], title: string): Record<string, string> {
  const spec: { action: "standup"; agent_ids?: string[]; title: string } = {
    action: "standup",
    title,
  };
  if (agentIds.length > 0) spec.agent_ids = agentIds;
  return { create: "1", spec: JSON.stringify(spec) };
}

// ── Standups store (the +standups fold — same file, Lane G owns both) ────────

export type StandupResult = { status: "ok"; data: Standup } | { status: "error"; error: string };

interface StandupsState {
  standups: Map<string, Standup>;
  entries: Map<string, StandupEntry[]>;
  loaded: boolean;

  init: () => Promise<void>;
  reseed: () => Promise<void>;
  /** StandupChanged fold: get_standup + list_standup_entries (entries stream in). */
  reconcile: (standupId: string) => Promise<void>;
  loadEntries: (standupId: string) => Promise<void>;
  /** Manual trigger: the row returns immediately; entries follow via events. */
  run: (agentIds: string[] | null, title: string | null) => Promise<StandupResult>;
  reset: () => void;
}

let standupsStarted = false;

export const useStandupsStore = create<StandupsState>((set, get) => ({
  standups: new Map(),
  entries: new Map(),
  loaded: false,

  reseed: async () => {
    try {
      const res = await commands.listStandups();
      if (res.status === "ok" && Array.isArray(res.data)) {
        set({ standups: new Map(res.data.map((s) => [s.id, s])) });
      }
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },

  reconcile: async (standupId) => {
    try {
      const res = await commands.getStandup(standupId);
      if (res.status !== "ok") return;
      const standups = new Map(get().standups);
      if (res.data === null) {
        standups.delete(standupId);
        const entries = new Map(get().entries);
        entries.delete(standupId);
        set({ standups, entries });
        return;
      }
      standups.set(standupId, res.data as Standup);
      set({ standups });
      await get().loadEntries(standupId);
    } catch {
      // backend unavailable (unit tests)
    }
  },

  loadEntries: async (standupId) => {
    try {
      const res = await commands.listStandupEntries(standupId);
      if (res.status === "ok" && Array.isArray(res.data)) {
        const entries = new Map(get().entries);
        entries.set(standupId, res.data);
        set({ entries });
      }
    } catch {
      // backend unavailable (unit tests)
    }
  },

  init: async () => {
    if (standupsStarted) return;
    standupsStarted = true;
    await get().reseed();
    try {
      await onDomainEvent((e) => {
        if (e.type === "StandupChanged") void get().reconcile(e.data.standup_id);
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },

  run: async (agentIds, title) => {
    try {
      const res = await commands.runStandup(agentIds, title);
      if (res.status === "error") return res;
      const standups = new Map(get().standups);
      standups.set(res.data.id, res.data);
      set({ standups });
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },

  reset: () => {
    standupsStarted = false;
    set({ standups: new Map(), entries: new Map(), loaded: false });
  },
}));
