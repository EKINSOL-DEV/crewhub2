// The Campus environment's World (M0 T9/T10): terrain, paths, nature scatter,
// plaza props. Lights live in GameShell (per-environment rig), not here.
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import type { ModelId } from "@/game/assets/manifest";
import { CloudPuffs } from "@/game/world/CloudPuffs";
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

export function CampusWorld() {
  const layout = useMemo(() => campusLayout(), []);
  const buildings = useMemo(() => campusBuildings(layout.plots), [layout]);
  const staticRef = useStaticMatrices();
  return (
    <group>
      {/* Animated residents (fountain water, clouds) stay auto-updating. */}
      <Fountain />
      <CloudPuffs />
      <group ref={staticRef}>
        <Terrain />
        <InstancedModel id="path-stone" placements={layout.pathTiles} />
        {(Object.keys(SCATTER_MODEL) as ScatterKind[]).map((kind) => (
          <InstancedModel
            key={kind}
            id={SCATTER_MODEL[kind]}
            placements={layout.scatter[kind]}
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
    </group>
  );
}
