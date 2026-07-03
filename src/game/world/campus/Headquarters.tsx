// The permanent headquarters building (M6 T3): distinct from the plain
// project pavilions — taller walls, a contrasting stone apron, a spawn
// podium at the center (the sim's spawn pad, M6 T2), three prop pads for
// Task 4's interactive furniture, and two entrance banners flanking the
// south corners. Corner posts cap the walls (its roof beams — once an open
// perimeter ring, unlike the pavilions' parallel rafters — were cut on user
// feedback; see the corner-posts comment below), so the interior stays
// visible from above.
//
// Every wall in `building.doors` gets its own gap — Pavilion.tsx only ever
// cuts the primary door (M6 T1's progress note flagged this), and HQ has
// one door per side, so it needs its own wall builder. Deliberately not
// shared with Pavilion.tsx (out of scope for this task): `lighten()` and
// `wallSegments()` below are small, intentional local copies of Pavilion's
// same-named helpers.
import { Suspense } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useModel } from "@/game/assets/use-model";
import { toonGradientMap } from "@/game/engine/toon";
import type { Building } from "./buildings";

const SLAB = "#e6d8b8";
const APRON = "#a9855c";
const PILLAR = "#7c5a3a";
const STEP = "#c7ac7c";
const PODIUM = "#f0e4c4";
const PAD = "#d8c393";

/** Lighten a `#rrggbb` hex color by adding `amt` to each channel (clamped).
 *  A local copy of Pavilion.tsx's helper of the same name — Pavilion.tsx is
 *  out of scope for this task, so its `lighten()` isn't importable. */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (c: number) => Math.min(255, c + amt);
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
const WALL = lighten(SLAB, 20);

const WALL_HEIGHT = 2.6;
const WALL_THICK = 0.3;
const WALL_INSET = 0.1;
const DOOR_GAP = 2.2;
/** Wall centerline offset in from the raw rect edge (inset + half thickness). */
const WALL_OFFSET = WALL_INSET + WALL_THICK / 2;

const PILLAR_SIZE = 0.5;
const PILLAR_HEIGHT = 3.0;
/** Just above the pillar tops, same "+0.05 clearance" convention Pavilion.tsx uses. */

const STEP_WIDTH = 0.6;
const STEP_DEPTH = 0.5;
const STEP_HEIGHT = 0.12;

/** Spawn podium (M6 T2 wires the sim to appear here). */
const PODIUM_RADIUS = 1.6;
const PODIUM_HEIGHT = 0.25;

/**
 * Interior floor markings for Task 4's interactive props — diagonal
 * (NW/NE/SW-quadrant) positions, well clear of the podium's own footprint
 * (r=1.6), the walls (≥1.5 clearance), and EVERY door's walk-in lane
 * (±1.5 either side of that door's centerline). Fix round 1 (M6 T4 carried
 * fix): the original west/north/east positions sat at {-3,0}/{0,-3}/{3,0}
 * — each one dead-center in its own door's walk-in lane (west door's lane
 * is the z≈0 strip, north door's is the x≈0 strip, and so on), so a player
 * walking straight in would collide with the prop stand. Moving off both
 * axes into the quadrants between doors clears every lane at once. South
 * is left propless; that's the primary door's sightline into the building
 * (see buildings.ts' `hqBuilding` comment on why south is the primary
 * face).
 */
export const HQ_PROP_PADS: { x: number; z: number }[] = [
  { x: -3.5, z: -2.5 }, // NW quadrant
  { x: 3.5, z: -2.5 }, // NE quadrant
  { x: -3.5, z: 2.5 }, // SW quadrant
];
const PAD_RADIUS = 0.8;
const PAD_HEIGHT = 0.06;

/**
 * Permanent roof-plate height: pillars top out at PILLAR_HEIGHT (3.0) — `5`
 * floats safely above with clean headroom (the beam ring the old comment
 * referenced was removed on user feedback).
 */
export const HQ_PLATE_Y = 5;

type Side = "front" | "back" | "left" | "right";

/** Which edge a door point sits on: nearest-edge comparison of the door's
 *  residual distance to each axis' half-extent, same logic Pavilion.tsx
 *  uses for its single primary door — applied here to every door in
 *  `building.doors`. */
function classifySide(rect: { w: number; d: number }, dx: number, dz: number): Side {
  const onXEdge = rect.w / 2 - Math.abs(dx) < rect.d / 2 - Math.abs(dz);
  return onXEdge ? (dx > 0 ? "right" : "left") : dz > 0 ? "back" : "front";
}

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
  axis: "x" | "z";
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

/** Two small step meshes flanking a door gap, just outside the wall line —
 *  the entrance's jambs. */
function Steps({
  axis,
  gapCenter,
  fixed,
  outward,
}: {
  axis: "x" | "z";
  gapCenter: number;
  fixed: number;
  /** +1 or -1: which way is "away from the building" along `fixed`'s axis. */
  outward: number;
}) {
  const stepFixed = fixed + outward * (STEP_DEPTH / 2);
  const alongs = [gapCenter - DOOR_GAP / 2 + STEP_WIDTH / 2, gapCenter + DOOR_GAP / 2 - STEP_WIDTH / 2];
  return (
    <>
      {alongs.map((along, i) => {
        const x = axis === "x" ? along : stepFixed;
        const z = axis === "x" ? stepFixed : along;
        const width = axis === "x" ? STEP_WIDTH : STEP_DEPTH;
        const depth = axis === "x" ? STEP_DEPTH : STEP_WIDTH;
        return (
          <mesh key={i} position={[x, STEP_HEIGHT / 2, z]} castShadow>
            <boxGeometry args={[width, STEP_HEIGHT, depth]} />
            <meshToonMaterial color={STEP} gradientMap={toonGradientMap()} />
          </mesh>
        );
      })}
    </>
  );
}

function Banner({ x, z }: { x: number; z: number }) {
  const model = useModel("banner-green");
  return (
    <group position={[x, 0, z]}>
      <primitive object={model} scale={1.5} />
    </group>
  );
}

export function Headquarters({ building }: { building: Building }) {
  const { rect } = building;
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  const px = hw - PILLAR_SIZE;
  const pz = hd - PILLAR_SIZE;

  // Map each door onto the side it was placed on — HQ carries one per wall
  // (buildings.ts' hqBuilding), but this reads generically off
  // `building.doors` rather than assuming all four are always present.
  const gapBySide = new Map<Side, number>();
  for (const d of building.doors ?? [building.door]) {
    const dx = d.x - rect.x;
    const dz = d.z - rect.z;
    const side = classifySide(rect, dx, dz);
    gapBySide.set(side, side === "front" || side === "back" ? dx : dz);
  }

  const sides: {
    side: Side;
    axis: "x" | "z";
    fixed: number;
    from: number;
    to: number;
    outward: number;
  }[] = [
    { side: "front", axis: "x", fixed: -hd + WALL_OFFSET, from: -hw, to: hw, outward: -1 },
    { side: "back", axis: "x", fixed: hd - WALL_OFFSET, from: -hw, to: hw, outward: 1 },
    { side: "left", axis: "z", fixed: -hw + WALL_OFFSET, from: -hd, to: hd, outward: -1 },
    { side: "right", axis: "z", fixed: hw - WALL_OFFSET, from: -hd, to: hd, outward: 1 },
  ];

  const walls = sides.flatMap(({ side, axis, fixed, from, to }) =>
    wallSegments(from, to, gapBySide.get(side) ?? null, DOOR_GAP).map((seg, i) => (
      <Wall key={`${side}-${i}`} axis={axis} along={seg.center} fixed={fixed} length={seg.length} />
    )),
  );

  const steps = sides
    .filter(({ side }) => gapBySide.has(side))
    .map(({ side, axis, fixed, outward }) => (
      <Steps key={side} axis={axis} gapCenter={gapBySide.get(side)!} fixed={fixed} outward={outward} />
    ));

  const corners: [number, number][] = [
    [-px, -pz],
    [px, -pz],
    [-px, pz],
    [px, pz],
  ];

  return (
    <group position={[rect.x, 0, rect.z]}>
      {/* Contrasting apron: wider than the slab but shorter, so its rim
          peeks out around the slab's edge as a border ring. */}
      <mesh position-y={0.04} receiveShadow>
        <boxGeometry args={[rect.w + 0.6, 0.08, rect.d + 0.6]} />
        <meshToonMaterial color={APRON} gradientMap={toonGradientMap()} />
      </mesh>
      <mesh position-y={0.07} receiveShadow>
        <boxGeometry args={[rect.w, 0.14, rect.d]} />
        <meshToonMaterial color={SLAB} gradientMap={toonGradientMap()} />
      </mesh>
      {/* Corner posts capping the walls — the perimeter beam ring was cut on
          user feedback ("die houten balken brengen niets bij"); the posts now
          just crown the wall corners. */}
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, PILLAR_HEIGHT / 2, z]} castShadow>
          <boxGeometry args={[PILLAR_SIZE, PILLAR_HEIGHT, PILLAR_SIZE]} />
          <meshToonMaterial color={PILLAR} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {walls}
      {steps}
      {/* Spawn podium — the sim's spawn pad (M6 T2). */}
      <mesh position-y={PODIUM_HEIGHT / 2 + 0.14} castShadow>
        <cylinderGeometry args={[PODIUM_RADIUS, PODIUM_RADIUS, PODIUM_HEIGHT, 20]} />
        <meshToonMaterial color={PODIUM} gradientMap={toonGradientMap()} />
      </mesh>
      {HQ_PROP_PADS.map((p, i) => (
        <mesh key={i} position={[p.x, PAD_HEIGHT / 2 + 0.14, p.z]} receiveShadow>
          <cylinderGeometry args={[PAD_RADIUS, PAD_RADIUS, PAD_HEIGHT, 16]} />
          <meshToonMaterial color={PAD} gradientMap={toonGradientMap()} />
        </mesh>
      ))}
      {/* Entrance banners flanking the south corners (the primary/default-
          camera-facing side — see hqBuilding's comment in buildings.ts). */}
      <Banner x={px} z={hd + 0.1} />
      <Banner x={-px} z={hd + 0.1} />
    </group>
  );
}

const PLATE_TEXT = "🏛 Headquarters";

/**
 * Permanent roof nameplate. Unlike RoofPlate (M5 T4) this carries no
 * project link — content is fixed. Deliberately a tiny local variant
 * instead of a `label` prop bolted onto RoofPlate (RoofPlate.tsx is out of
 * scope for this task): RoofPlate's whole reason to exist is reading the
 * linked project off useProjectsStore, so threading an optional
 * fixed-text bypass through it would be more coupling than this ~10-line
 * duplicate. Own Suspense boundary, same troika-font lesson as RoofPlate: a
 * still-loading font must never blank the building underneath it. Mounted
 * OUTSIDE CampusWorld's frozen static-matrix group (like RoofPlate) —
 * Billboard recomputes its rotation every frame to face the camera.
 */
export function HeadquartersPlate({ position }: { position: readonly [number, number, number] }) {
  return (
    <Billboard position={position as [number, number, number]}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[2.6, 0.5]} />
        <meshBasicMaterial color="#1f2430" transparent opacity={0.55} />
      </mesh>
      <Suspense fallback={null}>
        <Text fontSize={0.36} color="#f5efe0" anchorX="center" anchorY="middle">
          {PLATE_TEXT}
        </Text>
      </Suspense>
    </Billboard>
  );
}
