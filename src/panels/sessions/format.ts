// Pure formatting helpers for the sessions panel (T22, EKI-74).
import type { UsageTotals } from "@/ipc/bindings";

/** 950 → "950", 12_345 → "12.3k", 4_100_000 → "4.1M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim1(n / 1000)}k`;
  return `${trim1(n / 1_000_000)}M`;
}

function trim1(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Compact usage strip: `12.3k ▸ 4.1k` (in ▸ out). */
export function formatUsage(u: UsageTotals): string {
  return `${formatTokens(u.input_tokens)} ▸ ${formatTokens(u.output_tokens)}`;
}

/** Relative last-activity: "just now", "42s", "5m", "3h", "2d". */
export function formatRelative(ms: number, now: number): string {
  const delta = Math.max(0, now - ms);
  if (delta < 10_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}
