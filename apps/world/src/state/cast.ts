/* The viewer's cast: which figures stand for agents, kept per viewer in this browser (state/setting.ts). Null follows the
   town and the style (the default). */
import { createSetting } from "./setting.ts";

export const cast = createSetting<string | null>({ key: "crewhub-world.cast", parse: (text) => text || null, format: (value) => value || null });
export const useCast = cast.use;
export const setCast = cast.set;
export const readCast = () => cast.read();
