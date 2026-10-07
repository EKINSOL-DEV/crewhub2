/* Small word helpers the sections share. */

/** "just now", "3 min ago", "2 h ago", "yesterday": source time, never the wall clock. */
export function agoWords(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** The ticket page in the loops web app, or null when there is none to open (the demo). */
export function ticketHref(loopsUrl: string | null, ticketKey: string): string | null {
  return loopsUrl ? `${loopsUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(ticketKey)}` : null;
}

export const STATUS_WORDS = { backlog: "backlog", planned: "planned", in_progress: "in progress", review: "review", done: "done" } as const;
