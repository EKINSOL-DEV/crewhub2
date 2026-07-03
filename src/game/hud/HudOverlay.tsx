// Minimal M0 HUD: environment badge + quality cycler + fps. The real game
// bar (roster, build, day/night) is M1/M2 scope — this is the debug face.
import { ENVIRONMENTS, environmentById } from "@/game/world/environments/registry";
import { useGameEnvironment } from "@/game/world/environments/store";
import { useQuality, type QualityTier } from "@/game/engine/quality";
import { useBuildMode } from "@/game/build/mode";

const NEXT_TIER: Record<QualityTier, QualityTier> = { low: "medium", medium: "high", high: "low" };

export function HudOverlay({
  fps,
  bots,
  runs = 0,
  onHire,
}: {
  fps: number;
  bots: number;
  /** Flavor-engine run count (M4 T2) — optional so pre-M4 callers still typecheck. */
  runs?: number;
  onHire: () => void;
}) {
  const envId = useGameEnvironment((s) => s.id);
  const env = environmentById(envId);
  const night = useGameEnvironment((s) => s.night);
  const tier = useQuality((s) => s.tier);
  const setTier = useQuality((s) => s.setTier);
  const setEnvironment = useGameEnvironment((s) => s.setEnvironment);
  const toggleNight = useGameEnvironment((s) => s.toggleNight);
  const buildActive = useBuildMode((s) => s.active);
  const activateBuild = useBuildMode((s) => s.activate);
  const deactivateBuild = useBuildMode((s) => s.deactivate);
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
        className="pointer-events-auto rounded-full border-2 border-white/60 bg-indigo-700/80 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        title="Toggle day / night"
        onClick={toggleNight}
      >
        {night ? "🌙 Night" : "☀️ Day"}
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
      <button
        type="button"
        aria-pressed={buildActive}
        className={`pointer-events-auto rounded-full border-2 px-4 py-2 text-sm font-bold shadow-xl backdrop-blur transition-transform hover:scale-105 ${
          buildActive ? "border-white bg-amber-500 text-white" : "border-white/60 bg-amber-700/80 text-white"
        }`}
        title="Toggle build mode"
        onClick={() => (buildActive ? deactivateBuild() : activateBuild())}
      >
        🔨 Build
      </button>
      <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/90">
        {fps} fps
      </span>
      <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/90">
        🤖 {bots}
      </span>
      {runs > 0 && (
        <span className="rounded-full bg-violet-700/60 px-3 py-1.5 text-xs font-semibold text-violet-100">
          💭 {runs}
        </span>
      )}
    </div>
  );
}
