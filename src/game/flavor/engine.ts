// Flavor engine (M4 T1): throttled per-character "thought" bubbles, backed
// by a cheap headless run (Haiku by default). Not a simulation signal —
// purely decorative flavor text for the HUD. Store shape mirrors the
// settings-KV pattern in src/game/engine/quality.ts; the model policy read
// mirrors src/stores/meetings.ts readModelPolicy.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import type { Character } from "@/game/sim/characters";
import { flavorPrompt, sanitizeThought } from "./prompt";

export const FLAVOR_SETTING_KEY = "game.flavor.enabled";
export const FLAVOR_MODEL_KEY = "model_policy.character_flavor";
const DEFAULT_MODEL = "haiku";

/** Per-character throttle — Haiku is cheap, not free; recorded at attempt time. */
const COOLDOWN_MS = 240_000;
/** How long a generated thought stays visible before `thoughtFor` hides it. */
const THOUGHT_TTL_MS = 30_000;

export interface Thought {
  text: string;
  ts: number;
}

interface FlavorState {
  thoughts: Record<string, Thought>;
  runs: number;
  enabled: boolean;
  init(): Promise<void>;
  maybeThink(c: Character, nowMs: number): void;
}

/** `demo:*` keys are fake robots (see sim/demo.ts) — there is no session behind them. */
function isDemoKey(key: string): boolean {
  return key.startsWith("demo:");
}

let initRequested = false;
let model = DEFAULT_MODEL;
// Module-level, not store state: cooldown/in-flight are scheduling plumbing,
// not something a re-render should ever reflect.
const lastAttempt = new Map<string, number>();
let inFlight = false;

export const useFlavor = create<FlavorState>((set, get) => ({
  thoughts: {},
  runs: 0,
  enabled: true,

  init: async () => {
    if (initRequested) return;
    initRequested = true;
    try {
      const enabledRes = await commands.getSetting(FLAVOR_SETTING_KEY);
      if (enabledRes.status === "ok") {
        set({ enabled: enabledRes.data !== "0" });
      }
      const modelRes = await commands.getSetting(FLAVOR_MODEL_KEY);
      if (modelRes.status === "ok" && modelRes.data) {
        model = modelRes.data;
      }
    } catch {
      // backend unavailable (unit tests, plain browser) — defaults hold
    }
  },

  maybeThink: (c, nowMs) => {
    if (!get().enabled) return;
    if (c.agentId !== null || isDemoKey(c.key)) return;
    if (inFlight) return;
    const last = lastAttempt.get(c.key);
    if (last !== undefined && nowMs - last < COOLDOWN_MS) return;

    // Recorded now, win or lose — a failure must not retry-storm next frame.
    lastAttempt.set(c.key, nowMs);
    inFlight = true;
    void commands
      .worldGenerateProp(flavorPrompt(c), model)
      .then((res) => {
        if (res.status !== "ok" || res.data.status !== "success") return;
        const text = sanitizeThought(res.data.text);
        if (!text) return;
        set((state) => ({
          thoughts: { ...state.thoughts, [c.key]: { text, ts: nowMs } },
          runs: state.runs + 1,
        }));
      })
      .catch(() => undefined) // failures are silent; the cooldown above already holds
      .finally(() => {
        inFlight = false;
      });
  },
}));

/** Hides thoughts older than the TTL without pruning the store — a pure read. */
export function thoughtFor(key: string, nowMs: number): Thought | null {
  const t = useFlavor.getState().thoughts[key];
  if (!t || nowMs - t.ts > THOUGHT_TTL_MS) return null;
  return t;
}

/** Test hook: rerun init after a reset, and clear cooldown/in-flight plumbing. */
export function resetFlavorForTests(): void {
  initRequested = false;
  model = DEFAULT_MODEL;
  lastAttempt.clear();
  inFlight = false;
  useFlavor.setState({ thoughts: {}, runs: 0, enabled: true });
}
