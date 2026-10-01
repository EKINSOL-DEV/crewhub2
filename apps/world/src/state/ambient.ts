/* The "ambient" setting (plan 7.1 idle variety): on, reduced or off, kept in this browser. Storage may throw (private
   mode, blocked site data): the choice then lasts for this page only. */
import { AMBIENT_CHOICES, type Ambient } from "../world/movement";

export const AMBIENT_KEY = "crewhub-world.ambient";

export function readAmbient(): Ambient {
  try {
    const value = globalThis.localStorage?.getItem(AMBIENT_KEY);
    return AMBIENT_CHOICES.includes(value as Ambient) ? (value as Ambient) : "on";
  } catch {
    return "on";
  }
}

export function writeAmbient(value: Ambient) {
  try {
    globalThis.localStorage?.setItem(AMBIENT_KEY, value);
  } catch {
    // Not kept: storage is unavailable.
  }
}
