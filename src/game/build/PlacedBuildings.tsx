// Player-built pavilions render (M3 T5): the seeded four campus plots render
// straight off `campusBuildings()` in CampusWorld — this renders the disjoint
// set of *placed* ones (edits.buildings), reusing the same Pavilion the base
// four use (it's parametric off `Building.rect`, not the 14x12 plot size).
// Every placed pavilion also gets a thin colored outline traced along its
// slab edge: the linked room's color when `roomId` is set, a neutral gray
// otherwise — the only visual cue for "what room does this feed into" until
// M4's fuller room UI lands.
//
// Mounted OUTSIDE CampusWorld's frozen static-matrix subtree (buildings can
// be added/removed at runtime, unlike the terrain/seeded buildings); keyed
// by `${id}-${version}` so a remount always reflects the current desk count
// — cheap, and it matches the convention CampusWorld already uses for placed
// decor's InstancedModel groups.
import { useMemo } from "react";
import { useBindingsStore } from "@/stores/bindings";
import { nearestEdgeDoor, type Building } from "@/game/world/campus/buildings";
import type { Rect } from "@/game/world/campus/layout";
import { Pavilion } from "@/game/world/campus/Pavilion";
import { buildingDesks } from "./edits";
import { useCampusEdits } from "./store";

const NEUTRAL_EDGE = "#9ca3af";
const EDGE_THICKNESS = 0.2;
const EDGE_HEIGHT = 0.06;
/** Just above the slab's top surface (slab: 0.14 thick, centered at y=0.07). */
const EDGE_Y = 0.145;

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
  const rooms = useBindingsStore((s) => s.rooms);
  const roomColors = useMemo(() => new Map(rooms.map((r) => [r.id, r.color ?? NEUTRAL_EDGE])), [rooms]);

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
        const color = b.roomId ? (roomColors.get(b.roomId) ?? NEUTRAL_EDGE) : NEUTRAL_EDGE;
        return (
          <group key={`${b.id}-${version}`}>
            <Pavilion building={building} />
            <RoomEdge rect={rect} color={color} />
          </group>
        );
      })}
    </group>
  );
}
