/* The "Buildings" setting: which building template a viewer sees, `three-rooms` (Administration, the floor, the lead's
   office; threeRoomTemplate.ts) or `classic` (ten rooms). Kept per viewer in this browser (state/setting.ts), like the
   Old quarter setting; `?rooms=three|classic` in the URL overrides it for the page. It changes what this viewer sees,
   never the town document.

   The type and the default live in the pure template module (buildingTemplate.ts) so `node --test` can use them; this
   module re-exports them for the app. */
import { DEFAULT_BUILDING_PLAN, type BuildingPlan } from "../world/buildingTemplate.ts";
import { createSetting } from "./setting.ts";

export type { BuildingPlan } from "../world/buildingTemplate.ts";
export { DEFAULT_BUILDING_PLAN } from "../world/buildingTemplate.ts";

/** The address bar's override: `?rooms=three` or `?rooms=classic`. */
export const BUILDING_PLAN_PARAM = "rooms";

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
export const buildingPlan = createSetting<BuildingPlan>({
  key: "crewhub-world.building-plan",
  parse: (text) => parseBuildingPlan(text) ?? DEFAULT_BUILDING_PLAN,
  format: (plan) => plan,
  override: () => planFromSearch(globalThis.location?.search ?? ""),
});
/** The plan in force now (a live switch included), for code outside React: the director's graph, the prop import. */
export const buildingPlanNow = buildingPlan.now;
/** Switches the plan live: every building and the navigation graph rebuild on the next model. */
export const setBuildingPlan = buildingPlan.set;
export const useBuildingPlan = buildingPlan.use;
