// Per-environment lighting rig (M0 T10), lerped toward night (M4 T4). The
// sun's shadow camera is fitted to the campus bounds once — no per-frame
// work there; only the day/night rig's colors, intensities and sun position
// damp each frame, mutated straight onto the light objects via refs (never
// through React state) so the lerp never triggers a re-render.
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useQuality, QUALITY } from "@/game/engine/quality";
import { useGameEnvironment } from "@/game/world/environments/store";
import { dayRig, nightRig } from "@/game/world/night";
import type { GameEnvironment } from "@/game/world/environments/types";
import { CAMPUS } from "@/game/world/campus/layout";

const DAMP_RATE = 2.5;

export function Lights({ env }: { env: GameEnvironment }) {
  const tier = useQuality((s) => s.tier);
  const night = useGameEnvironment((s) => s.night);
  const mapSize = QUALITY[tier].shadowMapSize;
  const b = CAMPUS.half + 6;

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const scratchColor = useRef(new THREE.Color());
  const scratchVec = useRef(new THREE.Vector3());

  // Frozen at first mount (lazy useState initializer, run once). If this
  // recomputed on every render, R3F would reapply it as a JSX prop each
  // time `night` flips and stomp the ref-mutated, mid-lerp values back to
  // the target instantly. useFrame below picks up `night`/`env` fresh every
  // render, so the rig still tracks changes — just via the lerp, never a
  // prop reset.
  const [initial] = useState(() => (night ? nightRig(env) : dayRig(env)));

  useFrame((_, dt) => {
    const target = night ? nightRig(env) : dayRig(env);
    const k = 1 - Math.exp(-DAMP_RATE * dt);
    const scratch = scratchColor.current;

    const ambient = ambientRef.current;
    if (ambient) {
      ambient.color.lerp(scratch.set(target.ambient.color), k);
      ambient.intensity = THREE.MathUtils.damp(ambient.intensity, target.ambient.intensity, DAMP_RATE, dt);
    }

    const hemisphere = hemisphereRef.current;
    if (hemisphere) {
      hemisphere.color.lerp(scratch.set(target.hemisphere.sky), k);
      hemisphere.groundColor.lerp(scratch.set(target.hemisphere.ground), k);
      hemisphere.intensity = THREE.MathUtils.damp(
        hemisphere.intensity,
        target.hemisphere.intensity,
        DAMP_RATE,
        dt,
      );
    }

    const sun = sunRef.current;
    if (sun) {
      sun.color.lerp(scratch.set(target.sun.color), k);
      sun.intensity = THREE.MathUtils.damp(sun.intensity, target.sun.intensity, DAMP_RATE, dt);
      sun.position.lerp(scratchVec.current.set(...target.sun.position), k);
    }
  });

  return (
    <group>
      <ambientLight ref={ambientRef} color={initial.ambient.color} intensity={initial.ambient.intensity} />
      <hemisphereLight
        ref={hemisphereRef}
        color={initial.hemisphere.sky}
        groundColor={initial.hemisphere.ground}
        intensity={initial.hemisphere.intensity}
      />
      <directionalLight
        ref={sunRef}
        position={initial.sun.position}
        color={initial.sun.color}
        intensity={initial.sun.intensity}
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
