// 3D World panel (EKI-62/77): the playfulness core. Lazy-loaded — this module
// (and three.js with it) only ever loads when a world panel opens. The
// frameloop hard-pauses while the panel is occluded or the window is hidden.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import { toWorldBots } from "./lib/bots";
import { layoutWorld } from "./lib/layout";
import { useSpeechBubbles } from "./use-speech-bubbles";
import { useWorldVisibility } from "./use-world-visibility";
import { WorldScene } from "./WorldScene";

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
  const [webglFailed, setWebglFailed] = useState(false);

  // Static scenes (reduced motion) render on demand; hidden panels not at all.
  const frameloop = !visible ? "never" : reducedMotion ? "demand" : "always";

  return (
    <div ref={containerRef} data-testid="world-panel" className="relative h-full w-full min-h-0">
      {webglFailed ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          🌍 The world needs WebGL — it appears to be unavailable here.
        </div>
      ) : (
        <Canvas
          frameloop={frameloop}
          dpr={[1, 1.75]}
          camera={{ position: [0, 16, 22], fov: 45 }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", () => setWebglFailed(true));
          }}
          fallback={null}
        >
          <color attach="background" args={["#15171e"]} />
          <fog attach="fog" args={["#15171e", 45, 90]} />
          <WorldScene world={world} bots={bots} reducedMotion={reducedMotion} speech={speech} />
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={60} />
        </Canvas>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[10px] text-white/70">
        {bots.length} bot{bots.length === 1 ? "" : "s"} · {world.rooms.length - 1} room
        {world.rooms.length === 2 ? "" : "s"}
      </div>
    </div>
  );
}
