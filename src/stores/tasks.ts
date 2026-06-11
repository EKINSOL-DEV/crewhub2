// Tasks store (T10, EKI-93): the board renders from exactly two inputs —
// initial listTasks() and DomainEvent::TaskChanged → getTask single-task
// reconciliation (D-M3-2). One fold, two writers: human IPC edits apply
// optimistically with rollback; agent MCP edits arrive through the very same
// reconcile path, so the rendering layer can't tell them apart (that's the
// point). Pure reducer first, the zustand store just hosts it.
import { create } from "zustand";
import { commands, type SessionEvent, type SessionId, type Task } from "@/ipc/bindings";
import { onDomainEvent, onEngineEvent } from "@/ipc/events";
import { isTaskStatus, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/panels/board/task-constants";

// ── Pure reducer (D-M3-2 fold contract) ──────────────────────────────────────

export interface PendingWrite {
  /** Pre-move snapshot — what rollback restores. */
  snapshot: Task;
  /** What we optimistically wrote — the echo we expect back. */
  written: Task;
  version: number;
}

export interface TasksFold {
  byId: Map<string, Task>;
  /** Optimistic moves in flight, keyed by task id (pendingVersion echo suppression). */
  pending: Map<string, PendingWrite>;
}

export type TasksAction =
  | { kind: "seed"; tasks: Task[] }
  | { kind: "optimistic"; task: Task; version: number }
  | { kind: "confirm"; taskId: string; version: number }
  | { kind: "rollback"; taskId: string; version: number }
  /** From TaskChanged + getTask; `null` ⇒ the task was deleted, drop it. */
  | { kind: "reconcile"; taskId: string; task: Task | null };

export function emptyFold(): TasksFold {
  return { byId: new Map(), pending: new Map() };
}

/** Field-level equality on everything a writer can change — the echo test. */
export function sameTaskContent(a: Task, b: Task): boolean {
  return (
    a.id === b.id &&
    a.project_id === b.project_id &&
    a.room_id === b.room_id &&
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.assignee_agent_id === b.assignee_agent_id
  );
}

export function applyTasksAction(state: TasksFold, action: TasksAction): TasksFold {
  switch (action.kind) {
    case "seed": {
      const byId = new Map(action.tasks.map((t) => [t.id, t]));
      // Optimistic writes in flight survive a re-seed (G9: ProjectChanged /
      // RoomChanged re-seeds must not clobber a move awaiting confirm).
      for (const [id, p] of state.pending) if (byId.has(id)) byId.set(id, p.written);
      return { byId, pending: state.pending };
    }
    case "optimistic": {
      const prev = state.byId.get(action.task.id);
      if (!prev) return state; // unknown task — nothing to move
      const byId = new Map(state.byId);
      byId.set(action.task.id, action.task);
      const pending = new Map(state.pending);
      const existing = pending.get(action.task.id);
      // Chained moves before confirm keep the ORIGINAL snapshot: rollback
      // restores the last server-confirmed state, not an optimistic one.
      pending.set(action.task.id, {
        snapshot: existing?.snapshot ?? prev,
        written: action.task,
        version: action.version,
      });
      return { byId, pending };
    }
    case "confirm": {
      const p = state.pending.get(action.taskId);
      if (!p || p.version !== action.version) return state; // a newer move is still in flight
      const pending = new Map(state.pending);
      pending.delete(action.taskId);
      return { byId: state.byId, pending };
    }
    case "rollback": {
      const p = state.pending.get(action.taskId);
      if (!p || p.version !== action.version) return state; // superseded — don't clobber
      const byId = new Map(state.byId);
      byId.set(action.taskId, p.snapshot);
      const pending = new Map(state.pending);
      pending.delete(action.taskId);
      return { byId, pending };
    }
    case "reconcile": {
      const byId = new Map(state.byId);
      const pending = new Map(state.pending);
      if (action.task === null) {
        byId.delete(action.taskId);
        pending.delete(action.taskId);
        return { byId, pending };
      }
      const p = pending.get(action.taskId);
      if (p && sameTaskContent(p.written, action.task)) {
        // The echo of our own write: refresh server timestamps, keep the
        // pending entry until the IPC promise confirms — zero flicker.
        byId.set(action.taskId, action.task);
        return { byId, pending };
      }
      // A concurrent writer (agent via MCP) wins last-writer: apply it and
      // drop the pending entry so a late rollback can't clobber the newer
      // write (the conflict is visible in the task's event timeline).
      byId.set(action.taskId, action.task);
      pending.delete(action.taskId);
      return { byId, pending };
    }
  }
}

// ── Pure selectors ───────────────────────────────────────────────────────────

export interface BoardFilter {
  /** Project scope from useProjectFilter(); ignored when `hq` is set. */
  projectId: string | null;
  /** HQ cross-project mode: explicit "all projects" view (EKI-93). */
  hq: boolean;
  roomId: string | null;
  assigneeId: string | null;
  priority: string | null;
}

export const EMPTY_FILTER: BoardFilter = {
  projectId: null,
  hq: false,
  roomId: null,
  assigneeId: null,
  priority: null,
};

export function taskMatchesFilter(task: Task, f: BoardFilter): boolean {
  if (!f.hq && f.projectId && task.project_id !== f.projectId) return false;
  if (f.roomId && task.room_id !== f.roomId) return false;
  if (f.assigneeId && task.assignee_agent_id !== f.assigneeId) return false;
  if (f.priority && task.priority !== f.priority) return false;
  return true;
}

const PRIORITY_WEIGHT: Record<string, number> = Object.fromEntries(TASK_PRIORITIES.map((p, i) => [p, i]));

/** Urgent first, then freshest — within-column order is visual-only in v2.0. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pw = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
    return pw !== 0 ? pw : b.updated_at - a.updated_at;
  });
}

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<
    TaskStatus,
    Task[]
  >;
  for (const t of tasks) if (isTaskStatus(t.status)) groups[t.status].push(t);
  for (const s of TASK_STATUSES) groups[s] = sortTasks(groups[s]);
  return groups;
}

// ── Board deltas (feed for the notification matcher, D-M3-9) ─────────────────
//
// Emitted ONLY for non-self reconciliations: your own optimistic move never
// toasts at you, the echo of your own write is suppressed by pendingVersion.

export type BoardDelta =
  | { type: "created"; task: Task }
  | { type: "moved"; task: Task; from: string; to: string }
  | { type: "assigned"; task: Task; assigneeId: string | null }
  | { type: "edited"; task: Task; prevTitle: string; prevDescription: string | null };

type DeltaListener = (delta: BoardDelta) => void;

const deltaListeners = new Set<DeltaListener>();

/** Toasts store (and tests) subscribe here; returns the unsubscribe. */
export function onBoardDelta(listener: DeltaListener): () => void {
  deltaListeners.add(listener);
  return () => deltaListeners.delete(listener);
}

function emitDeltas(prev: Task | undefined, next: Task) {
  const fire = (d: BoardDelta) => {
    for (const l of deltaListeners) l(d);
  };
  if (!prev) {
    fire({ type: "created", task: next });
    if (next.assignee_agent_id) fire({ type: "assigned", task: next, assigneeId: next.assignee_agent_id });
    return;
  }
  if (prev.status !== next.status) fire({ type: "moved", task: next, from: prev.status, to: next.status });
  if (prev.assignee_agent_id !== next.assignee_agent_id)
    fire({ type: "assigned", task: next, assigneeId: next.assignee_agent_id });
  if (prev.title !== next.title || prev.description !== next.description)
    fire({ type: "edited", task: next, prevTitle: prev.title, prevDescription: prev.description });
}

// ── Run linkage (T12, D-M3-6): card ↔ live session ───────────────────────────

export interface TaskRunLink {
  session: SessionId;
  agentId: string | null;
  /** Display name for toasts ("🔨 Botje finished — …"). */
  agentName: string | null;
}

/** A run-stop suggestion: "move it to review?" — the human decides (D-M3-6). */
export interface ReviewSuggestion {
  taskId: string;
  sessionId: SessionId;
  agentId: string | null;
  agentName: string | null;
}

type SuggestionListener = (s: ReviewSuggestion) => void;

const suggestionListeners = new Set<SuggestionListener>();

export function onReviewSuggestion(listener: SuggestionListener): () => void {
  suggestionListeners.add(listener);
  return () => suggestionListeners.delete(listener);
}

function sessionKeyOf(id: SessionId): string {
  return `${id.provider}:${id.id}`;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface TasksState {
  byId: Map<string, Task>;
  pending: Map<string, PendingWrite>;
  /** Live run links by task id (registered at spawn, T12). */
  links: Record<string, TaskRunLink>;
  loaded: boolean;

  init: () => Promise<void>;
  reseed: () => Promise<void>;
  /** Fold one reducer action (also the test seam). */
  dispatch: (action: TasksAction) => void;
  /** Reconcile one TaskChanged: getTask + fold (the agent-write path). */
  reconcile: (taskId: string) => Promise<void>;
  /** Optimistic full-task update; returns an error message after rollback. */
  update: (task: Task) => Promise<string | null>;
  /** Optimistic status move (quick-move menu + drag both land here). */
  move: (taskId: string, status: TaskStatus) => Promise<string | null>;
  create: (input: Parameters<typeof commands.createTask>[0]) => Promise<string | null>;
  remove: (taskId: string) => Promise<string | null>;
  /** T12: link a spawned session to a task and record run_started. */
  registerRun: (taskId: string, session: SessionId, agentId: string | null, agentName: string | null) => void;
  /** T12: close the link and record run_finished. */
  finishRun: (taskId: string, outcome: string) => Promise<void>;
  /** Fold one engine event — the run-completion watch (test seam too). */
  applyEngine: (ev: SessionEvent) => void;
  reset: () => void;
}

let started = false;
let versionCounter = 0;
/** One suggestion per task+session — Idle can fire repeatedly. */
const suggestedRuns = new Set<string>();

export const useTasksStore = create<TasksState>((set, get) => ({
  byId: new Map(),
  pending: new Map(),
  links: {},
  loaded: false,

  dispatch: (action) => {
    const prevState = get();
    const next = applyTasksAction({ byId: prevState.byId, pending: prevState.pending }, action);
    set({ byId: next.byId, pending: next.pending });
    // Deltas fire only for reconciled changes that aren't our own echo.
    if (action.kind === "reconcile" && action.task) {
      const prevTask = prevState.byId.get(action.taskId);
      const wasOurEcho =
        prevState.pending.has(action.taskId) &&
        sameTaskContent(prevState.pending.get(action.taskId)!.written, action.task);
      if (!wasOurEcho) emitDeltas(prevTask, action.task);
    }
  },

  reconcile: async (taskId) => {
    try {
      const res = await commands.getTask(taskId);
      get().dispatch({
        kind: "reconcile",
        taskId,
        task: res.status === "ok" ? (res.data as Task | null) : null,
      });
    } catch {
      // backend unavailable (unit tests) — store stays drivable via dispatch()
    }
  },

  reseed: async () => {
    try {
      const res = await commands.listTasks();
      if (res.status === "ok" && Array.isArray(res.data)) {
        get().dispatch({ kind: "seed", tasks: res.data });
      }
      set({ loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  init: async () => {
    if (started) return;
    started = true;
    await get().reseed();
    try {
      await onDomainEvent((e) => {
        if (e.type === "TaskChanged") void get().reconcile(e.data.task_id);
        // G9: project/room deletes cascade task deletes with no per-task
        // events — re-seed wholesale on either.
        if (e.type === "ProjectChanged" || e.type === "RoomChanged") void get().reseed();
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
    try {
      await onEngineEvent((ev) => get().applyEngine(ev));
    } catch {
      // event bridge unavailable (unit tests)
    }
  },

  update: async (task) => {
    const version = ++versionCounter;
    get().dispatch({ kind: "optimistic", task, version });
    try {
      const res = await commands.updateTask(task);
      if (res.status === "error") {
        get().dispatch({ kind: "rollback", taskId: task.id, version });
        return res.error;
      }
      get().dispatch({ kind: "confirm", taskId: task.id, version });
      return null;
    } catch (e) {
      get().dispatch({ kind: "rollback", taskId: task.id, version });
      return String(e);
    }
  },

  move: async (taskId, status) => {
    const task = get().byId.get(taskId);
    if (!task || task.status === status) return null;
    return get().update({ ...task, status });
  },

  create: async (input) => {
    try {
      const res = await commands.createTask(input);
      if (res.status === "error") return res.error;
      // Insert directly — the TaskChanged echo reconciles to the same row.
      const byId = new Map(get().byId);
      byId.set(res.data.id, res.data);
      set({ byId });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  remove: async (taskId) => {
    try {
      const res = await commands.deleteTask(taskId);
      if (res.status === "error") return res.error;
      get().dispatch({ kind: "reconcile", taskId, task: null });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  registerRun: (taskId, session, agentId, agentName) => {
    suggestedRuns.delete(`${taskId}:${sessionKeyOf(session)}`);
    set({ links: { ...get().links, [taskId]: { session, agentId, agentName } } });
    void commands.recordTaskRunStarted(taskId, session, agentId).catch(() => undefined);
  },

  finishRun: async (taskId, outcome) => {
    const link = get().links[taskId];
    if (!link) return;
    const links = { ...get().links };
    delete links[taskId];
    set({ links });
    try {
      await commands.recordTaskRunFinished(taskId, link.session, outcome);
    } catch {
      // best-effort: the timeline misses the close, the board still moves on
    }
  },

  applyEngine: (ev) => {
    // D-M3-6 completion fold: Signal{stop} or status Idle/Ended on a linked
    // session ⇒ if the task is still in_progress, SUGGEST review (the card
    // never auto-moves); if the agent already moved it via MCP, close the
    // link silently — no double prompt.
    let stoppedKey: string | null = null;
    if (ev.type === "Signal" && ev.data.signal.event === "stop") stoppedKey = sessionKeyOf(ev.data.id);
    if (ev.type === "Updated" && (ev.data.meta.status === "Idle" || ev.data.meta.status === "Ended")) {
      stoppedKey = sessionKeyOf(ev.data.meta.id);
    }
    if (ev.type === "Removed") stoppedKey = sessionKeyOf(ev.data.id);
    if (!stoppedKey) return;

    const { links, byId } = get();
    for (const [taskId, link] of Object.entries(links)) {
      if (sessionKeyOf(link.session) !== stoppedKey) continue;
      const task = byId.get(taskId);
      if (task && task.status === "in_progress") {
        const dedupeKey = `${taskId}:${stoppedKey}`;
        if (suggestedRuns.has(dedupeKey)) continue;
        suggestedRuns.add(dedupeKey);
        const suggestion: ReviewSuggestion = {
          taskId,
          sessionId: link.session,
          agentId: link.agentId,
          agentName: link.agentName,
        };
        for (const l of suggestionListeners) l(suggestion);
      } else {
        // Agent already moved it (via MCP) — stay silent, just close the run.
        void get().finishRun(taskId, "agent_moved");
      }
    }
  },

  reset: () => {
    started = false;
    versionCounter = 0;
    suggestedRuns.clear();
    set({ byId: new Map(), pending: new Map(), links: {}, loaded: false });
  },
}));
