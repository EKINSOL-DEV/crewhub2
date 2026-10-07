/* The viewer's style options (a season, a planting, ...): kept per viewer in this browser, like the viewer's cast. An
   option that is absent follows the town and the style's default; a zone or a building that sets one wins over it.
   Storage may throw (private mode, blocked site data): the choice then lasts for this page only. */
import { useSyncExternalStore } from "react";

export const STYLE_OPTIONS_KEY = "crewhub-world.style-options";

/** Only a flat object of strings is kept; anything else in storage reads as no choice. */
export function parseStyleOptions(text: string | null | undefined): Record<string, string> {
  try {
    const value: unknown = JSON.parse(text ?? "null");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
  } catch {
    return {};
  }
}

let current: Record<string, string> | undefined;
const listeners = new Set<() => void>();
const read = (): Record<string, string> => {
  try {
    return parseStyleOptions(globalThis.localStorage?.getItem(STYLE_OPTIONS_KEY));
  } catch {
    return {};
  }
};

/** Sets one option; an empty value goes back to following the town. */
export function setStyleOption(id: string, value: string | null) {
  const next = { ...(current ?? read()) };
  if (value) next[id] = value;
  else delete next[id];
  current = next;
  try {
    if (Object.keys(next).length) globalThis.localStorage?.setItem(STYLE_OPTIONS_KEY, JSON.stringify(next));
    else globalThis.localStorage?.removeItem(STYLE_OPTIONS_KEY);
  } catch {
    // Not kept: storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function useStyleOptions(): Record<string, string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= read()),
  );
}
