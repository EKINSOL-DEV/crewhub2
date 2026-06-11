// Tiny subsequence fuzzy matcher for slash-command hints (EKI-52).

/** Score `query` against `candidate`; higher is better, null = no match. */
export function fuzzyScore(query: string, candidate: string): number | null {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (q.length === 0) return 0;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] === q[qi]) {
      qi++;
      streak++;
      score += streak; // consecutive matches compound
      if (ci === 0) score += 2; // prefix bonus
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return null;
  return score - c.length / 100; // shorter candidates win ties
}

export function fuzzyFilter<T>(query: string, items: readonly T[], text: (t: T) => string): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
    .filter((r): r is { item: T; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
