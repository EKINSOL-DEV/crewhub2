// Cross-panel "show me this project's diff" action (M3 T16, EKI-105): git
// strips, session rows and chat all funnel through here — same adoption
// logic as open-chat: focus an existing diff on the project, else adopt an
// unbound diff or welcome leaf, else split the focused leaf.
import { leaves } from "@/app/layout-tree";
import { useWorkspace } from "@/stores/workspace";

export function openDiffPanel(projectPath: string, base?: string): void {
  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (!tab) return; // workspace not loaded yet — nothing sane to do

  const params: Record<string, string> = { projectPath };
  if (base) params.base = base;

  const ls = leaves(tab.root);

  // 1. A diff panel already on this project → focus it (refresh base).
  const existing = ls.find((l) => l.kind === "diff" && l.params?.projectPath === projectPath);
  if (existing) {
    s.setPanelParams(existing.id, { ...existing.params, ...params });
    s.focusLeaf(existing.id);
    return;
  }

  // 2. An unbound diff or a fresh welcome leaf → adopt it.
  const adoptable =
    ls.find((l) => l.kind === "diff" && !l.params?.projectPath) ?? ls.find((l) => l.kind === "welcome");
  if (adoptable) {
    s.replacePanel(adoptable.id, "diff", params);
    s.focusLeaf(adoptable.id);
    return;
  }

  // 3. Otherwise split the focused (or last) leaf into a new diff panel.
  const anchor = ls.find((l) => l.id === s.focusedLeafId) ?? ls[ls.length - 1];
  if (!anchor) return;
  s.split(anchor.id, "row", "diff");
  const focused = useWorkspace.getState().focusedLeafId; // split() focuses the new leaf
  if (focused) s.setPanelParams(focused, params);
}
