// Build-mode UI state (M3 T3): which tool is selected while the player has
// build mode open. Purely ephemeral — no persistence, unlike edits' store.ts
// (src/game/build/store.ts), which is the source of truth for what's placed.
import { create } from "zustand";
import type { PlaceableKind } from "./edits";

export type BuildTool = { kind: "item"; item: PlaceableKind } | { kind: "building" } | { kind: "select" };

const SELECT_TOOL: BuildTool = { kind: "select" };

interface BuildModeState {
  active: boolean;
  tool: BuildTool;
  /** Enter build mode, always starting on the select/move tool. */
  activate: () => void;
  /** Leave build mode and reset the tool for next time. */
  deactivate: () => void;
  setTool: (tool: BuildTool) => void;
}

export const useBuildMode = create<BuildModeState>((set) => ({
  active: false,
  tool: SELECT_TOOL,
  activate: () => set({ active: true, tool: SELECT_TOOL }),
  deactivate: () => set({ active: false, tool: SELECT_TOOL }),
  setTool: (tool) => set({ tool }),
}));
