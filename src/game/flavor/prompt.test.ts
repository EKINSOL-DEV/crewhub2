import { describe, expect, it } from "vitest";
import { flavorPrompt, sanitizeThought } from "./prompt";

describe("flavorPrompt", () => {
  it("is deterministic for the same input", () => {
    const c = { name: "Ada", status: "Working" as const, activity: "refactoring the parser" };
    expect(flavorPrompt(c)).toBe(flavorPrompt(c));
  });

  it("mentions the character's name and activity", () => {
    const prompt = flavorPrompt({ name: "Ada", status: "Working", activity: "refactoring the parser" });
    expect(prompt).toContain("Ada");
    expect(prompt).toContain("refactoring the parser");
  });

  it("falls back to status when there is no activity", () => {
    const prompt = flavorPrompt({ name: "Turing", status: "Idle", activity: null });
    expect(prompt).toContain("Turing");
    expect(prompt).toContain("Idle");
  });

  it("asks for a short, quote-free reply", () => {
    const prompt = flavorPrompt({ name: "Grace", status: "Working", activity: "compiling" });
    expect(prompt).toMatch(/12 words/);
    expect(prompt).toMatch(/no quotes/i);
  });
});

describe("sanitizeThought", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeThought("  a tidy little thought  ")).toBe("a tidy little thought");
  });

  it("strips wrapping double quotes", () => {
    expect(sanitizeThought('"quietly counting semicolons"')).toBe("quietly counting semicolons");
  });

  it("strips wrapping single quotes", () => {
    expect(sanitizeThought("'quietly counting semicolons'")).toBe("quietly counting semicolons");
  });

  it("strips wrapping backticks", () => {
    expect(sanitizeThought("`quietly counting semicolons`")).toBe("quietly counting semicolons");
  });

  it("strips wrapping markdown emphasis", () => {
    expect(sanitizeThought("**quietly counting semicolons**")).toBe("quietly counting semicolons");
    expect(sanitizeThought("*quietly counting semicolons*")).toBe("quietly counting semicolons");
  });

  it("keeps only the first non-empty line", () => {
    expect(sanitizeThought("\n\nfirst thought here\nsecond line ignored")).toBe("first thought here");
  });

  it("clamps to 90 characters", () => {
    const long = "a".repeat(120);
    const result = sanitizeThought(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(90);
  });

  it("returns null for an empty string", () => {
    expect(sanitizeThought("")).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    expect(sanitizeThought("   \n  \n  ")).toBeNull();
  });

  it("returns null for error-ish text", () => {
    expect(sanitizeThought("Error: model unavailable")).toBeNull();
    expect(sanitizeThought("error: timed out")).toBeNull();
  });
});
