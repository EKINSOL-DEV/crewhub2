// Scene content (EKI-62): lights, ground, rooms, bots. Pure render — all data
// arrives as props from WorldPanel; all math lives in lib/.
import { useMemo } from "react";
import { ContactShadows, Grid } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Bot3D } from "./Bot3D";
import type { WorldBot } from "./lib/bots";
import type { WorldLayout, WorldZone } from "./lib/layout";
import { LOBBY_ID } from "./lib/layout";
import { assignHomes, roomInnerBounds } from "./lib/positions";
import type { SpeechMap } from "./lib/speech";
import type { WallSummary } from "./lib/taskwall";
import { WORLD_PALETTE_FALLBACK, type WorldPalette } from "./lib/theme-palette";
import type { PlacedProp } from "./props/placement";
import { RoomProps3D } from "./props/RoomProps3D";
import { Rooms3D } from "./Rooms3D";
import { TaskWall3D } from "./TaskWall3D";

export interface WorldSceneProps {
  world: WorldLayout;
  bots: WorldBot[];
  reducedMotion: boolean;
  speech?: SpeechMap | undefined;
  /** Per-zone task wall summaries (EKI-75); zones without one show no wall. */
  walls?: ReadonlyMap<string, WallSummary> | undefined;
  /** Per-room placed props (EKI-81); rooms absent from the map stay bare. */
  roomProps?: Record<string, PlacedProp[]> | undefined;
  /** Theme-derived colors (Epic 20); defaults to the classic look. */
  palette?: WorldPalette | undefined;
  onBotClick?: ((bot: WorldBot, e: ThreeEvent<MouseEvent>) => void) | undefined;
  onZoneClick?: ((zone: WorldZone, e: ThreeEvent<MouseEvent>) => void) | undefined;
  onWallClick?: ((zone: WorldZone, e: ThreeEvent<MouseEvent>) => void) | undefined;
}

export function WorldScene({
  world,
  bots,
  reducedMotion,
  speech,
  walls,
  roomProps,
  palette = WORLD_PALETTE_FALLBACK,
  onBotClick,
  onZoneClick,
  onWallClick,
}: WorldSceneProps) {
  const homes = useMemo(() => assignHomes(bots, world), [bots, world]);
  const zoneById = useMemo(() => new Map(world.rooms.map((z) => [z.id, z])), [world]);
  const groundW = world.bounds.maxX - world.bounds.minX + 8;
  const groundD = world.bounds.maxZ - world.bounds.minZ + 8;
  const groundX = (world.bounds.minX + world.bounds.maxX) / 2;
  const groundZ = (world.bounds.minZ + world.bounds.maxZ) / 2;

  return (
    <group>
      {/* Soft key + cool fill, leveled for ACES filmic output (Epic 20). */}
      <ambientLight intensity={0.75} />
      <directionalLight position={[8, 14, 6]} intensity={1.7} />
      <directionalLight position={[-6, 8, -8]} intensity={0.5} color="#aab8ff" />

      {/* Ground slab under everything */}
      <mesh position={[groundX, -0.2, groundZ]}>
        <boxGeometry args={[groundW, 0.1, groundD]} />
        <meshStandardMaterial color={palette.ground} roughness={1} />
      </mesh>

      {/* Subtle grid that fades with distance — between the rooms, under the
          floors. One shader plane, no per-cell geometry. */}
      <Grid
        position={[groundX, -0.142, groundZ]}
        args={[groundW, groundD]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={palette.grid}
        sectionSize={6.5}
        sectionThickness={1}
        sectionColor={palette.gridSection}
        fadeDistance={52}
        fadeStrength={1.6}
        followCamera={false}
        infiniteGrid={false}
      />

      {/* Cheap grounding: one blurred shadow catcher for the whole floor. */}
      <ContactShadows
        position={[groundX, 0.02, groundZ]}
        scale={[groundW, groundD]}
        opacity={0.38}
        blur={2.2}
        far={2.5}
        resolution={256}
        frames={reducedMotion ? 1 : Infinity}
      />

      <Rooms3D zones={world.rooms} palette={palette} onZoneClick={onZoneClick} />

      {/* Furniture (EKI-81) — persisted per room, starter set otherwise */}
      {roomProps && (
        <RoomProps3D zones={world.rooms} byRoom={roomProps} palette={palette} reducedMotion={reducedMotion} />
      )}

      {/* Task walls (EKI-75) — every room mirrors its kanban columns */}
      {world.rooms.map((zone) => {
        if (zone.id === LOBBY_ID) return null;
        const summary = walls?.get(zone.id);
        if (!summary) return null;
        return (
          <TaskWall3D
            key={zone.id}
            zone={zone}
            summary={summary}
            backColor={palette.ground}
            textColor={palette.text}
            onClick={onWallClick}
          />
        );
      })}

      {bots.map((bot) => {
        const home = homes.get(bot.key);
        if (!home) return null;
        const zone = zoneById.get(bot.roomId) ?? zoneById.get(LOBBY_ID)!;
        return (
          <Bot3D
            key={bot.key}
            bot={bot}
            home={home}
            bounds={roomInnerBounds(zone)}
            reducedMotion={reducedMotion}
            speech={speech?.[bot.key]?.text ?? null}
            onClick={onBotClick}
          />
        );
      })}
    </group>
  );
}
