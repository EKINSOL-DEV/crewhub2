// Backward-compat leaf for persisted layouts (EKI-121): the `world` PanelKind
// survives so old layout trees still parse, but there is exactly ONE world
// and it IS the main window now. Old world leaves render this signpost.
import { EmptyState } from "@/components/EmptyState";

export default function WorldMovedPanel() {
  return (
    <EmptyState
      emoji="🌍"
      title="The world moved"
      hint="There's exactly one world and it is the main window now — panels hover over it."
    />
  );
}
