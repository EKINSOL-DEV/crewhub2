/* Small word helpers the sections share. */

/** "<1 min", "3 min", "2 h", "1 day", "4 days": a span in source time, for "not seen for 2 h". */
export function spanWords(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "<1 min";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day" : `${d} days`;
}

/** "just now", "3 min ago", "2 h ago", "yesterday": source time, never the wall clock. */
export function agoWords(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const span = spanWords(now - ts);
  return span === "1 day" ? "yesterday" : `${span} ago`;
}

/** `Date.parse` that answers null for a missing or unreadable stamp, so a row is left out instead of showing NaN. */
export function stampOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

/** The ticket page in the loops web app, or null when there is none to open (the demo). */
export function ticketHref(loopsUrl: string | null, ticketKey: string): string | null {
  return loopsUrl ? `${loopsUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(ticketKey)}` : null;
}

export const STATUS_WORDS = { backlog: "backlog", planned: "planned", in_progress: "in progress", review: "review", done: "done" } as const;

/** A ticket's status in words: a status newer than this build as loops sent it, new to this world (round 48). */
export function statusWords(t: { status: keyof typeof STATUS_WORDS; newStatus: string | null }): string {
  return t.newStatus === null ? STATUS_WORDS[t.status] : `${t.newStatus} (new to this world)`;
}
