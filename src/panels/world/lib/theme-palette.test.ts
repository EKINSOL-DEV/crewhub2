// Theme → world palette (Epic 20): pure CSS-var → 3D color mapping with
// fallbacks. The world tints itself from the active theme; jsdom (no real
// computed styles) must land exactly on the classic hardcoded look.
import { describe, expect, it } from "vitest";
import {
  WORLD_PALETTE_FALLBACK,
  isHexColor,
  mixHex,
  shadeHex,
  worldPaletteFrom,
  type CssVarReader,
} from "./theme-palette";

describe("isHexColor", () => {
  it("accepts #rgb and #rrggbb, rejects everything else", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#1a2b3c")).toBe(true);
    expect(isHexColor(" #1a2b3c ")).toBe(true); // computed styles keep whitespace
    expect(isHexColor("#1a2b3c4d")).toBe(false);
    expect(isHexColor("oklch(0.5 0.1 200)")).toBe(false);
    expect(isHexColor("")).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });
});

describe("mixHex", () => {
  it("interpolates channel-wise and clamps t", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", -1)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
  });

  it("expands #rgb shorthand", () => {
    expect(mixHex("#fff", "#fff", 0.5)).toBe("#ffffff");
  });
});

describe("shadeHex", () => {
  it("darkens toward black and lightens toward white", () => {
    expect(shadeHex("#808080", -1)).toBe("#000000");
    expect(shadeHex("#808080", 1)).toBe("#ffffff");
    expect(shadeHex("#808080", 0)).toBe("#808080");
  });
});

describe("worldPaletteFrom", () => {
  const empty: CssVarReader = () => null;

  it("falls back to the classic look when no vars resolve", () => {
    expect(worldPaletteFrom(empty)).toEqual(WORLD_PALETTE_FALLBACK);
  });

  it("ignores non-hex values (future oklch themes) instead of crashing", () => {
    const reader: CssVarReader = () => "oklch(0.7 0.1 250)";
    expect(worldPaletteFrom(reader)).toEqual(WORLD_PALETTE_FALLBACK);
  });

  it("derives every surface from the theme vars when present", () => {
    // tokyo-night-ish vars
    const vars: Record<string, string> = {
      "--background": "#1a1b26",
      "--card": "#24283b",
      "--border": "#3d4560",
      "--primary": "#7aa2f7",
      "--foreground": "#c0caf5",
    };
    const p = worldPaletteFrom((name) => vars[name] ?? null);
    expect(p).not.toEqual(WORLD_PALETTE_FALLBACK);
    // Sky is a darker shade of the app background.
    expect(p.sky).toBe(shadeHex("#1a1b26", -0.35));
    // Fog matches the sky so distance dissolves seamlessly.
    expect(p.fog).toBe(p.sky);
    // Floors tint from card toward the accent; HQ leans harder.
    expect(p.hqFloor).not.toBe(p.floors[0]);
    expect(p.floors).toHaveLength(5);
    for (const f of p.floors) expect(isHexColor(f)).toBe(true);
    // Everything is a renderable hex color.
    for (const v of [p.sky, p.fog, p.ground, p.lobby, p.wall, p.grid, p.gridSection, p.text, p.textOutline])
      expect(isHexColor(v)).toBe(true);
  });

  it("re-tints when the vars change (same reader contract, new values)", () => {
    const light = worldPaletteFrom((n) => (n === "--background" ? "#fdf6e3" : null));
    const dark = worldPaletteFrom((n) => (n === "--background" ? "#1a1b26" : null));
    expect(light.sky).not.toBe(dark.sky);
  });
});
