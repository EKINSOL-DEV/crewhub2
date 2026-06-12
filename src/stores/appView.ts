// Top-level view state (world-primary shell): the app boots into the ONE 3D
// world every start — deliberately NOT persisted (product decision: the world
// is primary at start, the workspace is somewhere you visit). The only
// exceptions are handled in App.tsx: `?window=` routes never see a view, and
// an active onboarding wizard keeps the classic shell underneath it.
import { create } from "zustand";

export type AppView = "world" | "workspace";

interface AppViewState {
  view: AppView;
  setView: (view: AppView) => void;
}

export const useAppView = create<AppViewState>((set) => ({
  view: "world",
  setView: (view) => set({ view }),
}));

/** Test-only: back to the boot default. */
export function resetAppViewForTests() {
  useAppView.setState({ view: "world" });
}
