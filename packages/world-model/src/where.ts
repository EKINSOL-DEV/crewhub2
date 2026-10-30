/**
 * Agent awareness (LOOPS_INTEGRATION_PLAN.md section 7.2): "where am I" in about 40 tokens, in zone labels and never
 * coordinates. Pure over the world model; nothing is ever sent into a lane.
 */
import { CIVIC_WORDS, type CivicWords } from "./describe.ts";
import { roomPlaceWords, type RoomWording } from "./halls.ts";
import type { AgentPlacement, Building, PersonVisit, WorldModel } from "./model.ts";

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

/** "the workers room of CR product", or in halls "the floor of CR product"; "in"/"on" is left to the caller's lead. */
function placeIn(building: Building, agent: AgentPlacement, rooms: RoomWording): string {
  const room = agent.room ? roomPlaceWords(agent.room, rooms).replace(/^(in|on) /, "") : "the building";
  const desk = agent.deskTicketKey ? ` at the ${agent.deskTicketKey} desk` : "";
  return `${room} of ${building.name}${desk}`;
}

/** The word before the place: "in the workers room", "on the floor", "in Administration". */
function preposition(agent: AgentPlacement, rooms: RoomWording): string {
  return agent.room && roomPlaceWords(agent.room, rooms).startsWith("on ") ? "on" : "in";
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

/**
 * The voice of the answer (decision 8, round 15): the second person only when the asker is the agent itself ("You are",
 * "your real avatar", "letters for you"); otherwise the third person by display name ("cr-lead is", "cr-lead's real
 * avatar", "letters for cr-lead"). The world never knows the asker today: the text view's form is a person picking a
 * name, and no agent asks the world (section 7.2 is a plan, nothing is sent into a lane), so without an `asker` every
 * answer is in the third person.
 */
function voice(agent: AgentPlacement, asker: string | null) {
  const self = asker !== null && matches(agent, asker.trim().toLowerCase());
  const name = agent.displayName;
  return self
    ? { is: "You are", avatarIs: "Your real avatar is", forWhom: "you", bringing: "bringing you", alsoShows: "you also show", hereIs: "here you are", idle: (hall: string) => `You are in the ${hall}: you are active in no building right now.` }
    : { is: `${name} is`, avatarIs: `${name}'s real avatar is`, forWhom: name, bringing: `bringing ${name}`, alsoShows: `${name} also shows`, hereIs: `here ${name} is`, idle: (hall: string) => `${name} is in the ${hall}, active in no building right now.` };
}
type Voice = ReturnType<typeof voice>;

function letters(model: WorldModel, building: Building, agent: AgentPlacement, rooms: RoomWording, v: Voice): string {
  const waiting = building.mailbox.filter((l) => l.recipientId === agent.key || l.recipientId === agent.name).length;
  const coming = model.deliveries.filter((d) => d.recipientId === agent.key || d.recipientId === agent.name).length;
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${rooms === "classic" ? "the lobby" : "Administration"} has ${plural(waiting, "letter", "letters")} for ${v.forWhom}`);
  if (coming > 0) parts.push(`the postman is ${v.bringing} ${plural(coming, "letter", "letters")}`);
  return parts.length > 0 ? `; ${parts.join("; ")}` : "";
}

/**
 * The answer for `agentName` (a principal id, a herdr name or a display name, in any case). An agent with proxies
 * hears where its real avatar is and where its proxies stand; unknown names get a plain "no such agent". `rooms` picks
 * the words for places: the classic rooms, or the three halls ("on the floor of …", "Administration has a letter").
 * `asker`: who asks, when the caller knows (the agent itself hears "You are …"); null, the usual case, is the third
 * person ("cr-lead is …"), see `voice`. A person's answer is always in the third person.
 */
export function where(model: WorldModel, agentName: string, civic: CivicWords = CIVIC_WORDS, rooms: RoomWording = "classic", asker: string | null = null): string {
  const wanted = agentName.trim().toLowerCase();
  const found = wanted === "" ? [] : everyPlacement(model).filter((p) => matches(p.agent, wanted));
  const real = found.find((p) => p.agent.presence === "real");
  const proxies = found.filter((p) => p.agent.presence === "proxy");
  if (!real && proxies.length === 0) {
    const visit = wanted === "" ? undefined : personVisit(model, wanted);
    if (visit) return wherePerson(visit.visit, visit.building, rooms);
    return `No agent called "${agentName.trim().slice(0, 40)}" is in CrewHub World.`;
  }

  if (!real) {
    // Only echoes are left, for example an archived building: point at the real avatar's building.
    const first = proxies[0]!;
    const home = model.buildings.find((b) => b.slug === first.agent.workingIn);
    const v = voice(first.agent, asker);
    return `${v.avatarIs} in ${home ? home.name : "another building"}; ${v.hereIs} a translucent proxy.`;
  }

  const { agent, building } = real;
  const v = voice(agent, asker);
  const inferred = agent.locationInferred ? ", inferred from recent events" : "";
  if (!building) {
    if (model.postOffice.some((a) => a.key === agent.key)) {
      const carrying = model.deliveries.length;
      return `${v.is} at the ${civic.post}${carrying > 0 ? `, with ${plural(carrying, "letter", "letters")} in flight` : ""}.`;
    }
    return v.idle(civic.hall);
  }

  const proxyText =
    proxies.length > 0
      ? `; ${v.alsoShows} as a translucent proxy in ${proxies.map((p) => p.building?.name ?? "a building").join(", ")}`
      : "";
  const lead = `${proxies.length > 0 ? v.avatarIs : v.is} ${preposition(agent, rooms)}`;
  return `${lead} ${placeIn(building, agent, rooms)}${inferred}${nearby(building, agent)}${letters(model, building, agent, rooms, v)}${proxyText}.`;
}

/* ── People (spec addendum "a person in the world") ─────────────────────── */

/** The visit of a person asked for by principal id or display name: the one carrying first, then the queue, then landed. */
function personVisit(model: WorldModel, wanted: string): { visit: PersonVisit; building: Building } | undefined {
  const order: PersonVisit["phase"][] = ["carrying", "queued", "landed"];
  const all = model.buildings.flatMap((building) => building.visits.map((visit) => ({ visit, building })));
  return all
    .filter(({ visit }) => [visit.personId, visit.displayName].some((n) => n.toLowerCase() === wanted))
    .sort((a, b) => order.indexOf(a.visit.phase) - order.indexOf(b.visit.phase))[0];
}

/** A person is no resident: the answer says what they are doing with the package, in the third person. */
function wherePerson(visit: PersonVisit, building: Building, rooms: RoomWording): string {
  const done = rooms === "classic" ? "Dispatch" : "the Done rack";
  const who = `${visit.displayName} is a person`;
  if (visit.phase === "queued") return `${who} at the door of ${building.name}, waiting to carry ${visit.ticketKey} to ${done}.`;
  if (visit.phase === "carrying") return `${who} in ${building.name}, carrying ${visit.ticketKey} to ${done}.`;
  return `${who} in ${building.name}; they just moved ${visit.ticketKey} to ${done}${visit.rejected ? " as won't do" : ""}.`;
}
