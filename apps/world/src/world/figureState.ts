/* What a figure shows, derived from what the world model already says: an agent's placement, the ticket on its desk,
   its walker and (for the postman) its letters. Pure; the reducer and the projection know nothing of casts. */
import type { CastRole, FigureState } from "@crewhub/world-cast";
import type { AgentPlacement } from "@crewhub/world-model";

/** Where a figure stands in the world: its building, or one of the two civic places. */
export type FigurePlace = "building" | "post-office" | "town-hall";

/**
 * The cast role of an agent. The post office's agents are postmen; a town-hall agent without a role of its own (a
 * plain worker by the name rules) is the operator; everyone else keeps their role. No fact says "role unknown" yet,
 * so `unknown` is not produced here (the casting room shows it).
 */
export function figureRole(agent: Pick<AgentPlacement, "role">, place: FigurePlace): CastRole {
  if (place === "post-office") return "postman";
  if (place === "town-hall" && agent.role === "worker") return "operator";
  return agent.role;
}

export interface FigureFacts {
  agent: Pick<AgentPlacement, "posture" | "laneStatus" | "presence" | "alerts">;
  /** The ticket on its desk waits on a person. */
  deskWaiting?: boolean;
  /** Its walker, when it has one: moving, or standing somewhere (at its own desk: `seated`). */
  walker?: { walking: boolean; seated: boolean } | null;
  /** Something in hand: the postman's letters. */
  carrying?: boolean;
}

/**
 * focused → working; relaxed → done when its lane says so, else idle; raised-hand → blocked; greyed → stale. A proxy
 * idles, as does an agent standing away from its desk; walking wins over all of them.
 */
export function figureState({ agent, deskWaiting = false, walker = null, carrying = false }: FigureFacts): FigureState {
  const proxy = agent.presence === "proxy";
  let activity: FigureState["activity"];
  if (walker?.walking) activity = "walking";
  else if (proxy || (walker && !walker.seated)) activity = "idle";
  else if (agent.posture === "focused") activity = "working";
  else if (agent.posture === "raised-hand") activity = "blocked";
  else if (agent.posture === "greyed") activity = "stale";
  else activity = agent.laneStatus === "done" ? "done" : "idle";
  return { activity, waiting: deskWaiting && !proxy, alert: agent.alerts.length > 0, proxy, carrying };
}
