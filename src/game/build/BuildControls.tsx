// In-canvas build interactions (M3 T4): a ground-pick plane, item ghost
// preview, building rect tool, and select/move/rotate/delete for placed
// decor. Mounted by GameShell only while build mode is active, so every
// effect here (keydown, pointerup) is automatically scoped to the session —
// no `if (!active) return` guards needed inside.
//
// Camera vs. drag: GameCameraRig keeps left-drag panning while the select
// tool is active (`enabled={tool.kind === "select"}` in GameShell), so
// dragging a placed item to move it also pans the camera a little at the
// same time — a known rough edge, deliberately left for the controller's
// visual/feel pass rather than fought here with stopPropagation tricks.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useModel } from "@/game/assets/use-model";
import { CAMPUS, campusLayout, type Rect } from "@/game/world/campus/layout";
import { canPlaceBuilding, canPlaceItem, PLACEABLE_KINDS, snap, type CampusEdits } from "./edits";
import { useBuildMode } from "./mode";
import { useCampusEdits } from "./store";

const VALID_COLOR = new THREE.Color("#22c55e");
const INVALID_COLOR = new THREE.Color("#ef4444");
const RING_COLOR = "#fbbf24";
// Matches store.ts's ROT_STEP (15°/step) — kept in sync by convention, not
// import, since store.ts doesn't export it.
const ROT_STEP = Math.PI / 12;
// Ghost/pick meshes render at full item scale (matches applyEdits' 1.4).
const ITEM_SCALE = 1.4;

type Point = { x: number; z: number };
type Selection = { kind: "item" | "building"; id: string };

function normalizeRect(a: Point, b: Point): Rect {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(b.x - a.x), d: Math.abs(b.z - a.z) };
}

/** `edits` with one placed item removed — used so a dragged item never
 *  collides with its own pre-drag position in the validity check. */
function withoutItem(edits: CampusEdits, id: string): CampusEdits {
  return { ...edits, items: edits.items.filter((i) => i.id !== id) };
}

export function BuildControls() {
  const tool = useBuildMode((s) => s.tool);
  const setTool = useBuildMode((s) => s.setTool);
  const deactivate = useBuildMode((s) => s.deactivate);
  const edits = useCampusEdits((s) => s.edits);
  const addItem = useCampusEdits((s) => s.addItem);
  const moveItem = useCampusEdits((s) => s.moveItem);
  const rotateItem = useCampusEdits((s) => s.rotateItem);
  const removeItem = useCampusEdits((s) => s.removeItem);
  const addBuilding = useCampusEdits((s) => s.addBuilding);
  const removeBuilding = useCampusEdits((s) => s.removeBuilding);

  // Pure and seeded — cheap enough to recompute once per mount. CampusWorld
  // computes its own copy independently; both are the same deterministic
  // value, so there's nothing to share without threading a prop through.
  const layout = useMemo(() => campusLayout(), []);

  // Raw pick state, gated to "select" below — deriving instead of clearing
  // it via a tool-change effect avoids a setState-in-effect cascade; the
  // minor cost is that switching back into select re-shows whatever was
  // last picked, which is harmless (a stale ring at worst).
  const [rawSelection, setSelection] = useState<Selection | null>(null);
  const selection = tool.kind === "select" ? rawSelection : null;

  // Ghost/anchor/drag state is read every frame or every pointer event, not
  // rendered directly — refs, mutated only inside event handlers/effects,
  // never during render.
  const hover = useRef<Point | null>(null);
  const pendingRot = useRef(0);
  const anchor = useRef<Point | null>(null);
  const dragging = useRef(false);

  const ghostGroupRef = useRef<THREE.Group>(null);
  const ghostDiscRef = useRef<THREE.MeshBasicMaterial>(null);
  const buildingPreviewRef = useRef<THREE.Mesh>(null);
  const buildingMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // useModel must be called unconditionally (rules of hooks); fall back to a
  // fixed id when the tool isn't "item" — the ghost group just stays hidden.
  const ghostScene = useModel(tool.kind === "item" ? tool.item : PLACEABLE_KINDS[0]);
  // The kits' toonify() sets castShadow on every mesh — the ghost/pick layer
  // must never cast shadows (M3 T4 constraint), so strip it per-clone here.
  useEffect(() => {
    ghostScene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false;
    });
  }, [ghostScene]);

  // Leaving the building tool cancels a half-drawn anchor — a ref mutation
  // in an effect, not a setState, so no cascading-render lint concern.
  useEffect(() => {
    if (tool.kind !== "building") anchor.current = null;
  }, [tool.kind]);

  // Pointer-up anywhere ends a drag — the ground plane can't see releases
  // that land outside the canvas (same pattern as RoomProps3D's catch plane).
  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // Keyboard: `[`/`]` rotate (pending ghost or a selected item), Delete/
  // Backspace removes the selection, Escape steps back (cancel anchor ->
  // select tool -> deactivate). Depends on `tool`/`selection` so the closure
  // never goes stale; both only change on user clicks/tool switches, not
  // per frame, so re-subscribing here is cheap.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "[" || e.key === "]") {
        const dir = e.key === "]" ? 1 : -1;
        if (tool.kind === "item") {
          pendingRot.current += dir * ROT_STEP;
        } else if (tool.kind === "select" && selection?.kind === "item") {
          rotateItem(selection.id, dir);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (tool.kind === "select" && selection) {
          if (selection.kind === "item") removeItem(selection.id);
          else removeBuilding(selection.id);
          setSelection(null);
        }
        return;
      }
      if (e.key === "Escape") {
        if (tool.kind === "building" && anchor.current) {
          anchor.current = null;
        } else if (tool.kind !== "select") {
          setTool({ kind: "select" });
        } else {
          deactivate();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, selection, setTool, deactivate, removeItem, removeBuilding, rotateItem]);

  useFrame(() => {
    const ghost = ghostGroupRef.current;
    if (ghost) {
      if (tool.kind === "item" && hover.current) {
        ghost.visible = true;
        ghost.position.set(hover.current.x, 0, hover.current.z);
        ghost.rotation.y = pendingRot.current;
        const valid = canPlaceItem(edits, layout, hover.current.x, hover.current.z);
        ghostDiscRef.current?.color.copy(valid ? VALID_COLOR : INVALID_COLOR);
      } else {
        ghost.visible = false;
      }
    }

    const preview = buildingPreviewRef.current;
    if (preview) {
      if (tool.kind === "building" && anchor.current && hover.current) {
        const rect = normalizeRect(anchor.current, hover.current);
        preview.visible = true;
        preview.position.set(rect.x, 0.1, rect.z);
        preview.scale.set(Math.max(rect.w, 0.01), 1, Math.max(rect.d, 0.01));
        const valid = canPlaceBuilding(edits, layout, rect);
        buildingMatRef.current?.color.copy(valid ? VALID_COLOR : INVALID_COLOR);
      } else {
        preview.visible = false;
      }
    }
  });

  function handleGroundMove(e: ThreeEvent<PointerEvent>) {
    const x = snap(e.point.x);
    const z = snap(e.point.z);
    hover.current = { x, z };
    if (tool.kind === "select" && dragging.current && selection?.kind === "item") {
      // Every pointermove sample is a store write + persist() KV call + a
      // remount of all placed InstancedModel groups (CampusWorld keys them
      // by version) — only fire it on an actual grid-cell transition, not
      // every sub-pixel jiggle within the same cell.
      const current = edits.items.find((i) => i.id === selection.id);
      const moved = current && (current.x !== x || current.z !== z);
      if (moved && canPlaceItem(withoutItem(edits, selection.id), layout, x, z)) {
        moveItem(selection.id, x, z);
      }
    }
  }

  function handleGroundDown(e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return;
    const x = snap(e.point.x);
    const z = snap(e.point.z);
    if (tool.kind === "item") {
      if (canPlaceItem(edits, layout, x, z)) addItem(tool.item, x, z, pendingRot.current);
    } else if (tool.kind === "building") {
      if (!anchor.current) {
        anchor.current = { x, z };
      } else {
        const rect = normalizeRect(anchor.current, { x, z });
        if (canPlaceBuilding(edits, layout, rect)) addBuilding(rect, null);
        anchor.current = null;
      }
    } else {
      // Clicking empty ground in the select tool deselects. Clicking a
      // DEFAULT scatter item does nothing in M3 — no pick proxy is rendered
      // for it at all (removedDefaults stays unused, per brief).
      setSelection(null);
    }
  }

  const selectedItem =
    selection?.kind === "item" ? edits.items.find((i) => i.id === selection.id) : undefined;
  const selectedBuilding =
    selection?.kind === "building" ? edits.buildings.find((b) => b.id === selection.id) : undefined;

  return (
    <group>
      {/* Ground-pick plane: R3F's raycaster skips `visible={false}` meshes
          entirely, so a fully transparent, depth-write-off basic material is
          the reliable way to keep it invisible but still hit-testable (same
          trick as RoomProps3D's drag catch plane). */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.01}
        onPointerMove={handleGroundMove}
        onPointerDown={handleGroundDown}
        onPointerOut={() => {
          hover.current = null;
        }}
      >
        <planeGeometry args={[CAMPUS.half * 2, CAMPUS.half * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Item ghost: the real model at full opacity (cloned toon materials
          churn too much to also fade them) plus a flat validity disc — the
          disc communicates green/red, the model shows what you're placing. */}
      <group ref={ghostGroupRef} visible={false} scale={ITEM_SCALE}>
        <primitive object={ghostScene} />
        <mesh rotation-x={-Math.PI / 2} position-y={0.02 / ITEM_SCALE}>
          <circleGeometry args={[0.9 / ITEM_SCALE, 24]} />
          <meshBasicMaterial ref={ghostDiscRef} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>

      {/* Building rect preview — only visible once the first corner is anchored. */}
      <mesh ref={buildingPreviewRef} visible={false}>
        <boxGeometry args={[1, 0.2, 1]} />
        <meshBasicMaterial ref={buildingMatRef} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Select tool: one invisible pick proxy per placed item/building —
          only mounted in the select tool so item/building placement clicks
          never accidentally hit one instead of the ground plane. */}
      {tool.kind === "select" &&
        edits.items.map((item) => (
          <mesh
            key={item.id}
            position={[item.x, 1, item.z]}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              setSelection({ kind: "item", id: item.id });
              dragging.current = true;
            }}
          >
            <cylinderGeometry args={[0.7, 0.7, 2, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      {tool.kind === "select" &&
        edits.buildings.map((b) => (
          <mesh
            key={b.id}
            position={[b.x, 1, b.z]}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              setSelection({ kind: "building", id: b.id });
            }}
          >
            <boxGeometry args={[b.w, 2, b.d]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}

      {/* Selection highlight rings. Buildings can't be moved in M3 — only
          removed (see the header note + Delete/Backspace above). */}
      {selectedItem && (
        <mesh position={[selectedItem.x, 0.05, selectedItem.z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.75, 0.95, 24]} />
          <meshBasicMaterial color={RING_COLOR} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
      {selectedBuilding && (
        <mesh position={[selectedBuilding.x, 0.05, selectedBuilding.z]} rotation-x={-Math.PI / 2}>
          <ringGeometry
            args={[
              Math.max(selectedBuilding.w, selectedBuilding.d) / 2 + 0.3,
              Math.max(selectedBuilding.w, selectedBuilding.d) / 2 + 0.5,
              32,
            ]}
          />
          <meshBasicMaterial color={RING_COLOR} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
