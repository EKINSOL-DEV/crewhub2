// Character-motion helpers (Epic 20 polish): squash-and-stretch for the
// WaitingForPermission hop and an occasional eye blink. Pure functions —
// Bot3D folds them inside useFrame and skips them under reduced motion.

/** Squash at the ground, stretch at the apex; vertical scale span. */
const SQUASH_MIN_Y = 0.84;
const SQUASH_MAX_Y = 1.16;

export interface SquashScale {
  y: number;
  xz: number;
}

/**
 * Classic squash-and-stretch from normalized hop height `h` (0 = ground,
 * 1 = apex). Volume-preserving: y · xz² = 1, so the bot squishes rather
 * than shrinks.
 */
export function squashStretch(h: number): SquashScale {
  const hh = Math.min(1, Math.max(0, h));
  const y = SQUASH_MIN_Y + (SQUASH_MAX_Y - SQUASH_MIN_Y) * hh;
  return { y, xz: 1 / Math.sqrt(y) };
}

export const BLINK_PERIOD_S = 3.7;
export const BLINK_DUR_S = 0.14;
/** Eyes never scale below this — a closed eye is a slit, not a hole. */
const BLINK_MIN_SCALE = 0.08;

/**
 * Eye vertical scale at time `t` (seconds) for a bot offset by `phase`:
 * 1 (open) outside the blink window, a smooth sine dip to ~0.08 inside it.
 * Deterministic — same t/phase, same blink — and periodic.
 */
export function blinkScale(t: number, phase: number): number {
  const u = (((t + phase) % BLINK_PERIOD_S) + BLINK_PERIOD_S) % BLINK_PERIOD_S;
  if (u >= BLINK_DUR_S) return 1;
  return 1 - (1 - BLINK_MIN_SCALE) * Math.sin((Math.PI * u) / BLINK_DUR_S);
}
