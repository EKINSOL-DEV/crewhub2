// Desert biome decor (EKI-111): v1's postcard look — a wide sand disc,
// instanced saguaro + barrel cacti, scattered rocks, low dunes, and a few
// tumbleweeds rolling outside the bounds. All placement is seeded via
// scatterAround so the desert never reshuffles between renders.
import { useMemo, useRef, type ReactNode } from "react";
import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toonGradientMap } from "../lib/toon";
import { cellRandom, scatterAround } from "./scatter";
import type { DecorProps } from "./types";

const GROUND_Y = -0.15; // top of WorldScene's ground slab — props stand here
const TERRAIN_Y = -0.17; // sand disc tucked just under the slab
// Hard caps per family — scatter yield grows with world size; the caps keep
// huge worlds cheap.
const MAX_SAGUARO = 60;
const MAX_BARREL = 50;
const MAX_ROCK = 70;
const MAX_DUNE = 14;
const TUMBLEWEED_COUNT = 5;

const CACTUS_GREEN = "#3b7a3b";
const CACTUS_DARK = "#2d5e2d";
const NO_ROT: [number, number, number] = [0, 0, 0];

interface InstanceSeed {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
}

/** One instanced family: shared unit geometry (children) + one toon material. */
function ToonInstances({
  seeds,
  color,
  castShadow = false,
  receiveShadow = false,
  children,
}: {
  seeds: InstanceSeed[];
  color: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  children: ReactNode;
}) {
  if (seeds.length === 0) return null;
  return (
    <Instances
      limit={seeds.length}
      frustumCulled={false}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {children}
      <meshToonMaterial color={color} gradientMap={toonGradientMap()} />
      {seeds.map((t, i) => (
        <Instance key={i} position={t.pos} rotation={t.rot} scale={t.scale} />
      ))}
    </Instances>
  );
}

interface TumbleweedSeed {
  x: number;
  z: number;
  phase: number;
}

/** Wireframe brown balls that slowly roll in place; frozen under reduced motion. */
function Tumbleweeds({ weeds, reducedMotion }: { weeds: TumbleweedSeed[]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (reducedMotion || !group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const w = weeds[i];
      if (!w) return;
      child.rotation.x = t * 0.6 + w.phase;
      child.rotation.z = t * 0.35 + w.phase * 0.7;
      // Small drift around the spawn point — never wanders into the rooms.
      child.position.x = w.x + Math.sin(t * 0.12 + w.phase) * 0.6;
      child.position.z = w.z + Math.cos(t * 0.09 + w.phase) * 0.45;
    });
  });

  return (
    <group ref={group}>
      {weeds.map((w, i) => (
        <mesh key={i} position={[w.x, TERRAIN_Y + 0.32, w.z]}>
          <icosahedronGeometry args={[0.32, 0]} />
          <meshToonMaterial
            color="#8b7355"
            gradientMap={toonGradientMap()}
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

export function DesertDecor({ bounds, reducedMotion }: DecorProps) {
  const d = useMemo(() => {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const halfDiag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;

    // Saguaros: light trunk + low arm, dark high arm — split per color so
    // each family stays one geometry + one material.
    const greenCyl: InstanceSeed[] = [];
    const greenCap: InstanceSeed[] = [];
    const darkCyl: InstanceSeed[] = [];
    const darkCap: InstanceSeed[] = [];
    const saguaros = scatterAround(bounds, {
      step: 6,
      margin: 3,
      extent: 42,
      salt: 11,
      density: 0.14,
    }).slice(0, MAX_SAGUARO);
    for (const p of saguaros) {
      const s = 0.7 + p.r * 0.5;
      const yaw = p.r2 * Math.PI * 2;
      // A unit cylinder rotated [0, yaw, PI/2] lies along (ax, 0, az); arms
      // grow out along that axis, the second one mirrored.
      const ax = -Math.cos(yaw);
      const az = Math.sin(yaw);
      const armRot: [number, number, number] = [0, yaw, Math.PI / 2];
      greenCyl.push({
        pos: [p.x, GROUND_Y + 1.2 * s, p.z],
        rot: NO_ROT,
        scale: [0.19 * s, 2.4 * s, 0.19 * s],
      });
      greenCap.push({
        pos: [p.x, GROUND_Y + 2.4 * s, p.z],
        rot: NO_ROT,
        scale: [0.19 * s, 0.19 * s, 0.19 * s],
      });
      // Low arm: connector out, elbow up, rounded tip.
      greenCyl.push({
        pos: [p.x + ax * 0.3 * s, GROUND_Y + 1.1 * s, p.z + az * 0.3 * s],
        rot: armRot,
        scale: [0.09 * s, 0.55 * s, 0.09 * s],
      });
      greenCyl.push({
        pos: [p.x + ax * 0.52 * s, GROUND_Y + 1.42 * s, p.z + az * 0.52 * s],
        rot: NO_ROT,
        scale: [0.085 * s, 0.68 * s, 0.085 * s],
      });
      greenCap.push({
        pos: [p.x + ax * 0.52 * s, GROUND_Y + 1.76 * s, p.z + az * 0.52 * s],
        rot: NO_ROT,
        scale: [0.085 * s, 0.085 * s, 0.085 * s],
      });
      // High arm on the opposite side, in the darker green.
      darkCyl.push({
        pos: [p.x - ax * 0.3 * s, GROUND_Y + 1.5 * s, p.z - az * 0.3 * s],
        rot: armRot,
        scale: [0.1 * s, 0.55 * s, 0.1 * s],
      });
      darkCyl.push({
        pos: [p.x - ax * 0.52 * s, GROUND_Y + 1.82 * s, p.z - az * 0.52 * s],
        rot: NO_ROT,
        scale: [0.095 * s, 0.68 * s, 0.095 * s],
      });
      darkCap.push({
        pos: [p.x - ax * 0.52 * s, GROUND_Y + 2.16 * s, p.z - az * 0.52 * s],
        rot: NO_ROT,
        scale: [0.095 * s, 0.095 * s, 0.095 * s],
      });
    }

    // Barrel cacti: squashed sphere + a tiny flower on top.
    const barrelBody: InstanceSeed[] = [];
    const barrelFlower: InstanceSeed[] = [];
    const barrels = scatterAround(bounds, {
      step: 5,
      margin: 2,
      extent: 36,
      salt: 23,
      density: 0.1,
    }).slice(0, MAX_BARREL);
    for (const p of barrels) {
      const s = 0.5 + p.r * 0.6;
      barrelBody.push({
        pos: [p.x, GROUND_Y + 0.2 * s, p.z],
        rot: [0, p.r2 * Math.PI * 2, 0],
        scale: [0.3 * s, 0.22 * s, 0.3 * s],
      });
      barrelFlower.push({
        pos: [p.x, GROUND_Y + 0.42 * s, p.z],
        rot: NO_ROT,
        scale: [0.07 * s, 0.05 * s, 0.07 * s],
      });
    }

    const rocks: InstanceSeed[] = scatterAround(bounds, {
      step: 7,
      margin: 2,
      extent: 40,
      salt: 37,
      density: 0.13,
    })
      .slice(0, MAX_ROCK)
      .map((p) => {
        const s = 0.35 + p.r * 0.55;
        return {
          pos: [p.x, GROUND_Y + 0.45 * s, p.z],
          rot: [p.r3 * 0.5, p.r2 * Math.PI * 2, 0],
          scale: [s, s * (0.7 + p.r3 * 0.3), s],
        };
      });

    // Dunes sit far out: full spheres half-buried in the terrain disc.
    const dunes: InstanceSeed[] = scatterAround(bounds, {
      step: 15,
      margin: 10,
      extent: 52,
      salt: 53,
      density: 0.22,
    })
      .slice(0, MAX_DUNE)
      .map((p) => {
        const w = 3 + p.r * 4;
        return {
          pos: [p.x, TERRAIN_Y, p.z],
          rot: [0, p.r2 * Math.PI * 2, 0],
          scale: [w, 0.5 + p.r3 * 0.8, w * 0.7],
        };
      });

    // Tumbleweeds ring the building just past the bounds' circumscribed
    // circle, so the drift can never carry them inside.
    const tumbleweeds: TumbleweedSeed[] = Array.from({ length: TUMBLEWEED_COUNT }, (_, i) => {
      const a = (i / TUMBLEWEED_COUNT) * Math.PI * 2 + cellRandom(i, 1, 47) * 1.2;
      const rad = halfDiag + 7 + cellRandom(i, 2, 47) * 9;
      return {
        x: cx + Math.cos(a) * rad,
        z: cz + Math.sin(a) * rad,
        phase: cellRandom(i, 3, 47) * Math.PI * 2,
      };
    });

    return {
      cx,
      cz,
      radius: halfDiag + 55,
      greenCyl,
      greenCap,
      darkCyl,
      darkCap,
      barrelBody,
      barrelFlower,
      rocks,
      dunes,
      tumbleweeds,
    };
  }, [bounds]);

  return (
    <group>
      {/* Sand terrain — one big disc under the slab, out to the horizon fog. */}
      <mesh position={[d.cx, TERRAIN_Y, d.cz]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[d.radius, 48]} />
        <meshStandardMaterial color="#ddb985" roughness={1} />
      </mesh>

      {/* Saguaros */}
      <ToonInstances seeds={d.greenCyl} color={CACTUS_GREEN} castShadow>
        <cylinderGeometry args={[1, 1, 1, 8]} />
      </ToonInstances>
      <ToonInstances seeds={d.greenCap} color={CACTUS_GREEN}>
        <sphereGeometry args={[1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </ToonInstances>
      <ToonInstances seeds={d.darkCyl} color={CACTUS_DARK} castShadow>
        <cylinderGeometry args={[1, 1, 1, 8]} />
      </ToonInstances>
      <ToonInstances seeds={d.darkCap} color={CACTUS_DARK}>
        <sphereGeometry args={[1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </ToonInstances>

      {/* Barrel cacti */}
      <ToonInstances seeds={d.barrelBody} color="#4a8a3a" castShadow>
        <sphereGeometry args={[1, 10, 8]} />
      </ToonInstances>
      <ToonInstances seeds={d.barrelFlower} color="#c45c8a">
        <sphereGeometry args={[1, 6, 5]} />
      </ToonInstances>

      {/* Rocks */}
      <ToonInstances seeds={d.rocks} color="#a78d68" castShadow>
        <dodecahedronGeometry args={[1, 0]} />
      </ToonInstances>

      {/* Dunes */}
      <ToonInstances seeds={d.dunes} color="#dcba84" receiveShadow>
        <sphereGeometry args={[1, 12, 8]} />
      </ToonInstances>

      <Tumbleweeds weeds={d.tumbleweeds} reducedMotion={reducedMotion} />
    </group>
  );
}
