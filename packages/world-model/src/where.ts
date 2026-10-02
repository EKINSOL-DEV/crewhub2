/**
 * Agent awareness (LOOPS_INTEGRATION_PLAN.md section 7.2): "where am I" in about 40 tokens, in zone labels and never
 * coordinates. Pure over the world model; nothing is ever sent into a lane.
 */
import { roomLabel } from "./rooms.ts";
import type { AgentPlacement, Building, WorldModel } from "./model.ts";

const MAX_NEARBY = 3;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function matches(agent: AgentPlacement, wanted: string): boolean {
  return [agent.key, agent.name, agent.displayName].some((n) => n.toLowerCase() === wanted);
}

function everyPlacement(model: WorldModel): { agent: AgentPlacement; building: Building | null }[] {
  return [
    ...model.buildings.flatMap((building) => building.agents.map((agent) => ({ agent, building }))),
    ...model.townHall.map((agent) => ({ agent, building: null })),
    ...model.postOffice.map((agent) => ({ agent, building: null })),
  ];
}

function placeIn(building: Building, agent: AgentPlacement): string {
  const room = agent.room ? `the ${roomLabel(agent.room).toLowerCase()}` : "the building";
  const desk = agent.deskTicketKey ? ` at the ${agent.deskTicketKey} desk` : "";
  return `${room} of ${building.name}${desk}`;
}

/** Real avatars sharing the room, by display name, at most three. */
function nearby(building: Building, agent: AgentPlacement): string {
  const names = building.agents
    .filter((a) => a.presence === "real" && a.key !== agent.key && a.room === agent.room)
    .map((a) => a.displayName);
  if (names.length === 0) return "";
  const shown = names.slice(0, MAX_NEARBY).join(", ");
  return `; nearby: ${shown}${names.length > MAX_NEARBY ? ` and ${names.length - MAX_NEARBY} more` : ""}`;
}

function letters(model: WorldModel, building: Building, agent: AgentPlacement): string {
  const waiting = building.mailbox.filter((l) => l.recipientId === agent.key || l.recipientId === agent.name).length;
  const coming = model.deliveries.filter((d) => d.recipientId === agent.key || d.recipientId === agent.name).length;
  const parts: string[] = [];
  if (waiting > 0) parts.push(`the lobby has ${plural(waiting, "letter", "letters")} for you`);
  if (coming > 0) parts.push(`the postman is bringing you ${plural(coming, "letter", "letters")}`);
  return parts.length > 0 ? `; ${parts.join("; ")}` : "";
}

/**
 * The answer for `agentName` (a principal id, a herdr name or a display name, in any case). An agent with proxies
 * hears where its real avatar is and where its proxies stand; unknown names get a plain "no such agent".
 */
export function where(model: WorldModel, agentName: string): string {
  const wanted = agentName.trim().toLowerCase();
  const found = wanted === "" ? [] : everyPlacement(model).filter((p) => matches(p.agent, wanted));
  const real = found.find((p) => p.agent.presence === "real");
  const proxies = found.filter((p) => p.agent.presence === "proxy");
  if (!real && proxies.length === 0) return `No agent called "${agentName.trim().slice(0, 40)}" is in CrewHub World.`;

  if (!real) {
    // Only echoes are left, for example an archived building: point at the real avatar's building.
    const first = proxies[0]!;
    const home = model.buildings.find((b) => b.slug === first.agent.workingIn);
    return `Your real avatar is in ${home ? home.name : "another building"}; here you are a translucent proxy.`;
  }

  const { agent, building } = real;
  const inferred = agent.locationInferred ? ", inferred from recent events" : "";
  if (!building) {
    if (model.postOffice.some((a) => a.key === agent.key)) {
      const carrying = model.deliveries.length;
      return `You are at the post office${carrying > 0 ? `, with ${plural(carrying, "letter", "letters")} in flight` : ""}.`;
    }
    return "You are in the town hall: you are active in no building right now.";
  }

  const proxyText =
    proxies.length > 0
      ? `; you also show as a translucent proxy in ${proxies.map((p) => p.building?.name ?? "a building").join(", ")}`
      : "";
  const lead = proxies.length > 0 ? "Your real avatar is in" : "You are in";
  return `${lead} ${placeIn(building, agent)}${inferred}${nearby(building, agent)}${letters(model, building, agent)}${proxyText}.`;
}
