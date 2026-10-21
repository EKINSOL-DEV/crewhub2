/* What an agent just said to the person (round 12, the host's chat session): one line per agent, shown as a speech
   bubble over the agent's figure for a few seconds, then gone. Nothing of the conversation is kept beyond that: the
   store holds the newest line per agent until it expires, and the page keeps nothing else. A tap on the bubble opens
   the agent (its card; the Chat panel once it lands). */
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

const lines = new Map<string, Said>();
let snapshot: SaidMap = new Map();
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

/** Remembers an agent's line (the newest replaces an older one of the same agent) for SAID_MS. */
export function rememberSaid(line: ChatLine, nowMs = Date.now()): void {
  lines.set(line.agentId, { text: line.text, agentName: line.agentName ?? null, messageId: line.messageId, threadId: line.threadId, shownAt: nowMs, until: nowMs + SAID_MS });
  sweep(nowMs);
  publish();
}

/** The line over `agentId` right now, or null. `fading` is true in the last SAID_FADE_MS. */
export function saidBy(agentId: string, nowMs = Date.now(), map: SaidMap = snapshot): (Said & { fading: boolean }) | null {
  const said = map.get(agentId);
  if (said === undefined || said.until <= nowMs) return null;
  return { ...said, fading: said.until - nowMs <= SAID_FADE_MS };
}

/** Forgets everything (a new source, the tests). */
export function clearSaid(): void {
  lines.clear();
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
