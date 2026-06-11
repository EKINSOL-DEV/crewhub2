// Above-head bubbles (EKI-66): speech (latest AssistantText, brief) stacked
// over the activity chip (activity_detail). DOM via drei Html so text stays
// crisp at every zoom.
import { Html } from "@react-three/drei";
import type { WorldBot } from "./lib/bots";

export function BotBubbles({ bot, speech }: { bot: WorldBot; speech: string | null }) {
  if (!speech && !bot.activity) return null;
  return (
    <Html position={[0, 1.45, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
      <div className="flex max-w-56 flex-col items-center gap-1">
        {speech && (
          <div className="rounded-xl rounded-bl-sm border border-black/10 bg-white/95 px-2.5 py-1.5 text-[11px] leading-snug text-neutral-800 shadow-md">
            {speech}
          </div>
        )}
        {bot.activity && (
          <div className="whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/90">
            {bot.activity}
          </div>
        )}
      </div>
    </Html>
  );
}
