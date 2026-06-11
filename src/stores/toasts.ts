// Task notifications (T14, EKI-99 / D-M3-9): a pure rule matcher over the
// notification_rules table feeding an in-app toast center — the ONLY sink in
// M3 (the OS notification plugin is M6 Epic 22; it swaps the sink, not the
// matcher). Rules load via listNotificationRules and invalidate on
// SettingChanged{key:"notification_rules"}. Events come from the tasks-store
// board deltas (non-self reconciliations only — your own moves never toast
// at you) plus the T12 run-stop review suggestions.
import { create } from "zustand";
import { leaves } from "@/app/layout-tree";
import { openPanel } from "@/app/palette-actions";
import { commands, type Agent, type NotificationRule, type Task } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";
import { STATUS_CONFIG, isTaskStatus, type TaskStatus } from "@/panels/board/task-constants";
import { useAgentsStore } from "./agents";
import { onBoardDelta, onReviewSuggestion, useTasksStore, type BoardDelta } from "./tasks";
import { useWorkspace } from "./workspace";

// ── Pure: mention parsing ────────────────────────────────────────────────────

/** Agents whose `@Name` appears in the text (case-insensitive). */
export function mentionedAgents(text: string, agents: Agent[]): Agent[] {
  const lower = text.toLowerCase();
  return agents.filter((a) => a.name.trim() !== "" && lower.includes(`@${a.name.toLowerCase()}`));
}

// ── Pure: the rule matcher (closed trigger list, D-M3-9) ─────────────────────

export const NOTIFICATION_TRIGGERS = ["task_moved", "task_blocked", "task_assigned", "task_mention"] as const;

export type NotificationTrigger = (typeof NOTIFICATION_TRIGGERS)[number];

/** The matcher's input: a board delta, optionally enriched with text. */
export type RuleEvent =
  | { type: "created"; task: Task }
  | { type: "moved"; task: Task; from: string; to: string }
  | { type: "assigned"; task: Task; assigneeId: string | null }
  | { type: "edited"; task: Task; prevTitle: string; prevDescription: string | null }
  | { type: "status_update"; task: Task; text: string };

export interface MatchedNotification {
  trigger: NotificationTrigger;
  taskId: string;
  task: Task;
  /** The agent the notification is about, when there is one. */
  agentId: string | null;
}

function eventText(event: RuleEvent): string {
  switch (event.type) {
    case "created":
      return `${event.task.title}\n${event.task.description ?? ""}`;
    case "edited":
      return `${event.task.title}\n${event.task.description ?? ""}`;
    case "status_update":
      return event.text;
    default:
      return "";
  }
}

/** Which triggers an event raises, with the agent each one concerns. */
function raisedTriggers(event: RuleEvent, agents: Agent[]): MatchedNotification[] {
  const out: MatchedNotification[] = [];
  const base = { taskId: event.task.id, task: event.task };
  if (event.type === "moved") {
    out.push({ ...base, trigger: "task_moved", agentId: event.task.assignee_agent_id });
    if (event.to === "blocked") {
      out.push({ ...base, trigger: "task_blocked", agentId: event.task.assignee_agent_id });
    }
  }
  if (event.type === "assigned" && event.assigneeId) {
    out.push({ ...base, trigger: "task_assigned", agentId: event.assigneeId });
  }
  for (const mentioned of mentionedAgents(eventText(event), agents)) {
    out.push({ ...base, trigger: "task_mention", agentId: mentioned.id });
  }
  return out;
}

function ruleMatches(rule: NotificationRule, n: MatchedNotification): boolean {
  if (!rule.enabled || rule.trigger !== n.trigger) return false;
  switch (rule.scope) {
    case "global":
      return true;
    case "project":
      return rule.scope_id !== null && rule.scope_id === n.task.project_id;
    case "agent":
      return rule.scope_id !== null && rule.scope_id === n.agentId;
    default:
      return false;
  }
}

/**
 * The M6-proof seam: pure function, closed trigger list — the OS sink will
 * consume the same output. One notification per trigger even when several
 * rules match (rules select, they don't multiply).
 */
export function matchRules(
  rules: NotificationRule[],
  event: RuleEvent,
  agents: Agent[],
): MatchedNotification[] {
  return raisedTriggers(event, agents).filter((n) => rules.some((r) => ruleMatches(r, n)));
}

// ── Toast copy (Toast Critters, D-M3-8: verb-first, acting face up front) ────

function statusLabel(s: string): string {
  return isTaskStatus(s) ? STATUS_CONFIG[s as TaskStatus].label : s;
}

export function toastCopy(
  n: MatchedNotification,
  actor: { name: string; emoji: string } | null,
): { emoji: string; text: string } {
  const who = actor?.name ?? "someone";
  const face = actor?.emoji ?? "🤖";
  switch (n.trigger) {
    case "task_moved":
      return { emoji: face, text: `🙌 ${who} moved “${n.task.title}” → ${statusLabel(n.task.status)}` };
    case "task_blocked":
      return { emoji: "🚧", text: `“${n.task.title}” is blocked — ${who} flagged it` };
    case "task_assigned":
      return { emoji: face, text: `🫱 “${n.task.title}” assigned to ${who}` };
    case "task_mention":
      return { emoji: "💬", text: `${who} is mentioned on “${n.task.title}”` };
  }
}

// ── Toast queue store ────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  emoji: string;
  text: string;
  taskId: string | null;
  /** Blocked toasts get the gentle shake (reduced-motion: static). */
  shake: boolean;
  /** One-click action (the review suggestion of D-M3-6). */
  action: { label: string; run: () => void } | null;
}

const DEDUPE_WINDOW_MS = 5_000;
const RULES_KEY = "notification_rules";
/** MCP post_status_update's settings-key broadcast (T5) — the global feed. */
const STATUS_UPDATE_KEY = "last_status_update";

interface ToastsState {
  toasts: Toast[];
  rules: NotificationRule[];
  loaded: boolean;
  init: () => Promise<void>;
  refreshRules: () => Promise<void>;
  push: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  /** Feed one board event through the matcher (also the test seam). */
  publish: (event: RuleEvent, actor?: { name: string; emoji: string } | null) => void;
  /** T17: fold the newest `last_status_update` broadcast into the matcher. */
  publishStatusUpdate: () => Promise<void>;
  reset: () => void;
}

let started = false;
let toastCounter = 0;
const recent = new Map<string, number>(); // `${taskId}:${trigger}` → last toast ms
const unsubscribers: Array<() => void> = [];

/** Click-through (Epic 22 contract proven early): focus a board at the task. */
export function focusBoardAtTask(taskId: string): void {
  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  const board = tab ? leaves(tab.root).find((l) => l.kind === "board") : undefined;
  if (board) {
    s.setPanelParams(board.id, { ...board.params, task: taskId });
    s.focusLeaf(board.id);
  } else {
    openPanel("board", { task: taskId });
  }
}

/** D-M3-4 actor string → display identity (honest copy: never "verified"). */
function actorIdentity(actor: string): { name: string; emoji: string } {
  if (actor === "human") return { name: "you", emoji: "🧑" };
  if (actor.startsWith("agent:")) {
    const agent = useAgentsStore.getState().agents.find((a) => a.id === actor.slice("agent:".length));
    if (agent) return { name: agent.name, emoji: agent.icon ?? "🤖" };
  }
  return { name: "an agent", emoji: "🤖" };
}

/** Best-effort actor of the newest timeline entry (avatar + name for copy). */
async function newestActor(taskId: string): Promise<{ name: string; emoji: string } | null> {
  try {
    const res = await commands.listTaskEvents(taskId);
    if (res.status !== "ok" || !Array.isArray(res.data) || res.data.length === 0) return null;
    return actorIdentity(res.data[res.data.length - 1]!.actor);
  } catch {
    return null;
  }
}

export const useToasts = create<ToastsState>((set, get) => ({
  toasts: [],
  rules: [],
  loaded: false,

  refreshRules: async () => {
    try {
      const res = await commands.listNotificationRules();
      if (res.status === "ok" && Array.isArray(res.data)) set({ rules: res.data });
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },

  push: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  publish: (event, actor = null) => {
    const matched = matchRules(get().rules, event, useAgentsStore.getState().agents);
    const now = Date.now();
    for (const n of matched) {
      const key = `${n.taskId}:${n.trigger}`;
      const last = recent.get(key);
      if (last !== undefined && now - last < DEDUPE_WINDOW_MS) continue;
      recent.set(key, now);
      const assignee =
        n.trigger === "task_assigned" || n.trigger === "task_mention"
          ? useAgentsStore.getState().agents.find((a) => a.id === n.agentId)
          : undefined;
      const copy = toastCopy(n, assignee ? { name: assignee.name, emoji: assignee.icon ?? "🤖" } : actor);
      get().push({
        emoji: copy.emoji,
        text: copy.text,
        taskId: n.taskId,
        shake: n.trigger === "task_blocked",
        action: null,
      });
    }
  },

  publishStatusUpdate: async () => {
    try {
      const res = await commands.getSetting(STATUS_UPDATE_KEY);
      if (res.status !== "ok" || !res.data) return;
      const v: unknown = JSON.parse(res.data);
      if (typeof v !== "object" || v === null) return;
      const { text, by, task_id } = v as { text?: unknown; by?: unknown; task_id?: unknown };
      if (typeof text !== "string" || typeof task_id !== "string") return;
      let task: Task | null = useTasksStore.getState().byId.get(task_id) ?? null;
      if (!task) {
        const t = await commands.getTask(task_id);
        task = t.status === "ok" ? (t.data as Task | null) : null;
      }
      if (!task) return;
      get().publish(
        { type: "status_update", task, text },
        actorIdentity(typeof by === "string" ? by : "mcp"),
      );
    } catch {
      // best-effort: a malformed feed entry never breaks the toast center
    }
  },

  init: async () => {
    if (started) return;
    started = true;
    await get().refreshRules();
    try {
      await onDomainEvent((e) => {
        if (e.type === "SettingChanged" && e.data.key === RULES_KEY) void get().refreshRules();
        // status_update timeline events feed the matcher too (T17): mention
        // rules fire on agent status updates posted via MCP.
        if (e.type === "SettingChanged" && e.data.key === STATUS_UPDATE_KEY) {
          void get().publishStatusUpdate();
        }
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
    // Board deltas (non-self reconciliations) → matcher → toasts. The actor
    // is enriched from the newest timeline entry, best-effort.
    unsubscribers.push(
      onBoardDelta((delta: BoardDelta) => {
        void newestActor(delta.task.id).then((actor) => get().publish(delta, actor));
      }),
    );
    // Run-stop review suggestions (D-M3-6): always surfaced, rule-independent
    // — CrewHub only suggests, the human (or the agent via MCP) moves.
    unsubscribers.push(
      onReviewSuggestion((s) => {
        const id = get().push({
          emoji: "🔨",
          text: `${s.agentName ?? "The agent"} finished — move the task to review?`,
          taskId: s.taskId,
          shake: false,
          action: {
            label: "Move to review",
            run: () => {
              const tasks = useTasksStore.getState();
              void tasks.move(s.taskId, "review");
              void tasks.finishRun(s.taskId, "review");
              get().dismiss(id);
            },
          },
        });
      }),
    );
  },

  reset: () => {
    started = false;
    toastCounter = 0;
    recent.clear();
    for (const u of unsubscribers.splice(0)) u();
    set({ toasts: [], rules: [], loaded: false });
  },
}));
