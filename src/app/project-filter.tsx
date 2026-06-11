// Global project filter (EKI-22): tab-scoped (WorkspaceTab.projectFilter),
// exposed to every panel through useProjectFilter(). Pure predicate first.
// The projects list itself lives in stores/projects.ts since M3 T7 (EKI-85):
// one store, reconciled on ProjectChanged, so the switcher picks up newly
// registered projects live. Re-exported here for the M2 import paths.
import { useCallback, useEffect } from "react";
import type { Project } from "@/ipc/bindings";
import { pathUnderRoot, resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { usePalette, type PaletteAction } from "@/stores/palette";
import { useWorkspace } from "@/stores/workspace";

export { pathUnderRoot, resetProjectsForTests };

/** The M2 name for the projects store — panels/tests import it as useProjects. */
export const useProjects = useProjectsStore;

// ── Pure predicate ───────────────────────────────────────────────────────────

/**
 * No filter → everything matches. Filter set → the session's project_path
 * must live under the project's folder_path. Unknown project id → fail open
 * (a stale filter should never blank every panel).
 */
export function matchesProjectFilter(
  projectPath: string,
  projectId: string | null,
  projects: Project[],
): boolean {
  if (!projectId) return true;
  const project = projects.find((p) => p.id === projectId);
  if (!project) return true;
  return pathUnderRoot(projectPath, project.folder_path);
}

// ── The hook every panel consumes ────────────────────────────────────────────

export function useProjectFilter() {
  const projectId = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId)?.projectFilter ?? null);
  const setProjectFilter = useWorkspace((s) => s.setProjectFilter);
  const projects = useProjects((s) => s.projects);
  const project = projects.find((p) => p.id === projectId) ?? null;

  const matchesFilter = useCallback(
    (projectPath: string) => matchesProjectFilter(projectPath, projectId, projects),
    [projectId, projects],
  );

  return { projectId, project, projects, setProjectFilter, matchesFilter };
}

// ── Shell-header switcher (+ palette action source) ──────────────────────────

export function ProjectSwitcher() {
  const { projectId, projects, setProjectFilter } = useProjectFilter();
  const load = useProjects((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const actions: PaletteAction[] = [
      {
        id: "project.filter.all",
        label: "Project filter: all projects",
        emoji: "🌐",
        group: "Projects",
        keywords: ["project", "filter", "all", "everything", "clear"],
        run: () => useWorkspace.getState().setProjectFilter(null),
      },
      ...projects.map((p) => ({
        id: `project.filter.${p.id}`,
        label: `Project filter: ${p.name}`,
        emoji: p.icon ?? "📁",
        group: "Projects",
        keywords: ["project", "filter", "switch", p.name],
        run: () => useWorkspace.getState().setProjectFilter(p.id),
      })),
    ];
    return usePalette.getState().registerActions("projects", actions);
  }, [projects]);

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <span aria-hidden>📁</span>
      <select
        data-testid="project-switcher"
        aria-label="Project filter"
        className="max-w-36 rounded border bg-card px-1 py-0.5 text-xs text-foreground"
        value={projectId ?? ""}
        onChange={(e) => setProjectFilter(e.target.value || null)}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
