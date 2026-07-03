// One plot pavilion (M1 T1): raised slab, corner pillars, beams, four desks.
// Everything procedural toon — robots need somewhere to work, not a palace.
import { toonGradientMap } from "@/game/engine/toon";
import type { Building } from "./buildings";

const SLAB = "#d9c9a3";
const PILLAR = "#a98b6b";
const DESK = "#8b6f52";
const SCREEN = "#3fd1e0";

function Desk({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0.14, z]} rotation-y={rot}>
      <mesh position-y={0.55} castShadow>
        <boxGeometry args={[1.5, 0.09, 0.75]} />
        <meshToonMaterial color={DESK} gradientMap={toonGradientMap()} />
      </mesh>
      {[-0.62, 0.62].map((sx) => (
        <mesh key={sx} position={[sx, 0.27, 0]} castShadow>
          <boxGeometry args={[0.09, 0.55, 0.7]} />
          <meshToonMaterial color={DESK} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      <mesh position={[0, 0.86, -0.22]} rotation-x={-0.15} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.06]} />
        <meshToonMaterial color={SCREEN} gradientMap={toonGradientMap()} />
      </mesh>
    </group>
  );
}

export function Pavilion({ building }: { building: Building }) {
  const { rect } = building;
  const px = rect.w / 2 - 0.5;
  const pz = rect.d / 2 - 0.5;
  return (
    <group position={[rect.x, 0, rect.z]}>
      <mesh position-y={0.07} receiveShadow>
        <boxGeometry args={[rect.w, 0.14, rect.d]} />
        <meshToonMaterial color={SLAB} gradientMap={toonGradientMap()} />
      </mesh>
      {[
        [-px, -pz],
        [px, -pz],
        [-px, pz],
        [px, pz],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 1.9, z!]} castShadow>
          <boxGeometry args={[0.35, 3.8, 0.35]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {/* Three open beams instead of a roof — structure without occlusion. */}
      {[-pz, 0, pz].map((z, i) => (
        <mesh key={i} position={[0, 3.85, z]} castShadow>
          <boxGeometry args={[rect.w, 0.18, 0.3]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {building.desks.map((d) => (
        <Desk key={d.id} x={d.x - rect.x} z={d.z - rect.z} rot={d.rot} />
      ))}
    </group>
  );
}
