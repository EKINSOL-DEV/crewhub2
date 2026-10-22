/* What an agent just said to the person (round 12, the host's chat session): one line per agent, shown as a speech
   bubble over the agent's figure for a few seconds, then gone. A tap on the bubble opens the agent (its card; the Chat
   panel once it lands). Since round 16 a missed answer is not lost: the last RECENT_ANSWERS lines, newest first, stay for
   the page's life as the "Recent answers" list (the Chat panel, the text view), from the same lines the bubbles show and
   holding nothing more than a bubble does. Nothing is written to disk; a reload starts empty. */
import { useSyncExternalStore } from "react";
import type { ChatLine } from "@crewhub/loops-client";

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

const lines = new Map<string, Said>();
let snapshot: SaidMap = new Map();
let recent: readonly Answer[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function publish(): void {
  snapshot = new Map(lines);
  for (const listener of listeners) listener();
}

/** Drops every expired line and arms a wake-up for the next one to expire. */
function sweep(nowMs: number): void {
  let changed = false;
  let next = Number.POSITIVE_INFINITY;
  for (const [agentId, said] of lines) {
    if (said.until <= nowMs) {
      lines.delete(agentId);
      changed = true;
    } else next = Math.min(next, said.until);
  }
  if (timer !== null) clearTimeout(timer);
  timer = Number.isFinite(next) ? setTimeout(() => sweep(Date.now()), Math.max(0, next - nowMs)) : null;
  if (changed) publish();
}

/**
 * Remembers an agent's line: the bubble (the newest replaces an older one of the same agent) for SAID_MS, and the
 * Recent answers list (newest first, RECENT_ANSWERS at most, for the page's life). A line the page saw already (the same
 * message id: a stream that replayed) is not listed twice.
 */
export function rememberSaid(line: ChatLine, nowMs = Date.now()): void {
  const said: Said = { text: line.text, agentName: line.agentName ?? null, messageId: line.messageId, threadId: line.threadId, shownAt: nowMs, until: nowMs + SAID_MS };
  lines.set(line.agentId, said);
  if (!recent.some((a) => a.messageId === line.messageId)) recent = [{ ...said, agentId: line.agentId, at: line.at }, ...recent].slice(0, RECENT_ANSWERS);
  sweep(nowMs);
  publish();
}

/** The line over `agentId` right now, or null. `fading` is true in the last SAID_FADE_MS. */
export function saidBy(agentId: string, nowMs = Date.now(), map: SaidMap = snapshot): (Said & { fading: boolean }) | null {
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

/** Forgets everything, the list too (a new source, the tests). */
export function clearSaid(): void {
  lines.clear();
  recent = [];
  if (timer !== null) clearTimeout(timer);
  timer = null;
  publish();
}

export const subscribeSaid = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSaid = () => snapshot;
/** The lines in flight, for the canvas (re-rendered when one arrives or goes). */
export function useSaid(): SaidMap {
  return useSyncExternalStore(subscribeSaid, getSaid, getSaid);
}

/** The Recent answers list: the last RECENT_ANSWERS lines the page saw, newest first; the same array until one arrives. */
export const getRecentAnswers = () => recent;
/** How many bubbles are alive right now (the long-session probe, state/soak.ts). */
export const saidCount = () => lines.size;
export function useRecentAnswers(): readonly Answer[] {
  return useSyncExternalStore(subscribeSaid, getRecentAnswers, getRecentAnswers);
}
