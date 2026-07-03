// Plaza centerpiece (M0 T10): the fantasy-town fountain with a slowly
// rotating translucent water disc — cheap, charming, alive.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { useModel } from "@/game/assets/use-model";

export function Fountain() {
  const model = useModel("fountain");
  const water = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    // The disc is laid flat via rotation-x=-π/2, so its LOCAL z-axis points
    // world-up — spinning local y (as M0 shipped) slowly tipped the water
    // vertical. Spin local z to swirl in the basin plane.
    if (water.current) water.current.rotation.z += dt * 0.4;
  });
  return (
    <group>
      <primitive object={model} scale={3} />
      <mesh ref={water} position-y={0.55} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.7, 24]} />
        <meshToonMaterial color="#7fd4f2" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
