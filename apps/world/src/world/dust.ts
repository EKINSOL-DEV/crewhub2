/* The dust on a quiet package (`ticket.quiet`), as numbers: how the veil over it is tinted and where its motes drift.
   Pure (no three), so the object layer's frame path reads it and a test can. The veil and the motes are the world's
   own view of the fact, not the style's models: the style's Object3D count stays what it is. */

/** Motes over a quiet package. Reduced motion shows none: a still picture, the veil alone says it. */
export const MOTES = 5;
export const moteCount = (reduced: boolean): number => (reduced ? 0 : MOTES);
/** The motes hover low in front of the package, like dust at its feet: this far out from its front face (world
    units), drifting this far further, lifted this far off the surface it stands on at most. Measured on a rack: the
    shelf above hides everything from the package's top up, and the camera looks at a shelf from the front, so the
    strip of shelf before the package's face is where a speck shows (on a desk the same place is clear too). */
export const MOTE_OUT = 0.02;
export const MOTE_DRIFT = 0.05;
export const MOTE_LIFT = 0.03;
/** The veil: the style's mist, this far towards its ink (further in lamplight, where the hall is dim and a pale veil
    would glow), laid over the package at this opacity. Unlit and outside the tone mapping, so the grey is the grey:
    tone-mapped, a mid grey came out nearly white and the veil only unsaturated the package. */
export const VEIL_TOWARDS_INK: Record<"day" | "lamplight", number> = { day: 0.65, lamplight: 0.8 };
export const VEIL_OPACITY = 0.72;
/** Motes: world units across, their opacity, and their grey by day (mist this far towards ink; chalk in lamplight). */
export const MOTE_SIZE = 0.04;
export const MOTE_OPACITY = 0.9;
export const MOTE_TOWARDS_INK = 0.55;

export interface MotePlace {
  x: number;
  y: number;
  z: number;
}

/**
 * Mote `i` of a package of `size` (its width x, height y and depth z), with `seed`, at wall time `t` (seconds),
 * into `out`: x and z from the package's centre, y from its top. Each mote keeps its own station across the
 * package's width, before its front face, and drifts slowly out and back, sideways and up and down at its own
 * pace, so five of them never move in step. Deterministic: the same arguments give the same place.
 */
export function mote(seed: number, i: number, t: number, size: MotePlace, out: MotePlace): MotePlace {
  const u = seed >>> 0;
  const phase = (((u >>> ((i * 5) % 27)) % 61) / 61) * Math.PI * 2 + i * 1.3;
  const pace = 0.22 + ((u >>> ((i * 3) % 29)) % 7) * 0.03;
  const a = phase + t * pace;
  out.x = ((i + 0.5) / MOTES - 0.5) * size.x + Math.sin(a) * 0.02;
  out.z = size.z / 2 + MOTE_OUT + MOTE_DRIFT * (0.5 + 0.5 * Math.sin(a * 0.7 + phase));
  out.y = -size.y + MOTE_LIFT * (0.25 + ((i * 3 + u) % 4) / 8 + 0.25 * (0.5 + 0.5 * Math.sin(a * 1.7 + phase)));
  return out;
}
