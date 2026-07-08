// Shared wall-building helpers, hoisted out of Pavilion.tsx and
// Headquarters.tsx: both had byte-identical local copies of `lighten()` and
// `wallSegments()` (Headquarters.tsx's copy even said so explicitly, citing
// "out of scope" — this task is that scope). Also the canonical source for
// Headquarters' wall-inset/thickness constants, so HqProps.tsx's prop
// placements — previously a hand-copied `0.9` literal — derive from the same
// numbers Headquarters.tsx actually builds its walls with, instead of
// silently drifting if that geometry ever changes.

/** Lighten a `#rrggbb` hex color by adding `amt` to each channel (clamped). */
export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (c: number) => Math.min(255, c + amt);
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export interface WallSegment {
  center: number;
  length: number;
}

/** Split a wall's span into one or two segments, cutting a `gapWidth` hole
 *  centered on `gapCenter` when given; drops any segment that would end up
 *  with zero or negative length. */
export function wallSegments(
  from: number,
  to: number,
  gapCenter: number | null,
  gapWidth: number,
): WallSegment[] {
  if (gapCenter === null) return [{ center: (from + to) / 2, length: to - from }];
  const segments: WallSegment[] = [];
  const gapLo = gapCenter - gapWidth / 2;
  const gapHi = gapCenter + gapWidth / 2;
  if (gapLo > from) segments.push({ center: (from + gapLo) / 2, length: gapLo - from });
  if (to > gapHi) segments.push({ center: (gapHi + to) / 2, length: to - gapHi });
  return segments;
}

// --- Headquarters wall geometry (canonical source for HqProps' offsets) ---

export const HQ_WALL_THICK = 0.3;
export const HQ_WALL_INSET = 0.1;
/** Wall centerline offset in from the raw rect edge (inset + half thickness). */
export const HQ_WALL_OFFSET = HQ_WALL_INSET + HQ_WALL_THICK / 2;
