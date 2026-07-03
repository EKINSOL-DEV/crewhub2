// Backward-compat leaf for persisted layouts (EKI-121, then M4 T6 — the
// switch): the `world` PanelKind survives so old layout trees still parse,
// but the 3D world it once pointed to is gone — the game shell replaced it
// and IS the main window now. Old world leaves render this signpost instead
// of a second world (there was only ever going to be one).
import { EmptyState } from "@/components/EmptyState";

export default function WorldMovedPanel() {
  return (
    <EmptyState
      emoji="🌍"
      title="The world moved"
      hint="The old 3D office became the campus — it's the main window now, not a panel."
    />
  );
}
