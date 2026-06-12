// Environment system (EKI-111): an environment owns the world *outside* the
// building — sky, fog, ground, lighting rig, decor, and the room-floor
// fallback palette. Pure types + the palette merge; rendering lives in the
// decor components and WorldScene.
import type { ComponentType } from "react";
import type { WorldBounds } from "../lib/layout";
import { mixHex, shadeHex, type WorldPalette } from "../lib/theme-palette";

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

/** The night sky every biome dims toward. */
const NIGHT_SKY = "#10182b";

/**
 * Night mode (EKI-122): a pure transform over an environment — same biome,
 * lights out. Sky and ground sink toward a deep navy, the sun becomes a cool
 * moon at a fraction of the intensity. The `theme` environment (no lighting
 * rig, no color overrides) passes through untouched.
 */
export function applyNight(env: WorldEnvironment): WorldEnvironment {
  const colors: WorldEnvironment["colors"] = { ...env.colors };
  if (colors.sky) colors.sky = mixHex(colors.sky, NIGHT_SKY, 0.88);
  if (colors.fog) colors.fog = mixHex(colors.fog, NIGHT_SKY, 0.88);
  if (colors.ground) colors.ground = mixHex(shadeHex(colors.ground, -0.55), NIGHT_SKY, 0.25);
  if (colors.lobby) colors.lobby = mixHex(shadeHex(colors.lobby, -0.55), NIGHT_SKY, 0.25);
  if (colors.floors) colors.floors = colors.floors.map((f) => shadeHex(f, -0.35));

  const lighting = env.lighting
    ? {
        ambient: { color: "#5d6d96", intensity: env.lighting.ambient.intensity * 0.55 },
        ...(env.lighting.hemisphere
          ? {
              hemisphere: {
                sky: NIGHT_SKY,
                ground: "#2a3046",
                intensity: env.lighting.hemisphere.intensity * 0.6,
              },
            }
          : {}),
        // The sun clocks out; the moon is cooler and far dimmer.
        sun: {
          position: env.lighting.sun.position,
          color: "#bcd0ff",
          intensity: env.lighting.sun.intensity * 0.4,
        },
        ...(env.lighting.fill
          ? {
              fill: {
                position: env.lighting.fill.position,
                color: "#4a5a85",
                intensity: env.lighting.fill.intensity * 0.5,
              },
            }
          : {}),
      }
    : null;

  return { ...env, colors, lighting };
}
