// Environment registry (M0 T7). Campus ships in M0; Desert/Island/Sky land in
// M4 as new entries here — nothing else changes.
import { CampusWorld } from "@/game/world/campus/CampusWorld";
import type { GameEnvironment } from "./types";

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

export const ENVIRONMENTS: GameEnvironment[] = [campus];

export function environmentById(id: string): GameEnvironment {
  return ENVIRONMENTS.find((e) => e.id === id) ?? campus;
}
