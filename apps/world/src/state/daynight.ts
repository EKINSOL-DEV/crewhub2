/* The "Day and night" setting: the light drifts with the source clock from the morning through dusk into the evening
   and back (see world/dayClock.ts). Kept per viewer in this browser. Unset, it follows the mode: on in demo mode, where
   the scripted day runs on its own clock, and off in live mode, where a real session's light should not wander. That
   default lives here and nowhere else. Storage may throw (private mode, blocked site data): the choice then lasts for
   this page only. The HTML chrome follows the theme only, never the drift. */
import { useSyncExternalStore } from "react";

export const DAYNIGHT_KEY = "crewhub-world.daynight";

export type SourceMode = "demo" | "live";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

/** The setting when the viewer has not chosen: on in demo mode, off in live mode. */
export function defaultDayNight(mode: SourceMode): boolean {
  return mode === "demo";
}

export function readDayNight(mode: SourceMode, storage?: Storage | null): boolean {
  try {
    const value = local(storage)?.getItem(DAYNIGHT_KEY);
    return value === "on" ? true : value === "off" ? false : defaultDayNight(mode);
  } catch {
    return defaultDayNight(mode);
  }
}

export function writeDayNight(on: boolean, storage?: Storage | null) {
  try {
    local(storage)?.setItem(DAYNIGHT_KEY, on ? "on" : "off");
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: boolean | null = null;
const listeners = new Set<() => void>();

export function setDayNight(on: boolean) {
  current = on;
  writeDayNight(on);
  for (const listener of listeners) listener();
}

export function useDayNight(mode: SourceMode): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readDayNight(mode)),
  );
}
