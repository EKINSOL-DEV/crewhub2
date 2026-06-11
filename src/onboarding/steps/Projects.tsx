// Wizard projects step (T9, D-M6-3): rank the watcher's recent-project scan
// for one-click multi-select registration — NO new filesystem scanner — plus
// the existing `pick_folder` for fresh machines with no transcripts.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type RecentProject } from "@/ipc/bindings";
import { dirName, useProjectsStore } from "@/stores/projects";
import { useOnboarding } from "@/stores/onboarding";

function ago(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function ProjectsStep() {
  const [recent, setRecent] = useState<RecentProject[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createdIds = useOnboarding((s) => s.createdProjectIds);
  const projects = useProjectsStore((s) => s.projects);

  useEffect(() => {
    void useProjectsStore.getState().load();
    commands
      .scanRecentProjects()
      .then((res) => setRecent(res.status === "ok" && Array.isArray(res.data) ? res.data : []))
      .catch(() => setRecent([]));
  }, []);

  const created = projects.filter((p) => createdIds.includes(p.id));

  async function register(folderPath: string): Promise<void> {
    const res = await useProjectsStore.getState().create({
      name: dirName(folderPath),
      description: null,
      icon: null,
      color: null,
      folder_path: folderPath,
      docs_path: null,
    });
    if (res.status === "ok") useOnboarding.getState().addCreatedProject(res.data.id);
    else setError(res.error);
  }

  async function addSelected() {
    setBusy(true);
    setError(null);
    for (const path of picked) await register(path);
    setPicked(new Set());
    setRecent((r) => r?.filter((p) => !picked.has(p.path)) ?? r);
    setBusy(false);
  }

  async function pickManually() {
    setError(null);
    try {
      const res = await commands.pickFolder();
      if (res.status === "ok" && res.data) await register(res.data);
    } catch {
      // dialog unavailable — nothing to do
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">📁 Your projects</h2>
      <p className="text-sm text-muted-foreground">
        A project is just a folder CrewHub knows about — sessions, docs and the board all hang off it.
      </p>

      {recent === null ? (
        <p className="text-xs text-muted-foreground">Checking your recent session history…</p>
      ) : recent.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="recent-projects">
          <p className="text-xs font-medium">Found in your recent sessions — pick any:</p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {recent.map((r) => (
              <li key={r.path}>
                <label className="flex items-center gap-2 rounded border px-2 py-1 text-xs hover:bg-muted">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.path}`}
                    checked={picked.has(r.path)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(r.path);
                      else next.delete(r.path);
                      setPicked(next);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono">{r.path}</span>
                  <span className="shrink-0 text-muted-foreground">{ago(r.last_active_ms)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div>
            <Button
              size="sm"
              data-testid="add-selected-projects"
              disabled={picked.size === 0 || busy}
              onClick={() => void addSelected()}
            >
              {busy ? "Registering…" : `➕ Register ${picked.size || ""} selected`}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="no-recent-projects">
          No session history to suggest from — pick a folder by hand below.
        </p>
      )}

      <div>
        <Button size="sm" variant="outline" data-testid="pick-folder" onClick={() => void pickManually()}>
          📂 Choose a folder…
        </Button>
      </div>

      {created.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-2" data-testid="created-projects">
          <p className="text-xs font-medium">Registered:</p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {created.map((p) => (
              <li key={p.id}>
                ✅ {p.name} <span className="font-mono">({p.folder_path})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
