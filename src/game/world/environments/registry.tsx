// Environment registry (M0 T7). Campus ships in M0; Desert/Island/Sky land in
// M4 as new entries here — nothing else changes.
import type { ComponentType } from "react";
import { CampusWorld } from "@/game/world/campus/CampusWorld";
import { BIOMES } from "@/game/world/biome";
import type { GameEnvironment } from "./types";

/** Binds a biome's data into a zero-prop World for the registry contract. */
function biomeWorld(id: keyof typeof BIOMES): ComponentType {
  const biome = BIOMES[id];
  return function BiomeWorld() {
    return <CampusWorld biome={biome} />;
  };
}

const campus: GameEnvironment = {
  id: "campus",
  name: "Campus",
  emoji: "🏫",
  sky: "#aee2f7",
  fog: { color: "#c9ecf9", near: 60, far: 160 },
  ambient: { color: "#ffffff", intensity: 0.55 },
  hemisphere: { sky: "#bfe6ff", ground: "#9ed98a", intensity: 0.5 },
  // Sun sits on the default camera's side (+X/+Z) so the faces the player
  // sees are the lit ones — with it behind, every canopy showed its shadow
  // side and read as a dark box.
  sun: { position: [30, 44, 34], color: "#fff3d6", intensity: 2.6 },
  World: CampusWorld,
};

const desert: GameEnvironment = {
  id: "desert",
  name: "Desert",
  emoji: "🏜️",
  sky: "#ffe4b8",
  fog: { color: "#f4dba6", near: 60, far: 160 },
  ambient: { color: "#fff3e0", intensity: 0.55 },
  hemisphere: { sky: "#ffe4b8", ground: "#e7c384", intensity: 0.5 },
  sun: { position: [30, 44, 34], color: "#ffd9a0", intensity: 2.9 },
  World: biomeWorld("desert"),
};

const island: GameEnvironment = {
  id: "island",
  name: "Island",
  emoji: "🏝️",
  sky: "#a8e4f7",
  fog: { color: "#bfeaf5", near: 60, far: 160 },
  ambient: { color: "#ffffff", intensity: 0.55 },
  hemisphere: { sky: "#a8e4f7", ground: "#8fd47a", intensity: 0.5 },
  sun: { position: [30, 44, 34], color: "#fff3d6", intensity: 2.7 },
  World: biomeWorld("island"),
};

const sky: GameEnvironment = {
  id: "sky",
  name: "Sky",
  emoji: "✨",
  sky: "#cdd9f5",
  fog: { color: "#dfe7ff", near: 50, far: 140 },
  ambient: { color: "#f0f3ff", intensity: 0.55 },
  hemisphere: { sky: "#dfe7ff", ground: "#cfd8ec", intensity: 0.5 },
  sun: { position: [30, 44, 34], color: "#dfe7ff", intensity: 2.2 },
  World: biomeWorld("sky"),
};

export const ENVIRONMENTS: GameEnvironment[] = [campus, desert, island, sky];

export function environmentById(id: string): GameEnvironment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? campus;
}
