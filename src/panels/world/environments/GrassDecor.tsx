// Grass biome decor (EKI-111): v1's classic meadow — a wide grass disc,
// instanced tufts in two greens, scattered flowers, gray rocks, a couple of
// bushes, and the shared cloud bank overhead. All placement is seeded via
// scatterAround so the meadow never reshuffles between renders.
import { useMemo, type ReactNode } from "react";
import { Instance, Instances } from "@react-three/drei";
import { toonGradientMap } from "../lib/toon";
import { Clouds } from "./Clouds";
import { scatterAround } from "./scatter";
import type { DecorProps } from "./types";

const GROUND_Y = -0.15; // top of WorldScene's ground slab — props stand here
const TERRAIN_Y = -0.17; // grass disc tucked just under the slab
// Hard caps per family — scatter yield grows with world size; the caps keep
// huge worlds cheap.
const MAX_TUFT = 150;
const MAX_FLOWER = 50;
const MAX_ROCK = 50;
const MAX_BUSH = 6;

const TUFT_LIGHT = "#6fae4e";
const TUFT_DARK = "#4e7d38";
const NO_ROT: [number, number, number] = [0, 0, 0];

// Bush silhouette: three overlapping lobes — [dx, centerY, dz, radius].
const BUSH_LOBES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0.3, 0, 0.5],
  [0.34, 0.22, 0.12, 0.38],
  [-0.3, 0.24, -0.14, 0.36],
];

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

export function GrassDecor({ bounds, reducedMotion }: DecorProps) {
  const d = useMemo(() => {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const halfDiag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;

    // Tufts: 3 crossed cones per point, whole tuft picks one of two greens.
    const tuftLight: InstanceSeed[] = [];
    const tuftDark: InstanceSeed[] = [];
    const tufts = scatterAround(bounds, {
      step: 4,
      margin: 2,
      extent: 34,
      salt: 61,
      density: 0.16,
    }).slice(0, MAX_TUFT);
    for (const p of tufts) {
      const s = 0.7 + p.r * 0.6;
      const yaw = p.r2 * Math.PI * 2;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const target = p.r3 < 0.5 ? tuftLight : tuftDark;
      for (let b = 0; b < 3; b++) {
        // Center blade upright, outer two offset and tilted away from it.
        const off = (b - 1) * 0.07 * s;
        target.push({
          pos: [p.x + off * cosY, GROUND_Y + 0.24 * s, p.z - off * sinY],
          rot: [0, yaw, (b - 1) * -0.3],
          scale: [0.08 * s, 0.5 * s, 0.08 * s],
        });
      }
    }

    // Flowers: shared stems, heads bucketed per color via r3.
    const stems: InstanceSeed[] = [];
    const headsPink: InstanceSeed[] = [];
    const headsYellow: InstanceSeed[] = [];
    const headsWhite: InstanceSeed[] = [];
    const flowers = scatterAround(bounds, {
      step: 6,
      margin: 2,
      extent: 30,
      salt: 73,
      density: 0.12,
    }).slice(0, MAX_FLOWER);
    for (const p of flowers) {
      const s = 0.8 + p.r * 0.5;
      stems.push({
        pos: [p.x, GROUND_Y + 0.11 * s, p.z],
        rot: NO_ROT,
        scale: [0.02, 0.22 * s, 0.02],
      });
      const head: InstanceSeed = {
        pos: [p.x, GROUND_Y + 0.25 * s, p.z],
        rot: NO_ROT,
        scale: [0.06 * s, 0.06 * s, 0.06 * s],
      };
      if (p.r3 < 0.34) headsPink.push(head);
      else if (p.r3 < 0.67) headsYellow.push(head);
      else headsWhite.push(head);
    }

    const rocks: InstanceSeed[] = scatterAround(bounds, {
      step: 8,
      margin: 2,
      extent: 36,
      salt: 83,
      density: 0.16,
    })
      .slice(0, MAX_ROCK)
      .map((p) => {
        const s = 0.3 + p.r * 0.5;
        return {
          pos: [p.x, GROUND_Y + 0.45 * s, p.z],
          rot: [p.r3 * 0.5, p.r2 * Math.PI * 2, 0],
          scale: [s, s * (0.7 + p.r3 * 0.3), s],
        };
      });

    // Bushes: a handful of 3-lobe clusters, lobes yawed around the center.
    const bushes: InstanceSeed[] = [];
    const bushSpots = scatterAround(bounds, {
      step: 13,
      margin: 5,
      extent: 28,
      salt: 97,
      density: 0.14,
    }).slice(0, MAX_BUSH);
    for (const p of bushSpots) {
      const s = 0.8 + p.r * 0.7;
      const yaw = p.r2 * Math.PI * 2;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      for (const [dx, dy, dz, lr] of BUSH_LOBES) {
        bushes.push({
          pos: [p.x + (dx * cosY + dz * sinY) * s, GROUND_Y + dy * s, p.z + (-dx * sinY + dz * cosY) * s],
          rot: NO_ROT,
          scale: [lr * s, lr * 0.72 * s, lr * s],
        });
      }
    }

    return {
      cx,
      cz,
      radius: halfDiag + 55,
      tuftLight,
      tuftDark,
      stems,
      headsPink,
      headsYellow,
      headsWhite,
      rocks,
      bushes,
    };
  }, [bounds]);

  return (
    <group>
      {/* Grass terrain — one big disc under the slab, out to the horizon fog. */}
      <mesh position={[d.cx, TERRAIN_Y, d.cz]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[d.radius, 48]} />
        <meshStandardMaterial color="#558540" roughness={1} />
      </mesh>

      {/* Grass tufts — two tones, one instanced mesh each */}
      <ToonInstances seeds={d.tuftLight} color={TUFT_LIGHT}>
        <coneGeometry args={[1, 1, 5]} />
      </ToonInstances>
      <ToonInstances seeds={d.tuftDark} color={TUFT_DARK}>
        <coneGeometry args={[1, 1, 5]} />
      </ToonInstances>

      {/* Flowers */}
      <ToonInstances seeds={d.stems} color="#4e7d38">
        <cylinderGeometry args={[1, 1, 1, 5]} />
      </ToonInstances>
      <ToonInstances seeds={d.headsPink} color="#f2789f">
        <sphereGeometry args={[1, 8, 6]} />
      </ToonInstances>
      <ToonInstances seeds={d.headsYellow} color="#f7d154">
        <sphereGeometry args={[1, 8, 6]} />
      </ToonInstances>
      <ToonInstances seeds={d.headsWhite} color="#f5f2ea">
        <sphereGeometry args={[1, 8, 6]} />
      </ToonInstances>

      {/* Rocks */}
      <ToonInstances seeds={d.rocks} color="#8d8d85" castShadow>
        <dodecahedronGeometry args={[1, 0]} />
      </ToonInstances>

      {/* Bushes */}
      <ToonInstances seeds={d.bushes} color="#3e6b30" castShadow>
        <sphereGeometry args={[1, 10, 8]} />
      </ToonInstances>

      <Clouds bounds={bounds} reducedMotion={reducedMotion} />
    </group>
  );
}
