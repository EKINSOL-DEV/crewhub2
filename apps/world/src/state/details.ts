/* The "details" toggle: off shows a name pill and at most one bubble per robot and one name sign per building; on shows
   every label (room signs, rule chips, update cards, waiting tags, counts). Kept in this browser. Storage may throw
   (private mode, blocked site data): the choice then lasts for this page only. The text view always shows everything. */
import { useSyncExternalStore } from "react";

export const DETAILS_KEY = "crewhub-world.details";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

export function readDetails(storage?: Storage | null): boolean {
  try {
    return local(storage)?.getItem(DETAILS_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeDetails(on: boolean, storage?: Storage | null) {
  try {
    local(storage)?.setItem(DETAILS_KEY, on ? "on" : "off");
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: boolean | null = null;
const listeners = new Set<() => void>();

export function setDetails(on: boolean) {
  current = on;
  writeDetails(on);
  for (const listener of listeners) listener();
}

export function toggleDetails(): boolean {
  const next = !(current ?? readDetails());
  setDetails(next);
  return next;
}

export function useDetails(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readDetails()),
  );
}
