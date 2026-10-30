/* The "Old quarter" setting: archived buildings are folded away into a row of their own behind the town instead of
   standing boarded up on their plots. Off by default: a building keeps its place, archived or not. Kept per viewer in
   this browser; it changes what this viewer sees, never the town document. Storage may throw (private mode, blocked
   site data): the choice then lasts for this page only. */
import { useSyncExternalStore } from "react";

export const OLD_QUARTER_KEY = "crewhub-world.old-quarter";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

export function readOldQuarter(storage?: Storage | null): boolean {
  try {
    return local(storage)?.getItem(OLD_QUARTER_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeOldQuarter(on: boolean, storage?: Storage | null) {
  try {
    local(storage)?.setItem(OLD_QUARTER_KEY, on ? "on" : "off");
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: boolean | null = null;
const listeners = new Set<() => void>();

export function setOldQuarter(on: boolean) {
  current = on;
  writeOldQuarter(on);
  for (const listener of listeners) listener();
}

export function useOldQuarter(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readOldQuarter()),
  );
}
