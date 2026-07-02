// Environment registry (EKI-111): the four v1 biomes plus `theme`, which
// keeps the theme-derived minimal look (colors {}, default lighting, no
// decor). Default is desert — the classic CrewHub postcard.
import { DesertDecor } from "./DesertDecor";
import { GrassDecor } from "./GrassDecor";
import { IslandDecor } from "./IslandDecor";
import { SkyDecor } from "./SkyDecor";
import type { WorldEnvironment } from "./types";

/** v1's saturated room family — floor fallbacks in every outdoor biome. */
export const VIBRANT_FLOORS = [
  "#67d6a4", // mint
  "#f365b4", // pink
  "#4fd0cf", // teal
  "#f89a4c", // orange
  "#f7ce55", // yellow
  "#7c6fe0", // purple
];

export const ENVIRONMENTS: WorldEnvironment[] = [
  {
    id: "desert",
    name: "Desert",
    emoji: "🏜️",
    colors: {
      sky: "#87ceeb",
      ground: "#e4c28f",
      lobby: "#d8b57f",
      floors: VIBRANT_FLOORS,
    },
    showGrid: false,
    lighting: {
      ambient: { color: "#ffe8cc", intensity: 0.55 },
      hemisphere: { sky: "#87ceeb", ground: "#d2a06d", intensity: 0.4 },
      sun: { position: [15, 20, 10], color: "#ffd4a0", intensity: 1.8 },
      fill: { position: [-10, 8, -8], color: "#ffffff", intensity: 0.25 },
    },
    Decor: DesertDecor,
  },
  {
    id: "grass",
    name: "Grass",
    emoji: "🌿",
    colors: {
      sky: "#87ceeb",
      ground: "#5e8f45",
      lobby: "#6b9c50",
      floors: VIBRANT_FLOORS,
    },
    showGrid: false,
    lighting: {
      ambient: { color: "#eaf4e0", intensity: 0.6 },
      hemisphere: { sky: "#87ceeb", ground: "#5e8f45", intensity: 0.35 },
      sun: { position: [12, 18, 8], color: "#fff4d6", intensity: 1.6 },
      fill: { position: [-8, 9, -10], color: "#dceeff", intensity: 0.3 },
    },
    Decor: GrassDecor,
  },
  {
    id: "island",
    name: "Island",
    emoji: "🏝️",
    colors: {
      sky: "#9ed4f2",
      ground: "#5e8f45",
      lobby: "#6b9c50",
      floors: VIBRANT_FLOORS,
    },
    showGrid: false,
    lighting: {
      ambient: { color: "#f2ecd8", intensity: 0.6 },
      hemisphere: { sky: "#9ed4f2", ground: "#5e8f45", intensity: 0.35 },
      sun: { position: [14, 22, 9], color: "#ffe9b8", intensity: 1.7 },
      fill: { position: [-9, 10, -9], color: "#cfe8ff", intensity: 0.3 },
    },
    Decor: IslandDecor,
  },
  {
    id: "sky",
    name: "Sky Platform",
    emoji: "✨",
    colors: {
      sky: "#16222e",
      ground: "#31414f",
      lobby: "#3a4c5c",
      floors: VIBRANT_FLOORS,
      grid: "#2a3a47",
      gridSection: "#14b8a6",
    },
    showGrid: true,
    lighting: {
      ambient: { color: "#bfd7e8", intensity: 0.5 },
      hemisphere: { sky: "#16222e", ground: "#31414f", intensity: 0.3 },
      sun: { position: [10, 16, 6], color: "#cfe8ff", intensity: 1.4 },
      fill: { position: [-8, 6, -8], color: "#14b8a6", intensity: 0.35 },
    },
    Decor: SkyDecor,
  },
  {
    id: "theme",
    name: "Theme",
    emoji: "🎨",
    colors: {},
    showGrid: true,
    lighting: null,
    Decor: null,
  },
];

/** Lookup with fallback — unknown (stale/future) ids land on the default. */
export function environmentById(id: string): WorldEnvironment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0]!;
}

/** The next environment in the cycle — powers the switcher button. */
export function nextEnvironmentId(id: string): string {
  const i = ENVIRONMENTS.findIndex((e) => e.id === id);
  return ENVIRONMENTS[(i + 1) % ENVIRONMENTS.length]!.id;
}
