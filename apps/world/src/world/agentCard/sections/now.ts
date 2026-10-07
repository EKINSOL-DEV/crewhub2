/* "Now": where the agent is and what state it is in, in the text view's words. Always applies: the placement is a fact.
   In three-rooms wording the place is the hall and the desk ("crewhub-loops, the floor, at a worker desk"). */
import { DESK_WORDS, HALL_PLACES, hallOf, type AgentPlacement, type Building } from "@crewhub/world-model";
import type { AgentCardSection, CardRow } from "../types.ts";

/** "crewhub-loops, Workers room" (classic) or "crewhub-loops, on the floor at a worker desk" (three-rooms). */
export function whereWords(agent: AgentPlacement, building: Building | null, rooms: "three-rooms" | "classic"): string {
  if (!building) return agent.presence === "proxy" ? "elsewhere" : "the town";
  if (!agent.room) return building.name;
  if (rooms === "classic") return `${building.name}, ${building.rooms.find((r) => r.kind === agent.room)?.label ?? agent.room}`;
  const hall = hallOf(agent.room);
  return `${building.name}, ${HALL_PLACES[hall]}${hall === "floor" ? ` at ${DESK_WORDS[agent.role]}` : ""}`;
}

export const nowSection: AgentCardSection = {
  id: "now",
  title: "Now",
  when: () => true,
  render(facts, ctx) {
    const { agent } = facts;
    const rows: CardRow[] = [];
    const where = whereWords(agent, facts.building, ctx.rooms ?? "classic");
    rows.push({ kind: "text", label: "Where", text: `${where}${agent.locationInferred ? " (inferred from recent events)" : ""}` });
    if (agent.presence === "proxy") rows.push({ kind: "text", label: "", text: "A translucent proxy here: the real figure works in another building.", muted: true });
    else rows.push({ kind: "chips", chips: [{ kind: "lane", status: agent.laneStatus }, { kind: "plain", text: `posture ${agent.posture === "raised-hand" ? "hand raised" : agent.posture}` }] });
    if (ctx.freshness.stale) rows.push({ kind: "text", label: "", text: "The team snapshot is older than 5 minutes: the lane status is unknown.", muted: true });
    if (facts.team?.contextLine) rows.push({ kind: "quote", text: facts.team.contextLine, by: "status line" });
    for (const alert of agent.alerts) rows.push({ kind: "chips", chips: [{ kind: "attention", text: alert }] });
    return rows;
  },
};
