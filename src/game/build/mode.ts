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

/**
 * Every kind of single-open "card" the game HUD can show (M6 T4 adds the
 * middle three arms; M9 T2 adds the last one): a plot/placed RoomCard, HQ's
 * own card (no project to link, so it isn't a RoomCardTarget), the in-game
 * Projects dialog, a request to open the hire dialog, and a bot dossier
 * keyed by its sim key (a live session's `provider:id`, or `agent:<id>` for
 * resting crew — same key space DossierCard's own data join reads). Kept on
 * the SAME `roomCard` field/opener rather than a parallel state slot — only
 * one card should ever be on screen, and reusing the field that already
 * enforces that (every open replaces whatever was there, `activate()`
 * clears it) gets single-open semantics for the new cards for free instead
 * of re-deriving "close the others" across two fields. The "hire" arm
 * carries no payload of its own except an optional `agentId` (M9 fix round
 * 1: a resting-crew dossier's Hire button preselects its own agent, same as
 * a resting-crew character click already does via GameShell's separate
 * local `hireAgentId` state) — GameShell notices the arm and defers to its
 * existing HireDialog open/close state either way, since that dialog is
 * also reachable from the HUD and character clicks and needs to keep owning
 * its own boolean. The "dossier" arm re-targets itself in place (a card's
 * own "Forked from" row re-opens with a different `key`) rather than
 * needing a push/pop stack — GameShell keys its mount by `key` so
 * re-targeting still remounts fresh (bio/position/nowMs all reset, same as
 * opening any other card).
 */
export type CardTarget =
  | RoomCardTarget
  | { kind: "hq" }
  | { kind: "projects" }
  | { kind: "hire"; agentId?: string }
  | { kind: "dossier"; key: string };

interface BuildModeState {
  active: boolean;
  tool: BuildTool;
  /** Id of a just-placed building awaiting a room pick, or null (M3 T5). A
   *  store field rather than a callback prop — GameShell mounts
   *  RoomLinkDialog outside the Canvas, BuildControls' addBuilding call
   *  happens inside it, and threading a prop across that boundary would
   *  mean plumbing it through GameShell for no benefit over this. */
  pendingRoomLink: string | null;
  /** The single open card outside build mode, or null (M5 T4; M6 T4 widened
   *  the type — see `CardTarget`). Same store-field-over-prop rationale as
   *  `pendingRoomLink` — the click that opens it happens deep inside the
   *  Canvas (CampusWorld/PlacedBuildings/HqProps), the card itself mounts
   *  as an HTML sibling in GameShell. */
  roomCard: CardTarget | null;
  /** Which currently-open `roomCard` (by reference), if any, is the one
   *  whose OWN click also engaged the camera (focusBuilding/followBot) in
   *  the same handler — GameShell round-3 fix. `openCameraCoupledCard`
   *  below sets this to the exact same object it puts in `roomCard`; plain
   *  `openRoomCard` never touches it. GameShell's camera-mode->free effect
   *  reads this to decide whether the card that's open right now is the one
   *  allowed to auto-close, instead of closing any card that merely SHARES
   *  A KIND with a focus-coupled panel (the old rule — see GameShell.tsx's
   *  isFocusCoupledCard doc comment) even when that specific open never
   *  touched the camera (e.g. HqCard's roster rows, ChatWindow's ℹ️ button,
   *  a dossier's "Forked from" row all open a dossier without following
   *  anything).
   *
   *  Left stale on purpose rather than cleared by every call site that ever
   *  replaces/closes `roomCard`: a fresh object literal never `===`s an old
   *  one, so a dangling reference to a since-closed card can never falsely
   *  match whatever opens next — no cleanup bookkeeping required. */
  cameraCoupledCard: CardTarget | null;
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
  openRoomCard: (target: CardTarget) => void;
  /** Same as `openRoomCard`, for the handlers that ALSO call
   *  focusBuilding/followBot in the same click (CampusWorld's and
   *  PlacedBuildings' pavilion handlers, GameShell's selectCharacter) — also
   *  marks `target` as the card the camera's mode->free effect is allowed to
   *  auto-close. */
  openCameraCoupledCard: (target: CardTarget) => void;
  closeRoomCard: () => void;
}

export const useBuildMode = create<BuildModeState>((set) => ({
  active: false,
  tool: SELECT_TOOL,
  pendingRoomLink: null,
  roomCard: null,
  cameraCoupledCard: null,
  activate: () => set({ active: true, tool: SELECT_TOOL, roomCard: null, cameraCoupledCard: null }),
  deactivate: () => set({ active: false, tool: SELECT_TOOL, pendingRoomLink: null }),
  setTool: (tool) => set({ tool }),
  openRoomLink: (buildingId) => set({ pendingRoomLink: buildingId }),
  closeRoomLink: () => set({ pendingRoomLink: null }),
  openRoomCard: (target) => set({ roomCard: target }),
  openCameraCoupledCard: (target) => set({ roomCard: target, cameraCoupledCard: target }),
  closeRoomCard: () => set({ roomCard: null, cameraCoupledCard: null }),
}));
