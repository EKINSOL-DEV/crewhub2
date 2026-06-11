// Palette-launched dialogs (EKI-16): quick session spawn (haiku-default,
// D-M2-7). Small, self-contained, no Radix. The M2 "new task" placeholder
// moved to the board's CreateTaskDialog (T17 — room is required there, the
// v1 room_id lesson).
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_MODEL, isModelTierId, ModelPicker } from "@/components/ModelPicker";
import { commands, type Project } from "@/ipc/bindings";
import { usePalette } from "@/stores/palette";
import { useWorkspace } from "@/stores/workspace";
import { openPanel } from "./palette-actions";
import { useAgentsStore } from "@/stores/agents";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-background/60 pt-24"
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
      <div className="w-[26rem] max-w-[90vw] rounded-lg border bg-card p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SpawnDialog() {
  const setOpen = usePalette((s) => s.setSpawnDialogOpen);
  const projectFilter = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId)?.projectFilter);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPath, setProjectPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await commands.listProjects();
        if (res.status === "ok") {
          setProjects(res.data);
          const filtered = res.data.find((p) => p.id === projectFilter);
          const first = filtered ?? res.data[0];
          if (first) setProjectPath((prev) => prev || first.folder_path);
        }
        const def = await commands.getSetting("model.default_spawn");
        if (def.status === "ok" && isModelTierId(def.data)) setModel(def.data);
      } catch {
        // backend unavailable — keep defaults
      }
    })();
  }, [projectFilter]);

  async function spawn() {
    if (!projectPath.trim()) {
      setError("project path is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const provider = await useAgentsStore.getState().getSpawnProvider();
      if (!provider) throw new Error("No provider can spawn sessions");
      const res = await commands.spawnSession(provider, {
        project_path: projectPath.trim(),
        prompt: prompt.trim() || null,
        model,
        permission_mode: "Default",
        resume_session: null,
        fork: false,
        append_system_prompt: null,
        agent_id: null,
      });
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      openPanel("chat", { sessionId: res.data.id, provider: res.data.provider });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="🚀 Spawn session" onClose={() => setOpen(false)}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs">
          project path
          <input
            data-testid="spawn-project-path"
            list="spawn-projects"
            className="rounded border bg-background px-2 py-1 font-mono text-xs"
            placeholder="/path/to/project"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
          />
          <datalist id="spawn-projects">
            {projects.map((p) => (
              <option key={p.id} value={p.folder_path}>
                {p.name}
              </option>
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          first message (optional)
          <textarea
            className="min-h-16 rounded border bg-background px-2 py-1 text-xs"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <ModelPicker value={model} onChange={setModel} />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void spawn()}>
            {busy ? "Spawning…" : "Spawn"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ShellDialogs() {
  const spawnOpen = usePalette((s) => s.spawnDialogOpen);
  return <>{spawnOpen && <SpawnDialog />}</>;
}
