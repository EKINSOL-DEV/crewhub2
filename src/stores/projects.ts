// Projects store (M3 T7, EKI-85): THE projects source for every surface —
// the projects panel, the shell's project-filter switcher (which re-exports
// this store) and any panel needing the registered list. Seeded by
// list_projects, reconciled on DomainEvent::ProjectChanged so agent/MCP-made
// changes appear live. Pure helpers first (M2 plan §3.1 discipline).
import { create } from "zustand";
import { commands, type ArchivedSession, type NewProject, type Project, type Task } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** True when `path` equals `root` or sits underneath it (worktrees included). */
export function pathUnderRoot(path: string, root: string): boolean {
  const norm = (p: string) => (p.endsWith("/") ? p.slice(0, -1) : p);
  const p = norm(path);
  const r = norm(root);
  return p === r || p.startsWith(`${r}/`);
}

/** Basename of a folder path — the default name for a registered project. */
export function dirName(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const base = trimmed.split("/").pop();
  return base || path;
}

export interface ProjectSuggestion {
  folder_path: string;
  /** Defaults to the directory name (one-click register, EKI-85). */
  name: string;
  session_count: number;
  last_modified_ms: number;
}

/**
 * "Found in your session history" (EKI-85 auto-suggest): distinct archived
 * `project_path`s not yet covered by a registered project root (subpaths of a
 * registered root count as covered — worktrees should not re-suggest the
 * project). Newest activity first.
 */
export function suggestProjects(archived: ArchivedSession[], registered: Project[]): ProjectSuggestion[] {
  const byPath = new Map<string, ProjectSuggestion>();
  for (const a of archived) {
    if (!a.project_path) continue;
    if (registered.some((p) => pathUnderRoot(a.project_path, p.folder_path))) continue;
    const cur = byPath.get(a.project_path);
    if (cur) {
      cur.session_count += 1;
      cur.last_modified_ms = Math.max(cur.last_modified_ms, a.last_modified_ms);
    } else {
      byPath.set(a.project_path, {
        folder_path: a.project_path,
        name: dirName(a.project_path),
        session_count: 1,
        last_modified_ms: a.last_modified_ms,
      });
    }
  }
  return [...byPath.values()].sort((x, y) => y.last_modified_ms - x.last_modified_ms);
}

export interface ProjectStats {
  /** Archived sessions whose project_path lives under the project root. */
  archived_sessions: number;
  /** Newest archived activity, or null when the project has no history. */
  last_activity_ms: number | null;
  /** Task counts keyed by status (only statuses that occur appear). */
  tasks_by_status: Record<string, number>;
  /** Everything that is not `done`. */
  open_tasks: number;
}

/** Client-side stats join for a project card (EKI-85): sessions + tasks. */
export function projectStats(project: Project, archived: ArchivedSession[], tasks: Task[]): ProjectStats {
  let count = 0;
  let last: number | null = null;
  for (const a of archived) {
    if (!pathUnderRoot(a.project_path, project.folder_path)) continue;
    count += 1;
    last = Math.max(last ?? 0, a.last_modified_ms);
  }
  const byStatus: Record<string, number> = {};
  let open = 0;
  for (const t of tasks) {
    if (t.project_id !== project.id) continue;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.status !== "done") open += 1;
  }
  return {
    archived_sessions: count,
    last_activity_ms: last,
    tasks_by_status: byStatus,
    open_tasks: open,
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

export type ProjectResult = { status: "ok"; data: Project } | { status: "error"; error: string };

interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  /** Seed + subscribe exactly once; later calls are no-ops (safe per mount). */
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (input: NewProject) => Promise<ProjectResult>;
  update: (project: Project) => Promise<ProjectResult>;
  remove: (id: string) => Promise<string | null>;
}

let started = false;

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,
  refresh: async () => {
    try {
      const res = await commands.listProjects();
      // Array.isArray also guards loosely-mocked IPC (null data) in tests.
      if (res.status === "ok" && Array.isArray(res.data)) set({ projects: res.data });
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },
  load: async () => {
    if (started) return;
    started = true;
    await get().refresh();
    try {
      await onDomainEvent((e) => {
        if (e.type === "ProjectChanged") void get().refresh();
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },
  create: async (input) => {
    try {
      const res = await commands.createProject(input);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  update: async (project) => {
    try {
      const res = await commands.updateProject(project);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  remove: async (id) => {
    try {
      const res = await commands.deleteProject(id);
      if (res.status === "error") return res.error;
      await get().refresh();
      return null;
    } catch (e) {
      return String(e);
    }
  },
}));

/** Test-only reset. */
export function resetProjectsForTests() {
  started = false;
  useProjectsStore.setState({ projects: [], loaded: false });
}
