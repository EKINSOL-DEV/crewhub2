// HQ's interactive prop stands (M6 T4): three small furniture pieces inside
// the headquarters, one per HQ_PROP_PADS pad — 📋 Projects, 👥 Crew,
// 🧰 Workspace. Mounted OUTSIDE CampusWorld's frozen static-matrix group
// (like RoofPlate/HeadquartersPlate) since each stand's icon plate is a
// Billboard that recomputes its rotation every frame to face the camera;
// freezing matrixAutoUpdate on that subtree would leave it facing whatever
// direction it happened to mount in. HQ_RECT is fixed at the campus origin
// (buildings.ts), so — same convention CampusWorld already uses for
// HeadquartersPlate — the pads' local coordinates double as world
// coordinates without any rect-offset plumbing.
import { Suspense } from "react";
import { Billboard, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { openWorkspaceWindow } from "@/game/app/windows";
import { useModel } from "@/game/assets/use-model";
import { playSfx } from "@/game/audio/sfx";
import { useBuildMode } from "@/game/build/mode";
import { HQ_PROP_PADS } from "./Headquarters";

/** Above the stand's lantern base, low enough to still read as "this
 *  stand's icon" rather than a floating unrelated marker. */
const ICON_Y = 2.2;
const BASE_SCALE = 0.9;

/** The two card-opening props route through mode.ts's single-open card
 *  slot; "workspace" isn't a card at all (it opens a native window), so it
 *  short-circuits before ever touching that store. */
type CardProp = "projects" | "hire";
type PropKind = CardProp | "workspace";

const PROPS: { kind: PropKind; icon: string }[] = [
  { kind: "projects", icon: "📋" },
  { kind: "hire", icon: "👥" },
  { kind: "workspace", icon: "🧰" },
];

function PropStand({
  kind,
  x,
  z,
  icon,
  onActivate,
}: {
  kind: PropKind;
  x: number;
  z: number;
  icon: string;
  onActivate: () => void;
}) {
  const model = useModel("lantern");

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    // Build mode has its own select/place gestures over the same geometry —
    // same guard CampusWorld/PlacedBuildings use for pavilion clicks.
    if (useBuildMode.getState().active) return;
    e.stopPropagation();
    onActivate();
  };

  return (
    <group position={[x, 0, z]} name={`hq-prop-${kind}`} onPointerDown={handlePointerDown}>
      <primitive object={model} scale={BASE_SCALE} />
      <Billboard position={[0, ICON_Y, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshBasicMaterial color="#1f2430" transparent opacity={0.35} />
        </mesh>
        {/* Own boundary, same troika-font lesson as RoofPlate/
            HeadquartersPlate: a still-loading font must never blank the
            stand underneath it. */}
        <Suspense fallback={null}>
          <Text fontSize={0.4} color="#f5efe0" anchorX="center" anchorY="middle">
            {icon}
          </Text>
        </Suspense>
      </Billboard>
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
      {PROPS.map((p, i) => {
        const pad = HQ_PROP_PADS[i]!;
        return (
          <PropStand
            key={p.kind}
            kind={p.kind}
            x={pad.x}
            z={pad.z}
            icon={p.icon}
            onActivate={() => activate(p.kind)}
          />
        );
      })}
    </>
  );
}
