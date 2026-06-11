// Persona composer UI (T19, EKI-32): presets + trait sliders with a live
// system-prompt preview. All composition logic lives in persona.ts (pure).
import {
  composeSystemPrompt,
  PERSONA_PRESETS,
  TRAIT_SPECS,
  type Persona,
  type PersonaPresetId,
  type TraitLevel,
} from "./persona";

export function PersonaComposer({
  name,
  persona,
  onChange,
}: {
  name: string;
  persona: Persona;
  onChange: (p: Persona) => void;
}) {
  const pickPreset = (id: PersonaPresetId) =>
    onChange({ preset: id, traits: { ...PERSONA_PRESETS[id].traits } });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Persona preset">
        {Object.values(PERSONA_PRESETS).map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={persona.preset === p.id}
            data-testid={`preset-${p.id}`}
            onClick={() => pickPreset(p.id)}
            className={`rounded border px-2 py-1 text-xs ${
              persona.preset === p.id ? "border-accent bg-accent/10" : "border-border"
            }`}
            title={p.tagline}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {TRAIT_SPECS.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-muted-foreground">{t.label}</span>
            <input
              type="range"
              min={0}
              max={2}
              step={1}
              value={persona.traits[t.key]}
              aria-label={t.label}
              onChange={(e) =>
                onChange({
                  ...persona,
                  traits: { ...persona.traits, [t.key]: Number(e.target.value) as TraitLevel },
                })
              }
            />
            <span className="flex-1 truncate" title={t.fragments[persona.traits[t.key]]}>
              {t.fragments[persona.traits[t.key]]}
            </span>
          </label>
        ))}
      </div>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">System prompt preview (live)</p>
        <pre data-testid="persona-preview" className="rounded border bg-card p-2 text-xs whitespace-pre-wrap">
          {composeSystemPrompt(name, persona)}
        </pre>
      </div>
    </div>
  );
}
