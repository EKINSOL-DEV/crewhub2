// Game shell (M0): environment-driven sky/fog/lights around the selected
// World, RTS camera, quality-aware canvas. The HUD overlay lands in T12.
import { Suspense, useEffect, useState } from "react";
import { Characters } from "@/game/characters/Characters";
import { ChatWindows } from "@/game/chat/ChatWindows";
import { HireDialog } from "@/game/chat/HireDialog";
import { useGameChats } from "@/game/chat/store";
import { BuildControls } from "@/game/build/BuildControls";
import { BuildPalette } from "@/game/build/BuildPalette";
import { RoomLinkDialog } from "@/game/build/RoomLinkDialog";
import { useBuildMode } from "@/game/build/mode";
import { ProjectsDialog } from "@/game/hud/ProjectsDialog";
import { HqCard } from "@/game/world/campus/HqCard";
import { RoomCard } from "@/game/world/campus/RoomCard";
import { useAudio } from "@/game/audio/sfx";
import { GameCanvas } from "@/game/engine/GameCanvas";
import { Lights } from "@/game/engine/Lights";
import { GameCameraRig } from "@/game/engine/camera/GameCameraRig";
import { Effects } from "@/game/engine/effects/Effects";
import { preloadModels } from "@/game/assets/use-model";
import { useFlavor } from "@/game/flavor/engine";
import { demoCharacters } from "@/game/sim/demo";
import { CAMPUS } from "@/game/world/campus/layout";
import { environmentById } from "@/game/world/environments/registry";
import { useGameEnvironment } from "@/game/world/environments/store";
import { nightSky } from "@/game/world/night";
import { useQuality } from "@/game/engine/quality";
import { FpsProbe } from "@/game/hud/FpsProbe";
import { HudOverlay } from "@/game/hud/HudOverlay";
import type { RtsBounds } from "@/game/engine/camera/rts-camera";
import { WelcomeCard } from "./WelcomeCard";

// Module-level so the fps-driven re-render (1/s) never churns the camera
// rig's listeners (its effect deps include `bounds`).
const CAMERA_BOUNDS: RtsBounds = { half: CAMPUS.half, minDistance: 8, maxDistance: 60 };

// `?demo` mounts six deterministic fake robots instead of live sessions.
// Computed once at module scope — Date.now() is impure and a page reload
// is required to toggle `?demo` anyway, so there's nothing to react to.
const DEMO_MODE = new URLSearchParams(window.location.search).has("demo");
const DEMO_CHARACTERS = DEMO_MODE ? demoCharacters(Date.now()) : undefined;

export default function GameShell() {
  const [fps, setFps] = useState(0);
  const [botCount, setBotCount] = useState(0);
  const [hireOpen, setHireOpen] = useState(false);
  const [hireAgentId, setHireAgentId] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState<{ x: number; z: number; seq: number } | null>(null);
  const envId = useGameEnvironment((s) => s.id);
  const env = environmentById(envId);
  const night = useGameEnvironment((s) => s.night);
  const buildActive = useBuildMode((s) => s.active);
  const buildTool = useBuildMode((s) => s.tool);
  const pendingRoomLink = useBuildMode((s) => s.pendingRoomLink);
  const closeRoomLink = useBuildMode((s) => s.closeRoomLink);
  const roomCard = useBuildMode((s) => s.roomCard);
  const closeRoomCard = useBuildMode((s) => s.closeRoomCard);
  const flavorRuns = useFlavor((s) => s.runs);

  useEffect(() => {
    void useGameEnvironment.getState().init();
    void useQuality.getState().init();
    void useAudio.getState().init();
    preloadModels();
  }, []);

  // HQ's 👥 prop stand / HqCard shortcut route through mode.ts's single-open
  // card slot (M6 T4) rather than a prop-drilled callback — but the hire
  // dialog itself still owns its open/close state locally (it's also
  // reachable from the HUD and character clicks). Derived at render time,
  // not synced via an effect's setState (that pattern cascades an extra
  // render for no benefit here): `hireRequested` just ORs the card-slot
  // request into the same `open`/`onClose` HireDialog already takes.
  const hireRequested = roomCard?.kind === "hire";

  return (
    <div className="relative h-screen w-screen overflow-hidden" data-testid="game-shell">
      <GameCanvas>
        {/* Sky/fog swap instantly on night toggle — no lerp here (the fog
            color at every distance would visibly step). Lights.tsx carries
            the mood: its intensities/colors damp over ~1s, so the swap
            reads as "lights dim" rather than "sky snaps." */}
        <color attach="background" args={[night ? nightSky(env).sky : env.sky]} />
        <fog attach="fog" args={[night ? nightSky(env).fog : env.fog.color, env.fog.near, env.fog.far]} />
        <Lights env={env} />
        <Suspense fallback={null}>
          <env.World />
        </Suspense>
        {/* Own boundary: a suspending nameplate font must never hide the campus. */}
        <Suspense fallback={null}>
          <Characters
            override={DEMO_CHARACTERS}
            onCount={setBotCount}
            onSelect={(k, pos) => {
              // "agent:" keys are resting crew with no session yet — clicking
              // them opens the hire dialog, preselected to that agent.
              if (k.startsWith("agent:")) {
                setHireAgentId(k.slice("agent:".length));
                setHireOpen(true);
              } else {
                useGameChats.getState().open(k);
                setFocus((f) => ({ x: pos.x, z: pos.z, seq: (f?.seq ?? 0) + 1 }));
              }
            }}
          />
        </Suspense>
        <GameCameraRig
          bounds={CAMERA_BOUNDS}
          focus={focus}
          enabled={!buildActive || buildTool.kind === "select"}
        />
        {/* Own boundary: the ghost model's useModel() can suspend on first
            pick, and build mode must never blank the campus underneath it. */}
        {buildActive && (
          <Suspense fallback={null}>
            <BuildControls />
          </Suspense>
        )}
        <Effects />
        <FpsProbe onSample={setFps} />
      </GameCanvas>
      <HudOverlay
        fps={fps}
        bots={botCount}
        runs={flavorRuns}
        onHire={() => {
          setHireAgentId(undefined);
          setHireOpen(true);
        }}
      />
      <ChatWindows />
      {buildActive && <BuildPalette />}
      {pendingRoomLink && <RoomLinkDialog buildingId={pendingRoomLink} onClose={closeRoomLink} />}
      {roomCard?.kind === "plot" || roomCard?.kind === "placed" ? (
        <RoomCard target={roomCard} onClose={closeRoomCard} />
      ) : null}
      {roomCard?.kind === "hq" && <HqCard onClose={closeRoomCard} />}
      {roomCard?.kind === "projects" && <ProjectsDialog onClose={closeRoomCard} />}
      <HireDialog
        open={hireOpen || hireRequested}
        initialAgentId={hireRequested ? undefined : hireAgentId}
        onClose={() => {
          setHireOpen(false);
          if (hireRequested) closeRoomCard();
        }}
      />
      <WelcomeCard />
    </div>
  );
}
