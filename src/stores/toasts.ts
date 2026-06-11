// Task + attention notifications (M3 T14, EKI-99 / D-M3-9 — extended by M6
// T11, EKI-92 / D-M6-4): a pure rule matcher over the notification_rules
// table feeding two sinks — the in-app ToastCenter and the OS notification
// plugin, routed per rule via `config_json.sink` ("toast" | "os" | "both").
// M6 swapped the sink, not the matcher: task events still come from the
// tasks-store board deltas; the five attention triggers fold straight off
// the EngineEvent stream (PermissionRequest → permission_needed, Updated
// Ended transitions → session_stopped/session_error, Signal{notification} →
// hook_notification) plus MeetingChanged → meeting_complete. Rules load via
// listNotificationRules and invalidate on SettingChanged.
import { create } from "zustand";
import { leaves } from "@/app/layout-tree";
import { openChatPanel } from "@/app/open-chat";
import { openPanel } from "@/app/palette-actions";
import {
  commands,
  type Agent,
  type NotificationRule,
  type SessionEvent,
  type SessionId,
  type SessionStatus,
  type Task,
} from "@/ipc/bindings";
import { onDomainEvent, onEngineEvent } from "@/ipc/events";
import { STATUS_CONFIG, isTaskStatus, type TaskStatus } from "@/panels/board/task-constants";
import { useAgentsStore } from "./agents";
import { useBindingsStore } from "./bindings";
import { sendOsNotification } from "./os-notification";
import { pathUnderRoot, useProjectsStore } from "./projects";
import { sessionKey, shortId, useSessionsStore, type StoredSessionMeta } from "./sessions";
import { onBoardDelta, onReviewSuggestion, useTasksStore, type BoardDelta } from "./tasks";
import { useWorkspace } from "./workspace";

// ── Pure: mention parsing ────────────────────────────────────────────────────

/** Agents whose `@Name` appears in the text (case-insensitive). */
export function mentionedAgents(text: string, agents: Agent[]): Agent[] {
  const lower = text.toLowerCase();
  return agents.filter((a) => a.name.trim() !== "" && lower.includes(`@${a.name.toLowerCase()}`));
}

// ── Pure: the rule matcher (closed trigger list, D-M3-9 + D-M6-4) ────────────

export const TASK_TRIGGERS = ["task_moved", "task_blocked", "task_assigned", "task_mention"] as const;

/** M6's attention triggers (D-M6-4): default sink "both", seeded by T4. */
export const ATTENTION_TRIGGERS = [
  "permission_needed",
  "session_stopped",
  "session_error",
  "meeting_complete",
  "hook_notification",
] as const;

export const NOTIFICATION_TRIGGERS = [...TASK_TRIGGERS, ...ATTENTION_TRIGGERS] as const;

export type NotificationTrigger = (typeof NOTIFICATION_TRIGGERS)[number];
export type TaskTrigger = (typeof TASK_TRIGGERS)[number];
export type AttentionTrigger = (typeof ATTENTION_TRIGGERS)[number];

/** The matcher's input: a board delta, optionally enriched with text. */
export type RuleEvent =
  | { type: "created"; task: Task }
  | { type: "moved"; task: Task; from: string; to: string }
  | { type: "assigned"; task: Task; assigneeId: string | null }
  | { type: "edited"; task: Task; prevTitle: string; prevDescription: string | null }
  | { type: "status_update"; task: Task; text: string };

export interface MatchedNotification {
  trigger: TaskTrigger;
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

// ── Pure: per-rule sink routing (M6 T11, D-M6-4) ─────────────────────────────

export type NotificationSink = "toast" | "os" | "both";

/** Defaults when a rule carries no sink: task triggers toast, attention both. */
export function defaultSink(trigger: string): NotificationSink {
  return (ATTENTION_TRIGGERS as readonly string[]).includes(trigger) ? "both" : "toast";
}

/** A rule's sink: `config_json.sink` when valid, else the trigger default. */
export function ruleSink(rule: NotificationRule): NotificationSink {
  try {
    const cfg: unknown = JSON.parse(rule.config_json ?? "null");
    if (typeof cfg === "object" && cfg !== null) {
      const sink = (cfg as { sink?: unknown }).sink;
      if (sink === "toast" || sink === "os" || sink === "both") return sink;
    }
  } catch {
    // malformed config — fall through to the default
  }
  return defaultSink(rule.trigger);
}

/** Union of sinks over the matching rules (rules select, they don't multiply). */
export function combineSinks(rules: NotificationRule[]): { toast: boolean; os: boolean } {
  const sinks = rules.map(ruleSink);
  return {
    toast: sinks.some((s) => s === "toast" || s === "both"),
    os: sinks.some((s) => s === "os" || s === "both"),
  };
}

// ── Pure: the EngineEvent → attention-trigger fold (M6 T11, D-M6-4, G4) ──────

/** What the fold needs to remember about a session between events. */
export interface PrevMeta {
  status: SessionStatus;
  detail: string | null;
}

export interface AttentionNotification {
  trigger: AttentionTrigger;
  /** Dedupe key — applies ACROSS sinks (one event never double-fires). */
  key: string;
  emoji: string;
  text: string;
  /** Click route target (chat at this session), when there is one. */
  sessionKey: string | null;
}

/** Statuses that count as "was running" for the stop/error transition. */
const ACTIVE_STATUSES: readonly SessionStatus[] = ["Working", "WaitingForInput", "WaitingForPermission"];

function signalMessage(payloadJson: string | null): string | null {
  if (!payloadJson) return null;
  try {
    const v: unknown = JSON.parse(payloadJson);
    if (typeof v === "object" && v !== null) {
      const msg = (v as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim() !== "") return msg;
    }
  } catch {
    // tolerate any payload shape — copy falls back
  }
  return null;
}

/**
 * Fold one engine event into at most one attention notification. Pure:
 * `prev` is the caller-tracked previous meta, `name` the display label.
 * Honest note on session_error (D-M6-4): the wire enum has no error status —
 * an Ended transition whose activity detail mentions an error is the closest
 * provider-neutral signal; everything else lands as session_stopped.
 */
export function foldEngineEvent(
  prev: PrevMeta | undefined,
  ev: SessionEvent,
  name: string,
): AttentionNotification | null {
  switch (ev.type) {
    case "PermissionRequest": {
      const key = sessionKey(ev.data.id);
      return {
        trigger: "permission_needed",
        key: `${key}:permission_needed:${ev.data.request.request_id}`,
        emoji: "✋",
        text: `${name} is waiting on you — ${ev.data.request.tool} needs permission`,
        sessionKey: key,
      };
    }
    case "Signal": {
      if (ev.data.signal.event !== "notification") return null;
      const key = sessionKey(ev.data.id);
      const msg = signalMessage(ev.data.signal.payload_json);
      return {
        trigger: "hook_notification",
        key: `${key}:hook_notification:${ev.data.signal.ts}`,
        emoji: "🔔",
        text: msg ? `${name}: ${msg}` : `${name} sent a notification`,
        sessionKey: key,
      };
    }
    case "Updated": {
      const meta = ev.data.meta;
      if (meta.status !== "Ended" || !prev || !ACTIVE_STATUSES.includes(prev.status)) return null;
      const key = sessionKey(meta.id);
      const detail = `${prev.detail ?? ""} ${meta.activity_detail ?? ""}`.toLowerCase();
      if (detail.includes("error")) {
        return {
          trigger: "session_error",
          key: `${key}:session_error`,
          emoji: "💥",
          text: `${name} hit an error and stopped`,
          sessionKey: key,
        };
      }
      return {
        trigger: "session_stopped",
        key: `${key}:session_stopped`,
        emoji: "🏁",
        text: `${name} stopped`,
        sessionKey: key,
      };
    }
    default:
      return null;
  }
}

/** The meeting_complete notification (built at the MeetingChanged wiring). */
export function meetingCompleteNotification(meetingId: string, title: string): AttentionNotification {
  return {
    trigger: "meeting_complete",
    key: `meeting:${meetingId}:complete`,
    emoji: "🎤",
    text: `Meeting “${title}” wrapped up — minutes are ready`,
    sessionKey: null,
  };
}

/** Scope context for attention rules (agent/project scoping, D-M6-4). */
export interface AttentionCtx {
  agentId: string | null;
  projectId: string | null;
}

/** Which rules select this attention notification (returned for sink union). */
export function matchAttentionRules(
  rules: NotificationRule[],
  n: AttentionNotification,
  ctx: AttentionCtx,
): NotificationRule[] {
  return rules.filter((r) => {
    if (!r.enabled || r.trigger !== n.trigger) return false;
    switch (r.scope) {
      case "global":
        return true;
      case "agent":
        return r.scope_id !== null && r.scope_id === ctx.agentId;
      case "project":
        return r.scope_id !== null && r.scope_id === ctx.projectId;
      default:
        return false;
    }
  });
}

/**
 * Newest session waiting on a permission (G11's focus-listener route): when
 * the window regains focus after a permission_needed OS notification, the
 * chat opens at this session.
 */
export function waitingSessionKey(sessions: Record<string, StoredSessionMeta>): string | null {
  let best: { key: string; ms: number } | null = null;
  for (const [key, m] of Object.entries(sessions)) {
    if (m.removed || m.status !== "WaitingForPermission") continue;
    if (!best || m.last_activity_ms > best.ms) best = { key, ms: m.last_activity_ms };
  }
  return best?.key ?? null;
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
  /** Attention toasts route to the chat at this session (M6 T11). */
  sessionKey?: string | null;
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
  /** M6 T11: one attention notification through rules + sink routing. */
  publishAttention: (n: AttentionNotification, ctx?: AttentionCtx) => void;
  /** MeetingChanged fold: notify once when a meeting reaches "complete". */
  publishMeetingChanged: (meetingId: string) => Promise<void>;
  reset: () => void;
}

let started = false;
let toastCounter = 0;
const recent = new Map<string, number>(); // dedupe key → last dispatch ms (both sinks)
const unsubscribers: Array<() => void> = [];
// M6 T11 wiring state: previous session metas for the Updated fold, meetings
// already announced, and the G11 focus-route arm (set when a
// permission_needed reached the OS sink; cleared on the next window focus).
const prevMetas = new Map<string, PrevMeta>();
const announcedMeetings = new Set<string>();
let focusRouteArmed = false;

/** Display label for attention copy: binding name ?? agent name ?? short id. */
function attentionLabel(id: SessionId): string {
  const binding = useBindingsStore.getState().bindings[id.id];
  const agent = binding?.agent_id
    ? useAgentsStore.getState().agents.find((a) => a.id === binding.agent_id)
    : undefined;
  return binding?.display_name ?? agent?.name ?? `Session ${shortId(id.id)}`;
}

/** Best-effort scope context for a session: bound agent + covering project. */
function resolveAttentionCtx(sessKey: string | null): AttentionCtx {
  if (!sessKey) return { agentId: null, projectId: null };
  const rawId = sessKey.slice(sessKey.indexOf(":") + 1);
  const agentId = useBindingsStore.getState().bindings[rawId]?.agent_id ?? null;
  const meta = useSessionsStore.getState().sessions[sessKey];
  const projectId = meta
    ? (useProjectsStore.getState().projects.find((p) => pathUnderRoot(meta.project_path, p.folder_path))
        ?.id ?? null)
    : null;
  return { agentId, projectId };
}

/** The session an engine event concerns (meta tracking for the fold). */
function eventSession(ev: SessionEvent): SessionId | null {
  switch (ev.type) {
    case "Discovered":
    case "Updated":
      return ev.data.meta.id;
    case "Removed":
    case "Item":
    case "PermissionRequest":
    case "Question":
    case "Signal":
      return ev.data.id;
    default:
      return null;
  }
}

function trackPrevMeta(ev: SessionEvent): void {
  if (ev.type === "Discovered" || ev.type === "Updated") {
    prevMetas.set(sessionKey(ev.data.meta.id), {
      status: ev.data.meta.status,
      detail: ev.data.meta.activity_detail,
    });
  } else if (ev.type === "Removed") {
    prevMetas.delete(sessionKey(ev.data.id));
  }
}

/** G11: window focus after a permission OS notification → open the waiting chat. */
function onWindowFocus(): void {
  if (!focusRouteArmed) return;
  focusRouteArmed = false;
  const key = waitingSessionKey(useSessionsStore.getState().sessions);
  if (!key) return;
  const sep = key.indexOf(":");
  openChatPanel({ provider: key.slice(0, sep), id: key.slice(sep + 1) });
}

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

  publishAttention: (n, ctx) => {
    const matched = matchAttentionRules(get().rules, n, ctx ?? { agentId: null, projectId: null });
    if (matched.length === 0) return; // per-rule mute respected (enabled=false never matches)
    const now = Date.now();
    const last = recent.get(n.key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return; // dedupe ACROSS sinks
    recent.set(n.key, now);
    const sinks = combineSinks(matched);
    if (sinks.toast) {
      get().push({
        emoji: n.emoji,
        text: n.text,
        taskId: null,
        sessionKey: n.sessionKey,
        shake: n.trigger === "permission_needed",
        action: null,
      });
    }
    if (sinks.os) {
      void sendOsNotification("CrewHub", n.text);
      // D-M6-4's honest click contract: the OS plugin has no reliable click
      // callback — clicking brings the app forward (OS behavior) and the
      // focus listener routes to the waiting session (G11).
      if (n.trigger === "permission_needed") focusRouteArmed = true;
    }
  },

  publishMeetingChanged: async (meetingId) => {
    if (announcedMeetings.has(meetingId)) return;
    try {
      const res = await commands.getMeeting(meetingId);
      if (res.status !== "ok" || !res.data || res.data.state !== "complete") return;
      announcedMeetings.add(meetingId);
      get().publishAttention(meetingCompleteNotification(meetingId, res.data.title), {
        agentId: null,
        projectId: res.data.project_id,
      });
    } catch {
      // meeting gone or backend unavailable — nothing to announce
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
        // M6 T11: meeting_complete rides MeetingChanged (reconcile-by-refetch).
        if (e.type === "MeetingChanged") void get().publishMeetingChanged(e.data.meeting_id);
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
    // M6 T11 (D-M6-4, G4): the EngineEvent fold → attention triggers. The
    // fold is pure; this wiring just tracks previous metas and resolves the
    // scope context. Test seam: publishAttention / foldEngineEvent directly.
    try {
      await onEngineEvent((ev) => {
        const id = eventSession(ev);
        const prev = id ? prevMetas.get(sessionKey(id)) : undefined;
        const folded = id ? foldEngineEvent(prev, ev, attentionLabel(id)) : null;
        trackPrevMeta(ev);
        if (folded) get().publishAttention(folded, resolveAttentionCtx(folded.sessionKey));
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
    // G11 focus-listener route (armed by a permission_needed OS dispatch).
    window.addEventListener("focus", onWindowFocus);
    unsubscribers.push(() => window.removeEventListener("focus", onWindowFocus));
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
    prevMetas.clear();
    announcedMeetings.clear();
    focusRouteArmed = false;
    for (const u of unsubscribers.splice(0)) u();
    set({ toasts: [], rules: [], loaded: false });
  },
}));
