// Persona composer core (T19, EKI-32): presets + trait sliders compose into a
// system prompt. Pure functions — the PersonaComposer component only renders
// this module's output. Slider → prompt-fragment table is the contract.

export type TraitLevel = 0 | 1 | 2;

export interface PersonaTraits {
  thoroughness: TraitLevel;
  riskAppetite: TraitLevel;
  verbosity: TraitLevel;
  /** 0 = dry, 1 = friendly, 2 = playful. */
  tone: TraitLevel;
}

export type PersonaPresetId = "executor" | "advisor" | "explorer";

export interface Persona {
  preset: PersonaPresetId;
  traits: PersonaTraits;
}

export interface PersonaPreset {
  id: PersonaPresetId;
  label: string;
  emoji: string;
  tagline: string;
  /** Opening paragraph of the composed prompt. */
  base: string;
  traits: PersonaTraits;
}

/** Ported v1 presets (Executor / Advisor / Explorer). */
export const PERSONA_PRESETS: Record<PersonaPresetId, PersonaPreset> = {
  executor: {
    id: "executor",
    label: "Executor",
    emoji: "🔧",
    tagline: "ships scoped work end-to-end",
    base: "You are an executor: you take a scoped task, carry it to a verified finish, and report what changed. You bias to action over discussion and keep the diff as small as the task allows.",
    traits: { thoroughness: 1, riskAppetite: 0, verbosity: 0, tone: 1 },
  },
  advisor: {
    id: "advisor",
    label: "Advisor",
    emoji: "🦉",
    tagline: "thinks first, recommends, never surprises",
    base: "You are an advisor: you analyze before acting, lay out options with trade-offs, and recommend one. You never make irreversible changes without surfacing them first.",
    traits: { thoroughness: 2, riskAppetite: 0, verbosity: 2, tone: 1 },
  },
  explorer: {
    id: "explorer",
    label: "Explorer",
    emoji: "🔭",
    tagline: "prototypes fast, learns loud",
    base: "You are an explorer: you prototype quickly to learn, prefer running experiments over speculating, and clearly mark what is throwaway versus keepable.",
    traits: { thoroughness: 1, riskAppetite: 2, verbosity: 1, tone: 2 },
  },
};

export interface TraitSpec {
  key: keyof PersonaTraits;
  label: string;
  /** One prompt fragment per slider stop (0, 1, 2). */
  fragments: [string, string, string];
}

export const TRAIT_SPECS: TraitSpec[] = [
  {
    key: "thoroughness",
    label: "Thoroughness",
    fragments: [
      "Move fast: verify the happy path and flag anything you skipped.",
      "Be solid: test the main paths and the obvious edge cases.",
      "Be exhaustive: chase edge cases, validate assumptions, and double-check your own work.",
    ],
  },
  {
    key: "riskAppetite",
    label: "Risk appetite",
    fragments: [
      "Be conservative: prefer reversible steps and ask before anything destructive or external.",
      "Take measured risks: act within the task's scope, confirm anything beyond it.",
      "Be bold: try the ambitious approach first, but always leave an undo path.",
    ],
  },
  {
    key: "verbosity",
    label: "Verbosity",
    fragments: [
      "Report tersely: lead with the result, skip the play-by-play.",
      "Report normally: result first, then the notable decisions.",
      "Narrate your reasoning: explain what you considered and why you chose this path.",
    ],
  },
  {
    key: "tone",
    label: "Tone",
    fragments: [
      "Keep a dry, factual tone.",
      "Keep a warm, collegial tone.",
      "Keep a playful tone — a well-placed emoji is welcome, clarity still wins.",
    ],
  },
];

export function defaultPersona(preset: PersonaPresetId = "executor"): Persona {
  return { preset, traits: { ...PERSONA_PRESETS[preset].traits } };
}

/** Compose the live-preview system prompt (D-M2-6 "previewable", EKI-32 AC). */
export function composeSystemPrompt(name: string, persona: Persona): string {
  const preset = PERSONA_PRESETS[persona.preset];
  const style = TRAIT_SPECS.map((t) => `- ${t.fragments[persona.traits[t.key]]}`).join("\n");
  return [
    `You are "${name.trim() || "Agent"}", a CrewHub crew member.`,
    "",
    preset.base,
    "",
    "Working style:",
    style,
  ].join("\n");
}

export function serializePersona(persona: Persona): string {
  return JSON.stringify(persona);
}

function asLevel(v: unknown, fallback: TraitLevel): TraitLevel {
  return v === 0 || v === 1 || v === 2 ? v : fallback;
}

/** Tolerant parse of `agents.persona_json` — null/garbage never throws. */
export function parsePersona(json: string | null): Persona | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { preset?: unknown; traits?: Record<string, unknown> };
    const preset =
      raw.preset === "executor" || raw.preset === "advisor" || raw.preset === "explorer"
        ? raw.preset
        : "executor";
    const base = PERSONA_PRESETS[preset].traits;
    return {
      preset,
      traits: {
        thoroughness: asLevel(raw.traits?.["thoroughness"], base.thoroughness),
        riskAppetite: asLevel(raw.traits?.["riskAppetite"], base.riskAppetite),
        verbosity: asLevel(raw.traits?.["verbosity"], base.verbosity),
        tone: asLevel(raw.traits?.["tone"], base.tone),
      },
    };
  } catch {
    return null;
  }
}
