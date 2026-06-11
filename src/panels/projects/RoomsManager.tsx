// Rooms manager (M3 T8, EKI-87): per-project (and HQ/shared) room CRUD with
// icon/color, drag-free up/down ordering, HQ badge, a guarded delete that
// explains task fate (room_id-less tasks are invisible — the v1 lesson) and
// offers to move tasks first, plus the per-room assignment RuleEditor.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type Room, type Task } from "@/ipc/bindings";
import { roomsForProject, useRoomsStore } from "@/stores/rooms";
import { RuleEditor } from "./RuleEditor";

const QUICK_ICONS = ["🚪", "🧪", "🛋️", "📦", "🎛️", "🌿", "🛰️", "🏛️"];

function RoomForm({
  room,
  projectId,
  onClose,
}: {
  /** null = creating. */
  room: Room | null;
  projectId: string | null;
  onClose: () => void;
}) {
  const { create, update } = useRoomsStore();
  const [name, setName] = useState(room?.name ?? "");
  const [icon, setIcon] = useState(room?.icon ?? "🚪");
  const [color, setColor] = useState(room?.color ?? "#9ece6a");
  const [isHq, setIsHq] = useState(room?.is_hq ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = room
      ? await update({ ...room, name: name.trim(), icon, color, is_hq: isHq })
      : await create({ project_id: projectId, name: name.trim(), icon, color, is_hq: isHq });
    setBusy(false);
    if (res.status === "error") {
      setError(res.error);
      return;
    }
    onClose();
  };

  return (
    <div data-testid="room-form" className="flex flex-col gap-1.5 rounded border p-2 text-xs">
      <div className="flex items-center gap-1">
        <input
          aria-label="Room name"
          autoFocus
          className="flex-1 rounded border bg-card px-2 py-1 text-sm"
          placeholder="e.g. The Lab"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label="Room icon"
          className="w-12 rounded border bg-card px-1 py-1 text-center text-sm"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
        <input
          aria-label="Room color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="flex gap-1">
          {QUICK_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className="rounded px-1 hover:bg-accent/20"
              onClick={() => setIcon(i)}
            >
              {i}
            </button>
          ))}
        </span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={isHq} onChange={(e) => setIsHq(e.target.checked)} />
          HQ (the cross-project home base)
        </label>
        <span className="flex-1" />
        <Button size="xs" disabled={!name.trim() || busy} onClick={() => void save()}>
          {room ? "Save" : "Add room"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}

function DeleteGuard({ room, onClose }: { room: Room; onClose: () => void }) {
  const { rooms, remove } = useRoomsStore();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const others = rooms.filter((r) => r.id !== room.id);

  useEffect(() => {
    let cancelled = false;
    commands
      .listTasks()
      .then((res) => {
        if (cancelled) return;
        setTasks(
          res.status === "ok" && Array.isArray(res.data) ? res.data.filter((t) => t.room_id === room.id) : [],
        );
      })
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, [room.id]);
  const count = tasks?.length ?? 0;

  const doDelete = async (moveFirst: boolean) => {
    setError(null);
    if (moveFirst && moveTo && tasks) {
      for (const t of tasks) {
        const res = await commands.updateTask({ ...t, room_id: moveTo }).catch((e) => ({
          status: "error" as const,
          error: String(e),
        }));
        if (res.status === "error") {
          setError(res.error);
          return;
        }
      }
    }
    const err = await remove(room.id);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div
      data-testid={`room-delete-guard-${room.id}`}
      className="flex flex-col gap-1.5 rounded border border-red-500/50 bg-red-500/10 p-2 text-xs"
    >
      {count > 0 ? (
        <>
          <p>
            <strong>{count}</strong> task{count === 1 ? "" : "s"} live in <strong>{room.name}</strong>.
            Deleting the room orphans them — tasks without a room are invisible on every board.
          </p>
          {others.length > 0 && (
            <label className="flex items-center gap-1">
              Move them to
              <select
                aria-label="Move tasks to room"
                className="rounded border bg-card px-1 py-0.5"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
              >
                <option value="">— pick a room —</option>
                {others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              first
            </label>
          )}
        </>
      ) : (
        <p>
          Delete <strong>{room.name}</strong>? Its assignment rules go with it.
        </p>
      )}
      <div className="flex gap-1">
        {count > 0 && others.length > 0 && (
          <Button size="xs" variant="outline" disabled={!moveTo} onClick={() => void doDelete(true)}>
            Move tasks & delete
          </Button>
        )}
        <Button
          size="xs"
          variant="destructive"
          disabled={tasks === null}
          onClick={() => void doDelete(false)}
        >
          {count > 0 ? "Delete anyway" : "Delete"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}

export function RoomsManager({
  projectId,
  projectName,
}: {
  /** null = the HQ & shared section (rooms without a project). */
  projectId: string | null;
  projectName: string;
}) {
  const allRooms = useRoomsStore((s) => s.rooms);
  const rooms = useMemo(() => roomsForProject(allRooms, projectId), [allRooms, projectId]);
  const move = useRoomsStore((s) => s.move);
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [rulesFor, setRulesFor] = useState<string | null>(null);

  return (
    <section
      data-testid={`rooms-manager-${projectId ?? "hq"}`}
      className="flex w-72 flex-col gap-1 rounded border border-dashed p-2"
    >
      <div className="flex items-center gap-1">
        <h4 className="flex-1 text-xs font-medium text-muted-foreground">🚪 Rooms · {projectName}</h4>
        {editing === null && (
          <Button
            size="xs"
            variant="ghost"
            data-testid={`add-room-${projectId ?? "hq"}`}
            onClick={() => setEditing("new")}
          >
            ＋ room
          </Button>
        )}
      </div>

      {editing !== null && (
        <RoomForm
          room={editing === "new" ? null : editing}
          projectId={projectId}
          onClose={() => setEditing(null)}
        />
      )}

      {rooms.length === 0 && editing === null && (
        <p className="text-xs text-muted-foreground">No rooms yet — sessions have nowhere to hang out.</p>
      )}

      {rooms.map((room, idx) => (
        <div key={room.id} className="flex flex-col gap-1">
          <div
            data-testid={`room-row-${room.id}`}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent/10"
            style={{ borderLeft: `2px solid ${room.color ?? "transparent"}` }}
          >
            <span aria-hidden>{room.icon ?? "🚪"}</span>
            <span className="flex-1 truncate font-medium">{room.name}</span>
            {room.is_hq && (
              <span
                className="rounded bg-accent/20 px-1 text-[10px] text-accent uppercase"
                title="HQ — the cross-project home base"
              >
                hq
              </span>
            )}
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Move ${room.name} up`}
              disabled={idx === 0}
              onClick={() => void move(room.id, -1)}
            >
              ↑
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Move ${room.name} down`}
              disabled={idx === rooms.length - 1}
              onClick={() => void move(room.id, 1)}
            >
              ↓
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Rules for ${room.name}`}
              onClick={() => setRulesFor((id) => (id === room.id ? null : room.id))}
            >
              ⚙
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Edit ${room.name}`}
              onClick={() => setEditing(room)}
            >
              ✎
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Delete ${room.name}`}
              onClick={() => setDeleting(room)}
            >
              ✕
            </Button>
          </div>
          {deleting?.id === room.id && <DeleteGuard room={room} onClose={() => setDeleting(null)} />}
          {rulesFor === room.id && <RuleEditor room={room} />}
        </div>
      ))}
    </section>
  );
}
