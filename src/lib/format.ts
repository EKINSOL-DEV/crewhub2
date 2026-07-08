// Shared pure formatting helpers with no dependency on `@/game/*` or
// `@/panels/*` — this is neutral ground both sides may import from (panels
// must never import from game, but everyone may import from `@/lib`).

/** Compact token count: 12300 → "12.3k", 999 → "999", 4_100_000 → "4.1M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
