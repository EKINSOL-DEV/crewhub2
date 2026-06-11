// Run-with-agent dialog (T12, EKI-95): v1's RunOrSelfDialog fork ported —
// "How do you want to work on this? 🎯". Run spawns a managed session via the
// capability-driven provider with the D-M3-6 prompt envelope (editable
// preview), records run_started linkage and optimistically moves the card to
// in_progress; "do it myself" just moves it. One-off runs default to haiku
// (D-M2-7 — nothing here hardcodes an expensive model).
import { useEffect, useMemo, useState } from "react";
import { openChatPanel } from "@/app/open-chat";
import { useProjects } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { DEFAULT_MODEL, ModelPicker } from "@/components/ModelPicker";
import { commands, type Room, type Task } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useTasksStore } from "@/stores/tasks";
import { asPermissionMode, buildRunPrompt } from "./run-prompt";

const ONE_OFF = "__one_off__";

export interface RunWithAgentDialogProps {
  task: Task;
  room: Room | null;
  onClose: () => void;
  onError: (msg: string) => void;
}

export function RunWithAgentDialog({ task, room, onClose, onError }: RunWithAgentDialogProps) {
  const agents = useAgentsStore((s) => s.agents);
  const projects = useProjects((s) => s.projects);
  const [mode, setMode] = useState<"choose" | "run">("choose");
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? ONE_OFF);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [projectId, setProjectId] = useState<string>(task.project_id ?? projects[0]?.id ?? "");
  const [draft, setDraft] = useState<string | null>(null); // null = not user-edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useProjects.getState().load();
  }, []);

  const agent = agentId === ONE_OFF ? null : (agents.find((a) => a.id === agentId) ?? null);
  const builtPrompt = useMemo(() => buildRunPrompt(task, room, agent?.id ?? null), [task, room, agent]);
  const prompt = draft ?? builtPrompt;

  async function doItMyself() {
    const err = await useTasksStore.getState().move(task.id, "in_progress");
    if (err) onError(err);
    onClose();
  }

  async function run() {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      setError("pick a project — the session needs a working folder");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const provider = await useAgentsStore.getState().getSpawnProvider();
      if (!provider) {
        setError("no provider can spawn sessions right now");
        return;
      }
      const res = await commands.spawnSession(provider, {
        project_path: project.folder_path,
        prompt,
        model: agent ? agent.default_model : model,
        permission_mode: asPermissionMode(agent?.permission_mode),
        resume_session: null,
        fork: false,
        append_system_prompt: null,
        agent_id: agent?.id ?? null,
      });
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      const tasks = useTasksStore.getState();
      tasks.registerRun(task.id, res.data, agent?.id ?? null, agent?.name ?? null);
      const moveErr = await tasks.move(task.id, "in_progress");
      if (moveErr) onError(moveErr);
      openChatPanel({ provider: res.data.provider, id: res.data.id });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="run-with-agent-dialog"
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
      <div className="w-[26rem] max-w-[90%] rounded-lg border bg-card p-4 shadow-xl">
        <h2 className="mb-1 text-sm font-semibold">🎯 How do you want to work on this?</h2>
        <p className="mb-3 text-xs text-muted-foreground">“{task.title}”</p>

        {mode === "choose" ? (
          <div className="flex flex-col gap-2">
            <Button size="sm" data-testid="choose-run" onClick={() => setMode("run")}>
              🤝 Run with agent
            </Button>
            <Button size="sm" variant="outline" data-testid="choose-self" onClick={() => void doItMyself()}>
              🙋 Do it myself
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1 text-xs">
              agent
              <select
                aria-label="Run agent"
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon ?? "🤖"} {a.name}
                  </option>
                ))}
                <option value={ONE_OFF}>⚡ one-off session</option>
              </select>
            </label>
            {!agent && <ModelPicker value={model} onChange={setModel} label="One-off model" />}
            {!task.project_id && (
              <label className="flex items-center gap-1 text-xs">
                project
                <select
                  aria-label="Run project"
                  className="rounded border bg-background px-1 py-0.5 text-xs"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon ?? "📁"} {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs">
              prompt (editable preview)
              <textarea
                aria-label="Run prompt"
                className="min-h-28 rounded border bg-background px-2 py-1 font-mono text-[10px]"
                value={prompt}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button size="xs" disabled={busy} data-testid="run-spawn" onClick={() => void run()}>
                {busy ? "Spawning…" : "🚀 Run"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
