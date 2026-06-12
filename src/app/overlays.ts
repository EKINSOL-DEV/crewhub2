// World overlays (EKI-121): the workspace is no longer a place you VISIT —
// every panel renders as a game-HUD drawer over the 3D world. This store is
// the single source for which panel is up; the openers (open-chat/board/
// automation/diff and openPanel) all funnel through here in the main window.
//
// Secondary `?window=…` routes keep the classic workspace tree — panels in
// their own window are a power feature, not a destination.
import { create } from "zustand";
import type { PanelKind } from "./layout-tree";

export interface WorldOverlay {
  kind: PanelKind;
  params: Record<string, string>;
}

interface OverlaysState {
  overlay: WorldOverlay | null;
  /** Open a panel as the world overlay (replaces the current one). */
  open: (kind: PanelKind, params?: Record<string, string>) => void;
  /** Merge params into the open overlay — the PanelProps.setParams bridge. */
  merge: (params: Record<string, string>) => void;
  /** Toggle: open when closed or different, close when already showing. */
  toggle: (kind: PanelKind, params?: Record<string, string>) => void;
  close: () => void;
}

export const useOverlays = create<OverlaysState>((set, get) => ({
  overlay: null,
  open: (kind, params = {}) => set({ overlay: { kind, params } }),
  merge: (params) =>
    set((s) => (s.overlay ? { overlay: { ...s.overlay, params: { ...s.overlay.params, ...params } } } : s)),
  toggle: (kind, params = {}) => {
    if (get().overlay?.kind === kind) set({ overlay: null });
    else set({ overlay: { kind, params } });
  },
  close: () => set({ overlay: null }),
}));

/** True in `?window=…` routes — those keep the classic workspace tree. */
export function isPanelWindow(): boolean {
  return new URLSearchParams(window.location.search).has("window");
}
