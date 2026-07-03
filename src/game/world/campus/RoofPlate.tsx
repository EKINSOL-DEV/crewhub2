// Roof nameplate (M5 T4): a small in-canvas billboard above a pavilion's
// roof reading the linked project's icon + name, plus a flat color dot —
// renders nothing when the pavilion carries no project link. Subscribes to
// useProjectsStore directly (a plain zustand store, safe to read inside the
// R3F tree) rather than threading the project list down as a prop from
// CampusWorld/PlacedBuildings.
//
// Deliberately not TextBubble (@/game/engine/TextBubble): that component
// paints a white speech-bubble backdrop sized for chat/thought bubbles,
// which reads as "someone is talking" — a nameplate should look like
// signage, not speech. This renders bare slate-dark text floating over the
// roof instead, with its own Suspense boundary per the M1 troika-font
// lesson: a still-loading font must never blank the pavilion underneath it.
import { Suspense } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useProjectsStore } from "@/stores/projects";

const FALLBACK_ICON = "📁";
const TEXT_COLOR = "#1f2430";
const DOT_RADIUS = 0.1;

export function RoofPlate({
  projectId,
  position,
}: {
  projectId: string | null;
  position: readonly [number, number, number];
}) {
  const project = useProjectsStore((s) =>
    projectId ? (s.projects.find((p) => p.id === projectId) ?? null) : null,
  );
  if (!project) return null;

  return (
    <Billboard position={position as [number, number, number]}>
      <mesh position={[-0.3, 0, 0.01]}>
        <circleGeometry args={[DOT_RADIUS, 16]} />
        <meshBasicMaterial color={project.color ?? TEXT_COLOR} />
      </mesh>
      <Suspense fallback={null}>
        <Text fontSize={0.34} color={TEXT_COLOR} anchorX="left" anchorY="middle" position={[-0.14, 0, 0]}>
          {`${project.icon ?? FALLBACK_ICON} ${project.name}`}
        </Text>
      </Suspense>
    </Billboard>
  );
}
