// Shared seeded-randomness helpers (M2 T6): the sim, the campus layout, and
// character coloring all need the same tiny, dependency-free PRNG/hash so
// the world replays identically forever — one implementation, not three.

/** mulberry32 — tiny seeded PRNG; callers must replay identically forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-string hash — used to place/color things deterministically off a key. */
export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
