import {
  composeSystemPrompt,
  defaultPersona,
  parsePersona,
  PERSONA_PRESETS,
  serializePersona,
  TRAIT_SPECS,
  type PersonaPresetId,
} from "@/panels/crew/persona";

const PRESET_IDS = Object.keys(PERSONA_PRESETS) as PersonaPresetId[];

test("every preset composes its base paragraph and the agent name", () => {
  for (const id of PRESET_IDS) {
    const prompt = composeSystemPrompt("Scout", defaultPersona(id));
    expect(prompt).toContain('You are "Scout"');
    expect(prompt).toContain(PERSONA_PRESETS[id].base);
    expect(prompt).toContain("Working style:");
  }
});

test("blank name falls back to Agent", () => {
  expect(composeSystemPrompt("   ", defaultPersona())).toContain('You are "Agent"');
});

test("each trait slider stop swaps exactly its own fragment", () => {
  const base = defaultPersona("executor");
  for (const spec of TRAIT_SPECS) {
    for (const level of [0, 1, 2] as const) {
      const prompt = composeSystemPrompt("A", {
        ...base,
        traits: { ...base.traits, [spec.key]: level },
      });
      expect(prompt).toContain(spec.fragments[level]);
      // the other stops of this trait are absent
      for (const other of [0, 1, 2] as const) {
        if (other !== level) expect(prompt).not.toContain(spec.fragments[other]);
      }
    }
  }
});

test("compose lists one style line per trait", () => {
  const prompt = composeSystemPrompt("A", defaultPersona("advisor"));
  const lines = prompt.split("\n").filter((l) => l.startsWith("- "));
  expect(lines).toHaveLength(TRAIT_SPECS.length);
});

test("serialize/parse round-trips", () => {
  const p = defaultPersona("explorer");
  p.traits.verbosity = 0;
  expect(parsePersona(serializePersona(p))).toEqual(p);
});

test("parse tolerates null, garbage and out-of-range levels", () => {
  expect(parsePersona(null)).toBeNull();
  expect(parsePersona("not json {")).toBeNull();
  const fixed = parsePersona(JSON.stringify({ preset: "advisor", traits: { thoroughness: 7 } }));
  expect(fixed?.preset).toBe("advisor");
  expect(fixed?.traits.thoroughness).toBe(PERSONA_PRESETS.advisor.traits.thoroughness);
  const unknownPreset = parsePersona(JSON.stringify({ preset: "wizard" }));
  expect(unknownPreset?.preset).toBe("executor");
});
