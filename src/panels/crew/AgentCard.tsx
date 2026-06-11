// Agent avatar card (T20, EKI-36): Status Critter + Pop-in + hover quick actions.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusEmoji } from "@/components/StatusEmoji";
import { commands, type Agent } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import type { SessionView } from "@/stores/sessions";
import { openChatPanel } from "@/app/open-chat";
import { agentSpawnSpec, agentStatus } from "./crew-status";

export function AgentCard({
  agent,
  live,
  onEdit,
  onError,
}: {
  agent: Agent;
  /** This agent's bound, still-alive sessions (from agentLiveSessions). */
  live: SessionView[];
  onEdit?: ((a: Agent) => void) | undefined;
  onError?: ((msg: string) => void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const status = agentStatus(live);
  const primary = live[0] ?? null;

  const spawn = async () => {
    const spec = agentSpawnSpec(agent);
    if ("error" in spec) {
      onError?.(spec.error);
      return;
    }
    setBusy(true);
    try {
      const res = await commands.spawnSession("claude-code", spec);
      if (res.status === "error") {
        onError?.(res.error);
        return;
      }
      // Binding the fresh session to its agent is what makes it "crew" (T18 join).
      await useBindingsStore.getState().upsert({
        session_id: res.data.id,
        agent_id: agent.id,
        room_id: null,
        display_name: null,
        pinned: false,
      });
      openChatPanel({ provider: res.data.provider, id: res.data.id });
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    if (primary) {
      openChatPanel({ provider: primary.meta.id.provider, id: primary.meta.id.id });
    } else {
      void spawn();
    }
  };

  const stop = async () => {
    for (const v of live) {
      const res = await commands.killSession(v.meta.id);
      if (res.status === "error") onError?.(res.error);
    }
  };

  const toggleAutoSpawn = async () => {
    const res = await useAgentsStore.getState().update({ ...agent, auto_spawn: !agent.auto_spawn });
    if (res.status === "error") onError?.(res.error);
  };

  return (
    <div
      data-testid={`agent-card-${agent.id}`}
      className={`group pop-in relative flex w-36 flex-col items-center gap-1 rounded border p-2 text-center ${
        live.length === 0 ? "opacity-70" : ""
      }`}
      style={agent.color ? { borderColor: agent.color } : undefined}
    >
      <button
        type="button"
        className="flex flex-col items-center gap-1"
        onClick={open}
        disabled={busy}
        title={primary ? `Open chat with ${agent.name}` : `Spawn ${agent.name}`}
      >
        <span className="text-2xl" aria-hidden>
          {agent.icon ?? "🤖"}
        </span>
        <span className="max-w-full truncate text-xs font-medium">{agent.name}</span>
        <span className="text-sm" data-testid="agent-status">
          {status ? (
            <StatusEmoji status={status} title={`${agent.name}: ${status}`} />
          ) : (
            <span className="text-muted-foreground" title="off duty">
              🛋️
            </span>
          )}
        </span>
      </button>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {live.length === 0 ? (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void spawn()}>
            Spawn
          </Button>
        ) : (
          <Button size="xs" variant="outline" onClick={() => void stop()}>
            Stop
          </Button>
        )}
        <Button
          size="xs"
          variant={agent.auto_spawn ? "default" : "ghost"}
          title="Auto-spawn on startup"
          onClick={() => void toggleAutoSpawn()}
        >
          ⚡
        </Button>
        {onEdit && (
          <Button size="xs" variant="ghost" title="Edit agent" onClick={() => onEdit(agent)}>
            ✎
          </Button>
        )}
      </div>
    </div>
  );
}
