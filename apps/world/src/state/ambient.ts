/* The "ambient" setting (plan 7.1 idle variety; the plan's `presence.ambient`): on, reduced or off, kept in this browser
   (state/setting.ts). The walks read it; the AI-presence block of Settings shows it. It is the only stored ambient
   value. */
import { AMBIENT_CHOICES, type Ambient } from "../world/movement.ts";
import { createSetting, oneOfChoices } from "./setting.ts";

export const ambient = createSetting<Ambient>({ key: "crewhub-world.ambient", ...oneOfChoices(AMBIENT_CHOICES, "on") });
export const useAmbient = ambient.use;
export const setAmbient = ambient.set;
