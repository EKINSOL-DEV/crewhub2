/* The graphics setting: "pretty" (soft shadow maps, warm light pools, a sharp canvas) or "fast" (none of those; blob
   contact shadows stay), kept per viewer in this browser (state/setting.ts). Pretty is the default. */
import type { GraphicsQuality } from "@crewhub/world-style";
import { createSetting, oneOfChoices } from "./setting.ts";

export const QUALITY_CHOICES: readonly GraphicsQuality[] = ["pretty", "fast"];
export const quality = createSetting<GraphicsQuality>({ key: "crewhub-world.quality", ...oneOfChoices(QUALITY_CHOICES, "pretty") });
export const useQuality = quality.use;
export const setQuality = quality.set;
