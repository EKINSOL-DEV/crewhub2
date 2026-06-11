// Projects panel (M3 T7/T8, EKI-85/EKI-87): register projects via the native
// folder picker, see per-project stats, auto-suggest projects found in session
// history, and manage rooms + assignment rules per project (RoomsManager).
import { useEffect, useState } from "react";
import { openPanel } from "@/app/palette-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { commands, type ArchivedSession, type Project, type Task } from "@/ipc/bindings";
import { projectStats, suggestProjects, useProjectsStore } from "@/stores/projects";
import { useRoomsStore } from "@/stores/rooms";
import { useNow } from "../sessions/useNow";
import { ProjectCard } from "./ProjectCard";
import { ProjectForm } from "./ProjectForm";
import { RoomsManager } from "./RoomsManager";

export function ProjectsPanel() {
  const { projects, loaded, remove } = useProjectsStore();
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [archived, setArchived] = useState<ArchivedSession[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    void useProjectsStore.getState().load();
    void useRoomsStore.getState().load();
  }, []);

  // Stats + auto-suggest sources, refetched when the registered list changes
  // (a freshly registered project should leave the suggestions immediately).
  useEffect(() => {
    let cancelled = false;
    commands
      .listArchivedSessions(null)
      .then((res) => {
        if (!cancelled && res.status === "ok" && Array.isArray(res.data)) setArchived(res.data);
      })
      .catch(() => undefined);
    commands
      .listTasks()
      .then((res) => {
        if (!cancelled && res.status === "ok" && Array.isArray(res.data)) setTasks(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projects.length]);

  const suggestions = suggestProjects(archived, projects);
  const visible = projects.filter((p) => showArchived || p.status !== "archived");
  const archivedCount = projects.length - projects.filter((p) => p.status !== "archived").length;

  const registerSuggestion = async (folder: string, name: string) => {
    setError(null);
    const res = await useProjectsStore.getState().create({
      name,
      description: null,
      icon: "📁",
      color: null,
      folder_path: folder,
      docs_path: null,
    });
    if (res.status === "error") setError(`That folder didn't work out: ${res.error}`);
  };

  return (
    <div data-testid="projects-panel" className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">🗺️ Projects</h2>
        {archivedCount > 0 && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            show archived ({archivedCount})
          </label>
        )}
        {projects.length > 0 && editing === null && (
          <Button size="sm" onClick={() => setEditing("new")}>
            Register
          </Button>
        )}
      </div>

      {error && (
        <p data-testid="projects-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {editing !== null && (
        <ProjectForm project={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      {loaded && projects.length === 0 && editing === null && (
        <EmptyState
          emoji="🗺️"
          title="Register your first project"
          hint="Point CrewHub at a folder — rooms, docs and boards hang off it."
          action={
            <Button size="sm" data-testid="register-first" onClick={() => setEditing("new")}>
              Register a project
            </Button>
          }
        />
      )}

      {confirmDelete && (
        <div
          data-testid="confirm-delete"
          className="rounded border border-red-500/50 bg-red-500/10 p-2 text-xs"
        >
          <p>
            Delete <strong>{confirmDelete.name}</strong>? Its rooms and tasks go with it (the folder on disk
            is untouched). Archiving keeps everything.
          </p>
          <div className="mt-1 flex gap-2">
            <Button
              size="xs"
              variant="destructive"
              onClick={() => {
                void remove(confirmDelete.id).then((err) => err && setError(err));
                setConfirmDelete(null);
              }}
            >
              Delete it
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div data-testid="project-cards" className="flex flex-wrap gap-2">
          {visible.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <ProjectCard
                project={p}
                stats={projectStats(p, archived, tasks)}
                now={now}
                onEdit={() => setEditing(p)}
                onDelete={() => setConfirmDelete(p)}
                onOpenDocs={() => openPanel("docs", { projectId: p.id })}
              />
              <RoomsManager projectId={p.id} projectName={p.name} />
            </div>
          ))}
        </div>
      )}

      {/* HQ & shared rooms (project_id = null) — the cross-project home base. */}
      {loaded && projects.length > 0 && <RoomsManager projectId={null} projectName="HQ & shared" />}

      {suggestions.length > 0 && (
        <section data-testid="project-suggestions" className="flex flex-col gap-1">
          <h3 className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Found in your session history
          </h3>
          {suggestions.map((s) => (
            <div key={s.folder_path} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs">
              <span className="flex-1 truncate font-mono" title={s.folder_path}>
                {s.folder_path}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {s.session_count} session{s.session_count === 1 ? "" : "s"}
              </span>
              <Button
                size="xs"
                variant="outline"
                data-testid={`suggest-register-${s.name}`}
                onClick={() => void registerSuggestion(s.folder_path, s.name)}
              >
                Register
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
