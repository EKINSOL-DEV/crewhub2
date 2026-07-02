// The Campus environment's World (M0 T9/T10): terrain, paths, nature scatter,
// plaza props. Lights live in GameShell (per-environment rig), not here.
import { useMemo } from "react";
import type { ModelId } from "@/game/assets/manifest";
import { CloudPuffs } from "@/game/world/CloudPuffs";
import { Fountain } from "./Fountain";
import { InstancedModel } from "./InstancedModel";
import { Terrain } from "./Terrain";
import { campusLayout, type ScatterKind } from "./layout";

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

export function CampusWorld() {
  const layout = useMemo(() => campusLayout(), []);
  return (
    <group>
      <Terrain />
      <Fountain />
      <CloudPuffs />
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
    </group>
  );
}
