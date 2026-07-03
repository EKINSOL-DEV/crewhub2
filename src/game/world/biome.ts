// Biome definitions (M4 T3): pure data — colors + scatter-model overrides
// that turn the one campus layout into Desert/Island/Sky without touching
// the layout math itself. CampusWorld reads a Biome to pick which manifest
// model stamps each ScatterKind and which ground colors to paint.
import type { ModelId } from "@/game/assets/manifest";
import type { ScatterKind } from "./campus/layout";

export interface Biome {
  id: "campus" | "desert" | "island" | "sky";
  grass: string;
  apron: string;
  path: string;
  /** ScatterKind -> ModelId overrides. Missing = keep the campus default. */
  scatter: Partial<Record<ScatterKind, ModelId>>;
  /** Kinds to skip entirely (e.g. island drops pines, sky drops rocks). */
  skip?: ScatterKind[];
  /** CloudPuffs count override — sky wants a denser ceiling. */
  clouds?: number;
}

export const BIOMES: Record<Biome["id"], Biome> = {
  campus: {
    id: "campus",
    grass: "#82c95b",
    apron: "#6cb14b",
    path: "#e7d9b4",
    scatter: {},
  },
  desert: {
    id: "desert",
    grass: "#e7c384",
    apron: "#d4ad6e",
    path: "#f2e3bd",
    scatter: {
      treeDefault: "cactus-tall",
      treeOak: "cactus-short",
      treeDetailed: "cactus-tall",
      treeFat: "cactus-short",
      treePine: "rock-large",
      bush: "rock-small",
      grassTuft: "flower-yellow",
    },
    skip: ["flowerRed", "flowerPurple"],
  },
  island: {
    id: "island",
    grass: "#8fd47a",
    apron: "#ead9a8",
    path: "#f4e7c3",
    scatter: {
      treeDefault: "tree-palm",
      treeOak: "tree-palm-tall",
      treePine: "tree-palm-tall",
      treeDetailed: "tree-palm",
    },
  },
  sky: {
    id: "sky",
    grass: "#cfd8ec",
    apron: "#b9c3dd",
    path: "#eef2ff",
    scatter: {
      treeDefault: "bush",
      treeOak: "bush",
      treeFat: "bush",
    },
    skip: ["rockLarge", "rockSmall", "treePine", "treeDetailed"],
    clouds: 14,
  },
};
