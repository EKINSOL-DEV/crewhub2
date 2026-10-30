/* The chat threads' facts (round 24): where crewhub-loops lets the world's key read the chat, the host sends every tab
   the list of threads as it stands (per agent: when the last message was written, how many are unread), at attach and
   again after a dm.* event. Kept beside the model, for the agent card's Answers section ("last message in the chat 2 h
   ago, 1 unread" before any answer arrives this page). Null until the host sends a list: a key that cannot read the
   chat, a demo page, a host from before. Nothing of the messages themselves. */
import { useSyncExternalStore } from "react";
import type { ChatThreadFact } from "@crewhub/loops-client";

export type ThreadMap = ReadonlyMap<string, ChatThreadFact>;

let current: ThreadMap | null = null;
const listeners = new Set<() => void>();

/** The host's list, whole: replaces what was known. */
export function rememberThreads(threads: readonly ChatThreadFact[]): void {
  current = new Map(threads.map((t) => [t.agentId, t]));
  for (const listener of listeners) listener();
}

/** Forgets the list (a new source, the tests). */
export function clearThreads(): void {
  current = null;
  for (const listener of listeners) listener();
}

export const subscribeThreads = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getThreads = () => current;

/** The threads as the host last sent them, or null when it sent none. */
export function useChatThreads(): ThreadMap | null {
  return useSyncExternalStore(subscribeThreads, getThreads, getThreads);
}
