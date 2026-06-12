// Sky platform decor (EKI-111): v1's futuristic "Sky Platform ✨". A hex slab
// with a teal emissive rim under the building, small hex tiles drifting in
// the void around it, and a far star dome. No terrain beyond the platform —
// the void is the point; the scene fog handles the horizon.
import { useMemo, useRef } from "react";
import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cellRandom, scatterAround } from "./scatter";
import type { DecorProps } from "./types";

const PLATFORM_H = 1.2;
const ACCENT = "#14b8a6";
const MAX_TILES = 10;
const STAR_COUNT = 300;
const STAR_DOME_R = 90;

export function SkyDecor({ bounds, reducedMotion }: DecorProps) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  // The platform carries the whole building: half the bounds diagonal + margin.
  const R = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 10;
  const tilesRef = useRef<THREE.InstancedMesh>(null);

  // Floating hex tiles scattered outside the platform circle. The scatter
  // keep-out is a rectangle, so grow its margin until the rectangle's nearest
  // edge clears the circle, then spread a stride over the survivors.
  const tiles = useMemo(() => {
    const minHalf = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
    const pts = scatterAround(bounds, {
      step: 7,
      margin: R + 2 - minHalf,
      extent: 18,
      salt: 31,
      density: 0.3,
    });
    const stride = Math.max(1, Math.floor(pts.length / MAX_TILES));
    return pts
      .filter((_, i) => i % stride === 0)
      .slice(0, MAX_TILES)
      .map((p) => ({
        x: p.x,
        y: -3 + p.r2 * 7,
        z: p.z,
        rad: 1 + p.r * 1.5,
        rotY: p.r3 * Math.PI,
        phase: p.r3 * Math.PI * 2,
      }));
  }, [bounds, R]);

  // Star dome: ~300 points on the upper hemisphere of a far sphere.
  const stars = useMemo(() => {
    const arr = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const a = cellRandom(i, 1, 401) * Math.PI * 2;
      const h = 0.06 + cellRandom(i, 2, 401) * 0.94; // sin(elevation): above horizon only
      const rxz = Math.sqrt(1 - h * h) * STAR_DOME_R;
      arr[i * 3] = cx + Math.cos(a) * rxz;
      arr[i * 3 + 1] = h * STAR_DOME_R;
      arr[i * 3 + 2] = cz + Math.sin(a) * rxz;
    }
    return arr;
  }, [cx, cz]);

  useFrame((state) => {
    if (reducedMotion || !tilesRef.current) return;
    const t = state.clock.elapsedTime;
    tilesRef.current.children.forEach((child, i) => {
      const tile = tiles[i];
      if (tile) child.position.y = tile.y + Math.sin(t * 0.4 + tile.phase) * 0.35;
    });
  });

  return (
    <group>
      {/* Hex platform — top face at y=-0.16, just under the ground slab top. */}
      <mesh position={[cx, -0.16 - PLATFORM_H / 2, cz]} receiveShadow>
        <cylinderGeometry args={[R, R, PLATFORM_H, 6]} />
        <meshStandardMaterial color="#2c3a48" roughness={0.9} flatShading />
      </mesh>

      {/* Teal emissive rim. Cylinder hex corners sit at 30°+k·60°; the laid-
          flat torus's at k·60° — the 30° yaw lines both hexagons up. */}
      <group position={[cx, -0.16, cz]} rotation-y={Math.PI / 6}>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[R, 0.07, 6, 6]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.2} />
        </mesh>
      </group>

      {/* Floating hex tiles — bob out of phase, static under reduced motion. */}
      {tiles.length > 0 && (
        <Instances ref={tilesRef} limit={tiles.length} frustumCulled={false}>
          <cylinderGeometry args={[1, 1, 0.4, 6]} />
          <meshStandardMaterial color="#36465a" roughness={0.85} flatShading />
          {tiles.map((t, i) => (
            <Instance
              key={i}
              position={[t.x, t.y, t.z]}
              scale={[t.rad, 1, t.rad]}
              rotation={[0, t.rotY, 0]}
            />
          ))}
        </Instances>
      )}

      {/* Star dome — fog off so the far stars don't dissolve into it. */}
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffffff"
          size={0.35}
          sizeAttenuation
          fog={false}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
