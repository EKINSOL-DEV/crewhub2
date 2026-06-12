// Rooms (EKI-62, Epic 20 → EKI-112 beauty restoration): each room is a
// saturated colored zone, v1-style — toon-shaded walls wear the room color,
// the floor plate a lighter tint of it, rounded corner posts a darker shade.
// HQ goes formal: elevated platform with a cream/charcoal checkerboard, dark
// walls with purple posts and a gold emissive trim. Walls, posts and checker
// tiles are each ONE instanced mesh with per-instance color, so a dozen
// rooms stays trivially cheap.
import { useEffect, useState } from "react";
import { Instance, Instances, RoundedBox, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { LOBBY_ID, type WorldZone } from "./lib/layout";
import { mixHex, shadeHex, WORLD_PALETTE_FALLBACK, type WorldPalette } from "./lib/theme-palette";
import { toonGradientMap } from "./lib/toon";

const WALL_H = 0.9;
const WALL_T = 0.18;
const FLOOR_T = 0.12;
const FLOOR_R = 0.05; // corner radius — the "soft plate" look
const POST_R = WALL_T * 0.8; // corner posts poke just past the wall faces
const POST_H = WALL_H + 0.12; // …and just above the wall tops

// HQ dress code (v1's command-center look).
const HQ_WALL = "#332e4d";
const HQ_POST = "#7c6fe0";
const HQ_GOLD = "#ffd700";
const CHECK_LIGHT = "#f3efe6";
const CHECK_DARK = "#2e2b38";
const CHECK_N = 8; // checker tiles per side
const HQ_TOP = 0.12; // platform top — the "elevated" in elevated platform
const HQ_INSET = 0.25; // platform sits slightly inside the floor plate
const HQ_FRAME_T = 0.1; // gold trim width

/** The room's identity color — walls wear it, floor and posts derive from it. */
function zoneColor(zone: WorldZone, index: number, palette: WorldPalette): string {
  if (zone.id === LOBBY_ID) return palette.lobby;
  if (zone.color) return zone.color;
  if (zone.isHq) return palette.hqFloor;
  return palette.floors[index % palette.floors.length]!;
}

/** Door width in the south wall — v1's opening onto the plaza (EKI-116). */
const DOOR_W = 2.6;

/** Wall segments around a zone footprint: closed north/west/east, the south
 *  wall split around a centered door opening (lobby stays open: no walls). */
function wallSegments(z: WorldZone): { pos: [number, number, number]; scale: [number, number, number] }[] {
  const [cx, cz] = z.center;
  const hw = z.width / 2;
  const hd = z.size / 2;
  const jambW = (z.width - DOOR_W) / 2; // each side of the door
  return [
    { pos: [cx, WALL_H / 2, cz - hd], scale: [z.width + WALL_T, WALL_H, WALL_T] }, // north
    { pos: [cx - (DOOR_W + jambW) / 2, WALL_H / 2, cz + hd], scale: [jambW, WALL_H, WALL_T] }, // south-left
    { pos: [cx + (DOOR_W + jambW) / 2, WALL_H / 2, cz + hd], scale: [jambW, WALL_H, WALL_T] }, // south-right
    { pos: [cx - hw, WALL_H / 2, cz], scale: [WALL_T, WALL_H, z.size + WALL_T] }, // west
    { pos: [cx + hw, WALL_H / 2, cz], scale: [WALL_T, WALL_H, z.size + WALL_T] }, // east
  ];
}

/** Rounded posts: the four wall corners plus the two door jambs. */
function cornerPosts(z: WorldZone): [number, number, number][] {
  const [cx, cz] = z.center;
  const hw = z.width / 2;
  const hd = z.size / 2;
  return [
    [cx - hw, POST_H / 2, cz - hd],
    [cx + hw, POST_H / 2, cz - hd],
    [cx - hw, POST_H / 2, cz + hd],
    [cx + hw, POST_H / 2, cz + hd],
    [cx - DOOR_W / 2, POST_H / 2, cz + hd],
    [cx + DOOR_W / 2, POST_H / 2, cz + hd],
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
  // Hovered floor glows in its room color; the cursor turns into a pointer.
  const [hoverId, setHoverId] = useState<string | null>(null);
  useEffect(
    () => () => {
      document.body.style.cursor = "auto"; // never strand a pointer cursor
    },
    [],
  );

  const gradientMap = toonGradientMap();
  // Resolve every zone's identity color once — walls, posts, floors and the
  // hover glow all derive from this map.
  const resolved = new Map(zones.map((z, i) => [z.id, zoneColor(z, i, palette)]));

  const rooms = zones.filter((z) => z.id !== LOBBY_ID);
  const walls = rooms.flatMap((z) =>
    wallSegments(z).map((seg) => ({ ...seg, color: z.isHq ? HQ_WALL : resolved.get(z.id)! })),
  );
  const posts = rooms.flatMap((z) =>
    cornerPosts(z).map((pos) => ({
      pos,
      color: z.isHq ? HQ_POST : shadeHex(resolved.get(z.id)!, -0.2),
    })),
  );

  // HQ checkerboard — thin square plates covering the platform, alternating
  // cream/charcoal, all in one instanced mesh.
  const hqZones = rooms.filter((z) => z.isHq);
  const checks = hqZones.flatMap((z) => {
    const w = z.width - HQ_INSET * 2;
    const d = z.size - HQ_INSET * 2;
    const tw = w / CHECK_N;
    const td = d / CHECK_N;
    const tiles: { pos: [number, number, number]; scale: [number, number, number]; color: string }[] = [];
    for (let row = 0; row < CHECK_N; row++) {
      for (let col = 0; col < CHECK_N; col++) {
        tiles.push({
          pos: [
            z.center[0] - w / 2 + tw * (col + 0.5),
            HQ_TOP + 0.01,
            z.center[1] - d / 2 + td * (row + 0.5),
          ],
          scale: [tw, 0.02, td],
          color: (row + col) % 2 === 0 ? CHECK_LIGHT : CHECK_DARK,
        });
      }
    }
    return tiles;
  });

  return (
    <group>
      {/* Floors — rounded plates, one per zone, per-room click + hover glow.
          Lobby keeps its plain palette floor; rooms get a lighter tint of
          their identity color. */}
      {zones.map((z) => {
        const res = resolved.get(z.id)!;
        const plate = z.id === LOBBY_ID ? palette.lobby : mixHex(res, "#ffffff", 0.18);
        const hovered = hoverId === z.id;
        return (
          <RoundedBox
            key={z.id}
            args={[z.width, FLOOR_T, z.size]}
            radius={FLOOR_R}
            smoothness={2}
            position={[z.center[0], -FLOOR_T / 2, z.center[1]]}
            receiveShadow
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onZoneClick?.(z, e);
            }}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setHoverId(z.id);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHoverId((cur) => (cur === z.id ? null : cur));
              document.body.style.cursor = "auto";
            }}
          >
            <meshToonMaterial
              color={plate}
              gradientMap={gradientMap}
              emissive={hovered ? res : "#000000"}
              emissiveIntensity={hovered ? 0.18 : 0}
            />
          </RoundedBox>
        );
      })}

      {/* Walls — still one instanced mesh; the material stays white so each
          instance's own color (the room color) comes through unfiltered. */}
      {walls.length > 0 && (
        <Instances limit={walls.length} frustumCulled={false} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial color="#ffffff" gradientMap={gradientMap} />
          {walls.map((w, i) => (
            <Instance key={i} position={w.pos} scale={w.scale} color={w.color} />
          ))}
        </Instances>
      )}

      {/* Corner posts — v1's rounded-post silhouette, one instanced cylinder
          per corner, a darker shade of the room color. */}
      {posts.length > 0 && (
        <Instances limit={posts.length} frustumCulled={false} castShadow>
          <cylinderGeometry args={[POST_R, POST_R, POST_H, 12]} />
          <meshToonMaterial color="#ffffff" gradientMap={gradientMap} />
          {posts.map((p, i) => (
            <Instance key={i} position={p.pos} color={p.color} />
          ))}
        </Instances>
      )}

      {/* HQ platform — the floor plate rises onto a slightly-inset slab whose
          top carries the checkerboard, ringed by a gold emissive trim. */}
      {hqZones.map((z) => {
        const w = z.width - HQ_INSET * 2;
        const d = z.size - HQ_INSET * 2;
        const [cx, cz] = z.center;
        const frameY = HQ_TOP + 0.02;
        return (
          <group key={z.id}>
            <RoundedBox
              args={[w, HQ_TOP + FLOOR_T, d]}
              radius={FLOOR_R}
              smoothness={2}
              position={[cx, (HQ_TOP - FLOOR_T) / 2, cz]}
              castShadow
              receiveShadow
            >
              <meshToonMaterial color={shadeHex(HQ_WALL, -0.25)} gradientMap={gradientMap} />
            </RoundedBox>
            {/* Gold trim — four thin emissive bars along the platform edge. */}
            {(
              [
                { pos: [cx, frameY, cz - d / 2 + HQ_FRAME_T / 2], dims: [w, 0.04, HQ_FRAME_T] },
                { pos: [cx, frameY, cz + d / 2 - HQ_FRAME_T / 2], dims: [w, 0.04, HQ_FRAME_T] },
                {
                  pos: [cx - w / 2 + HQ_FRAME_T / 2, frameY, cz],
                  dims: [HQ_FRAME_T, 0.04, d - HQ_FRAME_T * 2],
                },
                {
                  pos: [cx + w / 2 - HQ_FRAME_T / 2, frameY, cz],
                  dims: [HQ_FRAME_T, 0.04, d - HQ_FRAME_T * 2],
                },
              ] satisfies { pos: [number, number, number]; dims: [number, number, number] }[]
            ).map((bar, i) => (
              <mesh key={i} position={bar.pos}>
                <boxGeometry args={bar.dims} />
                <meshStandardMaterial color={HQ_GOLD} emissive={HQ_GOLD} emissiveIntensity={0.6} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* HQ checkerboard tiles — one instanced mesh for every HQ in the world. */}
      {checks.length > 0 && (
        <Instances limit={checks.length} frustumCulled={false} receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial color="#ffffff" gradientMap={gradientMap} />
          {checks.map((t, i) => (
            <Instance key={i} position={t.pos} scale={t.scale} color={t.color} />
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
