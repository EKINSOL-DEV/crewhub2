// HQ's wall-anchored function props (M9 polish round): three procedural toon
// props, each built from primitives and set against an interior wall,
// shaped to evoke its function — a cork notice board (Projects), a
// reception desk (Crew), a workbench (Workspace). Replaces the earlier
// floating lantern-stand + Billboard-icon convention entirely (user
// feedback: "die iconen die er zweven zijn overbodig — gewoon een prop
// tegen de muur die de functie oproept, een prop die past bij de functie").
//
// No Billboard/Text/useModel anywhere in this file anymore — unlike the old
// HqProps, these props need no per-frame rotation, so (unlike
// HeadquartersPlate, which still needs one) they're mounted INSIDE
// CampusWorld's frozen static-matrix group, right alongside <Headquarters>.
// That's safe for the same reason a pavilion-wrapper's onPointerDown still
// fires from inside that frozen subtree: useStaticMatrices bakes
// matrixWorld once before flipping off matrixAutoUpdate, and raycasting
// tests against the (never-stale, since nothing here ever moves) baked
// matrixWorld, not against matrixAutoUpdate.
import type { ThreeEvent } from "@react-three/fiber";
import { openWorkspaceWindow } from "@/game/app/windows";
import { playSfx } from "@/game/audio/sfx";
import { useBuildMode } from "@/game/build/mode";
import { toonGradientMap } from "@/game/engine/toon";
import { HQ_RECT } from "./buildings";

/** The two card-opening props route through mode.ts's single-open card
 *  slot; "workspace" isn't a card at all (it opens a native window), so it
 *  short-circuits before ever touching that store. */
type CardProp = "projects" | "hire";
type PropKind = CardProp | "workspace";

const HW = HQ_RECT.w / 2;
const HD = HQ_RECT.d / 2;
/** How far in from the raw rect edge a prop's anchor sits — clears the wall
 *  (Headquarters.tsx's wall centerline sits at half-extent minus ~0.25, its
 *  own inner face closer still) and the corner posts with room to spare. */
const WALL_INSET = 0.9;

/** Generous invisible click target over each prop's visible geometry (per
 *  spec: ~2.2 wide x 2 tall) — the procedural shapes below are thin and
 *  gappy in places, so raycasting against just their own meshes alone would
 *  miss too easily. */
const HIT_WIDTH = 2.2;
const HIT_HEIGHT = 2;
const HIT_DEPTH = 1;

/** A prop's hit box, oriented by which local axis runs "along the wall" —
 *  north-wall props span x (thin in z), east/west-wall props span z (thin
 *  in x). */
function HitBox({ alongWall, y }: { alongWall: "x" | "z"; y: number }) {
  const args: [number, number, number] =
    alongWall === "x" ? [HIT_WIDTH, HIT_HEIGHT, HIT_DEPTH] : [HIT_DEPTH, HIT_HEIGHT, HIT_WIDTH];
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={args} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** Build mode has its own select/place gestures over the same geometry —
 *  same guard CampusWorld/PlacedBuildings use for pavilion clicks. */
function guardedPointerDown(onActivate: () => void) {
  return (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    if (useBuildMode.getState().active) return;
    e.stopPropagation();
    onActivate();
  };
}

// --- Notice board (Projects), north wall ------------------------------

const NOTICE_X = 4.5; // east of the north door's walk-in lane (|x|<=1.1)
const NOTICE_Z = -HD + WALL_INSET;

/** Five "pinned paper" quads at varied offsets/rotations, each with its own
 *  colored pin dot — deliberately un-aligned, like a real notice board. */
const PAPERS: { dx: number; dy: number; rot: number; color: string }[] = [
  { dx: -0.6, dy: 0.25, rot: -0.08, color: "#e2574c" },
  { dx: -0.18, dy: 0.05, rot: 0.05, color: "#3f8fd1" },
  { dx: 0.2, dy: 0.32, rot: -0.04, color: "#f2c14e" },
  { dx: 0.55, dy: -0.08, rot: 0.07, color: "#5cb85c" },
  { dx: 0.05, dy: -0.32, rot: 0.04, color: "#f2994a" },
];

function NoticeBoard({ onActivate }: { onActivate: () => void }) {
  return (
    <group
      name="hq-prop-projects"
      position={[NOTICE_X, 0, NOTICE_Z]}
      onPointerDown={guardedPointerDown(onActivate)}
    >
      {[-0.7, 0.7].map((x, i) => (
        <mesh key={i} position={[x, 0.8, 0]} castShadow>
          <boxGeometry args={[0.1, 1.6, 0.1]} />
          <meshToonMaterial color="#7c5a3a" gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      <mesh position={[0, 1.5, 0.05]} castShadow>
        <boxGeometry args={[1.8, 1.2, 0.08]} />
        <meshToonMaterial color="#caa06c" gradientMap={toonGradientMap()} />
      </mesh>
      {PAPERS.map((p, i) => (
        <group key={i} position={[p.dx, 1.5 + p.dy, 0.1]} rotation={[0, 0, p.rot]}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.22, 0.02]} />
            <meshToonMaterial color="#f7f2e4" gradientMap={toonGradientMap()} />
          </mesh>
          <mesh position={[0, 0.09, 0.02]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshToonMaterial color={p.color} gradientMap={toonGradientMap()} />
          </mesh>
        </group>
      ))}
      <HitBox alongWall="x" y={1} />
    </group>
  );
}

// --- Reception desk (Crew), east wall ---------------------------------

const RECEPTION_X = HW - WALL_INSET;
const RECEPTION_Z = 3.5; // south of the east door's walk-in lane (|z|<=1.1), toward the entrance

function ReceptionDesk({ onActivate }: { onActivate: () => void }) {
  return (
    <group
      name="hq-prop-hire"
      position={[RECEPTION_X, 0, RECEPTION_Z]}
      onPointerDown={guardedPointerDown(onActivate)}
    >
      {/* Desk slab + its room-facing front panel. */}
      <mesh position={[-0.35, 0.75, 0]} castShadow>
        <boxGeometry args={[0.7, 0.06, 1.6]} />
        <meshToonMaterial color="#b98a5e" gradientMap={toonGradientMap()} />
      </mesh>
      <mesh position={[-0.62, 0.38, 0]} castShadow>
        <boxGeometry args={[0.08, 0.76, 1.5]} />
        <meshToonMaterial color="#8a6640" gradientMap={toonGradientMap()} />
      </mesh>
      {/* A small bell on the counter. */}
      <mesh position={[-0.35, 0.82, 0.35]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.05, 12]} />
        <meshToonMaterial color="#d4af37" gradientMap={toonGradientMap()} />
      </mesh>
      <mesh position={[-0.35, 0.9, 0.35]} castShadow>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshToonMaterial color="#d4af37" gradientMap={toonGradientMap()} />
      </mesh>
      {/* A standing sign board next to the desk. */}
      <mesh position={[-0.5, 0.9, -0.75]} castShadow>
        <boxGeometry args={[0.08, 1.8, 0.08]} />
        <meshToonMaterial color="#7c5a3a" gradientMap={toonGradientMap()} />
      </mesh>
      <mesh position={[-0.5, 1.55, -0.75]} castShadow>
        <boxGeometry args={[0.5, 0.35, 0.06]} />
        <meshToonMaterial color="#3f8fd1" gradientMap={toonGradientMap()} />
      </mesh>
      <HitBox alongWall="z" y={1} />
    </group>
  );
}

// --- Workbench (Workspace), west wall ----------------------------------

const WORKBENCH_X = -HW + WALL_INSET;
const WORKBENCH_Z = -3.5; // north of the west door's walk-in lane (|z|<=1.1)

const LEG_OFFSETS: [number, number][] = [
  [0.06, 0.7],
  [0.64, 0.7],
  [0.06, -0.7],
  [0.64, -0.7],
];

function Workbench({ onActivate }: { onActivate: () => void }) {
  return (
    <group
      name="hq-prop-workspace"
      position={[WORKBENCH_X, 0, WORKBENCH_Z]}
      onPointerDown={guardedPointerDown(onActivate)}
    >
      <mesh position={[0.35, 0.8, 0]} castShadow>
        <boxGeometry args={[0.7, 0.07, 1.6]} />
        <meshToonMaterial color="#8a6640" gradientMap={toonGradientMap()} />
      </mesh>
      {LEG_OFFSETS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.38, z]} castShadow>
          <boxGeometry args={[0.08, 0.76, 0.08]} />
          <meshToonMaterial color="#5c4632" gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {/* Hammer: a cylindrical handle plus a crossways head. */}
      <mesh position={[0.28, 0.87, 0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
        <meshToonMaterial color="#7c5a3a" gradientMap={toonGradientMap()} />
      </mesh>
      <mesh position={[0.53, 0.87, 0.5]} castShadow>
        <boxGeometry args={[0.16, 0.08, 0.08]} />
        <meshToonMaterial color="#8f8f8f" gradientMap={toonGradientMap()} />
      </mesh>
      {/* Wrench: a flat handle plus a perpendicular jaw (an "L" in plan). */}
      <mesh position={[0.3, 0.85, 0]} castShadow>
        <boxGeometry args={[0.32, 0.03, 0.07]} />
        <meshToonMaterial color="#5b6b73" gradientMap={toonGradientMap()} />
      </mesh>
      <mesh position={[0.44, 0.85, 0.08]} castShadow>
        <boxGeometry args={[0.06, 0.03, 0.16]} />
        <meshToonMaterial color="#5b6b73" gradientMap={toonGradientMap()} />
      </mesh>
      {/* Paint can. */}
      <mesh position={[0.35, 0.9, -0.5]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.2, 12]} />
        <meshToonMaterial color="#c0392b" gradientMap={toonGradientMap()} />
      </mesh>
      <HitBox alongWall="z" y={0.85} />
    </group>
  );
}

export function HqProps() {
  const openRoomCard = useBuildMode((s) => s.openRoomCard);

  const activate = (kind: PropKind) => {
    if (kind === "workspace") {
      openWorkspaceWindow();
      playSfx("click");
      return;
    }
    openRoomCard({ kind });
  };

  return (
    <>
      <NoticeBoard onActivate={() => activate("projects")} />
      <ReceptionDesk onActivate={() => activate("hire")} />
      <Workbench onActivate={() => activate("workspace")} />
    </>
  );
}
