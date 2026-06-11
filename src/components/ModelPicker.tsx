// Shared model picker (D-M2-7): haiku-default, cost glyphs, never hides the
// choice. Used by spawn-from-chat, take-over, agent editor, palette spawns.
import { cn } from "@/lib/utils";

export interface ModelTier {
  id: string;
  label: string;
  glyph: string;
  hint: string;
}

export const MODEL_TIERS: ModelTier[] = [
  { id: "haiku", label: "haiku", glyph: "$", hint: "thrifty — great for quick tasks" },
  { id: "sonnet", label: "sonnet", glyph: "$$", hint: "balanced for daily work" },
  { id: "opus", label: "opus", glyph: "$$$", hint: "deepest thinking, premium cost" },
];

/** Quick spawns default to the cheap tier — nothing hardcodes an expensive model. */
export const DEFAULT_SPAWN_MODEL = "haiku";

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (model: string) => void;
  className?: string;
}) {
  const active = MODEL_TIERS.find((t) => t.id === value);
  return (
    <div className={cn("flex flex-col gap-1", className)} data-testid="model-picker">
      <div
        role="radiogroup"
        aria-label="model"
        className="flex overflow-hidden rounded-md border border-border"
      >
        {MODEL_TIERS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={tier.id === value}
            data-testid={`model-${tier.id}`}
            className={cn(
              "flex-1 px-2 py-1 text-xs",
              tier.id === value ? "bg-accent/25 font-medium" : "hover:bg-accent/10",
            )}
            onClick={() => onChange(tier.id)}
          >
            {tier.label} <span className="text-muted-foreground">{tier.glyph}</span>
          </button>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground" data-testid="model-hint">
        {active ? active.hint : `custom model: ${value}`}
      </div>
    </div>
  );
}
