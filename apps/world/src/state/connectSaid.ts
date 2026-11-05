/* The connect that was just made, said once as Live (round 65, walk finding w5-22). The Connect screen says "Key sent
   to the host; checking it with crewhub-loops." and, the key accepted, the town takes its place; the chip's first
   state on a load is never said (a plain load would say it to everyone), so a screen reader person heard the check
   start and never its end. The Connect screen marks the connect (`markConnected`); the App takes the mark once the
   connection is live (`takeConnected`) and says "Connected: Live." instead of the change sentence. The mark lives in
   this module (the screen and the town are the same page: the gate swaps the element, nothing reloads). */
import type { ConnectionState } from "@crewhub/loops-client";

let pending = false;

/** The Connect screen's key was accepted by the host: the town that follows says it is live. */
export function markConnected(): void {
  pending = true;
}

/** The mark, taken: true once after a connect, then false. */
export function takeConnected(): boolean {
  const was = pending;
  pending = false;
  return was;
}

/**
 * What the polite region says for the connection's new state: `connected` ("Connected: Live.") for the first live state
 * after a connect, `changed` ("Connection: …") for a change over an open town, null for the first state of a plain load,
 * the same state again, or no state.
 */
export function connectionSentence(justConnected: boolean, before: ConnectionState | null, after: ConnectionState | null): "connected" | "changed" | null {
  if (after === "live" && justConnected) return "connected";
  if (before !== null && after !== null && before !== after) return "changed";
  return null;
}
