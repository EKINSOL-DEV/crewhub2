// Environment system (EKI-111): an environment owns the world *outside* the
// building — sky, fog, ground, lighting rig, decor, and the room-floor
// fallback palette. Pure types + the palette merge; rendering lives in the
// decor components and WorldScene.
import type { ComponentType } from "react";
import type { WorldBounds } from "../lib/layout";
import type { WorldPalette } from "../lib/theme-palette";

export interface EnvironmentLighting {
  ambient: { color: string; intensity: number };
  hemisphere?: { sky: string; ground: string; intensity: number };
  sun: { position: [number, number, number]; color: string; intensity: number };
  fill?: { position: [number, number, number]; color: string; intensity: number };
}

export interface DecorProps {
  /** World bounds (rooms + lobby + margin) — decor stays outside of these. */
  bounds: WorldBounds;
  reducedMotion: boolean;
}

export interface WorldEnvironment {
  id: string;
  name: string;
  emoji: string;
  /** Palette overrides; merged over the theme palette when active. */
  colors: Partial<Pick<WorldPalette, "sky" | "fog" | "ground" | "lobby" | "floors" | "grid" | "gridSection">>;
  /** Natural terrain hides the blueprint grid. */
  showGrid: boolean;
  /** null = keep WorldScene's default rig (the `theme` environment). */
  lighting: EnvironmentLighting | null;
  /** Procedural scenery around the building; null = bare (theme env). */
  Decor: ComponentType<DecorProps> | null;
}

/**
 * Merge an environment's color overrides over the theme palette. Fog follows
 * the environment sky unless the environment pins it explicitly — the horizon
 * must dissolve into the right color.
 */
export function applyEnvironment(palette: WorldPalette, env: WorldEnvironment): WorldPalette {
  return {
    ...palette,
    ...env.colors,
    fog: env.colors.fog ?? env.colors.sky ?? palette.fog,
  };
}
