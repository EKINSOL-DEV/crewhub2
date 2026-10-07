/* The "Buildings" setting: which building template a viewer sees, `three-rooms` (Administration, the floor, the lead's
   office) or `classic` (ten rooms). Kept per viewer in this browser, like the Old quarter setting; `?rooms=three|classic`
   in the URL overrides it for the page. It changes what this viewer sees, never the town document. Storage may throw
   (private mode, blocked site data): the choice then lasts for this page only.

   Note for the merge: `rooms` owns this file (its template and Settings > Town > Buildings read it too); `words` wrote
   this stand-in so the wording could be wired before the template landed. Keep `rooms`' version where they differ. */
import { useSyncExternalStore } from "react";

export type BuildingPlan = "three-rooms" | "classic";

export const BUILDING_PLAN_KEY = "crewhub-world.building-plan";
export const DEFAULT_BUILDING_PLAN: BuildingPlan = "classic";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

/** `?rooms=three` or `?rooms=classic` (also the full words); anything else leaves the setting alone. */
export function planFromSearch(search: string): BuildingPlan | null {
  const value = new URLSearchParams(search).get("rooms");
  if (value === "three" || value === "three-rooms") return "three-rooms";
  return value === "classic" ? "classic" : null;
}

export function readBuildingPlan(storage?: Storage | null, search: string = globalThis.location?.search ?? ""): BuildingPlan {
  const fromUrl = planFromSearch(search);
  if (fromUrl) return fromUrl;
  try {
    const stored = local(storage)?.getItem(BUILDING_PLAN_KEY);
    return stored === "three-rooms" || stored === "classic" ? stored : DEFAULT_BUILDING_PLAN;
  } catch {
    return DEFAULT_BUILDING_PLAN;
  }
}

export function writeBuildingPlan(plan: BuildingPlan, storage?: Storage | null) {
  try {
    local(storage)?.setItem(BUILDING_PLAN_KEY, plan);
  } catch {
    // Not kept: storage is unavailable.
  }
}

let current: BuildingPlan | null = null;
const listeners = new Set<() => void>();

export function setBuildingPlan(plan: BuildingPlan) {
  current = plan;
  writeBuildingPlan(plan);
  for (const listener of listeners) listener();
}

export function useBuildingPlan(): BuildingPlan {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= readBuildingPlan()),
  );
}
