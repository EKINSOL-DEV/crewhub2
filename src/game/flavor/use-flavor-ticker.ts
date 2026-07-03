// Flavor ticker (M4 T2): every 15s, gives the flavor engine a chance to
// generate a throttled "thought" for each live, busy character. Pure
// scheduling glue — engine.ts's maybeThink owns the actual per-character
// cooldown and in-flight cap, this just decides *when* to ask and *who*.
import { useEffect, useRef } from "react";
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
  // The sessions store replaces its state (and so `characters`' identity)
  // sub-second while a session is actively Working — if that array were a
  // useEffect dep, the interval would reset before it ever fires. A ref
  // read from inside the interval sidesteps that: the effect only restarts
  // on `enabled` flipping, while the callback always sees the latest list.
  // Updated in its own effect, not during render — refs are for outside
  // render (same rule Characters.tsx documents for `infoRef`).
  const charactersRef = useRef(characters);
  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  useEffect(() => {
    if (!enabled) return;
    void useFlavor.getState().init();
    const timer = setInterval(() => {
      const nowMs = Date.now();
      for (const c of charactersRef.current) {
        if (ELIGIBLE.has(c.status)) useFlavor.getState().maybeThink(c, nowMs);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
