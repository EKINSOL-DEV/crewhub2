// Quick-move menu option tables, ported from v1's TaskCard
// `getQuickStatusOptions` / `getMoveStatusOptions` (D-M3-1: drag is NEVER the
// only path — this menu ships first, drag second). Pure tables, no React.
import { type TaskStatus } from "./task-constants";

export interface MoveOption {
  status: TaskStatus;
  emoji: string;
  label: string;
  /** Quick options are surfaced above the divider — the one-click verbs. */
  quick: boolean;
}

/** Prominent one-click verbs for the current state (v1's quick options). */
export function quickStatusOptions(status: TaskStatus): MoveOption[] {
  const options: MoveOption[] = [];
  if (status === "in_progress" || status === "review") {
    options.push({ status: "done", emoji: "✅", label: "Mark as Done", quick: true });
  }
  if (status === "in_progress") {
    options.push({ status: "blocked", emoji: "⚠️", label: "Mark blocked", quick: true });
  }
  return options;
}

/** The full "Move to …" list — every other column is always reachable. */
export function moveStatusOptions(status: TaskStatus): MoveOption[] {
  const options: MoveOption[] = [];
  if (status !== "todo") options.push({ status: "todo", emoji: "📋", label: "Move to To Do", quick: false });
  if (status !== "in_progress")
    options.push({ status: "in_progress", emoji: "🔄", label: "Move to In Progress", quick: false });
  if (status !== "review")
    options.push({ status: "review", emoji: "👀", label: "Move to Review", quick: false });
  if (status !== "done") options.push({ status: "done", emoji: "✅", label: "Move to Done", quick: false });
  if (status !== "blocked")
    options.push({ status: "blocked", emoji: "🚧", label: "Mark blocked", quick: false });
  return options;
}

/** The composed menu: quick verbs first, then the moves not already offered. */
export function quickMoveMenu(status: TaskStatus): MoveOption[] {
  const quick = quickStatusOptions(status);
  const seen = new Set(quick.map((o) => o.status));
  return [...quick, ...moveStatusOptions(status).filter((o) => !seen.has(o.status))];
}
