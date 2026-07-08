// The Campus environment's World (M0 T9/T10): terrain, paths, nature scatter,
// plaza props. Lights live in GameShell (per-environment rig), not here.
//
// Biomes (M4 T3): Desert/Island/Sky are the same layout repainted and
// re-scattered — see biome.ts. `biome` defaults to campus so every existing
// call site (and test) keeps rendering the original world unchanged.
import { useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import type { ModelId } from "@/game/assets/manifest";
import { placedItemPlacements, type PlaceableKind } from "@/game/build/edits";
import { useBuildMode, type CardTarget } from "@/game/build/mode";
import { PlacedBuildings } from "@/game/build/PlacedBuildings";
import { useCampusEdits } from "@/game/build/store";
import { useCameraDirector } from "@/game/engine/camera/director";
import { getLiveYaw } from "@/game/engine/camera/live-camera";
import { CloudPuffs } from "@/game/world/CloudPuffs";
import { BIOMES, type Biome } from "@/game/world/biome";
import { Fountain } from "./Fountain";
import { Headquarters, HeadquartersPlate, HQ_PLATE_Y } from "./Headquarters";
import { HqProps } from "./HqProps";
import { InstancedModel } from "./InstancedModel";
import { Terrain } from "./Terrain";
import { campusLayout, type ScatterKind } from "./layout";
import { campusBuildings, type Building } from "./buildings";
import { Pavilion, WALL_HEIGHT } from "./Pavilion";
import { RoofPlate } from "./RoofPlate";

/** Placed fountains keep the lantern/bench/hedge decor convention (M3 T4). */
const PLACED_FOUNTAIN_SCALE = 1.4;

/** Roof-nameplate height — matches PlacedBuildings' convention. Must clear
 *  Pavilion.tsx's corner posts, which peak at y=2.3 (centered at 1.15,
 *  height 2.3) — the roof beams this margin originally cleared (peaking at
 *  y=3.94) are long gone (cut on user feedback), but `+2.5` (4.5) still
 *  comfortably floats above the posts, so the constant stays as-is. */
const PLATE_Y = WALL_HEIGHT + 2.5;

const SCATTER_MODEL: Record<ScatterKind, ModelId> = {
  treeDefault: "tree-default",
  treeOak: "tree-oak",
  treeDetailed: "tree-detailed",
  treeFat: "tree-fat",
  treePine: "tree-pine",
  rockLarge: "rock-large",
  rockSmall: "rock-small",
  flowerRed: "flower-red",
  flowerYellow: "flower-yellow",
  flowerPurple: "flower-purple",
  bush: "bush",
  grassTuft: "grass-tuft",
};

/** Plants get the foliage hue fix; rocks keep their honest grey. */
const FOLIAGE: Set<ScatterKind> = new Set([
  "treeDefault",
  "treeOak",
  "treeDetailed",
  "treeFat",
  "treePine",
  "flowerRed",
  "flowerYellow",
  "flowerPurple",
  "bush",
  "grassTuft",
]);

/**
 * Freeze matrix auto-updates for a static subtree (perf loop iter 5): three
 * recomposes local matrices for every auto-update object every frame; the
 * terrain, pavilions and placed decor never move after mount. Runs once,
 * after a final world-matrix sync.
 */
function useStaticMatrices(): React.RefObject<THREE.Group | null> {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      obj.matrixAutoUpdate = false;
    });
    return () => {
      root.traverse((obj) => {
        obj.matrixAutoUpdate = true;
      });
    };
  }, []);
  return ref;
}

export function CampusWorld({ biome = BIOMES.campus }: { biome?: Biome }) {
  const layout = useMemo(() => campusLayout(), []);
  const buildings = useMemo(() => campusBuildings(layout.plots), [layout]);
  const staticRef = useStaticMatrices();
  const skip = biome.skip ?? [];
  const scatterKinds = (Object.keys(SCATTER_MODEL) as ScatterKind[]).filter((k) => !skip.includes(k));

  // Player-placed decor (M3 T4): grouped by kind for InstancedModel, keyed
  // by `versionByKind[kind]` (M4 debt sweep) so a fresh edit remounts only
  // its own kind's group instead of trying to animate its frozen
  // (frames={1}) instance matrices — moving one tree no longer remounts
  // every placed kind's InstancedModel. Kept OUTSIDE the static-matrix
  // group below — these placements change at runtime, so freezing them
  // would just mean re-running useStaticMatrices on every edit; a cheap
  // remount of one kind's meshes is simpler.
  const edits = useCampusEdits((s) => s.edits);
  const versionByKind = useCampusEdits((s) => s.versionByKind);
  // Shared with applyEdits (build/edits.ts) — one item->Placement mapping,
  // including the scale-1.4 convention, so CampusWorld's render pass and
  // applyEdits' merge pass can't drift apart.
  const placedByKind = useMemo(() => placedItemPlacements(edits.items), [edits]);

  const openCameraCoupledCard = useBuildMode((s) => s.openCameraCoupledCard);
  // Clicking a base pavilion outside build mode opens its RoomCard (M5 T4);
  // in build mode this steps aside for BuildControls' own tools (item/
  // building placement, the select-tool proxies over *placed* buildings).
  // HQ (M6, plotIndex -1) gets the same gesture but a different card (M6
  // T4): it isn't a plot and has no project to link, so it opens HqCard
  // instead of RoomCard — see mode.ts's CardTarget union and GameShell's
  // rendering switch. M8 T3: the same click also frames the building with
  // the camera director, seeded with the rig's live yaw (live-camera.ts —
  // the rig's own goal/current state is otherwise private to it) so a
  // multi-door building (HQ) picks whichever door reads angularly closest
  // to however the player is currently looking. openCameraCoupledCard, not
  // plain openRoomCard (round 3 fix): this same click also frames the
  // camera below, so this card is the one GameShell's mode->free effect is
  // allowed to auto-close later — see mode.ts's `cameraCoupledCard` doc.
  function handlePavilionPointerDown(e: ThreeEvent<PointerEvent>, target: CardTarget, building: Building) {
    if (e.button !== 0) return;
    if (useBuildMode.getState().active) return;
    e.stopPropagation();
    openCameraCoupledCard(target);
    useCameraDirector.getState().focusBuilding(building, getLiveYaw());
  }

  return (
    <group>
      {/* Animated residents (clouds) stay auto-updating. The plaza-center
          fountain moved to placed decor (M6) — HQ now stands where it did. */}
      <CloudPuffs count={biome.clouds} />
      <group ref={staticRef}>
        <Terrain grass={biome.grass} apron={biome.apron} path={biome.path} />
        <InstancedModel id="path-stone" placements={layout.pathTiles} />
        {scatterKinds.map((kind) => (
          <InstancedModel
            key={kind}
            id={biome.scatter[kind] ?? SCATTER_MODEL[kind]}
            placements={layout.scatter[kind]}
            // Cyan-band hue shift only touches campus greens/blues; safe for
            // cacti and palms too, so the foliage flag stays keyed on kind.
            foliage={FOLIAGE.has(kind)}
            tilt={kind.startsWith("tree") ? 0.05 : kind === "bush" || kind === "grassTuft" ? 0.09 : 0}
          />
        ))}
        <InstancedModel id="lantern" placements={layout.props.lantern} />
        <InstancedModel id="bench" placements={layout.props.bench} />
        <InstancedModel id="hedge" placements={layout.props.hedge} />
        <InstancedModel id="banner-green" placements={layout.props.banner} />
        {buildings.map((b) => (
          <group
            key={b.plotIndex}
            name={`pavilion-wrapper-${b.plotIndex}`}
            onPointerDown={(e: ThreeEvent<PointerEvent>) =>
              handlePavilionPointerDown(
                e,
                b.kind === "hq" ? { kind: "hq" } : { kind: "plot", plotIndex: b.plotIndex },
                b,
              )
            }
          >
            {b.kind === "hq" ? <Headquarters building={b} /> : <Pavilion building={b} />}
          </group>
        ))}
      </group>
      {/* HQ's interactive prop stands (M9 polish). Deliberately OUTSIDE the
          frozen static-matrix group. Investigated 2026-07-08 (see
          .superpowers/sdd/blackcanvas-findings.md): the "black first render"
          when mounted inside was NOT a three.js/matrix defect but a
          cold-start scheduling race — useStaticMatrices' one big synchronous
          traverse can starve R3F's renderer-constructing effect on a cold
          dev-server first load, and ~32 extra meshes in that traverse
          measurably tipped the odds (~45% black cold vs 0% outside). The
          outside mount stays: strictly cheaper, and it keeps the traverse
          lean. If cold-start robustness ever matters more, chunk that
          traverse across a rAF instead. */}
      <HqProps />
      {/* Placed pavilions (M3 T5): a disjoint set from the seeded four above,
          so no dedup needed — see PlacedBuildings' header for why this stays
          outside the frozen static-matrix group. */}
      <PlacedBuildings />
      {/* "fountain" is excluded here — placed fountains render as live
          <Fountain> components below (animated water disc) instead of
          joining this frozen InstancedModel/Merged group. */}
      {(Object.keys(placedByKind) as PlaceableKind[])
        .filter((kind) => kind !== "fountain")
        .map((kind) => (
          <InstancedModel
            key={`${kind}-${versionByKind[kind] ?? 0}`}
            id={kind}
            placements={placedByKind[kind]!}
          />
        ))}
      {edits.items
        .filter((item) => item.kind === "fountain")
        .map((item) => (
          <Fountain
            key={item.id}
            position={[item.x, 0, item.z]}
            rotationY={item.rot}
            scale={PLACED_FOUNTAIN_SCALE}
          />
        ))}
      {/* Base pavilions' roof nameplates (M5 T4): kept outside the frozen
          static-matrix group above — unlike the terrain/pavilion geometry,
          a plot's project link changes at runtime, and RoofPlate needs to
          react to that. HQ (M6) is excluded — it has no project to name,
          and its plotIndex (-1) isn't a real key into plotProjects; it gets
          its own permanent, project-independent plate instead. */}
      {buildings
        .filter((b) => b.kind !== "hq")
        .map((b) => (
          <RoofPlate
            key={`plate-${b.plotIndex}`}
            projectId={edits.plotProjects[b.plotIndex] ?? null}
            position={[b.rect.x, PLATE_Y, b.rect.z]}
          />
        ))}
      <HeadquartersPlate position={[0, HQ_PLATE_Y, 0]} />
    </group>
  );
}
