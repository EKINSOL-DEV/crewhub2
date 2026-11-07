/* Moving a building by hand (build mode): the building picked up, while its free plots show in the town as numbered
   markers to click. One per page; nothing is kept. */
import { useSyncExternalStore } from "react";

let moving: string | null = null;
const listeners = new Set<() => void>();

/** Picks a building up (its slug), or puts it down again (null). */
export function setMovingBuilding(slug: string | null) {
  if (slug === moving) return;
  moving = slug;
  for (const listener of listeners) listener();
}

export function useMovingBuilding(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => moving,
  );
}
