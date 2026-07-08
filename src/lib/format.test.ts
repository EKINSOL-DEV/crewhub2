// The one thorough suite for formatTokens (de-duplicated out of
// game/dossier/data.ts's abbrevTokens, panels/chat/render-list.ts, and
// panels/sessions/format.ts — all three had byte-identical or equivalent
// formulas). Callers keep thin pass-through checks; boundary cases live here.
import { describe, expect, it } from "vitest";
import { formatTokens } from "./format";

describe("formatTokens", () => {
  it("renders 0 as a plain string", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("leaves counts below 1000 as-is", () => {
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(999)).toBe("999");
  });

  it("compacts thousands with one decimal, right at the 1000 boundary", () => {
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1_050)).toBe("1.1k");
    expect(formatTokens(12_345)).toBe("12.3k");
    expect(formatTokens(4_100)).toBe("4.1k");
  });

  it("strips a trailing .0 for whole thousands below 100k", () => {
    expect(formatTokens(2_000)).toBe("2k");
    expect(formatTokens(99_000)).toBe("99k");
  });

  it("drops the decimal at and above the 100k boundary", () => {
    expect(formatTokens(99_999)).toBe("100k"); // toFixed(1) of 99.999 rounds to "100.0" -> "100"
    expect(formatTokens(100_000)).toBe("100k");
    expect(formatTokens(150_000)).toBe("150k");
    expect(formatTokens(999_000)).toBe("999k");
  });

  it("switches to M right at the 1,000,000 boundary", () => {
    expect(formatTokens(999_999)).toBe("1000k");
    expect(formatTokens(1_000_000)).toBe("1M");
  });

  it("compacts millions with one decimal, stripping a trailing .0", () => {
    expect(formatTokens(2_000_000)).toBe("2M");
    expect(formatTokens(2_500_000)).toBe("2.5M");
    expect(formatTokens(4_100_000)).toBe("4.1M");
  });
});
