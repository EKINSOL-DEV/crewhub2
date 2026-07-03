// Fountain (M0 T10, decor since M6): the fantasy-town fountain with a
// slowly rotating translucent water disc — cheap, charming, alive. Used to
// be the fixed plaza centerpiece; M6 gave that spot to the permanent HQ
// building, so this is now the renderer for player-PLACED fountain decor
// (see CampusWorld's placed-decor pass) — one live `<Fountain>` per placed
// item, at the item's own position/rotation/scale, instead of joining the
// other placed kinds' InstancedModel group. That keeps the animated water
// disc: an InstancedModel/Merged instance is a frozen (frames={1}) matrix
// stamp, which can't carry a per-frame spin.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { useModel } from "@/game/assets/use-model";

export function Fountain({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 3,
}: {
  position?: readonly [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  const model = useModel("fountain");
  const water = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    // The disc is laid flat via rotation-x=-π/2, so its LOCAL z-axis points
    // world-up — spinning local y (as M0 shipped) slowly tipped the water
    // vertical. Spin local z to swirl in the basin plane.
    if (water.current) water.current.rotation.z += dt * 0.4;
  });
  return (
    <group position={position as [number, number, number]} rotation-y={rotationY}>
      <primitive object={model} scale={scale} />
      <mesh ref={water} position-y={0.55} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.7, 24]} />
        <meshToonMaterial color="#7fd4f2" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
