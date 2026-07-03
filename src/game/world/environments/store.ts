// Environment selection (M0 T7): the old world's store pattern, same settings
// key (`world.environment`) so the choice carries across the rebuild. Unknown
// ids (old biomes before their M4 ports) fall back at lookup time.
// Night (M4 T4): a user toggle, not a clock — ported from the old world's
// store (src/panels/world/environments/store.ts), same `world.night` KV key
// and "1"/"0" encoding.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const ENVIRONMENT_SETTING_KEY = "world.environment";
export const NIGHT_SETTING_KEY = "world.night";
export const DEFAULT_GAME_ENVIRONMENT = "campus";

interface GameEnvironmentState {
  id: string;
  night: boolean;
  init: () => Promise<void>;
  setEnvironment: (id: string) => void;
  toggleNight: () => void;
}

let requested = false;

export const useGameEnvironment = create<GameEnvironmentState>((set, get) => ({
  id: DEFAULT_GAME_ENVIRONMENT,
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
      // backend unavailable (unit tests, plain browser) — keep the defaults
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

/** Test hook: rerun init after a reset. */
export function resetGameEnvironmentForTests(): void {
  requested = false;
  useGameEnvironment.setState({ id: DEFAULT_GAME_ENVIRONMENT, night: false });
}
