// Critically-damped 1D spring (Epic 20 motion polish). Closed-form solution
// of x'' = -2ω x' - ω²(x - target), evaluated exactly per step — stable for
// any dt (tab-back frame spikes can't overshoot or explode), no maath dep.

export interface Spring1D {
  x: number;
  v: number;
}

/**
 * Advance the spring by `dt` seconds toward `target` with angular frequency
 * `omega` (bigger = snappier; ~6–8 feels like a friendly little robot).
 */
export function springStep(s: Spring1D, target: number, omega: number, dt: number): Spring1D {
  if (dt === 0) return s;
  const a = s.x - target;
  const b = s.v + omega * a;
  const e = Math.exp(-omega * dt);
  return {
    x: target + (a + b * dt) * e,
    v: (b - omega * (a + b * dt)) * e,
  };
}
