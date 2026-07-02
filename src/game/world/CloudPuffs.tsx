// Flat-toon clouds (M0 T10): merged sphere trios drifting slowly overhead.
// Seeded positions; drift pauses under reduced motion.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";

const COUNT = 7;
const ALT = 26;
const RANGE = 70;

export function CloudPuffs() {
  const reducedMotion = usePrefersReducedMotion();
  const group = useRef<THREE.Group>(null);
  const seeds = useMemo(() => {
    // Fixed table, not Math.random(): identical sky every launch.
    return Array.from({ length: COUNT }, (_, i) => ({
      x: ((i * 37) % RANGE) - RANGE / 2,
      z: ((i * 53) % RANGE) - RANGE / 2,
      s: 2.2 + (i % 3) * 0.9,
      v: 0.4 + (i % 4) * 0.15,
    }));
  }, []);

  useFrame((_, dt) => {
    if (reducedMotion || !group.current) return;
    group.current.children.forEach((c, i) => {
      const seed = seeds[i];
      if (!seed) return;
      c.position.x += seed.v * dt;
      if (c.position.x > RANGE / 2) c.position.x = -RANGE / 2;
    });
  });

  return (
    <group ref={group}>
      {seeds.map((s, i) => (
        <group key={i} position={[s.x, ALT + (i % 2) * 3, s.z]} scale={s.s}>
          <mesh>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color="#ffffff" />
          </mesh>
          <mesh position={[1.1, -0.15, 0.2]} scale={0.7}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-1.05, -0.2, -0.15]} scale={0.6}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshToonMaterial color="#f4fbff" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
