// Day/night lighting (M4 T4): pure derivations over a GameEnvironment's
// lighting fields. Lights.tsx lerps toward whichever rig is current;
// GameShell swaps sky/fog instantly (the lights' lerp is what sells the
// mood, per the dispatch). Semantics ported from the old world's
// applyNight (src/panels/world/environments/types.ts) — same idea, lights
// out and a cool moon standing in for the sun — but the new rig contract
// fixes the night hemisphere/ambient/moon colors rather than deriving them
// from each environment's own palette.
import type { GameEnvironment } from "@/game/world/environments/types";

export interface LightRig {
  ambient: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  sun: { position: [number, number, number]; color: string; intensity: number };
}

/** Identity extraction — the environment's own rig, unchanged. */
export function dayRig(env: GameEnvironment): LightRig {
  return { ambient: env.ambient, hemisphere: env.hemisphere, sun: env.sun };
}

const MOON_COLOR = "#9db8ff";

export function nightRig(env: GameEnvironment): LightRig {
  const [x, y, z] = env.sun.position;
  return {
    ambient: { color: "#b9c6e8", intensity: env.ambient.intensity * 0.45 },
    hemisphere: { sky: "#4a5a86", ground: "#2f3a55", intensity: 0.35 },
    // The sun clocks out; the moon rises opposite it across the sky.
    sun: { position: [-x, y, -z], color: MOON_COLOR, intensity: 0.6 },
  };
}

const NIGHT_SKY = "#182338";
const NIGHT_FOG = "#1f2c47";

// `env` isn't used yet — every biome sinks to the same deep blue at night,
// same as the old world's NIGHT_SKY constant. Kept in the signature for
// symmetry with dayRig/nightRig and in case a biome ever wants its own
// night palette.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `_env` unused; see comment above
export function nightSky(_env: GameEnvironment): { sky: string; fog: string } {
  return { sky: NIGHT_SKY, fog: NIGHT_FOG };
}
