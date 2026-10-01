/* The frame rate overlay toggle (Settings and the F key): off by default, kept in this browser. Storage may throw
   (private mode, blocked site data): the choice then lasts for this page only. */
import { useSyncExternalStore } from "react";

export const FPS_KEY = "crewhub-world.fps";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

export function readFps(storage?: Storage | null): boolean {
  try {
    return local(storage)?.getItem(FPS_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeFps(on: boolean, storage?: Storage | null) {
  try {
    local(storage)?.setItem(FPS_KEY, on ? "on" : "off");
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: boolean | null = null;
const listeners = new Set<() => void>();

export function setFps(on: boolean) {
  current = on;
  writeFps(on);
  for (const listener of listeners) listener();
}

export function toggleFps(): boolean {
  const next = !(current ?? readFps());
  setFps(next);
  return next;
}

export function useFps(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readFps()),
  );
}
