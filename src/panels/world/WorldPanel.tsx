// 3D World panel (EKI-62/71/77): the playfulness core. Lazy-loaded — this
// module (and three.js with it) only ever loads when a world panel opens. The
// frameloop hard-pauses while the panel is occluded or the window is hidden.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFShadowMap } from "three";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import { openBoardPanel } from "@/panels/board/open-board";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import { useTasksStore } from "@/stores/tasks";
import { CameraRig, type CameraFocus, type CameraMode } from "./CameraRig";
import { environmentById, nextEnvironmentId } from "./environments/registry";
import { useEnvironmentStore } from "./environments/store";
import { applyEnvironment } from "./environments/types";
import { toWorldBots, type WorldBot } from "./lib/bots";
import { LOBBY_ID, ROOM_SIZE, layoutWorld, type WorldZone } from "./lib/layout";
import { attachContextGuard, probeWebgl } from "./lib/webgl-guard";
import { CreatorDialog } from "./props/CreatorDialog";
import { useCustomProps } from "./props/custom";
import { ImportBlueprintDialog } from "./props/ImportBlueprintDialog";
import { editProp, removeProp, rotateProp, scaleProp } from "./props/placement";
import type { PropDefinition } from "./props/registry";
import type { PropsEditApi } from "./props/RoomProps3D";
import { useWorldProps } from "./props/store";
import { summarizeWall, wallScopeFor, type WallSummary } from "./lib/taskwall";
import { BotActionsCard, CrewRestCard, RoomInfoCard } from "./overlays";
import { useSpeechBubbles } from "./use-speech-bubbles";
import { useWorldChats } from "./use-world-chats";
import { useWorldTheme } from "./use-world-theme";
import { WorldChatWindow } from "./WorldChatWindow";
import { useWorldVisibility } from "./use-world-visibility";
import { FpsProbe, WorldHudOverlay, worldDebugEnabled } from "./WorldHud";
import { WorldScene } from "./WorldScene";

type Selection =
  | { kind: "bot"; key: string }
  | { kind: "zone"; id: string }
  | { kind: "prop"; roomId: string; id: string }
  | null;

export default function WorldPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = useWorldVisibility(containerRef);
  const reducedMotion = usePrefersReducedMotion();
  const palette = useWorldTheme();

  useEffect(() => {
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
    void useTasksStore.getState().init();
    void useCustomProps.getState().init();
    void useEnvironmentStore.getState().init();
    void useProjectsStore.getState().load();
  }, []);

  // Environment (EKI-111): biome colors override the theme palette; the
  // `theme` environment keeps the pure theme-derived look.
  const envId = useEnvironmentStore((s) => s.id);
  const environment = useMemo(() => environmentById(envId), [envId]);
  const worldPalette = useMemo(() => applyEnvironment(palette, environment), [palette, environment]);

  const rooms = useBindingsStore((s) => s.rooms);
  const views = useSessionsView();
  const agents = useAgentsStore((s) => s.agents);
  const speech = useSpeechBubbles();
  const tasksById = useTasksStore((s) => s.byId);
  const world = useMemo(() => layoutWorld(rooms), [rooms]);

  // EKI-110: stale sessions leave the world even without new data — re-prune
  // on a slow tick (half the 5-min activity window is plenty of resolution).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hqId = useMemo(() => world.rooms.find((z) => z.isHq)?.id, [world]);
  const bots = useMemo(() => toWorldBots(views, { agents, hqId, nowMs }), [views, agents, hqId, nowMs]);

  // Per-room props (EKI-81): persisted in the settings KV, starter set as the
  // default. Loaded once per room id; renders catch up as each room arrives.
  const roomProps = useWorldProps((s) => s.byRoom);
  useEffect(() => {
    const dims = { width: ROOM_SIZE, depth: ROOM_SIZE };
    for (const room of rooms) void useWorldProps.getState().ensureLoaded(room.id, dims);
  }, [rooms]);

  // Task walls (EKI-75): live mirror of the board fold — TaskChanged
  // reconciliations land in the store, this memo re-folds, the wall updates.
  const walls = useMemo(() => {
    const tasks = [...tasksById.values()];
    const byZone = new Map<string, WallSummary>();
    for (const zone of world.rooms) {
      if (zone.id === LOBBY_ID) continue;
      byZone.set(zone.id, summarizeWall(tasks, wallScopeFor(zone)));
    }
    return byZone;
  }, [tasksById, world]);

  const [selection, setSelection] = useState<Selection>(null);
  // Floating chats (EKI-118/119): independent of the selection, several at
  // once messenger-style, held in a module store so open conversations
  // survive view switches and panel remounts.
  const chats = useWorldChats((s) => s.chats);
  const openChat = useWorldChats((s) => s.open);
  const [importZoneId, setImportZoneId] = useState<string | null>(null);
  const [creatorZoneId, setCreatorZoneId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  // Placement editor (EKI-81): E toggles while the world has focus; orbit
  // pauses mid-drag so the floor drag owns the pointer.
  const [editMode, setEditMode] = useState(false);
  const [propDragging, setPropDragging] = useState(false);
  // True unavailability is probed once (probe context released — they're a
  // scarce budget). Later context-lost events go through the grace-period
  // guard: StrictMode's twin disposal and WebKit's budget reclaims fire
  // transient losses on the LIVE canvas element that three.js restores by
  // itself — failing eagerly here unmounted the canvas and made every
  // transient loss look like "no WebGL" (seen in dev, a few seconds in).
  const [webglFailed, setWebglFailed] = useState(() => !probeWebgl());
  const activeCanvas = useRef<HTMLCanvasElement | null>(null);
  const detachGuard = useRef<(() => void) | null>(null);
  // Self-revival (EKI-120): a verified persistent loss first gets automatic
  // remounts (fresh canvas element → fresh context) before the "wake the
  // world" card ever appears — nobody should click that on a normal launch.
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const revives = useRef(0);
  const handleVerdict = (failed: boolean) => {
    if (!failed) {
      setWebglFailed(false);
      revives.current = 0;
      return;
    }
    if (revives.current < 2) {
      revives.current += 1;
      setCanvasEpoch((e) => e + 1);
    } else {
      setWebglFailed(true);
    }
  };
  const debug = useMemo(() => worldDebugEnabled(), []);
  const [fps, setFps] = useState(0);

  // Selections store keys, not objects — the cards always render live data.
  const selectedBot: WorldBot | null =
    selection?.kind === "bot" ? (bots.find((b) => b.key === selection.key) ?? null) : null;
  const selectedZone: WorldZone | null =
    selection?.kind === "zone" ? (world.rooms.find((z) => z.id === selection.id) ?? null) : null;
  const importZone: WorldZone | null = importZoneId
    ? (world.rooms.find((z) => z.id === importZoneId) ?? null)
    : null;
  const creatorZone: WorldZone | null = creatorZoneId
    ? (world.rooms.find((z) => z.id === creatorZoneId) ?? null)
    : null;

  // Camera focus (EKI-116): a selected room frames it; a selected bot is
  // followed while it wanders. The lobby is wide — frame on its long edge.
  const cameraFocus = useMemo<CameraFocus | null>(() => {
    if (selection?.kind === "bot") return { kind: "bot", key: selection.key };
    if (selection?.kind === "zone") {
      const z = world.rooms.find((r) => r.id === selection.id);
      return z ? { kind: "zone", center: z.center, size: Math.max(z.size, z.width * 0.55) } : null;
    }
    return null;
  }, [selection, world]);

  // Creator mode (EKI-83): remember the dreamed definition, drop an instance
  // at the room center, and flip into edit mode so it can be nudged into place.
  const placeCreatorProp = (roomId: string, def: PropDefinition) => {
    useCustomProps.getState().addDef(def);
    const st = useWorldProps.getState();
    st.setRoomProps(roomId, [
      ...(st.byRoom[roomId] ?? []),
      { id: `c-${Date.now().toString(36)}`, propId: def.id, x: 0, z: 0, rot: 0, scale: 1 },
    ]);
    setEditMode(true);
  };

  const toggleEditMode = () => {
    setEditMode((on) => {
      if (on) {
        setSelection((s) => (s?.kind === "prop" ? null : s));
        setPropDragging(false);
      }
      return !on;
    });
  };

  const propsEdit = useMemo<PropsEditApi | undefined>(() => {
    if (!editMode) return undefined;
    return {
      enabled: true,
      selected: selection?.kind === "prop" ? { roomId: selection.roomId, id: selection.id } : null,
      onSelect: (sel) => setSelection({ kind: "prop", ...sel }),
      onMove: (roomId, id, x, z) => {
        const st = useWorldProps.getState();
        const props = st.byRoom[roomId];
        if (props)
          st.setRoomProps(
            roomId,
            editProp(props, id, (p) => ({ ...p, x, z })),
          );
      },
      onDraggingChange: setPropDragging,
    };
  }, [editMode, selection]);

  /** Keyboard half of the gizmo-lite editor; true = the key was handled. */
  const handleEditKey = (key: string): boolean => {
    if (!editMode) return false;
    if (key === "Escape") {
      if (selection?.kind === "prop") setSelection(null);
      else toggleEditMode();
      return true;
    }
    if (selection?.kind !== "prop") return false;
    const { roomId, id } = selection;
    const st = useWorldProps.getState();
    const props = st.byRoom[roomId];
    if (!props) return false;
    switch (key) {
      case "[":
        st.setRoomProps(
          roomId,
          editProp(props, id, (p) => rotateProp(p, -1)),
        );
        return true;
      case "]":
        st.setRoomProps(
          roomId,
          editProp(props, id, (p) => rotateProp(p, 1)),
        );
        return true;
      case "+":
      case "=":
        st.setRoomProps(
          roomId,
          editProp(props, id, (p) => scaleProp(p, 1)),
        );
        return true;
      case "-":
      case "_":
        st.setRoomProps(
          roomId,
          editProp(props, id, (p) => scaleProp(p, -1)),
        );
        return true;
      case "Delete":
      case "Backspace":
        st.setRoomProps(roomId, removeProp(props, id));
        setSelection(null);
        return true;
      default:
        return false;
    }
  };

  // Static scenes (reduced motion) render on demand; hidden panels not at all.
  const frameloop = !visible ? "never" : reducedMotion ? "demand" : "always";

  if (webglFailed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <p>🌍 The world lost its WebGL spark — it appears to be unavailable here.</p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            // Fresh start: new canvas element, new revive budget.
            revives.current = 0;
            setCanvasEpoch((e) => e + 1);
            setWebglFailed(false);
          }}
        >
          ✨ Wake the world again
        </Button>
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
          return;
        }
        // E toggles the placement editor (EKI-81), same focus rule.
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          toggleEditMode();
          return;
        }
        if (handleEditKey(e.key)) e.preventDefault();
        // Esc outside edit mode: deselect → the camera flies back to overview.
        if (!editMode && e.key === "Escape" && selection) {
          setSelection(null);
          e.preventDefault();
        }
      }}
    >
      <Canvas
        key={canvasEpoch}
        frameloop={frameloop}
        dpr={[1, 1.75]}
        // PCFSoft is deprecated in this three release — plain PCF, no warning.
        shadows={{ type: PCFShadowMap }}
        camera={{ position: [0, 16, 22], fov: 45 }}
        // ACES filmic output (Epic 20) — soft highlights, grounded colors.
        gl={{ toneMapping: ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          activeCanvas.current = gl.domElement;
          setWebglFailed(false);
          // StrictMode's twin disposal force-loses the context the second
          // renderer INHERITS (same canvas → same context object), so every
          // dev launch died into the wake card (EKI-120). A loseContext()-
          // style loss is restorable — ask the browser to bring it back;
          // three reinitializes on `webglcontextrestored`.
          const ctx = gl.getContext();
          if (ctx.isContextLost()) {
            try {
              ctx.getExtension("WEBGL_lose_context")?.restoreContext();
            } catch {
              // not restorable this way — the guard + revive path takes over
            }
          }
          detachGuard.current?.();
          detachGuard.current = attachContextGuard({
            canvas: gl.domElement,
            isActive: () => activeCanvas.current === gl.domElement,
            isLost: () => gl.getContext().isContextLost(),
            onVerdict: handleVerdict,
          });
        }}
        onPointerMissed={() => setSelection(null)}
        fallback={null}
      >
        <color attach="background" args={[worldPalette.sky]} />
        <fog attach="fog" args={[worldPalette.fog, 45, 90]} />
        <WorldScene
          world={world}
          bots={bots}
          reducedMotion={reducedMotion}
          speech={speech}
          walls={walls}
          roomProps={roomProps}
          propsEdit={propsEdit}
          palette={worldPalette}
          environment={environment}
          onBotClick={(bot) => setSelection({ kind: "bot", key: bot.key })}
          onZoneClick={(zone) => setSelection({ kind: "zone", id: zone.id })}
          onWallClick={(zone) =>
            // Wall → the real board, scoped to the room (HQ = cross-project).
            // Empty strings clear stale params on an already-open board.
            openBoardPanel(zone.isHq ? { hq: "1", room: "" } : { hq: "", room: zone.id })
          }
        />
        <CameraRig
          mode={cameraMode}
          bounds={world.bounds}
          onExitFp={() => setCameraMode("orbit")}
          orbitEnabled={!propDragging}
          focus={cameraFocus}
          reducedMotion={reducedMotion}
        />
        {debug && <FpsProbe onSample={setFps} />}
      </Canvas>

      {debug && (
        <WorldHudOverlay fps={fps} bots={bots.length} rooms={world.rooms.length - 1} frameloop={frameloop} />
      )}

      {selectedBot &&
        (selectedBot.agentId ? (
          <CrewRestCard
            bot={selectedBot}
            onClose={() => setSelection(null)}
            // Waking spawns a session bot — follow it and open its chat.
            onSpawned={(key) => {
              setSelection({ kind: "bot", key });
              openChat(key);
            }}
          />
        ) : (
          // Keyed per bot: the activity feed's state must never cross bots.
          <BotActionsCard
            key={selectedBot.key}
            bot={selectedBot}
            onClose={() => setSelection(null)}
            onOpenChat={() => openChat(selectedBot.key)}
          />
        ))}
      {selectedZone && !selectedBot && (
        <RoomInfoCard
          zone={selectedZone}
          bots={bots.filter((b) => b.roomId === selectedZone.id)}
          onClose={() => setSelection(null)}
          onImportBlueprint={() => setImportZoneId(selectedZone.id)}
          onCreateProp={() => setCreatorZoneId(selectedZone.id)}
          onSelectBot={(b) => setSelection({ kind: "bot", key: b.key })}
        />
      )}

      {/* Floating chats (EKI-118/119) — keyed per bot so history never
          crosses; minimized ones line up as bubbles bottom-right. */}
      {(() => {
        let bubbleSlot = 0;
        return chats.map((c, i) => {
          const target = bots.find((b) => b.key === c.key);
          if (!target) return null;
          const bubbleIndex = c.min ? bubbleSlot++ : 0;
          return (
            <WorldChatWindow
              key={c.key}
              bot={target}
              minimized={c.min}
              bubbleIndex={bubbleIndex}
              stagger={i}
              zIndex={20 + i}
              onFocus={() => useWorldChats.getState().raise(c.key)}
              onMinimize={(min) => useWorldChats.getState().setMin(c.key, min)}
              onClose={() => useWorldChats.getState().close(c.key)}
            />
          );
        });
      })()}

      {creatorZone && (
        <CreatorDialog
          zone={creatorZone}
          onPlace={(def) => placeCreatorProp(creatorZone.id, def)}
          onClose={() => setCreatorZoneId(null)}
        />
      )}
      {importZone && (
        <ImportBlueprintDialog
          zone={importZone}
          onApply={(props) => useWorldProps.getState().setRoomProps(importZone.id, props)}
          onClose={() => setImportZoneId(null)}
        />
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[10px] text-white/70">
        {editMode ? (
          selection?.kind === "prop" ? (
            <>drag to move · [ ] rotate · + − scale · del remove · esc deselect</>
          ) : (
            <>click a prop to edit · esc done</>
          )
        ) : (
          <>
            {bots.length} bot{bots.length === 1 ? "" : "s"} · {world.rooms.length - 1} room
            {world.rooms.length === 2 ? "" : "s"} ·{" "}
            {cameraMode === "fp" ? "WASD walk · Esc exit" : "drag to orbit · F to walk"}
          </>
        )}
      </div>

      {cameraMode !== "fp" && (
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button
            type="button"
            className="rounded bg-black/40 px-2 py-1 text-[10px] text-white/80 hover:bg-black/60"
            title="Switch environment"
            onClick={() => useEnvironmentStore.getState().setEnvironment(nextEnvironmentId(environment.id))}
          >
            {environment.emoji} {environment.name}
          </button>
          <button
            type="button"
            className="rounded bg-black/40 px-2 py-1 text-[10px] text-white/80 hover:bg-black/60"
            onClick={() => {
              containerRef.current?.focus();
              toggleEditMode();
            }}
          >
            {editMode ? "✓ Done editing" : "🛠 Edit props"}
          </button>
        </div>
      )}
    </div>
  );
}
