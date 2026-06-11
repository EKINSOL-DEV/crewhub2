// Shared ModelPicker (D-M2-7): haiku-default, cost glyphs, never hides the
// choice. Used by the spawn dialog, agent editor and settings.
import { cn } from "@/lib/utils";

export const MODEL_TIERS = [
  { id: "haiku", label: "Haiku", glyph: "$", hint: "thrifty — great for quick tasks" },
  { id: "sonnet", label: "Sonnet", glyph: "$$", hint: "balanced daily driver" },
  { id: "opus", label: "Opus", glyph: "$$$", hint: "deepest thinking, priciest tokens" },
] as const;

export type ModelTierId = (typeof MODEL_TIERS)[number]["id"];

export const DEFAULT_MODEL: ModelTierId = "haiku";

export function isModelTierId(v: string | null | undefined): v is ModelTierId {
  return MODEL_TIERS.some((t) => t.id === v);
}

export interface ModelPickerProps {
  value: string;
  onChange: (id: ModelTierId) => void;
  label?: string;
}

export function ModelPicker({ value, onChange, label = "Model" }: ModelPickerProps) {
  const selected = MODEL_TIERS.find((t) => t.id === value);
  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {MODEL_TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            data-testid={`model-${t.id}`}
            title={t.hint}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
              value === t.id ? "border-ring bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
            <span className="font-mono text-[10px] opacity-70">{t.glyph}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{selected ? selected.hint : "custom model"}</p>
    </div>
  );
}
