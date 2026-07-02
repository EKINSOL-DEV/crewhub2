// The campus ground (M0 T9): one big toon plane, slightly darker apron
// beyond the playable bounds so the world edge reads as designed, not cut.
import { CAMPUS } from "./layout";

const GRASS = "#82c95b";
const APRON = "#6cb14b";

export function Terrain() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[CAMPUS.half * 2 + 80, CAMPUS.half * 2 + 80]} />
        <meshToonMaterial color={APRON} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[CAMPUS.half * 2, CAMPUS.half * 2]} />
        <meshToonMaterial color={GRASS} />
      </mesh>
    </group>
  );
}
