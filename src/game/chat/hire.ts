// Hire / adopt logic (M2 T5): resting crew get spawned into a fresh session,
// settled sessions elsewhere get taken over or forked into a game chat.
// Pure spec-building ports the crew-bar / history-footer flows (cited below)
// with an explicit model override instead of the agent's/session's stored
// default — the dialog always shows a picker.
import { commands, type Agent, type SessionMeta, type SpawnSpec } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { sessionKey } from "@/stores/transcripts";
import type { ModelTierId } from "@/components/ModelPicker";

const PERMISSION_MODES = new Set(["Default", "AcceptEdits", "Plan", "BypassPermissions"]);

/** Port of crew-status.ts:32 agentSpawnSpec, with the model coming from the picker, not agent.default_model. */
export function buildHireSpec(
  agent: Agent,
  opts: { model: ModelTierId; prompt: string | null },
): SpawnSpec | { error: string } {
  if (!agent.project_path) {
    return { error: `${agent.name} has no home project — set one in the agent editor first.` };
  }
  return {
    project_path: agent.project_path,
    prompt: opts.prompt,
    model: opts.model,
    permission_mode: PERMISSION_MODES.has(agent.permission_mode)
      ? (agent.permission_mode as SpawnSpec["permission_mode"])
      : "Default",
    resume_session: null,
    fork: false,
    append_system_prompt: agent.system_prompt,
    agent_id: agent.id,
  };
}

/** Port of HistoryFooter.tsx's go() — resume the session, forking if asked. */
export function buildAdoptSpec(meta: SessionMeta, opts: { fork: boolean }): SpawnSpec {
  return {
    project_path: meta.project_path,
    prompt: null,
    model: meta.model ?? null,
    permission_mode: "Default",
    resume_session: meta.id.id,
    fork: opts.fork,
    append_system_prompt: null,
    agent_id: null,
  };
}

/** Port of HistoryFooter.tsx:14 canTakeOver — settled External/Ended sessions only. */
export function canTakeOver(meta: SessionMeta): boolean {
  const settled = meta.status === "Idle" || meta.status === "Ended";
  return (meta.origin === "External" || meta.status === "Ended") && settled;
}

/** Spawn a fresh session for a resting crew agent, bind it, and hand back its chat key. */
export async function hireAgent(
  agent: Agent,
  opts: { model: ModelTierId; prompt: string | null },
): Promise<{ key: string } | { error: string }> {
  const spec = buildHireSpec(agent, opts);
  if ("error" in spec) return spec;
  const provider = await useAgentsStore.getState().getSpawnProvider();
  if (!provider) return { error: "No spawn-capable provider is available — is the engine running?" };
  const res = await commands.spawnSession(provider, spec);
  if (res.status === "error") return { error: res.error };
  await useBindingsStore.getState().upsert({
    session_id: res.data.id,
    agent_id: agent.id,
    room_id: null,
    display_name: null,
    pinned: false,
  });
  return { key: sessionKey(res.data) };
}

/** Take over or fork a settled/external session into a live chat. */
export async function adoptSession(
  meta: SessionMeta,
  opts: { fork: boolean },
): Promise<{ key: string } | { error: string }> {
  const spec = buildAdoptSpec(meta, opts);
  const provider = meta.id.provider;
  const res = await commands.spawnSession(provider, spec);
  if (res.status === "error") return { error: res.error };
  return { key: sessionKey(res.data) };
}
