// Create-task dialog (T10, EKI-93). Room is REQUIRED — the v1 lesson:
// `room_id`-less tasks were invisible on every board, so the form refuses to
// create one (the MCP side already enforces this in mcp/tools.rs).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Agent, Room } from "@/ipc/bindings";
import { useTasksStore } from "@/stores/tasks";
import { PRIORITY_CONFIG, TASK_PRIORITIES } from "./task-constants";

export interface CreateTaskDialogProps {
  rooms: Room[];
  agents: Agent[];
  /** Pre-selected room (from the board's room filter). */
  defaultRoomId: string | null;
  /** Project the task is filed under (active project filter; null in HQ/all). */
  projectId: string | null;
  onClose: () => void;
}

export function CreateTaskDialog({
  rooms,
  agents,
  defaultRoomId,
  projectId,
  onClose,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState(defaultRoomId ?? rooms[0]?.id ?? "");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim()) {
      setError("a task needs a title");
      return;
    }
    if (!roomId) {
      setError("a task needs a room — roomless tasks are invisible");
      return;
    }
    setBusy(true);
    setError(null);
    const room = rooms.find((r) => r.id === roomId);
    const err = await useTasksStore.getState().create({
      project_id: room?.project_id ?? projectId,
      room_id: roomId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      assignee_agent_id: assignee || null,
      created_by: null, // store defaults to "human"
    });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <div
      data-testid="create-task-dialog"
      className="absolute inset-0 z-30 flex items-start justify-center bg-background/60 pt-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="w-[24rem] max-w-[90%] rounded-lg border bg-card p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">📝 New task</h2>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            title
            <input
              autoFocus
              aria-label="New task title"
              className="rounded border bg-background px-2 py-1 text-xs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            description (markdown, optional)
            <textarea
              aria-label="New task description"
              className="min-h-16 rounded border bg-background px-2 py-1 text-xs"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs">
              room
              <select
                aria-label="New task room"
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                {rooms.length === 0 && <option value="">no rooms yet</option>}
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon ?? "🚪"} {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs">
              priority
              <select
                aria-label="New task priority"
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].emoji} {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs">
              assignee
              <select
                aria-label="New task assignee"
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
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
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button size="xs" disabled={busy} onClick={() => void create()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
