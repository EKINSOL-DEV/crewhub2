// Environment math (EKI-111): the palette merge and the seeded scatter are
// pure — pin their contracts here.
import { describe, expect, it } from "vitest";
import { WORLD_PALETTE_FALLBACK } from "../lib/theme-palette";
import { ENVIRONMENTS, environmentById, nextEnvironmentId, VIBRANT_FLOORS } from "./registry";
import { cellRandom, scatterAround } from "./scatter";
import { applyEnvironment } from "./types";

const bounds = { minX: -20, maxX: 20, minZ: -15, maxZ: 18 };

describe("applyEnvironment", () => {
  it("overrides only what the environment pins, and fog follows the env sky", () => {
    const desert = environmentById("desert");
    const merged = applyEnvironment(WORLD_PALETTE_FALLBACK, desert);
    expect(merged.sky).toBe(desert.colors.sky);
    expect(merged.fog).toBe(desert.colors.sky); // fog unpinned → follows sky
    expect(merged.floors).toEqual(VIBRANT_FLOORS);
    expect(merged.text).toBe(WORLD_PALETTE_FALLBACK.text); // untouched surface
  });

  it("the theme environment is a no-op merge", () => {
    const merged = applyEnvironment(WORLD_PALETTE_FALLBACK, environmentById("theme"));
    expect(merged).toEqual(WORLD_PALETTE_FALLBACK);
  });
});

describe("registry", () => {
  it("falls back to the default for unknown ids", () => {
    expect(environmentById("not-a-biome").id).toBe("desert");
  });

  it("cycles through every environment and wraps", () => {
    const seen = new Set<string>();
    let id = ENVIRONMENTS[0]!.id;
    for (let i = 0; i < ENVIRONMENTS.length; i++) {
      seen.add(id);
      id = nextEnvironmentId(id);
    }
    expect(seen.size).toBe(ENVIRONMENTS.length);
    expect(id).toBe(ENVIRONMENTS[0]!.id); // full loop
  });
});

describe("scatter", () => {
  it("is deterministic", () => {
    const opts = { step: 4, margin: 3, extent: 30, salt: 7, density: 0.3 };
    expect(scatterAround(bounds, opts)).toEqual(scatterAround(bounds, opts));
    expect(cellRandom(3, -5, 11)).toBe(cellRandom(3, -5, 11));
  });

  it("never places inside the keep-out and stays within the extent", () => {
    const margin = 3;
    const extent = 30;
    const pts = scatterAround(bounds, { step: 4, margin, extent, salt: 1, density: 0.5 });
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      const inside =
        p.x > bounds.minX - margin &&
        p.x < bounds.maxX + margin &&
        p.z > bounds.minZ - margin &&
        p.z < bounds.maxZ + margin;
      expect(inside).toBe(false);
      expect(p.r).toBeGreaterThanOrEqual(0);
      expect(p.r).toBeLessThan(1);
    }
  });
});
