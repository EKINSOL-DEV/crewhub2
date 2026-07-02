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

export function InstancedModel({ id, placements }: { id: ModelId; placements: Placement[] }) {
  const scene = useModel(id);
  const meshes = useMemo(() => collectMeshes(scene), [scene]);
  if (placements.length === 0) return null;
  return (
    <Merged meshes={meshes} castShadow receiveShadow>
      {(...Parts: ComponentType[]) => (
        <>
          {placements.map((p, i) => (
            <group key={i} position={[p.x, 0, p.z]} rotation-y={p.rot} scale={p.scale}>
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
