// Roof nameplate (M5 T4; restyled in the signage live-fix): a measured
// slate plate above a pavilion's roof reading the linked project's icon +
// name with the project color as an inline dot — renders nothing when the
// pavilion carries no project link. Subscribes to useProjectsStore directly
// (a plain zustand store, safe to read inside the R3F tree) rather than
// threading the project list down as a prop from CampusWorld/PlacedBuildings.
// Signage carries its own measured backdrop and its own Suspense around
// the troika Text (M1 lesson) — the plate/dot render immediately.
import { useProjectsStore } from "@/stores/projects";
import { Signage } from "./Signage";

const FALLBACK_ICON = "📁";

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
    <Signage
      position={position}
      text={`${project.icon ?? FALLBACK_ICON} ${project.name}`}
      dotColor={project.color ?? null}
    />
  );
}
