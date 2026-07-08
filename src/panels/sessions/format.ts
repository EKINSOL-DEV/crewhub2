// Pure formatting helpers for the sessions panel (T22, EKI-74).
import type { UsageTotals } from "@/ipc/bindings";
import { formatTokens } from "@/lib/format";

// Re-exported so existing importers (SessionsPanel.tsx et al., this module's
// own tests) don't need to change — the implementation lives in one place.
export { formatTokens };

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
