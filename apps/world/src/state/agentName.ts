/* An agent's display name in a model (state/world.ts, for the demo's bubble). Pure, so a node test can pin it. */
import type { WorldModel } from "@crewhub/world-model";

/** The display name of an agent in the model (a figure anywhere), or null for one the model does not place. */
export function agentDisplayName(model: WorldModel, agentId: string): string | null {
  for (const a of [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice]) if (a.name === agentId) return a.displayName;
  return null;
}
