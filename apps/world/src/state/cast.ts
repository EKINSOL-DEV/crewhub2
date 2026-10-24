/* The viewer's cast: which figures stand for agents, kept per viewer in this browser. Null follows the town and the
   style (the default). Storage may throw (private mode, blocked site data): the choice then lasts for this page only. */
import { useSyncExternalStore } from "react";

export const CAST_KEY = "crewhub-world.cast";

export function readCast(): string | null {
  try {
    return globalThis.localStorage?.getItem(CAST_KEY) || null;
  } catch {
    return null;
  }
}

let current: string | null | undefined;
const listeners = new Set<() => void>();

export function setCast(value: string | null) {
  current = value;
  try {
    if (value) globalThis.localStorage?.setItem(CAST_KEY, value);
    else globalThis.localStorage?.removeItem(CAST_KEY);
  } catch {
    // Not kept: storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function useCast(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current === undefined ? (current = readCast()) : current),
  );
}
