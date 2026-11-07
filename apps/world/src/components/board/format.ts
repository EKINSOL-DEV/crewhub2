/* Source: crewhub-loops apps/web/src/components/board/format.tsx @ a1bed0f, `timeAgo` only (the copied chat uses nothing
   else from it). Unchanged; change it in crewhub-loops. */
type T = (key: string, vars?: Record<string, string | number>) => string;

/* "now", "18m", "3h", "2d" like the prototypes; older than 30 days = a date. */
export function timeAgo(t: T, iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("time.now");
  if (min < 60) return t("time.minutes", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("time.hours", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("time.days", { n: d });
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
