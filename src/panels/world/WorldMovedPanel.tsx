// Backward-compat leaf for persisted layouts (world-primary shell): the
// `world` PanelKind survives so old layout trees still parse, but there is
// exactly ONE world now and it lives outside the panels. Old world leaves
// render this friendly signpost instead of a second world.
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useAppView } from "@/stores/appView";

export default function WorldMovedPanel() {
  return (
    <EmptyState
      emoji="🌍"
      title="The world moved"
      hint="There's exactly one world now, and it lives outside the panels — press ⌘1 to visit."
      action={
        <Button
          size="sm"
          variant="outline"
          data-testid="goto-world"
          onClick={() => useAppView.getState().setView("world")}
        >
          🌍 Take me there (⌘1)
        </Button>
      }
    />
  );
}
