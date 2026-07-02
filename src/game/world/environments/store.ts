// Environment selection (M0 T7): the old world's store pattern, same settings
// key (`world.environment`) so the choice carries across the rebuild. Unknown
// ids (old biomes before their M4 ports) fall back at lookup time.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const ENVIRONMENT_SETTING_KEY = "world.environment";
export const DEFAULT_GAME_ENVIRONMENT = "campus";

interface GameEnvironmentState {
  id: string;
  init: () => Promise<void>;
  setEnvironment: (id: string) => void;
}

let requested = false;

export const useGameEnvironment = create<GameEnvironmentState>((set) => ({
  id: DEFAULT_GAME_ENVIRONMENT,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(ENVIRONMENT_SETTING_KEY);
      if (res.status === "ok" && res.data) set({ id: res.data });
    } catch {
      // backend unavailable (unit tests, plain browser) — keep the default
    }
  },

  setEnvironment: (id) => {
    set({ id });
    void commands.setSetting(ENVIRONMENT_SETTING_KEY, id).catch(() => undefined);
  },
}));

/** Test hook: rerun init after a reset. */
export function resetGameEnvironmentForTests(): void {
  requested = false;
  useGameEnvironment.setState({ id: DEFAULT_GAME_ENVIRONMENT });
}
