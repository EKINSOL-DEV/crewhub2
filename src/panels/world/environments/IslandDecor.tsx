// Island decor (EKI-111): v1's Monument-Valley floating island. A grass disc
// just under the ground slab, a lathed earth bulge tapering to a rocky point,
// toon tufts and rocks near the rim, slow-bobbing rock shards below, and
// clouds both above and *below* the rim so the island reads as airborne.
import { useMemo, useRef } from "react";
import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Clouds } from "./Clouds";
import { cellRandom } from "./scatter";
import type { DecorProps } from "./types";
import { toonGradientMap } from "../lib/toon";

const TUFT_COUNT = 26;
const ROCK_COUNT = 5;
const SHARD_COUNT = 3;
const TUFT_GREENS = ["#4a7a35", "#6fae4e"];

export function IslandDecor({ bounds, reducedMotion }: DecorProps) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  // The island carries the whole building: half the bounds diagonal + margin.
  const R = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 14;
  const shardsRef = useRef<THREE.Group>(null);

  // Earth bulge profile, top rim (y=0) down to where the rock cone takes over.
  const bodyProfile = useMemo(
    () => [
      new THREE.Vector2(R, 0),
      new THREE.Vector2(R * 0.98, -1.2),
      new THREE.Vector2(R * 0.88, -3),
      new THREE.Vector2(R * 0.7, -4.8),
      new THREE.Vector2(R * 0.5, -6.2),
    ],
    [R],
  );

  // Grass tufts ring the rim; rocks sit slightly further in.
  const tufts = useMemo(
    () =>
      Array.from({ length: TUFT_COUNT }, (_, i) => {
        const a = cellRandom(i, 1, 211) * Math.PI * 2;
        const d = R - 1.5 - cellRandom(i, 2, 211) * 3;
        return {
          x: cx + Math.cos(a) * d,
          z: cz + Math.sin(a) * d,
          s: 0.5 + cellRandom(i, 3, 211) * 0.5,
          color: TUFT_GREENS[cellRandom(i, 4, 211) > 0.5 ? 1 : 0]!,
        };
      }),
    [R, cx, cz],
  );

  const rocks = useMemo(
    () =>
      Array.from({ length: ROCK_COUNT }, (_, i) => {
        const a = cellRandom(i, 1, 223) * Math.PI * 2;
        const d = R - 3 - cellRandom(i, 2, 223) * 3;
        return {
          x: cx + Math.cos(a) * d,
          z: cz + Math.sin(a) * d,
          s: 0.35 + cellRandom(i, 3, 223) * 0.45,
          rotY: cellRandom(i, 4, 223) * Math.PI,
        };
      }),
    [R, cx, cz],
  );

  // Tiny rock shards hovering below the rim — they bob in useFrame.
  const shards = useMemo(
    () =>
      Array.from({ length: SHARD_COUNT }, (_, i) => {
        const a = cellRandom(i, 1, 239) * Math.PI * 2;
        const d = R * (0.55 + cellRandom(i, 2, 239) * 0.4);
        return {
          x: cx + Math.cos(a) * d,
          y: -5 - cellRandom(i, 3, 239) * 4,
          z: cz + Math.sin(a) * d,
          s: 0.4 + cellRandom(i, 4, 239) * 0.5,
          phase: cellRandom(i, 5, 239) * Math.PI * 2,
        };
      }),
    [R, cx, cz],
  );

  // Low clouds outside the rim — the island floats *among* them.
  const lowClouds = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => {
        const a = cellRandom(i, 1, 251) * Math.PI * 2;
        const d = R + 10 + cellRandom(i, 2, 251) * 8;
        return {
          x: cx + Math.cos(a) * d,
          y: 2 + cellRandom(i, 3, 251) * 4,
          z: cz + Math.sin(a) * d,
          s: 1.4 + cellRandom(i, 4, 251) * 1.2,
        };
      }),
    [R, cx, cz],
  );

  useFrame((state) => {
    if (reducedMotion || !shardsRef.current) return;
    const t = state.clock.elapsedTime;
    shardsRef.current.children.forEach((child, i) => {
      const s = shards[i];
      if (!s) return;
      child.position.y = s.y + Math.sin(t * 0.3 + s.phase) * 0.25;
      child.rotation.y = t * 0.08 + s.phase;
    });
  });

  return (
    <group>
      {/* Grass top — just under the ground slab top (y=-0.15). */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.16, cz]} receiveShadow>
        <circleGeometry args={[R, 48]} />
        <meshToonMaterial color="#5e8f45" gradientMap={toonGradientMap()} />
      </mesh>

      {/* Island body: earth bulge + rocky taper to a point ~12 units down. */}
      <group position={[cx, -0.16, cz]}>
        <mesh>
          <latheGeometry args={[bodyProfile, 24]} />
          <meshStandardMaterial color="#8a6f4d" roughness={1} flatShading side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -9.2, 0]}>
          <cylinderGeometry args={[R * 0.5, 0.2, 6, 10]} />
          <meshStandardMaterial color="#7a6a58" roughness={1} flatShading />
        </mesh>
      </group>

      {/* Grass tufts — one instanced cone family, two greens per instance. */}
      <Instances limit={tufts.length} frustumCulled={false}>
        <coneGeometry args={[0.28, 0.7, 5]} />
        <meshToonMaterial color="#ffffff" gradientMap={toonGradientMap()} />
        {tufts.map((t, i) => (
          <Instance key={i} position={[t.x, -0.16 + (0.7 * t.s) / 2, t.z]} scale={t.s} color={t.color} />
        ))}
      </Instances>

      {/* A few rocks near the rim. */}
      <Instances limit={rocks.length} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshToonMaterial color="#7a6a58" gradientMap={toonGradientMap()} />
        {rocks.map((r, i) => (
          <Instance key={i} position={[r.x, -0.16 + r.s * 0.6, r.z]} scale={r.s} rotation={[0, r.rotY, 0]} />
        ))}
      </Instances>

      {/* Floating shards below the rim — static under reduced motion. */}
      <group ref={shardsRef}>
        {shards.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, s.z]} scale={s.s}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshToonMaterial color="#7a6a58" gradientMap={toonGradientMap()} />
          </mesh>
        ))}
      </group>

      {/* Cloud bank above, plus a few puffs *below* island level. */}
      <Clouds bounds={bounds} reducedMotion={reducedMotion} />
      {lowClouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          <mesh scale={[1.4, 0.6, 1]}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshStandardMaterial color="#ffffff" roughness={1} flatShading />
          </mesh>
          <mesh position={[0.9, -0.1, 0.2]} scale={[0.95, 0.4, 0.7]}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshStandardMaterial color="#ffffff" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
