// Task wall fold (EKI-75, master plan 19.4): pure math behind the in-world
// task board. Mirrors the kanban columns from the very same tasks-store fold
// the board panel renders — the wall is ambient awareness, the board panel
// owns mutation. No three.js in here.
import type { Task } from "@/ipc/bindings";
import { STATUS_CONFIG, TASK_STATUSES, type TaskStatus } from "@/panels/board/task-constants";
import { groupByStatus } from "@/stores/tasks";

/** Top task titles shown per column — the wall is a glance, not a list. */
export const WALL_TITLE_LIMIT = 3;

/** Per-status block colors — readable from across the room on any floor. */
export const WALL_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#60a5fa",
  in_progress: "#4ade80",
  review: "#c4b5fd",
  done: "#9ca3af",
  blocked: "#fb7185",
};

export interface WallColumn {
  status: TaskStatus;
  label: string;
  color: string;
  count: number;
  /** Urgent-first, freshest-next titles (sortTasks order), capped. */
  titles: string[];
}

export interface WallSummary {
  /** Always all five statuses, board order. */
  columns: WallColumn[];
  total: number;
}

/** What one wall surface shows: a room's tasks, or HQ's cross-project view. */
export type WallScope = { kind: "room"; roomId: string } | { kind: "hq" };

/** Zone → scope: the HQ room's wall totals every project (EKI-75). */
export function wallScopeFor(zone: { id: string; isHq: boolean }): WallScope {
  return zone.isHq ? { kind: "hq" } : { kind: "room", roomId: zone.id };
}

export function summarizeWall(tasks: Task[], scope: WallScope): WallSummary {
  const scoped = scope.kind === "hq" ? tasks : tasks.filter((t) => t.room_id === scope.roomId);
  const groups = groupByStatus(scoped); // drops unknown statuses, sorts columns
  let total = 0;
  const columns = TASK_STATUSES.map((status) => {
    const inColumn = groups[status];
    total += inColumn.length;
    return {
      status,
      label: STATUS_CONFIG[status].label,
      color: WALL_STATUS_COLORS[status],
      count: inColumn.length,
      titles: inColumn.slice(0, WALL_TITLE_LIMIT).map((t) => t.title),
    };
  });
  return { columns, total };
}

// ── Wall geometry helpers (pure layout, consumed by TaskWall3D) ──────────────

export interface ColumnSlot {
  /** Slot center along the wall's local x, 0 = wall center. */
  x: number;
  w: number;
}

/** Split `width` into `n` uniform slots separated by `gap`, centered on 0. */
export function columnSlots(width: number, n: number, gap: number): ColumnSlot[] {
  if (n <= 0) return [];
  const w = (width - gap * (n - 1)) / n;
  const left = -width / 2 + w / 2;
  return Array.from({ length: n }, (_, i) => ({ x: left + i * (w + gap), w }));
}

/** Hard ellipsis for 3D text — troika has no CSS truncation. */
export function truncateTitle(title: string, max: number): string {
  return title.length <= max ? title : `${title.slice(0, max - 1)}…`;
}
