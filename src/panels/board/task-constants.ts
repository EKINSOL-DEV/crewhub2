// Single source of truth for task status/priority config (v1 lesson: this
// table was duplicated 3× in v1 — TaskBoard, TaskCard and the create dialog
// each had their own copy. v2: one module, every board surface imports it).
export const TASK_STATUSES = ["todo", "in_progress", "review", "done", "blocked"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface StatusConfig {
  id: TaskStatus;
  label: string;
  emoji: string;
  /** Per-column Quiet Board whisper (D-M3-8) shown when the whole board is empty. */
  whisper: string;
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  todo: { id: "todo", label: "To do", emoji: "📋", whisper: "🧹 nothing to do…" },
  in_progress: { id: "in_progress", label: "In progress", emoji: "🔨", whisper: "😴 nobody's busy" },
  review: { id: "review", label: "Review", emoji: "🔍", whisper: "🪞 nothing to look over" },
  done: { id: "done", label: "Done", emoji: "✅", whisper: "🏝️ nothing shipped yet" },
  blocked: { id: "blocked", label: "Blocked", emoji: "🚧", whisper: "🍀 nothing stuck — lucky you" },
};

export function isTaskStatus(v: string | null | undefined): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v ?? "");
}

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface PriorityConfig {
  id: TaskPriority;
  label: string;
  emoji: string;
}

export const PRIORITY_CONFIG: Record<TaskPriority, PriorityConfig> = {
  low: { id: "low", label: "low", emoji: "🌱" },
  medium: { id: "medium", label: "medium", emoji: "🌤️" },
  high: { id: "high", label: "high", emoji: "🔥" },
  urgent: { id: "urgent", label: "urgent", emoji: "🚨" },
};

// ── Task-event vocabulary (D-M3-3, mirrors store/task_events.rs) ─────────────

export const TASK_EVENT_TYPES = [
  "created",
  "status_changed",
  "assigned",
  "run_started",
  "run_finished",
  "status_update",
] as const;

export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

/** Closed actor format (D-M3-3): `human` | `agent:<agent_id>` | `mcp`. */
export type ParsedActor = { kind: "human" } | { kind: "agent"; agentId: string } | { kind: "mcp" };

export function parseActor(actor: string): ParsedActor {
  if (actor === "human") return { kind: "human" };
  if (actor.startsWith("agent:")) return { kind: "agent", agentId: actor.slice("agent:".length) };
  return { kind: "mcp" };
}
