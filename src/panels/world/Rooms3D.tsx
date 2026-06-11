// Rooms (EKI-62, Epic 20 beauty pass): softly rounded floor plates (one
// RoundedBox per zone — a dozen static meshes, still trivially cheap) +
// instanced wall segments, all tinted from the active theme's palette, with
// a nameplate per room.
import { Instance, Instances, RoundedBox, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { LOBBY_ID, type WorldZone } from "./lib/layout";
import { WORLD_PALETTE_FALLBACK, type WorldPalette } from "./lib/theme-palette";

const WALL_H = 0.9;
const WALL_T = 0.18;
const FLOOR_T = 0.12;
const FLOOR_R = 0.05; // corner radius — the "soft plate" look

function floorColor(zone: WorldZone, index: number, palette: WorldPalette): string {
  if (zone.id === LOBBY_ID) return palette.lobby;
  if (zone.color) return zone.color;
  if (zone.isHq) return palette.hqFloor;
  return palette.floors[index % palette.floors.length]!;
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
  palette = WORLD_PALETTE_FALLBACK,
  onZoneClick,
}: {
  zones: WorldZone[];
  palette?: WorldPalette | undefined;
  onZoneClick?: ((zone: WorldZone, e: ThreeEvent<MouseEvent>) => void) | undefined;
}) {
  const walls = zones.filter((z) => z.id !== LOBBY_ID).flatMap(wallSegments);

  return (
    <group>
      {/* Floors — rounded plates, one per zone, per-room click. */}
      {zones.map((z, i) => (
        <RoundedBox
          key={z.id}
          args={[z.width, FLOOR_T, z.size]}
          radius={FLOOR_R}
          smoothness={2}
          position={[z.center[0], -FLOOR_T / 2, z.center[1]]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onZoneClick?.(z, e);
          }}
        >
          <meshStandardMaterial color={floorColor(z, i, palette)} roughness={0.9} />
        </RoundedBox>
      ))}

      {/* Walls — one instanced mesh for every segment in the building. */}
      {walls.length > 0 && (
        <Instances limit={walls.length} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={palette.wall} roughness={0.8} />
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
            // Rooms float their name above the task wall (EKI-75); the open
            // lobby keeps its low centered plate.
            z.id === LOBBY_ID ? WALL_H + 0.7 : WALL_H + 1.5,
            z.center[1] - z.size / 2 + (z.id === LOBBY_ID ? z.size / 2 : 0),
          ]}
          fontSize={0.55}
          color={palette.text}
          outlineWidth={0.02}
          outlineColor={palette.textOutline}
          anchorX="center"
          anchorY="middle"
        >
          {z.isHq ? `★ ${z.name}` : z.name}
        </Text>
      ))}
    </group>
  );
}
