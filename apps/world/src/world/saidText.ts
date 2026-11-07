/* What the agents just said (state/said.ts), as words outside the canvas (round 14): the text view's "<name> says:" lines
   while a bubble is live, and the chat marks over the buildings whose figure is not drawn from the town. Pure: the model,
   the said map and the clock in, lines and marks out. */
import type { AgentPlacement, TextLine, WorldModel } from "@crewhub/world-model";
import type { Answer, Said, SaidMap } from "../state/said.ts";
import { saidBy, saidWords } from "../state/said.ts";
import { roomName, type RoomWording } from "./roomWords.ts";

/** A live line of an agent inside a building: the chat mark over that building from the town, and its text-view chip. */
export interface SaidMark {
  slug: string;
  building: string;
  /** The agent's loops id (`AgentPlacement.name`) and its key for the pick. */
  agent: string;
  key: string;
  name: string;
  text: string;
  fading: boolean;
}

type Model = Pick<WorldModel, "buildings" | "townHall" | "postOffice">;

/** The marks: one per real agent inside a building with a line in flight, in building order. The town's own figures carry their bubble. */
export function saidMarks(model: Model, said: SaidMap, nowMs: number): SaidMark[] {
  const marks: SaidMark[] = [];
  for (const b of model.buildings)
    for (const a of b.agents) {
      if (a.presence !== "real") continue;
      const line = saidBy(a.name, nowMs, said);
      if (line === null) continue;
      marks.push({ slug: b.slug, building: b.name, agent: a.name, key: a.key, name: a.displayName, text: line.text, fading: line.fading });
    }
  return marks;
}

/**
 * The marks as the page shows them since round 65 (walk finding w3-4): one per real agent inside a building with an
 * answer the person has not opened the chat for (state/chatStores `unread`), its newest, in building order. A mark
 * outlives its bubble: it goes when the chat opens, or the agent's next answer replaces it; it never fades.
 */
export function answerMarks(model: Model, unread: readonly Answer[]): SaidMark[] {
  const marks: SaidMark[] = [];
  for (const b of model.buildings)
    for (const a of b.agents) {
      if (a.presence !== "real") continue;
      const answer = unread.find((u) => u.agentId === a.name);
      if (answer === undefined) continue;
      marks.push({ slug: b.slug, building: b.name, agent: a.name, key: a.key, name: a.displayName, text: answer.text, fading: false });
    }
  return marks;
}

/**
 * The live marks the page shows (round 76): the answers' marks, none while the Chat panel is open. The panel reads an
 * answer as it lands, so a mark there would stand for one commit and rebuild the building's pin twice.
 */
export function marksShown(model: Model, unread: readonly Answer[], chatOpen: boolean): SaidMark[] {
  return chatOpen ? [] : answerMarks(model, unread);
}

/** The mark's accessible name: who answered, and where a tap goes. */
export function markLabel(mark: Pick<SaidMark, "name" | "building">): string {
  return `${mark.name} answered: open ${mark.building}`;
}

/** The text view's chip beside the building: "<name> answered". */
export function markWords(mark: Pick<SaidMark, "name">): string {
  return `${mark.name} answered`;
}

/**
 * The text view's lines while bubbles are live: "<name> says: <first line> (in the lead's office of Inbox)" in the Town
 * section, one per agent with a line in flight, in model order (the buildings, then the town hall, then the post office).
 * The place is the agent's room of its building, the building alone without a room, or the civic place.
 */
export function saidLines(model: Model, said: SaidMap, nowMs: number, civic: { hall: string; post: string }, rooms: RoomWording = "classic"): TextLine[] {
  const lines: TextLine[] = [];
  const add = (a: AgentPlacement, line: Said, place: string) => lines.push({ section: "Town", kind: "fact", text: `${saidWords(a.displayName, line.text)} (${place})` });
  for (const b of model.buildings)
    for (const a of b.agents) {
      if (a.presence !== "real") continue;
      const line = saidBy(a.name, nowMs, said);
      if (line !== null) add(a, line, a.room ? `in the ${roomName(b, a.room, rooms).toLowerCase()} of ${b.name}` : `in ${b.name}`);
    }
  for (const a of model.townHall) {
    const line = saidBy(a.name, nowMs, said);
    if (line !== null) add(a, line, `at the ${civic.hall}`);
  }
  for (const a of model.postOffice) {
    const line = saidBy(a.name, nowMs, said);
    if (line !== null) add(a, line, `at the ${civic.post}`);
  }
  return lines;
}
