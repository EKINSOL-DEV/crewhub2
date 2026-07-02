import type { ComponentType } from "react";

/**
 * An environment owns everything AROUND the buildings (spec §Visual
 * direction): sky, fog, lighting rig, and the World component that renders
 * terrain + decor + centerpieces. Buildings, rooms and robots are identical
 * across environments.
 */
export interface GameEnvironment {
  id: string;
  name: string;
  emoji: string;
  sky: string;
  fog: { color: string; near: number; far: number };
  ambient: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  sun: { position: [number, number, number]; color: string; intensity: number };
  World: ComponentType;
}
