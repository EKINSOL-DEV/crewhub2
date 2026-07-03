import { describe, expect, it } from "vitest";
import { MODEL_IDS } from "@/game/assets/manifest";
import { BIOMES } from "./biome";
import type { ScatterKind } from "./campus/layout";

const SCATTER_KINDS: ScatterKind[] = [
  "treeDefault",
  "treeOak",
  "treeDetailed",
  "treeFat",
  "treePine",
  "rockLarge",
  "rockSmall",
  "flowerRed",
  "flowerYellow",
  "flowerPurple",
  "bush",
  "grassTuft",
];

describe("BIOMES", () => {
  it("defines all four biomes", () => {
    expect(Object.keys(BIOMES).sort()).toEqual(["campus", "desert", "island", "sky"]);
    for (const id of Object.keys(BIOMES) as (keyof typeof BIOMES)[]) {
      expect(BIOMES[id].id).toBe(id);
    }
  });

  it("only overrides real scatter kinds with real manifest ids", () => {
    for (const biome of Object.values(BIOMES)) {
      for (const [kind, modelId] of Object.entries(biome.scatter)) {
        expect(SCATTER_KINDS).toContain(kind);
        expect(MODEL_IDS).toContain(modelId);
      }
    }
  });

  it("only skips real scatter kinds", () => {
    for (const biome of Object.values(BIOMES)) {
      for (const kind of biome.skip ?? []) {
        expect(SCATTER_KINDS).toContain(kind);
      }
    }
  });

  it("campus has no overrides or skips — it IS the default", () => {
    expect(BIOMES.campus.scatter).toEqual({});
    expect(BIOMES.campus.skip ?? []).toEqual([]);
  });
});
