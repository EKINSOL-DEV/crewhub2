/* What the polite region says for a camera key (App.tsx: +, -, [, ], H). The keys moved the camera and said nothing,
   while D and F said "Details on" and "Frame rate overlay on" (round 65, walk finding w5-6): a screen reader person
   could not tell the key did anything. The toolbar's buttons say their own names and stay as they were. Pure. */
import type { CameraAction } from "../world/TownScene.ts";

const WORDS: Record<CameraAction, string> = {
  "zoom-in": "Zoomed in.",
  "zoom-out": "Zoomed out.",
  "rotate-left": "Rotated left.",
  "rotate-right": "Rotated right.",
  home: "Home view.",
};

/** One short sentence per camera action. */
export const cameraWords = (action: CameraAction): string => WORDS[action];
