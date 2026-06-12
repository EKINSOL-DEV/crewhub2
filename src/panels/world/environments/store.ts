// Environment selection (EKI-111): in-memory truth + best-effort persistence
// in the settings KV — the `props/store.ts` pattern. Unknown stored ids fall
// back to the default at lookup time (registry), never here.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const ENVIRONMENT_SETTING_KEY = "world.environment";
export const NIGHT_SETTING_KEY = "world.night";
export const DEFAULT_ENVIRONMENT_ID = "desert";

interface EnvironmentState {
  id: string;
  /** Lights out (EKI-122) — a user toggle, not a clock. */
  night: boolean;
  /** Load the persisted choices once. Idempotent. */
  init: () => Promise<void>;
  /** Switch now; KV write is best effort. */
  setEnvironment: (id: string) => void;
  toggleNight: () => void;
}

let requested = false;

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  id: DEFAULT_ENVIRONMENT_ID,
  night: false,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(ENVIRONMENT_SETTING_KEY);
      if (res.status === "ok" && res.data) set({ id: res.data });
      const n = await commands.getSetting(NIGHT_SETTING_KEY);
      if (n.status === "ok" && n.data === "1") set({ night: true });
    } catch {
      // backend unavailable (unit tests) — keep the defaults
    }
  },

  setEnvironment: (id) => {
    set({ id });
    void commands.setSetting(ENVIRONMENT_SETTING_KEY, id).catch(() => undefined);
  },

  toggleNight: () => {
    const night = !get().night;
    set({ night });
    void commands.setSetting(NIGHT_SETTING_KEY, night ? "1" : "0").catch(() => undefined);
  },
}));

/** Test hook: allow re-running init after a store reset. */
export function resetEnvironmentStoreForTests(): void {
  requested = false;
  useEnvironmentStore.setState({ id: DEFAULT_ENVIRONMENT_ID, night: false });
}
