// Game shell (M0): environment-driven sky/fog/lights around the selected
// World, RTS camera, quality-aware canvas. The HUD overlay lands in T12.
import { Suspense, useEffect, useState } from "react";
import { Characters } from "@/game/characters/Characters";
import { GameCanvas } from "@/game/engine/GameCanvas";
import { Lights } from "@/game/engine/Lights";
import { GameCameraRig } from "@/game/engine/camera/GameCameraRig";
import { Effects } from "@/game/engine/effects/Effects";
import { preloadModels } from "@/game/assets/use-model";
import { CAMPUS } from "@/game/world/campus/layout";
import { environmentById } from "@/game/world/environments/registry";
import { useGameEnvironment } from "@/game/world/environments/store";
import { useQuality } from "@/game/engine/quality";
import { FpsProbe } from "@/game/hud/FpsProbe";
import { HudOverlay } from "@/game/hud/HudOverlay";
import type { RtsBounds } from "@/game/engine/camera/rts-camera";

// Module-level so the fps-driven re-render (1/s) never churns the camera
// rig's listeners (its effect deps include `bounds`).
const CAMERA_BOUNDS: RtsBounds = { half: CAMPUS.half, minDistance: 8, maxDistance: 60 };

export default function GameShell() {
  const [fps, setFps] = useState(0);
  const envId = useGameEnvironment((s) => s.id);
  const env = environmentById(envId);

  useEffect(() => {
    void useGameEnvironment.getState().init();
    void useQuality.getState().init();
    preloadModels();
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden" data-testid="game-shell">
      <GameCanvas>
        <color attach="background" args={[env.sky]} />
        <fog attach="fog" args={[env.fog.color, env.fog.near, env.fog.far]} />
        <Lights env={env} />
        <Suspense fallback={null}>
          <env.World />
          <Characters />
        </Suspense>
        <GameCameraRig bounds={CAMERA_BOUNDS} />
        <Effects />
        <FpsProbe onSample={setFps} />
      </GameCanvas>
      <HudOverlay fps={fps} />
    </div>
  );
}
