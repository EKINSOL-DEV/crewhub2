// Pure agent↔session derivations for the crew bar (T20, EKI-36).
import type { SessionStatus, SpawnSpec } from "@/ipc/bindings";
import type { Agent } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { DEFAULT_MODEL } from "@/components/ModelPicker";

/** Most-attention-worthy first: 🙋 beats 🔨 beats 💬 beats 😴. */
const STATUS_PRIORITY: SessionStatus[] = [
  "WaitingForPermission",
  "Working",
  "WaitingForInput",
  "Idle",
  "Ended",
];

/** Sessions currently bound to this agent and still alive. */
export function agentLiveSessions(agentId: string, views: SessionView[]): SessionView[] {
  return views.filter((v) => v.binding?.agent_id === agentId && v.meta.status !== "Ended");
}

/** Derived crew-bar status: the highest-priority status among bound live sessions. */
export function agentStatus(live: SessionView[]): SessionStatus | null {
  for (const status of STATUS_PRIORITY) {
    if (live.some((v) => v.meta.status === status)) return status;
  }
  return null;
}

const PERMISSION_MODES = new Set(["Default", "AcceptEdits", "Plan", "BypassPermissions"]);

/** Spawn spec from agent defaults (haiku fallback per D-M2-7). */
export function agentSpawnSpec(agent: Agent): SpawnSpec | { error: string } {
  if (!agent.project_path) {
    return { error: `${agent.name} has no home project — set one in the agent editor first.` };
  }
  return {
    project_path: agent.project_path,
    prompt: null,
    model: agent.default_model ?? DEFAULT_MODEL,
    permission_mode: PERMISSION_MODES.has(agent.permission_mode)
      ? (agent.permission_mode as SpawnSpec["permission_mode"])
      : "Default",
    resume_session: null,
    fork: false,
    append_system_prompt: agent.system_prompt,
    agent_id: agent.id,
  };
}
