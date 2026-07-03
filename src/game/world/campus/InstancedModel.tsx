// One draw call per sub-mesh regardless of placement count (M0 T9). drei's
// <Merged> turns each kit sub-mesh (trunk, leaves, …) into an InstancedMesh;
// we stamp the full model once per placement.
import { useMemo } from "react";
import { Merged } from "@react-three/drei";
import type { ComponentType } from "react";
import { collectMeshes } from "@/game/assets/collect-meshes";
import { useModel } from "@/game/assets/use-model";
import type { ModelId } from "@/game/assets/manifest";
import type { Placement } from "./layout";

export function InstancedModel({
  id,
  placements,
  foliage = false,
  tilt = 0,
}: {
  id: ModelId;
  placements: Placement[];
  /** Apply the toon foliage hue fix (plants only — see engine/toon.ts). */
  foliage?: boolean;
  /** Max organic lean in radians, deterministic per placement (trees sway,
   *  lanterns stand at attention). */
  tilt?: number;
}) {
  const scene = useModel(id, { foliageHueFix: foliage });
  const meshes = useMemo(() => collectMeshes(scene), [scene]);
  if (placements.length === 0) return null;
  return (
    // frames={1}: placements never move, so drei recomputing every instance
    // matrix per frame (~300 across the campus) is pure CPU waste — compute
    // once on mount, then freeze (perf loop iter 4).
    <Merged meshes={meshes} castShadow receiveShadow frames={1}>
      {(...Parts: ComponentType[]) => (
        <>
          {placements.map((p, i) => (
            <group
              key={i}
              position={[p.x, 0, p.z]}
              // Deterministic pseudo-lean from the index — no Math.random().
              rotation={[Math.sin(i * 127.1) * tilt, p.rot, Math.cos(i * 311.7) * tilt]}
              scale={p.scale}
            >
              {Parts.map((Part, j) => (
                <Part key={j} />
              ))}
            </group>
          ))}
        </>
      )}
    </Merged>
  );
}
