// Per-room placed props (EKI-81): in-memory truth + best-effort persistence
// in the settings KV (`world.props:<room_id>`, JSON) — no schema changes.
// Rooms with nothing persisted get the deterministic starter set; that set is
// only written back once the user actually edits, keeping the KV clean.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import {
  clampToRoom,
  parseStoredRoomProps,
  propsSettingKey,
  serializeRoomProps,
  type PlacedProp,
  type RoomDims,
} from "./placement";
import { starterProps } from "./starter";

export const PERSIST_DEBOUNCE_MS = 600;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const requested = new Set<string>();

interface WorldPropsState {
  byRoom: Record<string, PlacedProp[]>;
  /** Load a room's props once (KV → parse → else starter set). Idempotent. */
  ensureLoaded: (roomId: string, dims: RoomDims) => Promise<void>;
  /** Replace a room's props: state now, KV write debounced. */
  setRoomProps: (roomId: string, props: PlacedProp[]) => void;
}

export const useWorldProps = create<WorldPropsState>((set) => ({
  byRoom: {},

  ensureLoaded: async (roomId, dims) => {
    if (requested.has(roomId)) return;
    requested.add(roomId);
    let stored: PlacedProp[] | null = null;
    try {
      const res = await commands.getSetting(propsSettingKey(roomId));
      if (res.status === "ok" && res.data) stored = parseStoredRoomProps(res.data);
    } catch {
      // backend unavailable (unit tests) — fall through to the starter set
    }
    const props = (stored ?? starterProps(roomId, dims)).map((p) => clampToRoom(p, dims));
    set((s) => ({ byRoom: { ...s.byRoom, [roomId]: props } }));
  },

  setRoomProps: (roomId, props) => {
    set((s) => ({ byRoom: { ...s.byRoom, [roomId]: props } }));
    clearTimeout(timers.get(roomId));
    timers.set(
      roomId,
      setTimeout(() => {
        timers.delete(roomId);
        void commands.setSetting(propsSettingKey(roomId), serializeRoomProps(props)).catch(() => undefined);
      }, PERSIST_DEBOUNCE_MS),
    );
  },
}));
