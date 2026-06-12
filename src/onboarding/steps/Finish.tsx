// Wizard finish step (T9, D-M6-2 + D-M6-12 Crew Cheer): confetti, "your crew
// is moving in 📦", and the handoff — the footer's "Enter your workspace"
// seeds a two-panel layout (chat + board) and dissolves the overlay into the
// live shell. Reduced motion: ConfettiBurst renders nothing by itself.
import { leaves } from "@/app/layout-tree";
import { ConfettiBurst } from "@/panels/crew/ConfettiBurst";
import { useOnboarding } from "@/stores/onboarding";
import { useWorkspace } from "@/stores/workspace";

/**
 * Seed the promised "working workspace": the active tab becomes a chat+board
 * split. Best-effort — when the workspace isn't loaded (shouldn't happen
 * behind the overlay) finishing simply lands on whatever is there.
 *
 * Game-HUD shell (EKI-121): finishing lands in the world; the seeded
 * chat+board split waits in the detached panel window for whoever opens it.
 */
export function enterWorkspace(): void {
  const s = useWorkspace.getState();
  const tab = s.activeTab();
  if (!tab) return;
  const first = leaves(tab.root)[0];
  if (!first) return;
  s.replacePanel(first.id, "chat");
  s.split(first.id, "row", "board");
}

export function FinishStep() {
  const sampleCrew = useOnboarding((s) => s.sampleCrew);
  return (
    <div className="relative flex flex-col gap-3">
      <ConfettiBurst count={24} />
      <h2 className="text-lg font-semibold">🎉 All set — your crew is moving in 📦</h2>
      <p className="text-sm text-muted-foreground">
        You'll land in a two-panel workspace: a chat on the left, the board on the right. A few breadcrumbs
        for later:
      </p>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>⌘K opens the command palette — every panel and action lives there</li>
        <li>🌍 the World panel shows your rooms in 3D (your agents wander them)</li>
        <li>⚙️ Settings has everything you skipped — including "Re-run setup wizard"</li>
        {sampleCrew && <li>🧹 done with the sample crew? Delete its project like any other</li>}
      </ul>
    </div>
  );
}
