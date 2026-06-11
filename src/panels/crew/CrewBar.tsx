// Crew bar (T20, EKI-36): pinned agents as avatar cards with live Status
// Critters. Docked into the shell sidebar by Lane A (slot reserved in T7);
// the crew panel reuses it with showUnpinned for full management.
import { useEffect, useState } from "react";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import type { Agent } from "@/ipc/bindings";
import { agentLiveSessions } from "./crew-status";
import { AgentCard } from "./AgentCard";

export function CrewBar({
  onEdit,
  showUnpinned = false,
}: {
  onEdit?: ((a: Agent) => void) | undefined;
  showUnpinned?: boolean;
}) {
  const { agents, init } = useAgentsStore();
  const views = useSessionsView();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void init();
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
  }, [init]);

  const visible = showUnpinned ? agents : agents.filter((a) => a.is_pinned);

  return (
    <div data-testid="crew-bar" className="flex flex-wrap gap-2">
      {visible.map((a) => (
        <AgentCard
          key={a.id}
          agent={a}
          live={agentLiveSessions(a.id, views)}
          onEdit={onEdit}
          onError={setError}
        />
      ))}
      {error && (
        <p data-testid="crew-error" className="w-full text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
