/* The "ambient" setting (plan 7.1 idle variety; the plan's `presence.ambient`): on, reduced or off, kept in this
   browser. The walks read it; the AI-presence block of Settings shows it. It is the only stored ambient value. Storage
   may throw (private mode, blocked site data): the choice then lasts for this page only. */
import { useSyncExternalStore } from "react";
import { AMBIENT_CHOICES, type Ambient } from "../world/movement";

export const AMBIENT_KEY = "crewhub-world.ambient";

export function readAmbient(): Ambient {
  try {
    const value = globalThis.localStorage?.getItem(AMBIENT_KEY);
    return AMBIENT_CHOICES.includes(value as Ambient) ? (value as Ambient) : "on";
  } catch {
    return "on";
  }
}

export function writeAmbient(value: Ambient) {
  try {
    globalThis.localStorage?.setItem(AMBIENT_KEY, value);
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: Ambient | null = null;
const listeners = new Set<() => void>();

export function setAmbient(value: Ambient) {
  current = value;
  writeAmbient(value);
  for (const listener of listeners) listener();
}

export function useAmbient(): Ambient {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readAmbient()),
  );
}
