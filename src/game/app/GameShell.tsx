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
import { useBuildMode, type CardTarget } from "@/game/build/mode";
import { DossierCard } from "@/game/dossier/DossierCard";
import { ProjectsDialog } from "@/game/hud/ProjectsDialog";
import { HqCard } from "@/game/world/campus/HqCard";
import { RoomCard } from "@/game/world/campus/RoomCard";
import { useAudio } from "@/game/audio/sfx";
import { GameCanvas } from "@/game/engine/GameCanvas";
import { Lights } from "@/game/engine/Lights";
import { GameCameraRig } from "@/game/engine/camera/GameCameraRig";
import { useCameraDirector } from "@/game/engine/camera/director";
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

/**
 * Pure Escape-precedence rule (M8 T2), pulled out of the handler so it's
 * unit-testable without mounting GameShell (which needs a real R3F canvas —
 * see game-shell-escape.test.tsx). `false` at every step of the ladder means
 * "something else already owns this Escape press"; only once every step is
 * clear AND the camera isn't already free does it return `true`.
 */
export function shouldExitCameraOnEscape(
  hasOpenCard: boolean,
  buildActive: boolean,
  cameraFree: boolean,
): boolean {
  return !hasOpenCard && !buildActive && !cameraFree;
}

/**
 * Bot-click composition (M8 T3), pulled out of Characters' onSelect prop for
 * the same testability reason as shouldExitCameraOnEscape above — GameCanvas
 * never mounts under jsdom (no WebGL), so this handler never runs in a
 * rendered GameShell test; game-shell-select.test.tsx exercises it directly
 * instead. followBot() always fires — a clicked robot is always something
 * worth looking at, whether resting crew (agent:-prefixed, no session yet)
 * or a live session — alongside whichever of hire/chat the key routes to,
 * same routing as before this task. Build-mode item-tool clicks never reach
 * here at all (Characters.tsx's own guard suppresses onSelect entirely), so
 * there's no separate build-mode guard to test in this function.
 *
 * No longer takes the bot's click-time position: that used to also drive a
 * one-shot `setFocus` snap on GameCameraRig's now-removed M4-era `focus`
 * prop, dropped in the same fix wave that removed that prop (see
 * GameCameraRig.tsx's file doc comment) — followBot() already frames the
 * bot on entry AND keeps tracking it every frame after, which the old
 * snap-only prop never did, and the two racing corrupted the rig's restore
 * snapshot. Characters' onSelect still passes a position (its own contract,
 * used nowhere else) — the call site below just no longer forwards it.
 *
 * Round 2 reverses M9 T2's "a robot click deliberately does NOT also open
 * its dossier" call: a click now always opens the dossier dock alongside
 * follow (single-open — mode.ts's own `openRoomCard` replaces whatever else
 * was showing). No `deps` parameter anymore either: the "agent:" (resting
 * crew) branch used to force-open the hire dialog directly via locally-owned
 * component state, which — now that the dossier ALSO opens on the same
 * click — would stack two docked GamePanels on top of each other at once.
 * DossierCard already offers an equivalent "👥 Hire" shortcut for an
 * `agent:`-keyed dossier (M9 fix round 1, wired through this same roomCard
 * slot), the same way HqCard's roster rows route a resting-crew click
 * through the dossier rather than straight to hire — so a resting-crew
 * character click now behaves the same way. Live sessions still open their
 * chat window immediately, unchanged — a chat window docks bottom-right, a
 * different slot than the dossier's, so there's no collision to avoid there.
 */
export function selectCharacter(key: string): void {
  useCameraDirector.getState().followBot(key);
  useBuildMode.getState().openRoomCard({ kind: "dossier", key });
  if (!key.startsWith("agent:")) {
    useGameChats.getState().open(key);
  }
}

/**
 * Whether an open card kind is "focus-coupled" (round 2): room/HQ/dossier
 * panels each frame a specific building or bot — the panel and the camera
 * shot are the same idea shown two ways, so they share one lifetime. Closing
 * one of these (✕/Escape/🎥 Exit zoom) also exits camera focus/follow (the
 * `exitAndCloseRoomCard` wrapper below, passed as their `onClose` instead of
 * plain `closeRoomCard`), and exiting the camera some other way (HUD's 🎥✕
 * chip, a pan takeover, a despawned followed bot) also closes whichever of
 * these three is open (the effect below). Projects/hire/room-link never
 * touch the camera at all — opening or closing THEM must never affect
 * whatever shot the player already had going, so they're excluded here and
 * keep using plain `closeRoomCard`/`closeRoomLink`.
 *
 * Kind-based, not causally tracked: a dossier can be open with the camera in
 * any state at all (e.g. HqCard's roster rows open one without ever calling
 * followBot) — this couples on WHAT'S open, not on whether that specific
 * open call is what engaged the camera, which keeps the rule simple and
 * matches the brief.
 */
export function isFocusCoupledCard(kind: CardTarget["kind"] | undefined): boolean {
  return kind === "plot" || kind === "placed" || kind === "hq" || kind === "dossier";
}

export default function GameShell() {
  const [fps, setFps] = useState(0);
  const [botCount, setBotCount] = useState(0);
  const [hireOpen, setHireOpen] = useState(false);
  const [hireAgentId, setHireAgentId] = useState<string | undefined>(undefined);
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
  // Subscribed (not .getState()) — this drives the focus-coupled effect
  // below, which must react to the camera BECOMING free, same reason
  // HudOverlay subscribes for its own 🎥✕ chip's visibility.
  const cameraFree = useCameraDirector((s) => s.mode.kind === "free");

  useEffect(() => {
    void useGameEnvironment.getState().init();
    void useQuality.getState().init();
    void useAudio.getState().init();
    preloadModels();
  }, []);

  // Focus-coupled dock lifetime, direction 2 of 2 (round 2 — direction 1 is
  // `exitAndCloseRoomCard` below, passed as onClose to the three coupled
  // panels): the camera exiting SOME OTHER WAY than one of those panels'
  // own close (the HUD's 🎥✕ chip, a pan takeover, a despawned followed
  // bot) closes whichever of room/HQ/dossier is open, if any — see
  // isFocusCoupledCard's own doc comment for why this is kind-based, not
  // causally tracked. Dep is deliberately just `cameraFree`, not `roomCard`:
  // reading the room card imperatively means opening one of these three
  // while the camera is ALREADY free (HqCard's roster rows never engage it)
  // isn't immediately undone by this same effect — only a fresh
  // free-TRANSITION reacts. No loop with direction 1: by the time THIS
  // effect runs, a panel that closed itself (calling exit() first) has
  // already cleared roomCard, so the imperative read below finds nothing
  // coupled left to close.
  useEffect(() => {
    if (!cameraFree) return;
    if (isFocusCoupledCard(useBuildMode.getState().roomCard?.kind)) {
      closeRoomCard();
    }
  }, [cameraFree, closeRoomCard]);

  // Focus-coupled dock lifetime, direction 1 of 2: closing one of
  // room/HQ/dossier also exits the camera, on the SAME Escape press or
  // click — GameShell's own Escape-precedence effect below can't do this
  // itself (its `roomCard`/`hasOpenCard` closure is stale until the next
  // render, which hasn't happened yet within the same keydown dispatch), so
  // it has to happen inside the panel's own onClose instead, synchronously,
  // before that same press's event finishes dispatching. exit() when
  // already free is a no-op, so this is always safe to call unconditionally.
  const exitAndCloseRoomCard = () => {
    useCameraDirector.getState().exit();
    closeRoomCard();
  };

  // HQ's 👥 prop stand / HqCard shortcut / DossierCard's Hire button (M9 fix
  // round 1, for a resting-crew dossier) all route through mode.ts's
  // single-open card slot (M6 T4) rather than a prop-drilled callback — but
  // the hire dialog itself still owns its open/close state locally (it's
  // also reachable from the HUD and character clicks). Derived at render
  // time, not synced via an effect's setState (that pattern cascades an
  // extra render for no benefit here): `hireRequest` just ORs the card-slot
  // request into the same `open`/`onClose` HireDialog already takes, and
  // its optional `agentId` (present only from a resting-crew dossier's Hire
  // button) preselects the same way a resting-crew character click already
  // does via the local `hireAgentId` state below.
  const hireRequest = roomCard?.kind === "hire" ? roomCard : null;

  // Escape precedence (M8 T2): HqCard, RoomCard, RoomLinkDialog and
  // ProjectsDialog each own their own Escape listener, mounted only while
  // open. HireDialog does NOT (M8 T3 fix: this comment used to claim it
  // did) — its `hasOpenCard` guard below still blocks camera-exit while
  // it's open, so an Escape press while hiring is simply a no-op until the
  // dialog closes some other way (✕/backdrop click). Then the build-mode
  // ladder (BuildControls' own listener, mounted only while build is
  // active) — all of those are independent
  // `window.addEventListener("keydown", ...)` calls that never
  // stopPropagation, so this handler can't literally sit "after" them in a
  // bubble chain. Precedence here means this handler's own guard: it
  // no-ops whenever a card is open or build mode is active, leaving those
  // to react to THIS SAME Escape press, and only exits a focus/follow
  // camera shot once a later press finds both clear.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const hasOpenCard = roomCard !== null || hireOpen || hireRequest !== null;
      const build = useBuildMode.getState();
      const cameraFree = useCameraDirector.getState().mode.kind === "free";
      if (shouldExitCameraOnEscape(hasOpenCard, build.active, cameraFree)) {
        useCameraDirector.getState().exit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [roomCard, hireOpen, hireRequest]);

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
          <Characters override={DEMO_CHARACTERS} onCount={setBotCount} onSelect={selectCharacter} />
        </Suspense>
        <GameCameraRig bounds={CAMERA_BOUNDS} enabled={!buildActive || buildTool.kind === "select"} />
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
        <RoomCard target={roomCard} onClose={exitAndCloseRoomCard} />
      ) : null}
      {roomCard?.kind === "hq" && <HqCard onClose={exitAndCloseRoomCard} />}
      {roomCard?.kind === "projects" && <ProjectsDialog onClose={closeRoomCard} />}
      {roomCard?.kind === "dossier" && (
        <DossierCard key={roomCard.key} dossierKey={roomCard.key} onClose={exitAndCloseRoomCard} />
      )}
      <HireDialog
        open={hireOpen || hireRequest !== null}
        initialAgentId={hireRequest ? hireRequest.agentId : hireAgentId}
        onClose={() => {
          setHireOpen(false);
          if (hireRequest) closeRoomCard();
        }}
      />
      <WelcomeCard />
    </div>
  );
}
