/* "Now": where the agent is and what state it is in, in the text view's words, and how fresh that is. Always applies:
   the placement is a fact. In three-rooms wording the place is the hall and the desk ("crewhub-loops, the floor, at a
   worker desk"). The team's own status word and status line come when the team snapshot knows the agent; "last seen"
   comes from loops (`lastSeenAt`, when its key was last used). Old facts are said to be old: the card never claims an
   agent is working from a stale snapshot or an old sighting. Text, never colour alone. */
import { DESK_WORDS, HALL_PLACES, hallOf, type AgentPlacement, type Building } from "@crewhub/world-model";
import type { AgentCardSection, CardRow } from "../types.ts";
import { agoWords, spanWords, stampOf } from "../words.ts";

/** A sighting older than this, with no fresh team status, is not read as working (the team snapshot's own limit). */
export const SEEN_FRESH_MS = 300_000;

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
    const stale = ctx.freshness.stale;
    if (stale) rows.push({ kind: "text", label: "", text: ctx.freshness.teamTs === null ? "No team snapshot yet: the lane status is unknown." : "The team snapshot is older than 5 minutes: the lane status is unknown.", muted: true });
    // The team's own word, as herdr reported it; an old snapshot's word is history, not now.
    const team = facts.team;
    if (team) {
      const typed = team.unsentInput === "typed" ? "; text typed in its input, not sent" : "";
      rows.push({ kind: "text", label: stale ? "Team said" : "Team says", text: `${team.status}${stale ? ", in a snapshot that is old now" : ""}${typed}`, muted: stale });
    } else if (facts.loops) {
      rows.push({ kind: "text", label: "Team says", text: facts.loops.external ? "nothing: an external bot has no pane for the team to watch" : "nothing: not in the team snapshot", muted: true });
    }
    if (team?.contextLine) rows.push({ kind: "quote", text: team.contextLine, by: "status line" });
    // Loops' own sighting: when the key was last used. Fresh team status outranks it; otherwise an old one is said so.
    const loops = facts.loops;
    if (loops) {
      const seen = stampOf(loops.lastSeenAt);
      const teamFresh = team !== null && !stale;
      if (seen === null) rows.push({ kind: "text", label: "Seen by loops", text: `never${teamFresh ? "" : "; not known to be working"}`, muted: !teamFresh });
      else if (ctx.now - seen <= SEEN_FRESH_MS) rows.push({ kind: "text", label: "Seen by loops", text: agoWords(seen, ctx.now) });
      else rows.push({ kind: "text", label: "Not seen by loops", text: `for ${spanWords(ctx.now - seen)}${teamFresh ? "" : "; not known to be working"}`, muted: !teamFresh });
    }
    for (const alert of agent.alerts) rows.push({ kind: "chips", chips: [{ kind: "attention", text: alert }] });
    return rows;
  },
};
