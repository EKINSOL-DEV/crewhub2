/* The frame rate overlay toggle (Settings and the F key): off by default, kept in this browser (state/setting.ts). */
import { createSetting, onOff, toggle } from "./setting.ts";

export const fps = createSetting<boolean>({ key: "crewhub-world.fps", ...onOff });
export const useFps = fps.use;
export const setFps = fps.set;
export const toggleFps = () => toggle(fps);
