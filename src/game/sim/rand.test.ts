import { describe, expect, it } from "vitest";
import { hashCode, mulberry32 } from "./rand";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("produces values in [0, 1)", () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("hashCode", () => {
  it("is deterministic and non-negative", () => {
    expect(hashCode("claude:abc")).toBe(hashCode("claude:abc"));
    expect(hashCode("claude:abc")).toBeGreaterThanOrEqual(0);
  });

  it("differs for different strings (in general)", () => {
    expect(hashCode("a")).not.toBe(hashCode("b"));
  });
});
