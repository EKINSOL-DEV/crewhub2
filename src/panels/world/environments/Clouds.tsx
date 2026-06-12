// Drifting clouds (EKI-114): a few flat-shaded puffs high over the world.
// Each cloud is 3 squashed spheres in one group; the whole bank drifts on a
// slow loop and holds still under reduced motion.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldBounds } from "../lib/layout";
import { cellRandom } from "./scatter";

const CLOUD_Y = 14;
const DRIFT_SPEED = 0.35;

export interface CloudsProps {
  bounds: WorldBounds;
  reducedMotion: boolean;
  count?: number;
  color?: string;
}

export function Clouds({ bounds, reducedMotion, count = 6, color = "#ffffff" }: CloudsProps) {
  const bank = useRef<THREE.Group>(null);
  const spanX = bounds.maxX - bounds.minX + 50;

  useFrame((state) => {
    if (reducedMotion || !bank.current) return;
    // Wrap the drift so clouds circulate instead of leaving forever.
    bank.current.position.x = ((state.clock.elapsedTime * DRIFT_SPEED) % spanX) - spanX / 2;
  });

  const clouds = Array.from({ length: count }, (_, i) => {
    const r = cellRandom(i, 7, 91);
    const x = bounds.minX - 20 + (bounds.maxX - bounds.minX + 40) * cellRandom(i, 3, 17);
    const z = bounds.minZ - 18 + (bounds.maxZ - bounds.minZ + 36) * cellRandom(i, 5, 53);
    const s = 1.6 + r * 1.8;
    return { x, z, s, y: CLOUD_Y + r * 4 };
  });

  return (
    <group ref={bank}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {[
            [0, 0, 0, 1],
            [0.9, -0.1, 0.2, 0.7],
            [-0.85, -0.12, -0.15, 0.62],
          ].map(([x, y, z, s], j) => (
            <mesh key={j} position={[x!, y!, z!]} scale={[s! * 1.4, s! * 0.6, s!]}>
              <sphereGeometry args={[1, 12, 10]} />
              <meshStandardMaterial color={color} roughness={1} flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
