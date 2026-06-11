// Session binding UI (T21, EKI-40): bind/unbind agent, assign room, inline
// display name, pin toggle. All writes are optimistic via the bindings store
// (rollback on error). Binding an External session is the explicit "adopt
// into the crew" gesture; room auto-assignment is M3 — manual only here.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { NewSessionBinding } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import type { SessionView } from "@/stores/sessions";

function desiredState(view: SessionView): NewSessionBinding {
  return {
    session_id: view.meta.id.id,
    agent_id: view.binding?.agent_id ?? null,
    room_id: view.binding?.room_id ?? null,
    display_name: view.binding?.display_name ?? null,
    pinned: view.binding?.pinned ?? false,
  };
}

export function BindingControls({ view, onClose }: { view: SessionView; onClose?: () => void }) {
  const agents = useAgentsStore((s) => s.agents);
  const rooms = useBindingsStore((s) => s.rooms);
  const upsert = useBindingsStore((s) => s.upsert);
  const remove = useBindingsStore((s) => s.remove);
  const [name, setName] = useState(view.binding?.display_name ?? "");
  const [error, setError] = useState<string | null>(null);

  const patch = async (changes: Partial<NewSessionBinding>) => {
    setError(null);
    const err = await upsert({ ...desiredState(view), ...changes });
    if (err) setError(err);
  };

  const commitName = () => {
    const display_name = name.trim() || null;
    if (display_name !== (view.binding?.display_name ?? null)) void patch({ display_name });
  };

  return (
    <div data-testid="binding-controls" className="flex flex-col gap-2 rounded border bg-card p-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">{view.binding ? "Session binding" : "Adopt into the crew"}</span>
        <span className="flex-1" />
        {onClose && (
          <Button size="xs" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        )}
      </div>

      <label className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-muted-foreground">Agent</span>
        <select
          aria-label="Bound agent"
          className="flex-1 rounded border bg-background px-1 py-0.5"
          value={view.binding?.agent_id ?? ""}
          onChange={(e) => void patch({ agent_id: e.target.value || null })}
        >
          <option value="">— unbound —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon ?? "🤖"} {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-muted-foreground">Room</span>
        <select
          aria-label="Assigned room"
          className="flex-1 rounded border bg-background px-1 py-0.5"
          value={view.binding?.room_id ?? ""}
          onChange={(e) => void patch({ room_id: e.target.value || null })}
        >
          <option value="">— no room —</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.icon ?? "🚪"} {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-muted-foreground">Name</span>
        <input
          aria-label="Display name"
          className="flex-1 rounded border bg-background px-1 py-0.5"
          placeholder={view.displayName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
          }}
        />
      </label>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            aria-label="Pinned"
            checked={view.binding?.pinned ?? false}
            onChange={(e) => void patch({ pinned: e.target.checked })}
          />
          Pinned
        </label>
        <span className="flex-1" />
        {view.binding && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setError(null);
              void remove(view.meta.id.id).then((err) => err && setError(err));
            }}
          >
            Unbind
          </Button>
        )}
      </div>
      <p className="text-muted-foreground">Rooms are assigned manually in M2 — room rules land in M3.</p>
      {error && (
        <p data-testid="binding-error" className="text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
