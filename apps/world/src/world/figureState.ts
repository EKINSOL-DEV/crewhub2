/* What a figure shows: the cast adapter of the appearance module. The figure at rest is world-model's `figureLook`
   (the placement and the ticket on its desk); the walker and (for the postman) the letters are the scene's own facts,
   laid on top here. Pure; the reducer and the projection know nothing of casts. */
import { IDLE_STATE, type CastRole, type FigureState } from "@crewhub/world-cast";
import { figureLook, type AgentPlacement, type FigureLook } from "@crewhub/world-model";

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

/** The one look the renderer's per-frame reads fill (no allocation per frame). */
const look: FigureLook = { pose: "idle", waiting: false, alert: false, proxy: false, lamp: "off" };

/**
 * The figure at rest (`figureLook`: its posture and lane), except that walking wins over all of it and an agent
 * standing away from its desk idles. `into` is filled and returned when given (the renderer asks every frame and
 * reuses one state).
 */
export function figureState({ agent, deskWaiting = false, walker = null, carrying = false }: FigureFacts, into: FigureState = { ...IDLE_STATE }): FigureState {
  figureLook(agent, { waiting: deskWaiting }, look);
  into.activity = walker?.walking ? "walking" : walker && !walker.seated ? "idle" : look.pose;
  into.waiting = look.waiting;
  into.alert = look.alert;
  into.proxy = look.proxy;
  into.carrying = carrying;
  return into;
}
