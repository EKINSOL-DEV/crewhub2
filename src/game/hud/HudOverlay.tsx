// Minimal M0 HUD: environment badge + quality cycler + fps. The real game
// bar (roster, build, day/night) is M1/M2 scope — this is the debug face.
import { ENVIRONMENTS, environmentById } from "@/game/world/environments/registry";
import { useGameEnvironment } from "@/game/world/environments/store";
import { useQuality, type QualityTier } from "@/game/engine/quality";

const NEXT_TIER: Record<QualityTier, QualityTier> = { low: "medium", medium: "high", high: "low" };

export function HudOverlay({ fps, bots, onHire }: { fps: number; bots: number; onHire: () => void }) {
  const envId = useGameEnvironment((s) => s.id);
  const env = environmentById(envId);
  const tier = useQuality((s) => s.tier);
  const setTier = useQuality((s) => s.setTier);
  const setEnvironment = useGameEnvironment((s) => s.setEnvironment);
  const idx = ENVIRONMENTS.findIndex((e) => e.id === env.id);
  const next = ENVIRONMENTS[(idx + 1) % ENVIRONMENTS.length]!;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2">
      <button
        type="button"
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-emerald-700/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        title="Switch environment"
        onClick={() => setEnvironment(next.id)}
      >
        {env.emoji} {env.name}
      </button>
      <button
        type="button"
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-sky-700/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        title="Cycle quality tier"
        onClick={() => setTier(NEXT_TIER[tier])}
      >
        ✨ {tier}
      </button>
      <button
        type="button"
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-emerald-700/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        title="Hire, link, or adopt a crew member"
        onClick={onHire}
      >
        + Hire
      </button>
      <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/90">
        {fps} fps
      </span>
      <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/90">
        🤖 {bots}
      </span>
    </div>
  );
}
