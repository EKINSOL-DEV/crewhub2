// Flavor ticker (M4 T2): every 15s, gives the flavor engine a chance to
// generate a throttled "thought" for each live, busy character. Pure
// scheduling glue — engine.ts's maybeThink owns the actual per-character
// cooldown and in-flight cap, this just decides *when* to ask and *who*.
import { useEffect } from "react";
import type { Character } from "@/game/sim/characters";
import { useFlavor } from "./engine";

const TICK_MS = 15_000;
const ELIGIBLE = new Set<Character["status"]>(["Working", "WaitingForInput"]);

/**
 * `enabled` should be false for demo scenes (`?demo`) — those are fake
 * robots with no session behind them (maybeThink already skips `demo:*`
 * keys, but there's no point running the interval at all).
 */
export function useFlavorTicker(characters: Character[], enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void useFlavor.getState().init();
    const timer = setInterval(() => {
      const nowMs = Date.now();
      for (const c of characters) {
        if (ELIGIBLE.has(c.status)) useFlavor.getState().maybeThink(c, nowMs);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [characters, enabled]);
}
