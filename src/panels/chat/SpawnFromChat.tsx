// Spawn-from-chat (EKI-52): an unbound chat panel offers agent pick +
// ModelPicker (haiku default for one-offs — D-M2-7) and calls spawnSession.
import { useEffect, useState } from "react";
import { DEFAULT_SPAWN_MODEL, ModelPicker } from "@/components/ModelPicker";
import { commands, type Agent, type Project, type SessionId } from "@/ipc/bindings";

export function SpawnFromChat({ onSpawned }: { onSpawned: (id: SessionId) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [projectPath, setProjectPath] = useState("");
  const [model, setModel] = useState(DEFAULT_SPAWN_MODEL);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void commands
      .listAgents()
      .then((r) => r.status === "ok" && setAgents(r.data))
      .catch(() => {});
    void commands
      .listProjects()
      .then((r) => r.status === "ok" && setProjects(r.data))
      .catch(() => {});
  }, []);

  const pickAgent = (id: string) => {
    setAgentId(id);
    const agent = agents.find((a) => a.id === id);
    if (agent?.default_model) setModel(agent.default_model);
    if (agent?.project_path) setProjectPath(agent.project_path);
  };

  const spawn = async () => {
    const path = projectPath.trim();
    if (!path) {
      setError("pick a project first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const agent = agents.find((a) => a.id === agentId);
      const res = await commands.spawnSession("claude-code", {
        project_path: path,
        prompt: prompt.trim() ? prompt.trim() : null,
        model,
        permission_mode: "Default",
        resume_session: null,
        fork: false,
        append_system_prompt: agent?.system_prompt ?? null,
        agent_id: agent?.id ?? null,
      });
      if (res.status === "ok") onSpawned(res.data);
      else setError(res.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6" data-testid="spawn-from-chat">
      <div className="text-3xl" aria-hidden="true">
        💤
      </div>
      <div className="text-sm font-medium">Nobody's talking yet — summon a crew member</div>
      <div className="flex w-full max-w-sm flex-col gap-2 text-xs">
        <label className="flex flex-col gap-1">
          crew member (optional)
          <select
            data-testid="spawn-agent"
            className="rounded border border-border bg-card px-2 py-1.5"
            value={agentId}
            onChange={(e) => pickAgent(e.target.value)}
          >
            <option value="">— one-off session —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon ?? "🧑‍🚀"} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          project
          <select
            data-testid="spawn-project"
            className="rounded border border-border bg-card px-2 py-1.5"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
          >
            <option value="">— pick a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.folder_path}>
                {p.icon ?? "📁"} {p.name}
              </option>
            ))}
          </select>
        </label>
        <input
          data-testid="spawn-project-path"
          className="rounded border border-border bg-card px-2 py-1.5 font-mono"
          placeholder="…or a raw project path"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
        />
        <ModelPicker value={model} onChange={setModel} />
        <textarea
          data-testid="spawn-prompt"
          rows={2}
          className="resize-none rounded border border-border bg-card px-2 py-1.5"
          placeholder="first message (optional)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {error && (
          <div className="text-destructive" data-testid="spawn-error">
            {error}
          </div>
        )}
        <button
          type="button"
          data-testid="spawn-submit"
          disabled={busy}
          className="rounded-md border border-border bg-accent/20 px-3 py-1.5 font-medium hover:bg-accent/30 disabled:opacity-50"
          onClick={() => void spawn()}
        >
          {busy ? "summoning…" : "🪄 summon"}
        </button>
      </div>
    </div>
  );
}
