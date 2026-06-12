// Cross-panel "take me to the board" action (T17): the palette's "New task",
// project cards and toast click-throughs funnel through here — same adoption
// logic as open-chat/open-diff: focus an existing board (merging params),
// else adopt a fresh welcome leaf, else split the focused leaf.
import { leaves } from "@/app/layout-tree";
import { isPanelWindow, useOverlays } from "@/app/overlays";
import { useWorkspace } from "@/stores/workspace";

export function openBoardPanel(params?: Record<string, string>): void {
  // Main window: the panel is a drawer over the world (EKI-121).
  if (!isPanelWindow()) {
    useOverlays.getState().open("board", params);
    return;
  }

  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (!tab) return; // workspace not loaded yet — nothing sane to do

  const ls = leaves(tab.root);

  // 1. A board already on screen → focus it (merge any params in).
  const existing = ls.find((l) => l.kind === "board");
  if (existing) {
    if (params) s.setPanelParams(existing.id, { ...existing.params, ...params });
    s.focusLeaf(existing.id);
    return;
  }

  // 2. A fresh welcome leaf → adopt it.
  const adoptable = ls.find((l) => l.kind === "welcome");
  if (adoptable) {
    s.replacePanel(adoptable.id, "board", params);
    s.focusLeaf(adoptable.id);
    return;
  }

  // 3. Otherwise split the focused (or last) leaf into a new board panel.
  const anchor = ls.find((l) => l.id === s.focusedLeafId) ?? ls[ls.length - 1];
  if (!anchor) return;
  s.split(anchor.id, "row", "board");
  const focused = useWorkspace.getState().focusedLeafId; // split() focuses the new leaf
  if (focused && params) s.setPanelParams(focused, params);
}
