import { describe, expect, it } from "vitest";
import { buildCreatorPrompt, COLOR_ROLES, MAX_PARTS, parseCreatorProp, slugify } from "./creator";

const NONE: ReadonlySet<string> = new Set();

/** A small, plausible model reply (the happy path). */
function duck(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: "Rubber duck",
    emoji: "🦆",
    radius: 0.5,
    parts: [
      { shape: "sphere", size: [0.3], at: [0, 0.3, 0], color: "shade" },
      { shape: "sphere", size: [0.18], at: [0, 0.55, 0.15], color: "shade" },
      { shape: "cone", size: [0.06, 0.1], at: [0, 0.55, 0.3], color: "accent", rotY: 0.2 },
    ],
    ...over,
  };
}

function okDef(text: string, existing: ReadonlySet<string> = NONE) {
  const res = parseCreatorProp(text, existing);
  if (!res.ok) throw new Error(`expected ok, got: ${res.error}`);
  return res;
}

describe("buildCreatorPrompt", () => {
  it("includes the description, all 12 color roles and the word JSON", () => {
    const prompt = buildCreatorPrompt("a tiny gramophone");
    expect(prompt).toContain("a tiny gramophone");
    expect(prompt).toContain("JSON");
    expect(COLOR_ROLES).toHaveLength(12);
    for (const role of COLOR_ROLES) expect(prompt).toContain(role);
  });

  it("spells out the size arity per shape and the limits", () => {
    const prompt = buildCreatorPrompt("x");
    for (const frag of ["box [w,h,d]", "cylinder [rTop,rBottom,h]", "sphere [r]", "cone [r,h]"]) {
      expect(prompt).toContain(frag);
    }
    expect(prompt).toContain("16");
    expect(prompt).toContain("0.3..2");
  });
});

describe("parseCreatorProp", () => {
  it("parses a clean JSON reply into a creator: definition", () => {
    const { def, warnings } = okDef(JSON.stringify(duck()));
    expect(def.id).toBe("creator:rubber-duck");
    expect(def.label).toBe("Rubber duck");
    expect(def.emoji).toBe("🦆");
    expect(def.radius).toBe(0.5);
    expect(def.parts).toHaveLength(3);
    expect(def.parts[2]!.rotY).toBeCloseTo(0.2);
    expect(def.keywords).toEqual(["rubber", "duck"]);
    expect(warnings).toEqual([]);
  });

  it("strips markdown fences", () => {
    const { def } = okDef("```json\n" + JSON.stringify(duck()) + "\n```");
    expect(def.parts).toHaveLength(3);
  });

  it("tolerates surrounding prose around bare JSON", () => {
    const { def } = okDef(`Here's your duck!\n${JSON.stringify(duck())}\nEnjoy.`);
    expect(def.label).toBe("Rubber duck");
  });

  it("rejects non-JSON input", () => {
    for (const bad of ["no json at all", "{ broken", "{ not: 'json' }"]) {
      expect(parseCreatorProp(bad, NONE).ok, bad).toBe(false);
    }
  });

  it("drops parts with unknown shapes, with a warning", () => {
    const bp = duck({
      parts: [
        { shape: "torus", size: [0.3], at: [0, 0.3, 0], color: "shade" },
        { shape: "sphere", size: [0.3], at: [0, 0.3, 0], color: "shade" },
      ],
    });
    const { def, warnings } = okDef(JSON.stringify(bp));
    expect(def.parts).toHaveLength(1);
    expect(warnings.join(" ")).toContain("torus");
  });

  it("keeps only the first 16 parts, with a warning", () => {
    const part = { shape: "box", size: [0.2, 0.2, 0.2], at: [0, 0.1, 0], color: "wood" };
    const bp = duck({ parts: Array.from({ length: MAX_PARTS + 4 }, () => ({ ...part })) });
    const { def, warnings } = okDef(JSON.stringify(bp));
    expect(def.parts).toHaveLength(MAX_PARTS);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("maps unknown color roles to accent, with a warning", () => {
    const bp = duck({ parts: [{ shape: "sphere", size: [0.3], at: [0, 0.3, 0], color: "hotpink" }] });
    const { def, warnings } = okDef(JSON.stringify(bp));
    expect(def.parts[0]!.color).toBe("accent");
    expect(warnings.join(" ")).toContain("hotpink");
  });

  it("clamps oversized size components to 4", () => {
    const bp = duck({ parts: [{ shape: "box", size: [9, 0.5, 0.5], at: [0, 0.25, 0], color: "wood" }] });
    const { def } = okDef(JSON.stringify(bp));
    expect(def.parts[0]!.size[0]).toBe(4);
  });

  it("fixes wrong size arity by truncating/padding, drops the unsalvageable", () => {
    const bp = duck({
      parts: [
        { shape: "sphere", size: [0.3, 0.4], at: [0, 0.3, 0], color: "shade" }, // truncate → [0.3]
        { shape: "box", size: [0.5], at: [0, 0.25, 0], color: "wood" }, // pad → [0.5, 0.5, 0.5]
        { shape: "cone", size: [], at: [0, 0, 0], color: "wood" }, // dropped
      ],
    });
    const { def, warnings } = okDef(JSON.stringify(bp));
    expect(def.parts).toHaveLength(2);
    expect(def.parts[0]!.size).toEqual([0.3]);
    expect(def.parts[1]!.size).toEqual([0.5, 0.5, 0.5]);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("clamps at: negative y to 0, |x| and |z| to 2; bad at → origin with warning", () => {
    const bp = duck({
      parts: [
        { shape: "sphere", size: [0.3], at: [5, -1, -5], color: "shade" },
        { shape: "sphere", size: [0.3], at: "center", color: "shade" },
      ],
    });
    const { def, warnings } = okDef(JSON.stringify(bp));
    expect(def.parts[0]!.at).toEqual([2, 0, -2]);
    expect(def.parts[1]!.at).toEqual([0, 0, 0]);
    expect(warnings.join(" ")).toContain("at");
  });

  it("fails when parts are missing, empty, or nothing survives", () => {
    for (const parts of [undefined, [], [{ shape: "wedge", size: [1], at: [0, 0, 0], color: "wood" }]]) {
      const res = parseCreatorProp(JSON.stringify(duck({ parts })), NONE);
      expect(res.ok).toBe(false);
    }
  });

  it("defaults label, emoji and radius with warnings", () => {
    const bp = duck({ label: "   ", emoji: 7, radius: "big" });
    const { def, warnings } = okDef(JSON.stringify(bp));
    expect(def.label).toBe("Mystery prop");
    expect(def.emoji).toBe("✨");
    expect(def.radius).toBe(0.8);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("takes the first grapheme-ish chunk of a chatty emoji field", () => {
    const { def } = okDef(JSON.stringify(duck({ emoji: "🦆 (a duck)" })));
    expect(def.emoji).toBe("🦆");
  });

  it("clamps radius into [0.3, 2]", () => {
    expect(okDef(JSON.stringify(duck({ radius: 0.01 }))).def.radius).toBe(0.3);
    expect(okDef(JSON.stringify(duck({ radius: 50 }))).def.radius).toBe(2);
  });

  it("suffixes colliding ids: creator:duck, creator:duck-2, creator:duck-3", () => {
    const text = JSON.stringify(duck({ label: "Duck" }));
    expect(okDef(text).def.id).toBe("creator:duck");
    expect(okDef(text, new Set(["creator:duck"])).def.id).toBe("creator:duck-2");
    expect(okDef(text, new Set(["creator:duck", "creator:duck-2"])).def.id).toBe("creator:duck-3");
  });
});

describe("slugify", () => {
  it("kebab-cases, collapses and trims non-alphanumerics", () => {
    expect(slugify("Rubber Duck!")).toBe("rubber-duck");
    expect(slugify("  ¡Ünïcorn?  lamp  ")).toBe("n-corn-lamp");
  });

  it("caps at 24 chars without a trailing dash", () => {
    const slug = slugify("a very very very long prop label indeed");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to 'prop' when nothing survives", () => {
    expect(slugify("!!!")).toBe("prop");
    expect(slugify("")).toBe("prop");
  });
});
