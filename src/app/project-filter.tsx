// Global project filter (EKI-22): tab-scoped (WorkspaceTab.projectFilter),
// exposed to every panel through useProjectFilter(). Pure predicate first.
import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { commands, type Project } from "@/ipc/bindings";
import { usePalette, type PaletteAction } from "@/stores/palette";
import { useWorkspace } from "@/stores/workspace";

// ── Pure predicate ───────────────────────────────────────────────────────────

/** True when `path` equals `root` or sits underneath it (worktrees included). */
export function pathUnderRoot(path: string, root: string): boolean {
  const norm = (p: string) => (p.endsWith("/") ? p.slice(0, -1) : p);
  const p = norm(path);
  const r = norm(root);
  return p === r || p.startsWith(`${r}/`);
}

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

// ── Projects store (read-only list for the switcher + predicate) ─────────────

interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  load: () => Promise<void>;
}

export const useProjects = create<ProjectsState>((set) => ({
  projects: [],
  loaded: false,
  load: async () => {
    try {
      const res = await commands.listProjects();
      if (res.status === "ok" && Array.isArray(res.data)) set({ projects: res.data, loaded: true });
      else set({ loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

/** Test-only reset. */
export function resetProjectsForTests() {
  useProjects.setState({ projects: [], loaded: false });
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
