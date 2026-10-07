/* The "Buildings" setting: which building template a viewer sees, `three-rooms` (Administration, the floor, the lead's
   office; threeRoomTemplate.ts) or `classic` (ten rooms). Kept per viewer in this browser, like the Old quarter
   setting; `?rooms=three|classic` in the URL overrides it for the page. It changes what this viewer sees, never the
   town document. Storage may throw (private mode, blocked site data): the choice then lasts for this page only.

   The type and the default live in the pure template module (buildingTemplate.ts) so `node --test` can use them; this
   module re-exports them for the app. */
import { useSyncExternalStore } from "react";
import { DEFAULT_BUILDING_PLAN, type BuildingPlan } from "../world/buildingTemplate.ts";

export type { BuildingPlan } from "../world/buildingTemplate.ts";
export { DEFAULT_BUILDING_PLAN } from "../world/buildingTemplate.ts";

export const BUILDING_PLAN_KEY = "crewhub-world.building-plan";
/** The address bar's override: `?rooms=three` or `?rooms=classic`. */
export const BUILDING_PLAN_PARAM = "rooms";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

/** The plan a `?rooms=` value (or a stored value) names, or null for anything else. */
export function parseBuildingPlan(value: string | null | undefined): BuildingPlan | null {
  if (value === "three" || value === "three-rooms") return "three-rooms";
  return value === "classic" ? "classic" : null;
}

/** `?rooms=three` or `?rooms=classic` (also the full words); anything else leaves the setting alone. */
export function planFromSearch(search: string): BuildingPlan | null {
  return parseBuildingPlan(new URLSearchParams(search).get(BUILDING_PLAN_PARAM));
}

/** The viewer's plan: the address bar's, else the stored one, else the default. */
export function readBuildingPlan(storage?: Storage | null, search: string = globalThis.location?.search ?? ""): BuildingPlan {
  const fromUrl = planFromSearch(search);
  if (fromUrl) return fromUrl;
  try {
    return parseBuildingPlan(local(storage)?.getItem(BUILDING_PLAN_KEY)) ?? DEFAULT_BUILDING_PLAN;
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

/** The plan in force now (a live switch included), for code outside React: the director's graph, the prop import. */
export function buildingPlanNow(): BuildingPlan {
  return (current ??= readBuildingPlan());
}

/** Switches the plan live: every building and the navigation graph rebuild on the next model. */
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
    buildingPlanNow,
  );
}
