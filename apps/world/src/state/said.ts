/* What an agent just said to the person (round 12, the host's chat session), its shapes and its words: one line per
   agent, shown as a speech bubble over the agent's figure for a few seconds, then gone. A tap on the bubble opens the agent
   (its card; the Chat panel once it lands). Since round 16 a missed answer is not lost: the last RECENT_ANSWERS lines,
   newest first, stay for the page's life as the "Recent answers" list (the Chat panel, the text view), from the same lines
   the bubbles show and holding nothing more than a bubble does. The store is state/chatStores.ts. Pure. */

/** How long a bubble stays (ms), and how long before its end it fades. */
export const SAID_MS = 12_000;
export const SAID_FADE_MS = 4_000;

export interface Said {
  text: string;
  agentName: string | null;
  messageId: string;
  threadId: string;
  /** When it was shown (ms) and when it goes. */
  shownAt: number;
  until: number;
}

export type SaidMap = ReadonlyMap<string, Said>;

/** One answer in the Recent answers list: what the bubble held, plus when loops wrote it (`ChatLine.at`). */
export interface Answer extends Said {
  agentId: string;
  /** When loops wrote it (ISO), for the list's time; `shownAt` is when the page saw it. */
  at: string;
}

/** How many answers the list keeps (the newest). */
export const RECENT_ANSWERS = 10;

/** The line over `agentId` right now, or null. `fading` is true in the last SAID_FADE_MS. */
export function saidBy(agentId: string, nowMs: number, map: SaidMap): (Said & { fading: boolean }) | null {
  const said = map.get(agentId);
  if (said === undefined || said.until <= nowMs) return null;
  return { ...said, fading: said.until - nowMs <= SAID_FADE_MS };
}

/** The bubble's words: "<name> says: <line>", the title of the bubble and the first part of its accessible name. */
export function saidWords(name: string, text: string): string {
  return `${name} says: ${text}`;
}

/**
 * Two sentences joined without doubling terminal punctuation (round 14): a line that already ends with ., !, ? or … (a
 * closing quote or bracket after it allowed) gets no second full stop before the next sentence.
 */
export function joinSentences(first: string, second: string): string {
  const a = first.trimEnd();
  if (a === "") return second;
  return /[.!?\u2026]["'\u2019\u201d)\]]*$/.test(a) ? `${a} ${second}` : `${a}. ${second}`;
}

/** The bubble's accessible name: what the agent says, then what a tap does. */
export function saidLabel(name: string, text: string, action: string): string {
  return joinSentences(saidWords(name, text), action);
}
