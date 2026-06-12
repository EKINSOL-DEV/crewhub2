// Cross-panel "take me to automation" action (T13/T15): palette actions and
// Lane G's standup "Schedule this" deep-link funnel through here — same
// adoption logic as open-board: focus an existing automation panel (merging
// params), else adopt a fresh welcome leaf, else split the focused leaf.
import { leaves } from "@/app/layout-tree";
import { isPanelWindow, useOverlays } from "@/app/overlays";
import { useWorkspace } from "@/stores/workspace";

export function openAutomationPanel(params?: Record<string, string>): void {
  // Main window: the panel is a drawer over the world (EKI-121).
  if (!isPanelWindow()) {
    useOverlays.getState().open("automation", params);
    return;
  }

  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (!tab) return; // workspace not loaded yet — nothing sane to do

  const ls = leaves(tab.root);

  const existing = ls.find((l) => l.kind === "automation");
  if (existing) {
    if (params) s.setPanelParams(existing.id, { ...existing.params, ...params });
    s.focusLeaf(existing.id);
    return;
  }

  const adoptable = ls.find((l) => l.kind === "welcome");
  if (adoptable) {
    s.replacePanel(adoptable.id, "automation", params);
    s.focusLeaf(adoptable.id);
    return;
  }

  const anchor = ls.find((l) => l.id === s.focusedLeafId) ?? ls[ls.length - 1];
  if (!anchor) return;
  s.split(anchor.id, "row", "automation");
  const focused = useWorkspace.getState().focusedLeafId; // split() focuses the new leaf
  if (focused && params) s.setPanelParams(focused, params);
}
