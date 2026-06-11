// Crew panel (T19/T20, EKI-32/EKI-36): hire, edit and manage agents.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import type { Agent } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { AgentEditor } from "./AgentEditor";
import { ConfettiBurst } from "./ConfettiBurst";
import { CrewBar } from "./CrewBar";

// Takes no params today; still mounts as a registry panel (PanelProps-compatible).
export function CrewPanel() {
  const { agents, loaded, init, remove } = useAgentsStore();
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    void init();
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
  }, [init]);

  return (
    <div data-testid="crew-panel" className="relative flex h-full flex-col gap-3 overflow-auto p-3">
      {celebrate && <ConfettiBurst onDone={() => setCelebrate(false)} />}

      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">🧑‍🚀 Crew</h2>
        {agents.length > 0 && editing === null && (
          <Button size="sm" onClick={() => setEditing("new")}>
            Hire
          </Button>
        )}
      </div>

      {editing !== null && (
        <AgentEditor
          agent={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(_a, created) => {
            if (created) setCelebrate(true); // Confetti Hire (D-M2-6)
          }}
        />
      )}

      {loaded && agents.length === 0 && editing === null && (
        <EmptyState
          emoji="🧑‍🚀"
          title="Hire your first agent"
          hint="Agents are reusable personas — a name, a model, a working style — you can spawn into any project."
          action={
            <Button size="sm" data-testid="hire-first" onClick={() => setEditing("new")}>
              Hire
            </Button>
          }
        />
      )}

      {agents.length > 0 && (
        <>
          <CrewBar showUnpinned onEdit={(a) => setEditing(a)} />
          {editing !== null && editing !== "new" && (
            <Button
              size="xs"
              variant="destructive"
              className="self-start"
              onClick={() => {
                void remove(editing.id);
                setEditing(null);
              }}
            >
              Fire {editing.name}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
