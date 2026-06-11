// Scene content (EKI-62): lights, ground, rooms, bots. Pure render — all data
// arrives as props from WorldPanel; all math lives in lib/.
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Bot3D } from "./Bot3D";
import type { WorldBot } from "./lib/bots";
import type { WorldLayout, WorldZone } from "./lib/layout";
import { LOBBY_ID } from "./lib/layout";
import { assignHomes, roomInnerBounds } from "./lib/positions";
import type { SpeechMap } from "./lib/speech";
import type { WallSummary } from "./lib/taskwall";
import { Rooms3D } from "./Rooms3D";
import { TaskWall3D } from "./TaskWall3D";

export interface WorldSceneProps {
  world: WorldLayout;
  bots: WorldBot[];
  reducedMotion: boolean;
  speech?: SpeechMap | undefined;
  /** Per-zone task wall summaries (EKI-75); zones without one show no wall. */
  walls?: ReadonlyMap<string, WallSummary> | undefined;
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
      <ambientLight intensity={0.65} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-6, 8, -8]} intensity={0.3} color="#aab8ff" />

      {/* Ground slab under everything */}
      <mesh position={[groundX, -0.2, groundZ]}>
        <boxGeometry args={[groundW, 0.1, groundD]} />
        <meshStandardMaterial color="#22252e" roughness={1} />
      </mesh>

      <Rooms3D zones={world.rooms} onZoneClick={onZoneClick} />

      {/* Task walls (EKI-75) — every room mirrors its kanban columns */}
      {world.rooms.map((zone) => {
        if (zone.id === LOBBY_ID) return null;
        const summary = walls?.get(zone.id);
        if (!summary) return null;
        return <TaskWall3D key={zone.id} zone={zone} summary={summary} onClick={onWallClick} />;
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
