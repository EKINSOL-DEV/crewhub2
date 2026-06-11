// Rooms (EKI-62): instanced floors + wall segments (2 draw calls for the whole
// building) with a nameplate per room. Geometry is unit boxes scaled per
// instance — 8 rooms or 80, same cost shape.
import { Instance, Instances, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { LOBBY_ID, type WorldZone } from "./lib/layout";

const WALL_H = 0.9;
const WALL_T = 0.18;
const FLOOR_T = 0.12;

const FLOOR_FALLBACKS = ["#3b4254", "#41495e", "#374055", "#454058", "#3d4a52"] as const;

function floorColor(zone: WorldZone, index: number): string {
  if (zone.id === LOBBY_ID) return "#2e3340";
  if (zone.color) return zone.color;
  if (zone.isHq) return "#4d4458";
  return FLOOR_FALLBACKS[index % FLOOR_FALLBACKS.length]!;
}

/** The four wall segments around a zone footprint (lobby stays open: no walls). */
function wallSegments(z: WorldZone): { pos: [number, number, number]; scale: [number, number, number] }[] {
  const [cx, cz] = z.center;
  const hw = z.width / 2;
  const hd = z.size / 2;
  return [
    { pos: [cx, WALL_H / 2, cz - hd], scale: [z.width + WALL_T, WALL_H, WALL_T] }, // north
    { pos: [cx, WALL_H / 2, cz + hd], scale: [z.width + WALL_T, WALL_H, WALL_T] }, // south
    { pos: [cx - hw, WALL_H / 2, cz], scale: [WALL_T, WALL_H, z.size + WALL_T] }, // west
    { pos: [cx + hw, WALL_H / 2, cz], scale: [WALL_T, WALL_H, z.size + WALL_T] }, // east
  ];
}

export function Rooms3D({
  zones,
  onZoneClick,
}: {
  zones: WorldZone[];
  onZoneClick?: ((zone: WorldZone, e: ThreeEvent<MouseEvent>) => void) | undefined;
}) {
  const walls = zones.filter((z) => z.id !== LOBBY_ID).flatMap(wallSegments);

  return (
    <group>
      {/* Floors — one instanced mesh; per-room click via per-instance handler. */}
      <Instances limit={Math.max(zones.length, 1)} frustumCulled={false}>
        <boxGeometry args={[1, FLOOR_T, 1]} />
        <meshStandardMaterial roughness={0.9} />
        {zones.map((z, i) => (
          <Instance
            key={z.id}
            color={floorColor(z, i)}
            position={[z.center[0], -FLOOR_T / 2, z.center[1]]}
            scale={[z.width, 1, z.size]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onZoneClick?.(z, e);
            }}
          />
        ))}
      </Instances>

      {/* Walls — one more instanced mesh for every segment in the building. */}
      {walls.length > 0 && (
        <Instances limit={walls.length} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#565e72" roughness={0.8} />
          {walls.map((w, i) => (
            <Instance key={i} position={w.pos} scale={w.scale} />
          ))}
        </Instances>
      )}

      {/* Nameplates — billboard-ish text floating over the north wall. */}
      {zones.map((z) => (
        <Text
          key={z.id}
          position={[
            z.center[0],
            WALL_H + 0.7,
            z.center[1] - z.size / 2 + (z.id === LOBBY_ID ? z.size / 2 : 0),
          ]}
          fontSize={0.55}
          color="#e7eaf2"
          outlineWidth={0.02}
          outlineColor="#1a1d24"
          anchorX="center"
          anchorY="middle"
        >
          {z.isHq ? `★ ${z.name}` : z.name}
        </Text>
      ))}
    </group>
  );
}
