/* The graphics setting: "pretty" (soft shadow maps, warm light pools, a sharp canvas) or "fast" (none of those; blob
   contact shadows stay), kept per viewer in this browser. Pretty is the default. Storage may throw (private mode,
   blocked site data): the choice then lasts for this page only. */
import { useSyncExternalStore } from "react";
import type { GraphicsQuality } from "@crewhub/world-style";

export const QUALITY_KEY = "crewhub-world.quality";
export const QUALITY_CHOICES: readonly GraphicsQuality[] = ["pretty", "fast"];

export function readQuality(): GraphicsQuality {
  try {
    const value = globalThis.localStorage?.getItem(QUALITY_KEY);
    return QUALITY_CHOICES.includes(value as GraphicsQuality) ? (value as GraphicsQuality) : "pretty";
  } catch {
    return "pretty";
  }
}

export function writeQuality(value: GraphicsQuality) {
  try {
    globalThis.localStorage?.setItem(QUALITY_KEY, value);
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: GraphicsQuality | null = null;
const listeners = new Set<() => void>();

export function setQuality(value: GraphicsQuality) {
  current = value;
  writeQuality(value);
  for (const listener of listeners) listener();
}

export function useQuality(): GraphicsQuality {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readQuality()),
  );
}
