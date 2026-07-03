// The Campus environment's World (M0 T9/T10): terrain, paths, nature scatter,
// plaza props. Lights live in GameShell (per-environment rig), not here.
//
// Biomes (M4 T3): Desert/Island/Sky are the same layout repainted and
// re-scattered — see biome.ts. `biome` defaults to campus so every existing
// call site (and test) keeps rendering the original world unchanged.
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import type { ModelId } from "@/game/assets/manifest";
import { placedItemPlacements, type PlaceableKind } from "@/game/build/edits";
import { PlacedBuildings } from "@/game/build/PlacedBuildings";
import { useCampusEdits } from "@/game/build/store";
import { CloudPuffs } from "@/game/world/CloudPuffs";
import { BIOMES, type Biome } from "@/game/world/biome";
import { Fountain } from "./Fountain";
import { InstancedModel } from "./InstancedModel";
import { Terrain } from "./Terrain";
import { campusLayout, type ScatterKind } from "./layout";
import { campusBuildings } from "./buildings";
import { Pavilion } from "./Pavilion";

const SCATTER_MODEL: Record<ScatterKind, ModelId> = {
  treeDefault: "tree-default",
  treeOak: "tree-oak",
  treeDetailed: "tree-detailed",
  treeFat: "tree-fat",
  treePine: "tree-pine",
  rockLarge: "rock-large",
  rockSmall: "rock-small",
  flowerRed: "flower-red",
  flowerYellow: "flower-yellow",
  flowerPurple: "flower-purple",
  bush: "bush",
  grassTuft: "grass-tuft",
};

/** Plants get the foliage hue fix; rocks keep their honest grey. */
const FOLIAGE: Set<ScatterKind> = new Set([
  "treeDefault",
  "treeOak",
  "treeDetailed",
  "treeFat",
  "treePine",
  "flowerRed",
  "flowerYellow",
  "flowerPurple",
  "bush",
  "grassTuft",
]);

/**
 * Freeze matrix auto-updates for a static subtree (perf loop iter 5): three
 * recomposes local matrices for every auto-update object every frame; the
 * terrain, pavilions and placed decor never move after mount. Runs once,
 * after a final world-matrix sync.
 */
function useStaticMatrices(): React.RefObject<THREE.Group | null> {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      obj.matrixAutoUpdate = false;
    });
    return () => {
      root.traverse((obj) => {
        obj.matrixAutoUpdate = true;
      });
    };
  }, []);
  return ref;
}

export function CampusWorld({ biome = BIOMES.campus }: { biome?: Biome }) {
  const layout = useMemo(() => campusLayout(), []);
  const buildings = useMemo(() => campusBuildings(layout.plots), [layout]);
  const staticRef = useStaticMatrices();
  const skip = biome.skip ?? [];
  const scatterKinds = (Object.keys(SCATTER_MODEL) as ScatterKind[]).filter((k) => !skip.includes(k));

  // Player-placed decor (M3 T4): grouped by kind for InstancedModel, keyed
  // by `versionByKind[kind]` (M4 debt sweep) so a fresh edit remounts only
  // its own kind's group instead of trying to animate its frozen
  // (frames={1}) instance matrices — moving one tree no longer remounts
  // every placed kind's InstancedModel. Kept OUTSIDE the static-matrix
  // group below — these placements change at runtime, so freezing them
  // would just mean re-running useStaticMatrices on every edit; a cheap
  // remount of one kind's meshes is simpler.
  const edits = useCampusEdits((s) => s.edits);
  const versionByKind = useCampusEdits((s) => s.versionByKind);
  // Shared with applyEdits (build/edits.ts) — one item->Placement mapping,
  // including the scale-1.4 convention, so CampusWorld's render pass and
  // applyEdits' merge pass can't drift apart.
  const placedByKind = useMemo(() => placedItemPlacements(edits.items), [edits]);

  return (
    <group>
      {/* Animated residents (fountain water, clouds) stay auto-updating. */}
      <Fountain />
      <CloudPuffs count={biome.clouds} />
      <group ref={staticRef}>
        <Terrain grass={biome.grass} apron={biome.apron} path={biome.path} />
        <InstancedModel id="path-stone" placements={layout.pathTiles} />
        {scatterKinds.map((kind) => (
          <InstancedModel
            key={kind}
            id={biome.scatter[kind] ?? SCATTER_MODEL[kind]}
            placements={layout.scatter[kind]}
            // Cyan-band hue shift only touches campus greens/blues; safe for
            // cacti and palms too, so the foliage flag stays keyed on kind.
            foliage={FOLIAGE.has(kind)}
            tilt={kind.startsWith("tree") ? 0.05 : kind === "bush" || kind === "grassTuft" ? 0.09 : 0}
          />
        ))}
        <InstancedModel id="lantern" placements={layout.props.lantern} />
        <InstancedModel id="bench" placements={layout.props.bench} />
        <InstancedModel id="hedge" placements={layout.props.hedge} />
        <InstancedModel id="banner-green" placements={layout.props.banner} />
        {buildings.map((b) => (
          <Pavilion key={b.plotIndex} building={b} />
        ))}
      </group>
      {/* Placed pavilions (M3 T5): a disjoint set from the seeded four above,
          so no dedup needed — see PlacedBuildings' header for why this stays
          outside the frozen static-matrix group. */}
      <PlacedBuildings />
      {(Object.keys(placedByKind) as PlaceableKind[]).map((kind) => (
        <InstancedModel
          key={`${kind}-${versionByKind[kind] ?? 0}`}
          id={kind}
          placements={placedByKind[kind]!}
        />
      ))}
    </group>
  );
}
