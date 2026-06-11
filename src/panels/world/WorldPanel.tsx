// 3D World panel (EKI-62/71/77): the playfulness core. Lazy-loaded — this
// module (and three.js with it) only ever loads when a world panel opens. The
// frameloop hard-pauses while the panel is occluded or the window is hidden.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import { CameraRig, type CameraMode } from "./CameraRig";
import { toWorldBots, type WorldBot } from "./lib/bots";
import { layoutWorld, type WorldZone } from "./lib/layout";
import { BotActionsCard, RoomInfoCard } from "./overlays";
import { useSpeechBubbles } from "./use-speech-bubbles";
import { useWorldVisibility } from "./use-world-visibility";
import { FpsProbe, WorldHudOverlay, worldDebugEnabled } from "./WorldHud";
import { WorldScene } from "./WorldScene";

type Selection = { kind: "bot"; key: string } | { kind: "zone"; id: string } | null;

export default function WorldPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = useWorldVisibility(containerRef);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
  }, []);

  const rooms = useBindingsStore((s) => s.rooms);
  const views = useSessionsView();
  const speech = useSpeechBubbles();
  const world = useMemo(() => layoutWorld(rooms), [rooms]);
  const bots = useMemo(() => toWorldBots(views), [views]);

  const [selection, setSelection] = useState<Selection>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [webglFailed, setWebglFailed] = useState(false);
  const debug = useMemo(() => worldDebugEnabled(), []);
  const [fps, setFps] = useState(0);

  // Selections store keys, not objects — the cards always render live data.
  const selectedBot: WorldBot | null =
    selection?.kind === "bot" ? (bots.find((b) => b.key === selection.key) ?? null) : null;
  const selectedZone: WorldZone | null =
    selection?.kind === "zone" ? (world.rooms.find((z) => z.id === selection.id) ?? null) : null;

  // Static scenes (reduced motion) render on demand; hidden panels not at all.
  const frameloop = !visible ? "never" : reducedMotion ? "demand" : "always";

  if (webglFailed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        🌍 The world needs WebGL — it appears to be unavailable here.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="world-panel"
      tabIndex={0}
      className="relative h-full w-full min-h-0 outline-none"
      onKeyDown={(e) => {
        // F toggles first-person, only while the world itself has focus —
        // never steal keystrokes from chat composers in sibling panels.
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          setCameraMode((m) => (m === "fp" ? "orbit" : "fp"));
        }
      }}
    >
      <Canvas
        frameloop={frameloop}
        dpr={[1, 1.75]}
        camera={{ position: [0, 16, 22], fov: 45 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => setWebglFailed(true));
        }}
        onPointerMissed={() => setSelection(null)}
        fallback={null}
      >
        <color attach="background" args={["#15171e"]} />
        <fog attach="fog" args={["#15171e", 45, 90]} />
        <WorldScene
          world={world}
          bots={bots}
          reducedMotion={reducedMotion}
          speech={speech}
          onBotClick={(bot) => setSelection({ kind: "bot", key: bot.key })}
          onZoneClick={(zone) => setSelection({ kind: "zone", id: zone.id })}
        />
        <CameraRig mode={cameraMode} bounds={world.bounds} onExitFp={() => setCameraMode("orbit")} />
        {debug && <FpsProbe onSample={setFps} />}
      </Canvas>

      {debug && (
        <WorldHudOverlay fps={fps} bots={bots.length} rooms={world.rooms.length - 1} frameloop={frameloop} />
      )}

      {selectedBot && <BotActionsCard bot={selectedBot} onClose={() => setSelection(null)} />}
      {selectedZone && !selectedBot && (
        <RoomInfoCard
          zone={selectedZone}
          bots={bots.filter((b) => b.roomId === selectedZone.id)}
          onClose={() => setSelection(null)}
        />
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[10px] text-white/70">
        {bots.length} bot{bots.length === 1 ? "" : "s"} · {world.rooms.length - 1} room
        {world.rooms.length === 2 ? "" : "s"} ·{" "}
        {cameraMode === "fp" ? "WASD walk · Esc exit" : "drag to orbit · F to walk"}
      </div>
    </div>
  );
}
