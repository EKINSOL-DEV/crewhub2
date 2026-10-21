/* The host's health as this page last read it (round 14): the gate's first read, then whatever the Connection panel, the
   Pair screen or a probe reads later. The Chat panel's small print and the text view's Chat line take the chat session's
   state from here (`connection.session`), so the three places tell one story per road without a read of their own. */
import { useSyncExternalStore } from "react";
import type { HostHealth } from "@crewhub/loops-client";
import { SOURCE } from "./world";

let current: HostHealth | null = SOURCE.health ?? null;
const listeners = new Set<() => void>();

/** A fresh health read: kept for everyone who shows it. */
export function rememberHealth(health: HostHealth): void {
  current = health;
  for (const listener of listeners) listener();
}

export const subscribeHealth = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getHealth = () => current;

/** The last health read, or null before the first (a demo page). */
export function useHostHealth(): HostHealth | null {
  return useSyncExternalStore(subscribeHealth, getHealth, getHealth);
}
