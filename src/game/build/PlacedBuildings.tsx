// Player-built pavilions render (M3 T5): the seeded four campus plots render
// straight off `campusBuildings()` in CampusWorld — this renders the disjoint
// set of *placed* ones (edits.buildings), reusing the same Pavilion the base
// four use (it's parametric off `Building.rect`, not the 14x12 plot size).
// Every placed pavilion also gets a thin colored outline traced along its
// slab edge: the linked project's color (M5 T4 — was the linked room's color
// pre-M5) when `projectId` is set, a neutral gray otherwise; plus a roof
// nameplate (RoofPlate) when linked.
//
// Mounted OUTSIDE CampusWorld's frozen static-matrix subtree (buildings can
// be added/removed at runtime, unlike the terrain/seeded buildings, and a
// linked project can change at any time too — RoofPlate needs to react to
// that); keyed by `${id}-${version}` so a remount always reflects the
// current desk count — cheap, and it matches the convention CampusWorld
// already uses for placed decor's InstancedModel groups.
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useCameraDirector } from "@/game/engine/camera/director";
import { getLiveYaw } from "@/game/engine/camera/live-camera";
import { nearestEdgeDoor, type Building } from "@/game/world/campus/buildings";
import type { Rect } from "@/game/world/campus/layout";
import { Pavilion, WALL_HEIGHT } from "@/game/world/campus/Pavilion";
import { RoofPlate } from "@/game/world/campus/RoofPlate";
import { useProjectsStore } from "@/stores/projects";
import { buildingDesks } from "./edits";
import { useBuildMode } from "./mode";
import { useCampusEdits } from "./store";

const NEUTRAL_EDGE = "#9ca3af";
const EDGE_THICKNESS = 0.2;
const EDGE_HEIGHT = 0.06;
/** Just above the slab's top surface (slab: 0.14 thick, centered at y=0.07). */
const EDGE_Y = 0.145;
/** Roof-nameplate height — matches CampusWorld's convention. Must clear
 *  Pavilion.tsx's corner posts, which peak at y=2.3 (centered at 1.15,
 *  height 2.3) — the roof beams this margin originally cleared (peaking at
 *  y=3.94) are long gone (cut on user feedback), but `+2.5` (4.5) still
 *  comfortably floats above the posts, so the constant stays as-is. */
const PLATE_Y = WALL_HEIGHT + 2.5;

function RoomEdge({ rect, color }: { rect: Rect; color: string }) {
  const t = EDGE_THICKNESS;
  return (
    <group position={[rect.x, EDGE_Y, rect.z]}>
      <mesh position={[0, 0, -rect.d / 2 + t / 2]}>
        <boxGeometry args={[rect.w, EDGE_HEIGHT, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, rect.d / 2 - t / 2]}>
        <boxGeometry args={[rect.w, EDGE_HEIGHT, t]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-rect.w / 2 + t / 2, 0, 0]}>
        <boxGeometry args={[t, EDGE_HEIGHT, rect.d]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[rect.w / 2 - t / 2, 0, 0]}>
        <boxGeometry args={[t, EDGE_HEIGHT, rect.d]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function PlacedBuildings() {
  const buildings = useCampusEdits((s) => s.edits.buildings);
  const version = useCampusEdits((s) => s.version);
  const projects = useProjectsStore((s) => s.projects);
  const openCameraCoupledCard = useBuildMode((s) => s.openCameraCoupledCard);
  const colorByProjectId = useMemo(
    () => new Map(projects.map((p) => [p.id, p.color ?? NEUTRAL_EDGE])),
    [projects],
  );

  // Clicking a placed pavilion outside build mode opens its RoomCard (M5
  // T4); build mode keeps its own select-tool pick proxies (BuildControls),
  // untouched — this handler steps aside whenever build mode is active so
  // the two gestures never collide over the same pavilion. M8 T3: the same
  // click also frames the building with the camera director — same
  // live-yaw seed as CampusWorld's base-pavilion handler.
  // openCameraCoupledCard, not plain openRoomCard (round 3 fix): this same
  // click also frames the camera below, so this card is the one GameShell's
  // mode->free effect is allowed to auto-close later — see mode.ts's
  // `cameraCoupledCard` doc.
  function handlePointerDown(e: ThreeEvent<PointerEvent>, id: string, building: Building) {
    if (e.button !== 0) return;
    if (useBuildMode.getState().active) return;
    e.stopPropagation();
    openCameraCoupledCard({ kind: "placed", id });
    useCameraDirector.getState().focusBuilding(building, getLiveYaw());
  }

  return (
    <group>
      {buildings.map((b) => {
        const rect: Rect = { x: b.x, z: b.z, w: b.w, d: b.d };
        const building: Building = {
          plotIndex: -1,
          rect,
          desks: buildingDesks(b),
          door: nearestEdgeDoor(rect),
        };
        const color = b.projectId ? (colorByProjectId.get(b.projectId) ?? NEUTRAL_EDGE) : NEUTRAL_EDGE;
        return (
          <group key={`${b.id}-${version}`}>
            <group onPointerDown={(e) => handlePointerDown(e, b.id, building)}>
              <Pavilion building={building} />
            </group>
            <RoomEdge rect={rect} color={color} />
            <RoofPlate projectId={b.projectId ?? null} position={[rect.x, PLATE_Y, rect.z]} />
          </group>
        );
      })}
    </group>
  );
}
