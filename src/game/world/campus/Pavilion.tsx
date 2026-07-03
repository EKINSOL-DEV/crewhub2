// One plot pavilion (M1 T1): raised slab, corner pillars, beams, four desks.
// Everything procedural toon — robots need somewhere to work, not a palace.
import { toonGradientMap } from "@/game/engine/toon";
import type { Building } from "./buildings";

const SLAB = "#d9c9a3";
const PILLAR = "#a98b6b";
const DESK = "#8b6f52";
const SCREEN = "#3fd1e0";

/** Lighten a `#rrggbb` hex color by adding `amt` to each channel (clamped). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (c: number) => Math.min(255, c + amt);
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
const WALL = lighten(SLAB, 24);

const WALL_HEIGHT = 2.0;
const WALL_THICK = 0.3;
const WALL_INSET = 0.1;
const DOOR_GAP = 2.2;
/** Wall centerline offset in from the raw rect edge (inset + half thickness). */
const WALL_OFFSET = WALL_INSET + WALL_THICK / 2;

type WallAxis = "x" | "z";

/** Split a wall's span into one or two segments, cutting a `gapWidth` hole
 *  centered on `gapCenter` when given; drops any segment that would end up
 *  with zero or negative length. */
function wallSegments(
  from: number,
  to: number,
  gapCenter: number | null,
  gapWidth: number,
): { center: number; length: number }[] {
  if (gapCenter === null) return [{ center: (from + to) / 2, length: to - from }];
  const segments: { center: number; length: number }[] = [];
  const gapLo = gapCenter - gapWidth / 2;
  const gapHi = gapCenter + gapWidth / 2;
  if (gapLo > from) segments.push({ center: (from + gapLo) / 2, length: gapLo - from });
  if (to > gapHi) segments.push({ center: (gapHi + to) / 2, length: to - gapHi });
  return segments;
}

function Wall({
  axis,
  along,
  fixed,
  length,
}: {
  axis: WallAxis;
  along: number;
  fixed: number;
  length: number;
}) {
  const x = axis === "x" ? along : fixed;
  const z = axis === "x" ? fixed : along;
  const width = axis === "x" ? length : WALL_THICK;
  const depth = axis === "x" ? WALL_THICK : length;
  return (
    <mesh position={[x, WALL_HEIGHT / 2, z]} castShadow>
      <boxGeometry args={[width, WALL_HEIGHT, depth]} />
      <meshToonMaterial color={WALL} gradientMap={toonGradientMap()} />
    </mesh>
  );
}

function Desk({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0.14, z]} rotation-y={rot}>
      <mesh position-y={0.55} castShadow>
        <boxGeometry args={[1.5, 0.09, 0.75]} />
        <meshToonMaterial color={DESK} gradientMap={toonGradientMap()} />
      </mesh>
      {[-0.62, 0.62].map((sx) => (
        <mesh key={sx} position={[sx, 0.27, 0]} castShadow>
          <boxGeometry args={[0.09, 0.55, 0.7]} />
          <meshToonMaterial color={DESK} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      <mesh position={[0, 0.86, -0.22]} rotation-x={-0.15} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.06]} />
        <meshToonMaterial color={SCREEN} gradientMap={toonGradientMap()} />
      </mesh>
    </group>
  );
}

export function Pavilion({ building }: { building: Building }) {
  const { rect } = building;
  const px = rect.w / 2 - 0.5;
  const pz = rect.d / 2 - 0.5;

  // Which edge the door sits on: nearest-edge comparison of the door point
  // against the rect's own half-extents (the edge the door was placed on
  // has ~zero residual; the other axis' residual stays positive).
  const doorX = building.door.x - rect.x;
  const doorZ = building.door.z - rect.z;
  const doorOnXEdge = rect.w / 2 - Math.abs(doorX) < rect.d / 2 - Math.abs(doorZ);

  const hw = rect.w / 2;
  const hd = rect.d / 2;
  type Side = "front" | "back" | "left" | "right";
  const doorSide: Side = doorOnXEdge ? (doorX > 0 ? "right" : "left") : doorZ > 0 ? "back" : "front";
  const sides: { side: Side; axis: WallAxis; fixed: number; from: number; to: number; gapCenter: number }[] =
    [
      { side: "front", axis: "x", fixed: -hd + WALL_OFFSET, from: -hw, to: hw, gapCenter: doorX },
      { side: "back", axis: "x", fixed: hd - WALL_OFFSET, from: -hw, to: hw, gapCenter: doorX },
      { side: "left", axis: "z", fixed: -hw + WALL_OFFSET, from: -hd, to: hd, gapCenter: doorZ },
      { side: "right", axis: "z", fixed: hw - WALL_OFFSET, from: -hd, to: hd, gapCenter: doorZ },
    ];
  const walls = sides.flatMap(({ side, axis, fixed, from, to, gapCenter }) =>
    wallSegments(from, to, side === doorSide ? gapCenter : null, DOOR_GAP).map((seg, i) => (
      <Wall key={`${side}-${i}`} axis={axis} along={seg.center} fixed={fixed} length={seg.length} />
    )),
  );

  return (
    <group position={[rect.x, 0, rect.z]}>
      <mesh position-y={0.07} receiveShadow>
        <boxGeometry args={[rect.w, 0.14, rect.d]} />
        <meshToonMaterial color={SLAB} gradientMap={toonGradientMap()} />
      </mesh>
      {[
        [-px, -pz],
        [px, -pz],
        [-px, pz],
        [px, pz],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 1.9, z!]} castShadow>
          <boxGeometry args={[0.35, 3.8, 0.35]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {/* Three open beams instead of a roof — structure without occlusion. */}
      {[-pz, 0, pz].map((z, i) => (
        <mesh key={i} position={[0, 3.85, z]} castShadow>
          <boxGeometry args={[rect.w, 0.18, 0.3]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {walls}
      {building.desks.map((d) => (
        <Desk key={d.id} x={d.x - rect.x} z={d.z - rect.z} rot={d.rot} />
      ))}
    </group>
  );
}
