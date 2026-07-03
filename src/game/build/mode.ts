// Build-mode UI state (M3 T3): which tool is selected while the player has
// build mode open. Purely ephemeral — no persistence, unlike edits' store.ts
// (src/game/build/store.ts), which is the source of truth for what's placed.
import { create } from "zustand";
import type { PlaceableKind } from "./edits";

export type BuildTool = { kind: "item"; item: PlaceableKind } | { kind: "building" } | { kind: "select" };

const SELECT_TOOL: BuildTool = { kind: "select" };

/** Which pavilion a RoomCard (M5 T4) is open for — a base plot (by index
 *  into the seeded layout) or a player-built pavilion (by its edits id). */
export type RoomCardTarget = { kind: "plot"; plotIndex: number } | { kind: "placed"; id: string };

interface BuildModeState {
  active: boolean;
  tool: BuildTool;
  /** Id of a just-placed building awaiting a room pick, or null (M3 T5). A
   *  store field rather than a callback prop — GameShell mounts
   *  RoomLinkDialog outside the Canvas, BuildControls' addBuilding call
   *  happens inside it, and threading a prop across that boundary would
   *  mean plumbing it through GameShell for no benefit over this. */
  pendingRoomLink: string | null;
  /** Pavilion a RoomCard is open for outside build mode, or null (M5 T4).
   *  Same store-field-over-prop rationale as `pendingRoomLink` — the click
   *  that opens it happens deep inside the Canvas (CampusWorld/
   *  PlacedBuildings), the card itself mounts as an HTML sibling in
   *  GameShell. */
  roomCard: RoomCardTarget | null;
  /** Enter build mode, always starting on the select/move tool. Also
   *  dismisses any open RoomCard — build mode's own selection/inspection UI
   *  takes over the same "click a pavilion" gesture, so the two must not be
   *  open at once. */
  activate: () => void;
  /** Leave build mode and reset the tool for next time. */
  deactivate: () => void;
  setTool: (tool: BuildTool) => void;
  openRoomLink: (buildingId: string) => void;
  closeRoomLink: () => void;
  openRoomCard: (target: RoomCardTarget) => void;
  closeRoomCard: () => void;
}

export const useBuildMode = create<BuildModeState>((set) => ({
  active: false,
  tool: SELECT_TOOL,
  pendingRoomLink: null,
  roomCard: null,
  activate: () => set({ active: true, tool: SELECT_TOOL, roomCard: null }),
  deactivate: () => set({ active: false, tool: SELECT_TOOL, pendingRoomLink: null }),
  setTool: (tool) => set({ tool }),
  openRoomLink: (buildingId) => set({ pendingRoomLink: buildingId }),
  closeRoomLink: () => set({ pendingRoomLink: null }),
  openRoomCard: (target) => set({ roomCard: target }),
  closeRoomCard: () => set({ roomCard: null }),
}));
