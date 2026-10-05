/* The town plan as React state: worked out from the town document and the model's buildings (world/townPlan.ts),
   and kept until one of them changes what stands where. The tier remembers where it came from, so a project coming
   and going does not flap it. */
import { useMemo, useRef } from "react";
import type { TownDocument, WorldModel } from "@crewhub/world-model";
import type { Tier } from "../world/settlement";
import { planTown, type TownPlan } from "../world/townPlan";
import { useOldQuarter } from "./oldQuarter";

export function useTownPlan(model: WorldModel, doc: TownDocument): TownPlan {
  const oldQuarter = useOldQuarter();
  const tier = useRef<Tier | null>(null);
  // The model is a new object on every reduction; the plan only follows who is there, archived or not, and in which zone.
  const buildings = model.buildings.map((b) => `${b.slug}:${b.archived ? 1 : 0}:${b.zoneId}`).join("|");
  const plan = useMemo(
    () => planTown(doc, model.buildings, { previous: tier.current, oldQuarter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildings, doc.plots, doc.districts, oldQuarter],
  );
  tier.current = plan.tier;
  return plan;
}
