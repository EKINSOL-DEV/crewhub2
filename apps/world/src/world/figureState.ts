/* What a figure shows, derived from what the world model already says: an agent's placement, the ticket on its desk,
   its walker and (for the postman) its letters. Pure; the reducer and the projection know nothing of casts. */
import { IDLE_STATE, type CastRole, type FigureState } from "@crewhub/world-cast";
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
 * idles, as does an agent standing away from its desk; walking wins over all of them. `into` is filled and returned
 * when given (the renderer asks every frame and reuses one state).
 */
export function figureState({ agent, deskWaiting = false, walker = null, carrying = false }: FigureFacts, into: FigureState = { ...IDLE_STATE }): FigureState {
  const proxy = agent.presence === "proxy";
  if (walker?.walking) into.activity = "walking";
  else if (proxy || (walker && !walker.seated)) into.activity = "idle";
  else if (agent.posture === "focused") into.activity = "working";
  else if (agent.posture === "raised-hand") into.activity = "blocked";
  else if (agent.posture === "greyed") into.activity = "stale";
  else into.activity = agent.laneStatus === "done" ? "done" : "idle";
  into.waiting = deskWaiting && !proxy;
  into.alert = agent.alerts.length > 0;
  into.proxy = proxy;
  into.carrying = carrying;
  return into;
}
