// Live-bot registry (M8 T2): GameCameraRig's "follow" mode needs a bot's
// live x/z every frame, but `Sim` is created and owned inside
// Characters/use-sim.ts, and GameCameraRig is a *sibling* of Characters
// inside the same <GameCanvas> — no prop path connects them without lifting
// Sim creation up to GameShell, a much bigger change than this task's scope
// (and GameShell doesn't otherwise need it). Same cross-component-boundary
// shape as command-bus.ts's chat -> sim bridge, but the read direction
// (sim -> camera) and no queueing: `sim.world.bots` is a live Map mutated in
// place every tick (see use-sim.ts's own comment on that), so registering
// the Map ONCE per Sim identity is enough — nothing here needs to react to
// registration, only read the live Map when a frame needs it. Module-level,
// not a store, for the same reason as command-bus.ts: exactly one sim per
// app.
import type { SimBot } from "./sim";

let bots: Map<string, SimBot> | null = null;

/** Characters.tsx calls this once per Sim identity (mount/remount), and with
 *  `null` on unmount. */
export function registerLiveBots(map: Map<string, SimBot> | null): void {
  bots = map;
}

/** GameCameraRig reads this imperatively per frame — never in render. */
export function getLiveBot(key: string): SimBot | undefined {
  return bots?.get(key);
}

/** Test-only reset — mirrors command-bus.ts having no reset (its queue is
 *  self-draining) but this registry persists across a component's lifetime,
 *  so tests need an explicit way back to "nothing registered". */
export function resetLiveBotsForTests(): void {
  bots = null;
}
