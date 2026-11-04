/* The AI-presence settings kept in this browser (state/director.ts). Storage may throw (private window, blocked site
   data): the settings then last for this page only. Pure but for the storage, which a test passes in. */
import { DEFAULT_PRESENCE, normalizePresence, type PresenceSettings } from "@crewhub/world-model";

export const PRESENCE_KEY = "crewhub.presence.v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// Reading `localStorage` itself can throw, so it is looked up inside the try.
const local = (storage: Storage | null | undefined) => (storage === undefined ? globalThis.localStorage : storage);

export function loadPresence(storage?: Storage | null): PresenceSettings {
  try {
    const raw = local(storage)?.getItem(PRESENCE_KEY);
    return raw ? normalizePresence(JSON.parse(raw)) : DEFAULT_PRESENCE;
  } catch {
    return DEFAULT_PRESENCE;
  }
}

export function savePresence(settings: PresenceSettings, storage?: Storage | null): void {
  try {
    local(storage)?.setItem(PRESENCE_KEY, JSON.stringify(settings));
  } catch {
    // The settings then last for this page only.
  }
}
