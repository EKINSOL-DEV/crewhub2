// All placed props, room by room (EKI-81). Display is dumb: zone center +
// room-local offset → world position, one Prop3D per placement. The lobby
// strip stays unfurnished.
//
// Edit mode (gizmo-lite): pointer-down on a prop selects it and starts a
// floor drag — a transparent catch plane appears under the cursor, every
// move re-raycasts onto y=0 and the prop follows, clamped to its room.
// Rotate/scale/delete are keyboard-driven and live in WorldPanel.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { LOBBY_ID, type WorldZone } from "../lib/layout";
import { WORLD_PALETTE_FALLBACK, type WorldPalette } from "../lib/theme-palette";
import { clampToRoom, type PlacedProp } from "./placement";
import { Prop3D } from "./Prop3D";
import { propColors } from "./registry";

export interface PropSelection {
  roomId: string;
  /** PlacedProp instance id. */
  id: string;
}

export interface PropsEditApi {
  enabled: boolean;
  selected: PropSelection | null;
  onSelect: (sel: PropSelection) => void;
  /** Live drag updates, room-local coordinates (already clamped). */
  onMove: (roomId: string, id: string, x: number, z: number) => void;
  /** Camera lock while dragging. */
  onDraggingChange: (dragging: boolean) => void;
}

export interface RoomProps3DProps {
  zones: WorldZone[];
  /** Room id → placed props (room-local coordinates). */
  byRoom: Record<string, PlacedProp[]>;
  palette?: WorldPalette | undefined;
  reducedMotion?: boolean;
  edit?: PropsEditApi | undefined;
}

export function RoomProps3D({
  zones,
  byRoom,
  palette = WORLD_PALETTE_FALLBACK,
  reducedMotion = false,
  edit,
}: RoomProps3DProps) {
  const colors = useMemo(() => propColors(palette), [palette]);
  const [dragState, setDragState] = useState<PropSelection | null>(null);
  // Leaving edit mode mid-drag cancels it (derived, no effect needed) — the
  // panel resets its camera lock on exit, so nothing stays stuck.
  const dragging = edit?.enabled ? dragState : null;
  const onDraggingChange = edit?.onDraggingChange;

  const endDrag = useCallback(() => {
    setDragState(null);
    onDraggingChange?.(false);
  }, [onDraggingChange]);

  // Pointer-up anywhere ends the drag — the catch plane can't see releases
  // outside the canvas.
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointerup", endDrag);
    return () => window.removeEventListener("pointerup", endDrag);
  }, [dragging, endDrag]);

  const dragZone = dragging ? (zones.find((z) => z.id === dragging.roomId) ?? null) : null;

  const handleDragMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging || !dragZone || !edit) return;
    e.stopPropagation();
    const local = clampToRoom(
      {
        id: dragging.id,
        propId: "",
        x: e.point.x - dragZone.center[0],
        z: e.point.z - dragZone.center[1],
        rot: 0,
        scale: 1,
      },
      { width: dragZone.width, depth: dragZone.size },
    );
    edit.onMove(dragging.roomId, dragging.id, local.x, local.z);
  };

  return (
    <group>
      {zones.map((zone) => {
        if (zone.id === LOBBY_ID) return null;
        const props = byRoom[zone.id];
        if (!props?.length) return null;
        return props.map((p) => (
          <Prop3D
            key={`${zone.id}/${p.id}`}
            placed={p}
            position={[zone.center[0] + p.x, 0, zone.center[1] + p.z]}
            colors={colors}
            reducedMotion={reducedMotion}
            editable={edit?.enabled ?? false}
            selected={edit?.selected?.roomId === zone.id && edit.selected.id === p.id}
            selectionColor={palette.text}
            onPointerDown={(placed, e) => {
              if (!edit?.enabled) return;
              const sel = { roomId: zone.id, id: placed.id };
              edit.onSelect(sel);
              setDragState(sel);
              edit.onDraggingChange(true);
              e.stopPropagation();
            }}
          />
        ));
      })}

      {/* Catch plane — exists only mid-drag, so floor clicks behave normally */}
      {dragging && dragZone && (
        <mesh
          position={[dragZone.center[0], 0.01, dragZone.center[1]]}
          rotation-x={-Math.PI / 2}
          onPointerMove={handleDragMove}
          onPointerUp={endDrag}
        >
          <planeGeometry args={[80, 80]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
