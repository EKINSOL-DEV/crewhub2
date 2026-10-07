/* "Now": where the agent is and what state it is in, in the text view's words. Always applies: the placement is a fact. */
import type { AgentCardSection, CardRow } from "../types.ts";

export const nowSection: AgentCardSection = {
  id: "now",
  title: "Now",
  when: () => true,
  render(facts, ctx) {
    const { agent } = facts;
    const rows: CardRow[] = [];
    const where = facts.building ? `${facts.building.name}${agent.room ? `, ${facts.building.rooms.find((r) => r.kind === agent.room)?.label ?? agent.room}` : ""}` : agent.presence === "proxy" ? "elsewhere" : "the town";
    rows.push({ kind: "text", label: "Where", text: `${where}${agent.locationInferred ? " (inferred from recent events)" : ""}` });
    if (agent.presence === "proxy") rows.push({ kind: "text", label: "", text: "A translucent proxy here: the real figure works in another building.", muted: true });
    else rows.push({ kind: "chips", chips: [{ kind: "lane", status: agent.laneStatus }, { kind: "plain", text: `posture ${agent.posture === "raised-hand" ? "hand raised" : agent.posture}` }] });
    if (ctx.freshness.stale) rows.push({ kind: "text", label: "", text: "The team snapshot is older than 5 minutes: the lane status is unknown.", muted: true });
    if (facts.team?.contextLine) rows.push({ kind: "quote", text: facts.team.contextLine, by: "status line" });
    for (const alert of agent.alerts) rows.push({ kind: "chips", chips: [{ kind: "attention", text: alert }] });
    return rows;
  },
};
