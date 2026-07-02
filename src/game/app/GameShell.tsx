// Game shell (M0 T1): the campus world IS the screen. Lights + placeholder
// atmosphere until the environment-driven shell (T10) takes over.
import { Suspense } from "react";
import { GameCameraRig } from "@/game/engine/camera/GameCameraRig";
import type { RtsBounds } from "@/game/engine/camera/rts-camera";
import { GameCanvas } from "@/game/engine/GameCanvas";
import { CampusWorld } from "@/game/world/campus/CampusWorld";

const CAMERA_BOUNDS: RtsBounds = { half: 40, minDistance: 8, maxDistance: 60 };

export default function GameShell() {
  return (
    <div className="relative h-screen w-screen overflow-hidden" data-testid="game-shell">
      <GameCanvas>
        <GameCameraRig bounds={CAMERA_BOUNDS} />
        <color attach="background" args={["#bfe3f2"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[20, 30, 10]} intensity={1.4} castShadow />
        <Suspense fallback={null}>
          <CampusWorld />
        </Suspense>
      </GameCanvas>
    </div>
  );
}
