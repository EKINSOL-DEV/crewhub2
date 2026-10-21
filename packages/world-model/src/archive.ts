/**
 * Closed buildings: what the world says about an archived project (since when, in words) and the short window after
 * `project.archived` or `project.restored` in which the renderer plays the closing or the opening. Pure: the dates
 * are read in UTC with fixed English month names, so the words never depend on the browser's locale.
 */
import type { BuildingClosing } from "./model.ts";
import type { ProjectChangeFact } from "./facts.ts";

/** Source-time ms after the event in which a closing or an opening still plays (a late update plays nothing). */
export const CLOSING_MS = 8_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The archive date as "9 Oct 2026" and the whole days since it (never negative); null when the date does not parse. */
export function archivedSince(archivedAt: string, now: number): { date: string; days: number } | null {
  const at = Date.parse(archivedAt);
  if (Number.isNaN(at)) return null;
  const d = new Date(at);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const days = Math.max(0, Math.floor((now - at) / DAY_MS));
  return { date, days };
}

/** "closed since 9 Oct 2026 (11 days)", "closed since 20 Oct 2026 (under a day)"; just "closed" without a readable
 *  date. Under a day is not "today": the date is the UTC day, and a project closed late in the evening shows the day
 *  before the reader's. */
export function archivedWords(archivedAt: string | null | undefined, now: number): string {
  const since = archivedAt ? archivedSince(archivedAt, now) : null;
  if (!since) return "closed";
  const days = since.days === 0 ? "under a day" : since.days === 1 ? "1 day" : `${since.days} days`;
  return `closed since ${since.date} (${days})`;
}

/** The closing or opening to play for a project change at `now`, or null when the window has passed (or not begun). */
export function closingOf(change: ProjectChangeFact | undefined, now: number): BuildingClosing | null {
  if (!change) return null;
  const until = change.ts + CLOSING_MS;
  if (now < change.ts || now >= until) return null;
  return { kind: change.kind, at: change.ts, until };
}
