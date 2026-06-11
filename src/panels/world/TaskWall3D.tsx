// In-world task wall (EKI-75): one board surface per room mounted over the
// north wall, mirroring that room's kanban columns from the live tasks fold.
// Read-only by design — clicking it opens the real board panel scoped to the
// room (HQ wall → cross-project board). Drag-on-wall is explicitly not a
// thing: the board panel owns mutation, the wall is ambient awareness.
import { useMemo } from "react";
import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { WorldZone } from "./lib/layout";
import { columnSlots, truncateTitle, type WallSummary } from "./lib/taskwall";

const WALL_W_RATIO = 0.74; // board width as a share of the room width
const BOARD_H = 1.15;
const BOARD_Y = 1.05; // center height — sits above the room wall, below the nameplate
const BOARD_T = 0.06;
const COL_GAP = 0.08;
const COL_H = 0.86;
const TITLE_MAX_CHARS = 14;

export interface TaskWall3DProps {
  zone: WorldZone;
  summary: WallSummary;
  /** Theme-aware board backing color (falls back to a neutral slate). */
  backColor?: string | undefined;
  textColor?: string | undefined;
  onClick?: ((zone: WorldZone, e: ThreeEvent<MouseEvent>) => void) | undefined;
}

export function TaskWall3D({ zone, summary, backColor, textColor, onClick }: TaskWall3DProps) {
  const boardW = zone.width * WALL_W_RATIO;
  const slots = useMemo(
    () => columnSlots(boardW * 0.94, summary.columns.length, COL_GAP),
    [boardW, summary.columns.length],
  );

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick?.(zone, e);
  };

  return (
    <group
      // Flush against the inner face of the north wall, floating above it.
      position={[zone.center[0], BOARD_Y, zone.center[1] - zone.size / 2 + 0.13]}
      onClick={handleClick}
    >
      {/* Backboard — the click target for the whole wall (the group handler
          catches clicks on column planes/text via R3F event bubbling). */}
      <mesh onClick={handleClick}>
        <boxGeometry args={[boardW, BOARD_H, BOARD_T]} />
        <meshStandardMaterial color={backColor ?? "#2a2e3a"} roughness={0.85} />
      </mesh>

      {/* Header: HQ walls announce the cross-project view */}
      <Text
        position={[-boardW / 2 + 0.12, BOARD_H / 2 - 0.13, BOARD_T / 2 + 0.005]}
        fontSize={0.12}
        color={textColor ?? "#e7eaf2"}
        anchorX="left"
        anchorY="middle"
      >
        {zone.isHq ? `★ all projects · ${summary.total}` : `tasks · ${summary.total}`}
      </Text>

      {/* Columns: color block + count + top titles */}
      {summary.columns.map((col, i) => {
        const slot = slots[i]!;
        const colTop = BOARD_H / 2 - 0.26;
        return (
          <group key={col.status} position={[slot.x, 0, BOARD_T / 2 + 0.005]}>
            {/* Column color block — height hints fill (min sliver when empty) */}
            <mesh position={[0, colTop - COL_H / 2, -0.002]}>
              <planeGeometry args={[slot.w, COL_H]} />
              <meshBasicMaterial color={col.color} transparent opacity={col.count > 0 ? 0.28 : 0.1} />
            </mesh>
            <mesh position={[0, colTop + 0.02, 0]}>
              <planeGeometry args={[slot.w, 0.05]} />
              <meshBasicMaterial color={col.color} />
            </mesh>
            {/* Count, big and readable */}
            <Text
              position={[0, colTop - 0.16, 0.002]}
              fontSize={0.17}
              color={textColor ?? "#e7eaf2"}
              anchorX="center"
              anchorY="middle"
            >
              {String(col.count)}
            </Text>
            {/* Top task titles — the glanceable bit */}
            {col.titles.map((title, j) => (
              <Text
                key={j}
                position={[0, colTop - 0.36 - j * 0.115, 0.002]}
                fontSize={0.068}
                color={textColor ?? "#e7eaf2"}
                fillOpacity={0.8}
                anchorX="center"
                anchorY="middle"
                maxWidth={slot.w * 0.95}
              >
                {truncateTitle(title, TITLE_MAX_CHARS)}
              </Text>
            ))}
          </group>
        );
      })}
    </group>
  );
}
