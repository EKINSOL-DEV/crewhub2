// Action items → tasks (T11, EKI-19 — D-M4-6): one click onto the existing M3
// surface. Convert calls `convert_action_item`; when the meeting has no room
// the UI must ask first (the standing room_id lesson: tasks without a room
// don't show on any board). Converted items deep-link to the board task and
// "execute" opens the M3 RunWithAgentDialog — zero new run machinery.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type ActionItem, type Meeting, type Task } from "@/ipc/bindings";
import { openBoardPanel } from "@/panels/board/open-board";
import { RunWithAgentDialog } from "@/panels/board/RunWithAgentDialog";
import { PRIORITY_CONFIG, type TaskPriority } from "@/panels/board/task-constants";
import { useAgentsStore } from "@/stores/agents";
import { useMeetingsStore } from "@/stores/meetings";
import { useRoomsStore } from "@/stores/rooms";

function priorityEmoji(priority: string | null): string | null {
  if (!priority) return null;
  return PRIORITY_CONFIG[priority as TaskPriority]?.emoji ?? null;
}

interface RoomPickerProps {
  itemId: string;
  onPick: (roomId: string) => void;
  onClose: () => void;
}

/** Inline room ask — shown only when the meeting itself has no room. */
function RoomPicker({ itemId, onPick, onClose }: RoomPickerProps) {
  const rooms = useRoomsStore((s) => s.rooms);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  return (
    <div
      data-testid={`room-picker-${itemId}`}
      className="mt-1 flex flex-col gap-1 rounded border bg-muted/30 p-2"
    >
      <p className="text-[10px] text-muted-foreground">
        this meeting has no room — tasks without a room don't show on any board, so pick one:
      </p>
      <div className="flex items-center gap-2">
        <select
          aria-label="Task room"
          className="rounded border bg-background px-1 py-0.5 text-xs"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.icon ?? "🚪"} {r.name}
            </option>
          ))}
        </select>
        <Button
          size="xs"
          disabled={!roomId}
          data-testid={`room-picker-go-${itemId}`}
          onClick={() => onPick(roomId)}
        >
          ➕ Make it a task
        </Button>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export interface ActionItemsListProps {
  meeting: Meeting;
  items: ActionItem[];
  onError: (msg: string) => void;
}

export function ActionItemsList({ meeting, items, onError }: ActionItemsListProps) {
  const agents = useAgentsStore((s) => s.agents);
  const rooms = useRoomsStore((s) => s.rooms);
  const [picking, setPicking] = useState<string | null>(null);
  const [runTask, setRunTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const convert = async (itemId: string, roomId: string | null) => {
    setBusy(itemId);
    setPicking(null);
    const res = await useMeetingsStore.getState().convertActionItem(itemId, meeting.id, roomId);
    setBusy(null);
    if (res.status === "error") onError(`couldn't convert — ${res.error}`);
  };

  const execute = async (taskId: string) => {
    try {
      const res = await commands.getTask(taskId);
      if (res.status === "ok" && res.data) setRunTask(res.data as Task);
      else onError("that task is gone — was it deleted from the board?");
    } catch {
      onError("couldn't load the task");
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="no-action-items">
        🧾 no action items parsed from synthesis — the output above still has everything said
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="action-items">
      <h3 className="text-xs font-semibold">🧾 Action items</h3>
      {items.map((item) => {
        const assignee = item.assignee_agent_id
          ? (agents.find((a) => a.id === item.assignee_agent_id) ?? null)
          : null;
        const prio = priorityEmoji(item.priority);
        return (
          <div
            key={item.id}
            data-testid={`action-item-${item.id}`}
            className="rounded border px-2 py-1.5 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1">{item.text}</span>
              {prio && (
                <span title={`priority: ${item.priority}`} data-testid={`item-priority-${item.id}`}>
                  {prio}
                </span>
              )}
              {assignee && (
                <span
                  className="rounded-full border px-1.5 py-0.5 text-[10px]"
                  data-testid={`item-assignee-${item.id}`}
                  title={assignee.name}
                >
                  {assignee.icon ?? "🤖"} {assignee.name}
                </span>
              )}
              {item.task_id ? (
                <>
                  <button
                    type="button"
                    data-testid={`item-open-task-${item.id}`}
                    className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                    title="open the task on the board"
                    onClick={() => openBoardPanel({ task: item.task_id! })}
                  >
                    📋 on the board
                  </button>
                  <Button
                    size="xs"
                    variant="outline"
                    data-testid={`item-execute-${item.id}`}
                    onClick={() => void execute(item.task_id!)}
                  >
                    🎯 Execute
                  </Button>
                </>
              ) : (
                <Button
                  size="xs"
                  disabled={busy === item.id}
                  data-testid={`item-convert-${item.id}`}
                  onClick={() => {
                    if (meeting.room_id) void convert(item.id, meeting.room_id);
                    else setPicking(picking === item.id ? null : item.id);
                  }}
                >
                  {busy === item.id ? "Converting…" : "➕ Make it a task"}
                </Button>
              )}
            </div>
            {picking === item.id && (
              <RoomPicker
                itemId={item.id}
                onPick={(roomId) => void convert(item.id, roomId)}
                onClose={() => setPicking(null)}
              />
            )}
          </div>
        );
      })}
      {runTask && (
        <RunWithAgentDialog
          task={runTask}
          room={runTask.room_id ? (rooms.find((r) => r.id === runTask.room_id) ?? null) : null}
          onClose={() => setRunTask(null)}
          onError={onError}
        />
      )}
    </div>
  );
}
