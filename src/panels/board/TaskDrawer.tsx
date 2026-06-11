// Task detail drawer (T10/T13, EKI-93/97): markdown description, inline edit,
// and the event timeline from list_task_events with honest actor badges
// (D-M3-4): `agent:<id>` renders the agent's avatar + "via MCP 🔧",
// unattributed `mcp` renders "🤖 an agent" — the copy never claims verified
// identity. `human` is simply you.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { commands, type Agent, type Room, type Task, type TaskEvent } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useTasksStore } from "@/stores/tasks";
import {
  parseActor,
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isTaskStatus,
  type TaskStatus,
} from "./task-constants";

// ── Actor badge (D-M3-4: honest, self-reported attribution) ──────────────────

export function ActorBadge({ actor, agents }: { actor: string; agents: Agent[] }) {
  const parsed = parseActor(actor);
  if (parsed.kind === "human") {
    return <span data-testid="actor-badge">🧑 you</span>;
  }
  if (parsed.kind === "agent") {
    const agent = agents.find((a) => a.id === parsed.agentId);
    return (
      <span data-testid="actor-badge" className="inline-flex items-center gap-1">
        {agent?.icon ?? "🤖"} {agent?.name ?? parsed.agentId}
        <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground" title="self-reported">
          via MCP 🔧
        </span>
      </span>
    );
  }
  return (
    <span data-testid="actor-badge" className="inline-flex items-center gap-1">
      🤖 an agent
      <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground" title="unattributed">
        via MCP 🔧
      </span>
    </span>
  );
}

// ── Timeline entry copy ──────────────────────────────────────────────────────

function payloadOf(e: TaskEvent): Record<string, unknown> {
  try {
    const v: unknown = e.payload_json ? JSON.parse(e.payload_json) : {};
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function eventText(e: TaskEvent, agents: Agent[]): string {
  const p = payloadOf(e);
  const agentName = (id: unknown) =>
    typeof id === "string" ? (agents.find((a) => a.id === id)?.name ?? id) : null;
  switch (e.event_type) {
    case "created":
      return "created this task";
    case "status_changed": {
      const label = (s: unknown) =>
        isTaskStatus(s as string) ? STATUS_CONFIG[s as TaskStatus].label : String(s);
      return `moved ${label(p.from)} → ${label(p.to)}`;
    }
    case "assigned":
      return p.agent_id ? `assigned to ${agentName(p.agent_id)}` : "unassigned";
    case "run_started":
      return `started a run${agentName(p.agent_id) ? ` with ${agentName(p.agent_id)}` : ""}`;
    case "run_finished":
      return `run finished — ${typeof p.outcome === "string" ? p.outcome : "done"}`;
    case "status_update":
      return typeof p.text === "string" ? `“${p.text}”` : "posted a status update";
    default:
      return e.event_type;
  }
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── The drawer ───────────────────────────────────────────────────────────────

export interface TaskDrawerProps {
  taskId: string;
  rooms: Room[];
  onClose: () => void;
  /** T12 entry point — the button renders only when wired. */
  onRunWithAgent?: (task: Task) => void;
  onError: (msg: string) => void;
}

export function TaskDrawer({ taskId, rooms, onClose, onRunWithAgent, onError }: TaskDrawerProps) {
  const task = useTasksStore((s) => s.byId.get(taskId));
  const agents = useAgentsStore((s) => s.agents);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updatedAt = task?.updated_at;
  useEffect(() => {
    let live = true;
    void commands
      .listTaskEvents(taskId)
      .then((res) => {
        if (live && res.status === "ok" && Array.isArray(res.data)) setEvents(res.data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [taskId, updatedAt]);

  if (!task) {
    return (
      <aside data-testid="task-drawer" className="flex w-72 shrink-0 flex-col border-l p-3">
        <p className="text-xs text-muted-foreground">🍂 that task isn't there anymore</p>
        <Button size="xs" variant="outline" className="mt-2 self-start" onClick={onClose}>
          Close
        </Button>
      </aside>
    );
  }

  const patch = async (changes: Partial<Task>) => {
    const err = await useTasksStore.getState().update({ ...task, ...changes });
    if (err) onError(err);
  };

  return (
    <aside
      data-testid="task-drawer"
      className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l p-3"
    >
      <div className="flex items-start gap-1">
        {editing ? (
          <input
            aria-label="Task title"
            className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm font-semibold"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
        ) : (
          <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug">{task.title}</h2>
        )}
        <button
          type="button"
          aria-label="Close task"
          className="rounded px-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <label className="flex items-center gap-1">
          status
          <select
            aria-label="Status"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={task.status}
            onChange={(e) => void patch({ status: e.target.value })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].emoji} {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          priority
          <select
            aria-label="Priority"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={task.priority}
            onChange={(e) => void patch({ priority: e.target.value })}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_CONFIG[p].emoji} {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          room
          <select
            aria-label="Room"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={task.room_id ?? ""}
            onChange={(e) => void patch({ room_id: e.target.value || null })}
          >
            {!task.room_id && <option value="">—</option>}
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.icon ?? "🚪"} {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          assignee
          <select
            aria-label="Assignee"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={task.assignee_agent_id ?? ""}
            onChange={(e) => void patch({ assignee_agent_id: e.target.value || null })}
          >
            <option value="">nobody</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon ?? "🤖"} {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {editing ? (
        <div className="flex flex-col gap-1">
          <textarea
            aria-label="Task description"
            className="min-h-24 rounded border bg-background px-2 py-1 text-xs"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
          />
          <div className="flex gap-1">
            <Button
              size="xs"
              onClick={() => {
                setEditing(false);
                void patch({
                  title: draftTitle.trim() || task.title,
                  description: draftDescription.trim() || null,
                });
              }}
            >
              Save
            </Button>
            <Button size="xs" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {task.description ? (
            <Markdown text={task.description} className="text-xs" />
          ) : (
            <p className="text-xs italic text-muted-foreground">no description</p>
          )}
          <div className="flex gap-1">
            <Button
              size="xs"
              variant="outline"
              data-testid="edit-task"
              onClick={() => {
                setDraftTitle(task.title);
                setDraftDescription(task.description ?? "");
                setEditing(true);
              }}
            >
              ✏️ Edit
            </Button>
            {onRunWithAgent && (
              <Button size="xs" data-testid="run-with-agent" onClick={() => onRunWithAgent(task)}>
                🤝 Run with agent
              </Button>
            )}
          </div>
        </div>
      )}

      <section className="mt-1 flex flex-col gap-1">
        <h3 className="text-[10px] font-medium uppercase text-muted-foreground">Timeline</h3>
        <ol data-testid="task-timeline" className="flex flex-col gap-1.5">
          {events.map((e) => (
            <li key={e.id} className="text-[11px] leading-snug">
              <ActorBadge actor={e.actor} agents={agents} /> <span>{eventText(e, agents)}</span>
              <span className="ml-1 text-[9px] text-muted-foreground">{formatTime(e.created_at)}</span>
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-[10px] italic text-muted-foreground">🕊️ nothing happened yet</li>
          )}
        </ol>
      </section>

      <div className="mt-auto pt-2">
        {confirmDelete ? (
          <span className="flex items-center gap-1 text-xs">
            really delete?
            <Button
              size="xs"
              variant="destructive"
              onClick={() => {
                void useTasksStore
                  .getState()
                  .remove(task.id)
                  .then((err) => {
                    if (err) onError(err);
                    else onClose();
                  });
              }}
            >
              Yes
            </Button>
            <Button size="xs" variant="outline" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            🗑️ Delete task
          </Button>
        )}
      </div>
    </aside>
  );
}
