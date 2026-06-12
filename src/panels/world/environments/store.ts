// Environment selection (EKI-111): in-memory truth + best-effort persistence
// in the settings KV — the `props/store.ts` pattern. Unknown stored ids fall
// back to the default at lookup time (registry), never here.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const ENVIRONMENT_SETTING_KEY = "world.environment";
export const DEFAULT_ENVIRONMENT_ID = "desert";

interface EnvironmentState {
  id: string;
  /** Load the persisted choice once. Idempotent. */
  init: () => Promise<void>;
  /** Switch now; KV write is best effort. */
  setEnvironment: (id: string) => void;
}

let requested = false;

export const useEnvironmentStore = create<EnvironmentState>((set) => ({
  id: DEFAULT_ENVIRONMENT_ID,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(ENVIRONMENT_SETTING_KEY);
      if (res.status === "ok" && res.data) set({ id: res.data });
    } catch {
      // backend unavailable (unit tests) — keep the default
    }
  },

  setEnvironment: (id) => {
    set({ id });
    void commands.setSetting(ENVIRONMENT_SETTING_KEY, id).catch(() => undefined);
  },
}));

/** Test hook: allow re-running init after a store reset. */
export function resetEnvironmentStoreForTests(): void {
  requested = false;
  useEnvironmentStore.setState({ id: DEFAULT_ENVIRONMENT_ID });
}
