// Per-environment lighting rig (M0 T10). The sun's shadow camera is fitted to
// the campus bounds once — no per-frame work.
import { useQuality, QUALITY } from "@/game/engine/quality";
import type { GameEnvironment } from "@/game/world/environments/types";
import { CAMPUS } from "@/game/world/campus/layout";

export function Lights({ env }: { env: GameEnvironment }) {
  const tier = useQuality((s) => s.tier);
  const mapSize = QUALITY[tier].shadowMapSize;
  const b = CAMPUS.half + 6;
  return (
    <group>
      <ambientLight color={env.ambient.color} intensity={env.ambient.intensity} />
      <hemisphereLight
        color={env.hemisphere.sky}
        groundColor={env.hemisphere.ground}
        intensity={env.hemisphere.intensity}
      />
      <directionalLight
        position={env.sun.position}
        color={env.sun.color}
        intensity={env.sun.intensity}
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-b}
        shadow-camera-right={b}
        shadow-camera-top={b}
        shadow-camera-bottom={-b}
        shadow-camera-near={4}
        shadow-camera-far={120}
        shadow-bias={-0.0005}
      />
    </group>
  );
}
