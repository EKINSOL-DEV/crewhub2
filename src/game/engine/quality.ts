// Quality tiers (M0 T5): one knob that fans out to dpr, shadow resolution and
// post effects. Persisted best-effort in the settings KV (the environment
// store pattern — src/panels/world/environments/store.ts).
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export const QUALITY_SETTING_KEY = "game.quality";

export type QualityTier = "low" | "medium" | "high";

export interface QualityConfig {
  dprMax: number;
  shadowMapSize: number;
  ssao: boolean;
  multisampling: 0 | 2 | 4;
}

export const QUALITY: Record<QualityTier, QualityConfig> = {
  low: { dprMax: 1, shadowMapSize: 1024, ssao: false, multisampling: 0 },
  medium: { dprMax: 1.5, shadowMapSize: 2048, ssao: true, multisampling: 2 },
  high: { dprMax: 2, shadowMapSize: 4096, ssao: true, multisampling: 4 },
};

const TIERS: QualityTier[] = ["low", "medium", "high"];

/** Pure heuristic — cores and pixel density are the two cheap signals. */
export function detectQuality(caps: { cores: number; dpr: number }): QualityTier {
  if (caps.cores >= 8 && caps.dpr >= 1.5) return "high";
  if (caps.cores <= 4) return "low";
  return "medium";
}

interface QualityState {
  tier: QualityTier;
  init: () => Promise<void>;
  setTier: (tier: QualityTier) => void;
}

let requested = false;

export const useQuality = create<QualityState>((set) => ({
  tier: detectQuality({
    cores: typeof navigator === "undefined" ? 8 : (navigator.hardwareConcurrency ?? 8),
    dpr: typeof window === "undefined" ? 1.5 : window.devicePixelRatio,
  }),

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(QUALITY_SETTING_KEY);
      if (res.status === "ok" && res.data && TIERS.includes(res.data as QualityTier)) {
        set({ tier: res.data as QualityTier });
      }
    } catch {
      // backend unavailable (unit tests, plain browser) — keep the detection
    }
  },

  setTier: (tier) => {
    set({ tier });
    void commands.setSetting(QUALITY_SETTING_KEY, tier).catch(() => undefined);
  },
}));

/** Test hook: rerun init after a reset. */
export function resetQualityForTests(): void {
  requested = false;
  useQuality.setState({ tier: "medium" });
}
