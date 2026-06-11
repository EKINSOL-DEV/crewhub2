// Pure grouping for the history panel (T24, EKI-78).
import type { ArchivedSession } from "@/ipc/bindings";

/** "Today", "Yesterday", or a locale date. */
export function dayLabel(ms: number, now: number): string {
  const day = new Date(ms);
  const ref = new Date(now);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(day, ref)) return "Today";
  const yesterday = new Date(now - 86_400_000);
  if (sameDay(day, yesterday)) return "Yesterday";
  return day.toLocaleDateString();
}

export interface ArchiveGroup {
  label: string;
  sessions: ArchivedSession[];
}

/** Group by day label, newest first inside and across groups. */
export function groupArchived(sessions: ArchivedSession[], now: number): ArchiveGroup[] {
  const sorted = [...sessions].sort((a, b) => b.last_modified_ms - a.last_modified_ms);
  const groups: ArchiveGroup[] = [];
  for (const s of sorted) {
    const label = dayLabel(s.last_modified_ms, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.sessions.push(s);
    else groups.push({ label, sessions: [s] });
  }
  return groups;
}

/** Short project name for a row: the folder's basename. */
export function projectName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
