// Project card (M3 T7, EKI-85): icon/color, recent-session stats, open-task
// counts, quick actions. The git status strip is Lane F's component
// (panels/diff/GitStrip) — its slot here stays empty until F lands (T17 wires
// it into the slot below).
import { Button } from "@/components/ui/button";
import type { Project } from "@/ipc/bindings";
import { useWorkspace } from "@/stores/workspace";
import { formatRelative } from "../sessions/format";
import { HandoffMenu } from "../sessions/HandoffMenu";
import type { ProjectStats } from "@/stores/projects";

/** "2 todo · 1 in progress" — only statuses that occur, stable order. */
export function taskSummary(byStatus: Record<string, number>): string {
  const ORDER = ["todo", "in_progress", "review", "blocked", "done"];
  return ORDER.flatMap((s) => (byStatus[s] ? [`${byStatus[s]} ${s.replace("_", " ")}`] : [])).join(" · ");
}

export function ProjectCard({
  project,
  stats,
  now,
  onEdit,
  onDelete,
  onOpenDocs,
}: {
  project: Project;
  stats: ProjectStats;
  now: number;
  onEdit: () => void;
  onDelete: () => void;
  /** Wired once the docs panel exists (T9); null hides the button. */
  onOpenDocs: (() => void) | null;
}) {
  const setProjectFilter = useWorkspace((s) => s.setProjectFilter);
  const archived = project.status === "archived";
  const tasks = taskSummary(stats.tasks_by_status);

  return (
    <div
      data-testid={`project-card-${project.id}`}
      className="pop-in flex w-72 flex-col gap-1.5 rounded border p-2 text-xs"
      style={{ borderLeft: `3px solid ${project.color ?? "var(--border)"}` }}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-base">
          {project.icon ?? "📁"}
        </span>
        <span className="flex-1 truncate text-sm font-medium" title={project.name}>
          {project.name}
        </span>
        {archived && (
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground uppercase">archived</span>
        )}
      </div>

      {project.description && (
        <p className="truncate text-muted-foreground" title={project.description}>
          {project.description}
        </p>
      )}

      <p className="truncate font-mono text-[10px] text-muted-foreground" title={project.folder_path}>
        {project.folder_path}
      </p>

      <p data-testid="project-stats" className="text-muted-foreground">
        {stats.archived_sessions > 0
          ? `${stats.archived_sessions} session${stats.archived_sessions === 1 ? "" : "s"} · last ${formatRelative(stats.last_activity_ms ?? 0, now)}`
          : "no sessions yet"}
        {tasks && ` · ${tasks}`}
      </p>

      {/* Git strip slot — Lane F's <GitStrip projectPath={…}/> mounts here (T17). */}
      <div data-testid="git-strip-slot" />

      <div className="flex flex-wrap items-center gap-1 border-t pt-1.5">
        <Button size="xs" variant="outline" onClick={onEdit}>
          Edit
        </Button>
        {onOpenDocs && (
          <Button size="xs" variant="outline" onClick={onOpenDocs}>
            Docs
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          title="Scope every panel in this tab to the project"
          onClick={() => setProjectFilter(project.id)}
        >
          Focus
        </Button>
        <HandoffMenu projectPath={project.folder_path} sessionId={null} />
        <span className="flex-1" />
        <Button size="xs" variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
