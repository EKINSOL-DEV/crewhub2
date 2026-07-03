// The campus ground (M0 T9/T13): one big toon plane, slightly darker apron
// beyond the playable bounds so the world edge reads as designed, not cut.
// The paths themselves are solid cream strips + a plaza plate (the Two Point
// read) — the kit's stone tiles scatter on top as accents, they don't have
// to carry the path silhouette alone.
//
// Biomes (M4 T3) repaint this same geometry — grass/apron/path are props
// now, defaulting to the campus palette.
import { CAMPUS } from "./layout";
import { BIOMES } from "../biome";

const PATH_WIDTH = 3;

export function Terrain({
  grass = BIOMES.campus.grass,
  apron = BIOMES.campus.apron,
  path = BIOMES.campus.path,
}: {
  grass?: string;
  apron?: string;
  path?: string;
}) {
  const size = CAMPUS.half * 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[size + 80, size + 80]} />
        <meshToonMaterial color={apron} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshToonMaterial color={grass} />
      </mesh>
      {/* Path cross: two full-length strips through the origin. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} receiveShadow>
        <planeGeometry args={[size, PATH_WIDTH]} />
        <meshToonMaterial color={path} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} rotation-z={Math.PI / 2} position-y={0.004} receiveShadow>
        <planeGeometry args={[size, PATH_WIDTH]} />
        <meshToonMaterial color={path} />
      </mesh>
      {/* Plaza plate under the fountain — grounds the whole center. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} receiveShadow>
        <circleGeometry args={[CAMPUS.plazaRadius + 2.6, 48]} />
        <meshToonMaterial color={path} />
      </mesh>
    </group>
  );
}
