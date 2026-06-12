// Projects panel (M3 T7/T8 → EKI-124): two clean CRUDs behind playful tabs —
// 🗺️ Projects (cards + register + history suggestions, tucked away) and
// 🚪 Rooms (per-project sections + HQ & shared). The old single-scroll mix of
// cards, room managers and history rows read as noise; tabs give each list
// room to breathe.
import { useEffect, useMemo, useState } from "react";
import { openPanel } from "@/app/palette-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { commands, type ArchivedSession, type Project } from "@/ipc/bindings";
import { projectStats, suggestProjects, useProjectsStore } from "@/stores/projects";
import { useRoomsStore } from "@/stores/rooms";
import { useTasksStore } from "@/stores/tasks";
import { useNow } from "../sessions/useNow";
import { ProjectCard } from "./ProjectCard";
import { ProjectForm } from "./ProjectForm";
import { RoomsManager } from "./RoomsManager";

function TabPill({
  active,
  emoji,
  label,
  count,
  testId,
  onClick,
}: {
  active: boolean;
  emoji: string;
  label: string;
  count: number;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 ${
        active ? "border-primary bg-primary/15 shadow-sm" : "bg-card hover:bg-muted"
      }`}
    >
      <span aria-hidden>{emoji}</span>
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-primary/20" : "bg-muted"}`}
      >
        {count}
      </span>
    </button>
  );
}

export function ProjectsPanel() {
  const { projects, loaded, remove } = useProjectsStore();
  const allRooms = useRoomsStore((s) => s.rooms);
  const [tab, setTab] = useState<"projects" | "rooms">("projects");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [archived, setArchived] = useState<ArchivedSession[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  // Task counts come from Lane E's live tasks store (T17): seeded once,
  // reconciled on TaskChanged — agent moves update the cards without polling.
  const tasksById = useTasksStore((s) => s.byId);
  const tasks = useMemo(() => [...tasksById.values()], [tasksById]);

  useEffect(() => {
    void useProjectsStore.getState().load();
    void useRoomsStore.getState().load();
    void useTasksStore.getState().init();
  }, []);

  // Auto-suggest source, refetched when the registered list changes (a
  // freshly registered project should leave the suggestions immediately).
  useEffect(() => {
    let cancelled = false;
    commands
      .listArchivedSessions(null)
      .then((res) => {
        if (!cancelled && res.status === "ok" && Array.isArray(res.data)) setArchived(res.data);
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
      <div className="flex items-center gap-1.5">
        <TabPill
          active={tab === "projects"}
          emoji="🗺️"
          label="Projects"
          count={visible.length}
          testId="tab-projects"
          onClick={() => setTab("projects")}
        />
        <TabPill
          active={tab === "rooms"}
          emoji="🚪"
          label="Rooms"
          count={allRooms.length}
          testId="tab-rooms"
          onClick={() => setTab("rooms")}
        />
        <span className="flex-1" />
        {tab === "projects" && archivedCount > 0 && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            show archived ({archivedCount})
          </label>
        )}
        {tab === "projects" && projects.length > 0 && editing === null && (
          <Button size="sm" onClick={() => setEditing("new")}>
            ➕ New project
          </Button>
        )}
      </div>

      {error && (
        <p data-testid="projects-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {tab === "projects" && (
        <>
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
              className="rounded-xl border border-red-500/50 bg-red-500/10 p-2 text-xs"
            >
              <p>
                Delete <strong>{confirmDelete.name}</strong>? Its rooms and tasks go with it (the folder on
                disk is untouched). Archiving keeps everything.
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
            <div data-testid="project-cards" className="flex flex-wrap gap-2.5">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  stats={projectStats(p, archived, tasks)}
                  now={now}
                  onEdit={() => setEditing(p)}
                  onDelete={() => setConfirmDelete(p)}
                  onOpenDocs={() => openPanel("docs", { projectId: p.id })}
                />
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <section data-testid="project-suggestions" className="mt-auto flex flex-col gap-1">
              <button
                type="button"
                data-testid="toggle-suggestions"
                className="flex items-center gap-1.5 rounded-full px-1 py-0.5 text-left text-[10px] font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
                onClick={() => setShowSuggestions((s) => !s)}
              >
                <span aria-hidden>{showSuggestions ? "▾" : "▸"}</span>
                📂 Found in your session history ({suggestions.length})
              </button>
              {showSuggestions &&
                suggestions.map((s) => (
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
        </>
      )}

      {tab === "rooms" && (
        <div className="flex flex-col gap-2.5">
          {projects
            .filter((p) => p.status !== "archived")
            .map((p) => (
              <RoomsManager key={p.id} projectId={p.id} projectName={`${p.icon ?? "📁"} ${p.name}`} />
            ))}
          {/* HQ & shared rooms (project_id = null) — the cross-project home base. */}
          {loaded && <RoomsManager projectId={null} projectName="🏛️ HQ & shared" />}
        </div>
      )}
    </div>
  );
}
