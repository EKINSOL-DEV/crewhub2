/* The "Day and night" setting: the light drifts with the source clock from the morning through dusk into the evening
   and back (see world/dayClock.ts). Kept per viewer in this browser (state/setting.ts). Unset, it follows the mode: on in
   demo mode, where the scripted day runs on its own clock, and off in live mode, where a real session's light should not
   wander. That default lives here and nowhere else. The HTML chrome follows the theme only, never the drift. */
import { createSetting } from "./setting.ts";

export type SourceMode = "demo" | "live";

/** The setting when the viewer has not chosen: on in demo mode, off in live mode. */
export function defaultDayNight(mode: SourceMode): boolean {
  return mode === "demo";
}

/** The viewer's choice; null when they have made none. */
export const dayNight = createSetting<boolean | null>({
  key: "crewhub-world.daynight",
  parse: (text) => (text === "on" ? true : text === "off" ? false : null),
  format: (on) => (on === null ? null : on ? "on" : "off"),
});
export const setDayNight = (on: boolean) => dayNight.set(on);
/** The setting in force: the viewer's choice, else the mode's default. */
export const dayNightIn = (mode: SourceMode, choice: boolean | null): boolean => choice ?? defaultDayNight(mode);
export const useDayNight = (mode: SourceMode): boolean => dayNightIn(mode, dayNight.use());
