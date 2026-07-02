// The campus ground (M0 T9/T13): one big toon plane, slightly darker apron
// beyond the playable bounds so the world edge reads as designed, not cut.
// The paths themselves are solid cream strips + a plaza plate (the Two Point
// read) — the kit's stone tiles scatter on top as accents, they don't have
// to carry the path silhouette alone.
import { CAMPUS } from "./layout";

const GRASS = "#82c95b";
const APRON = "#6cb14b";
const PATH = "#e7d9b4";
const PATH_WIDTH = 3;

export function Terrain() {
  const size = CAMPUS.half * 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[size + 80, size + 80]} />
        <meshToonMaterial color={APRON} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshToonMaterial color={GRASS} />
      </mesh>
      {/* Path cross: two full-length strips through the origin. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} receiveShadow>
        <planeGeometry args={[size, PATH_WIDTH]} />
        <meshToonMaterial color={PATH} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} rotation-z={Math.PI / 2} position-y={0.004} receiveShadow>
        <planeGeometry args={[size, PATH_WIDTH]} />
        <meshToonMaterial color={PATH} />
      </mesh>
      {/* Plaza plate under the fountain — grounds the whole center. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} receiveShadow>
        <circleGeometry args={[CAMPUS.plazaRadius + 2.6, 48]} />
        <meshToonMaterial color={PATH} />
      </mesh>
    </group>
  );
}
