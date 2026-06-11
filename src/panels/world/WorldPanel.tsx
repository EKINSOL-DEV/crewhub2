// 3D World panel (EKI-62/71/77): the playfulness core. Lazy-loaded — this
// module (and three.js with it) only ever loads when a world panel opens. The
// frameloop hard-pauses while the panel is occluded or the window is hidden.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import { openBoardPanel } from "@/panels/board/open-board";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import { useTasksStore } from "@/stores/tasks";
import { CameraRig, type CameraMode } from "./CameraRig";
import { toWorldBots, type WorldBot } from "./lib/bots";
import { LOBBY_ID, ROOM_SIZE, layoutWorld, type WorldZone } from "./lib/layout";
import { ImportBlueprintDialog } from "./props/ImportBlueprintDialog";
import { editProp, removeProp, rotateProp, scaleProp } from "./props/placement";
import type { PropsEditApi } from "./props/RoomProps3D";
import { useWorldProps } from "./props/store";
import { summarizeWall, wallScopeFor, type WallSummary } from "./lib/taskwall";
import { BotActionsCard, RoomInfoCard } from "./overlays";
import { useSpeechBubbles } from "./use-speech-bubbles";
import { useWorldTheme } from "./use-world-theme";
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
  }, []);

  const rooms = useBindingsStore((s) => s.rooms);
  const views = useSessionsView();
  const speech = useSpeechBubbles();
  const tasksById = useTasksStore((s) => s.byId);
  const world = useMemo(() => layoutWorld(rooms), [rooms]);
  const bots = useMemo(() => toWorldBots(views), [views]);

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
  const [importZoneId, setImportZoneId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  // Placement editor (EKI-81): E toggles while the world has focus; orbit
  // pauses mid-drag so the floor drag owns the pointer.
  const [editMode, setEditMode] = useState(false);
  const [propDragging, setPropDragging] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
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
          return;
        }
        // E toggles the placement editor (EKI-81), same focus rule.
        if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          toggleEditMode();
          return;
        }
        if (handleEditKey(e.key)) e.preventDefault();
      }}
    >
      <Canvas
        frameloop={frameloop}
        dpr={[1, 1.75]}
        camera={{ position: [0, 16, 22], fov: 45 }}
        // ACES filmic output (Epic 20) — soft highlights, grounded colors.
        gl={{ toneMapping: ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => setWebglFailed(true));
        }}
        onPointerMissed={() => setSelection(null)}
        fallback={null}
      >
        <color attach="background" args={[palette.sky]} />
        <fog attach="fog" args={[palette.fog, 45, 90]} />
        <WorldScene
          world={world}
          bots={bots}
          reducedMotion={reducedMotion}
          speech={speech}
          walls={walls}
          roomProps={roomProps}
          propsEdit={propsEdit}
          palette={palette}
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
        />
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
          onImportBlueprint={() => setImportZoneId(selectedZone.id)}
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
        <button
          type="button"
          className="absolute bottom-2 right-2 rounded bg-black/40 px-2 py-1 text-[10px] text-white/80 hover:bg-black/60"
          onClick={() => {
            containerRef.current?.focus();
            toggleEditMode();
          }}
        >
          {editMode ? "✓ Done editing" : "🛠 Edit props"}
        </button>
      )}
    </div>
  );
}
