// First-run welcome ceremony (M4 T6 — the switch): a one-shot KV flag so the
// campus greets a fresh install once and never again. Same store pattern as
// the environment/quality stores (src/game/engine/quality.ts).
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const WELCOMED_SETTING_KEY = "game.welcomed";

interface GameWelcomeState {
  welcomed: boolean;
  /** True once init() has resolved (success or not) — gates the first paint
   * so a returning user's card never flashes before the KV read lands. */
  loaded: boolean;
  init: () => Promise<void>;
  dismiss: () => void;
}

let requested = false;

export const useGameWelcome = create<GameWelcomeState>((set) => ({
  welcomed: false,
  loaded: false,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(WELCOMED_SETTING_KEY);
      set({ welcomed: res.status === "ok" && res.data === "1" });
    } catch {
      // backend unavailable (unit tests, plain browser) — not welcomed yet
    } finally {
      set({ loaded: true });
    }
  },

  dismiss: () => {
    set({ welcomed: true });
    void commands.setSetting(WELCOMED_SETTING_KEY, "1").catch(() => undefined);
  },
}));

/** Test hook: rerun init after a reset. */
export function resetGameWelcomeForTests(): void {
  requested = false;
  useGameWelcome.setState({ welcomed: false, loaded: false });
}
