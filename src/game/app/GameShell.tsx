// Game shell (M0 T1): the campus world IS the screen. Placeholder scene
// until the environment system (T7-T10) replaces the inline contents.
import { GameCameraRig } from "@/game/engine/camera/GameCameraRig";
import type { RtsBounds } from "@/game/engine/camera/rts-camera";
import { GameCanvas } from "@/game/engine/GameCanvas";

const CAMERA_BOUNDS: RtsBounds = { half: 40, minDistance: 8, maxDistance: 60 };

export default function GameShell() {
  return (
    <div className="relative h-screen w-screen overflow-hidden" data-testid="game-shell">
      <GameCanvas>
        <GameCameraRig bounds={CAMERA_BOUNDS} />
        <color attach="background" args={["#bfe3f2"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[20, 30, 10]} intensity={1.4} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshToonMaterial color="#7ec850" />
        </mesh>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[2, 2, 2]} />
          <meshToonMaterial color="#f472b6" />
        </mesh>
      </GameCanvas>
    </div>
  );
}
