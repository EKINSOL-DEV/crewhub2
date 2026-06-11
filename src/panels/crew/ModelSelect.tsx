// TODO(merge): swap for the shared ModelPicker (Lane B owns src/components/ModelPicker.tsx).
// Plain native select per the lane contract: tier choice with cost glyphs,
// haiku-default (D-M2-7 — nothing hardcodes an expensive model).

export const DEFAULT_MODEL = "haiku";

export const MODEL_TIERS = [
  { id: "haiku", glyph: "$", hint: "thrifty — great for quick tasks" },
  { id: "sonnet", glyph: "$$", hint: "balanced daily driver" },
  { id: "opus", glyph: "$$$", hint: "deep work, premium price" },
] as const;

export function ModelSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (model: string) => void;
}) {
  return (
    <select
      id={id}
      data-testid="model-select"
      className="rounded border bg-card px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {MODEL_TIERS.map((t) => (
        <option key={t.id} value={t.id}>
          {t.id} {t.glyph} — {t.hint}
        </option>
      ))}
    </select>
  );
}
