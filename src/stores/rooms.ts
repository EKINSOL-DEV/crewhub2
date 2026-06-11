// Rooms store (M3 T7/T8, EKI-87): rooms CRUD over the room IPC, reconciled on
// DomainEvent::RoomChanged (room-rule CRUD also emits it — Lane 0 T2). Lane D
// owns this store; other lanes consume read-only. Pure ordering helpers first.
import { create } from "zustand";
import { commands, type NewRoom, type NewRoomRule, type Room, type RoomRule } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Stable display order: sort_order asc, then created_at asc, then name. */
export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at || a.name.localeCompare(b.name),
  );
}

/** Rooms living in one project section (null = HQ & shared rooms). */
export function roomsForProject(rooms: Room[], projectId: string | null): Room[] {
  return sortRooms(rooms.filter((r) => r.project_id === projectId));
}

/**
 * Up/down reorder without drag (T8 explicitly drag-free): move `id` by
 * `delta` (−1 | +1) within its ordered sibling list and return the minimal
 * set of `{ id, sort_order }` writes that makes the new order stick —
 * sequential indices, only for rooms whose sort_order actually changes.
 */
export function reorderRooms(
  siblings: Room[],
  id: string,
  delta: -1 | 1,
): Array<{ id: string; sort_order: number }> {
  const ordered = sortRooms(siblings);
  const from = ordered.findIndex((r) => r.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  const next = [...ordered];
  const moved = next.splice(from, 1)[0];
  if (!moved) return [];
  next.splice(to, 0, moved);
  return next.flatMap((room, idx) => (room.sort_order === idx ? [] : [{ id: room.id, sort_order: idx }]));
}

// ── Store ────────────────────────────────────────────────────────────────────

export type RoomResult = { status: "ok"; data: Room } | { status: "error"; error: string };
export type RuleResult = { status: "ok"; data: RoomRule } | { status: "error"; error: string };

interface RoomsState {
  rooms: Room[];
  /**
   * ALL room rules in evaluator order (priority desc, oldest→newest within a
   * priority — exactly what list_room_rules returns and assignRoom expects).
   */
  rules: RoomRule[];
  loaded: boolean;
  /** Seed + subscribe exactly once; later calls are no-ops. */
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (input: NewRoom) => Promise<RoomResult>;
  update: (room: Room) => Promise<RoomResult>;
  remove: (id: string) => Promise<string | null>;
  /** Up/down move within the room's project section. */
  move: (id: string, delta: -1 | 1) => Promise<string | null>;
  createRule: (input: NewRoomRule) => Promise<RuleResult>;
  updateRule: (rule: RoomRule) => Promise<RuleResult>;
  removeRule: (id: string) => Promise<string | null>;
}

let started = false;

export const useRoomsStore = create<RoomsState>((set, get) => ({
  rooms: [],
  rules: [],
  loaded: false,
  refresh: async () => {
    try {
      const [roomsRes, rulesRes] = await Promise.all([commands.listRooms(), commands.listRoomRules(null)]);
      if (roomsRes.status === "ok" && Array.isArray(roomsRes.data)) set({ rooms: roomsRes.data });
      if (rulesRes.status === "ok" && Array.isArray(rulesRes.data)) set({ rules: rulesRes.data });
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },
  load: async () => {
    if (started) return;
    started = true;
    await get().refresh();
    try {
      await onDomainEvent((e) => {
        if (e.type === "RoomChanged") void get().refresh();
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },
  create: async (input) => {
    try {
      const res = await commands.createRoom(input);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  update: async (room) => {
    try {
      const res = await commands.updateRoom(room);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  remove: async (id) => {
    try {
      const res = await commands.deleteRoom(id);
      if (res.status === "error") return res.error;
      await get().refresh();
      return null;
    } catch (e) {
      return String(e);
    }
  },
  move: async (id, delta) => {
    const room = get().rooms.find((r) => r.id === id);
    if (!room) return null;
    const siblings = roomsForProject(get().rooms, room.project_id);
    const writes = reorderRooms(siblings, id, delta);
    for (const w of writes) {
      const target = get().rooms.find((r) => r.id === w.id);
      if (!target) continue;
      const res = await commands.updateRoom({ ...target, sort_order: w.sort_order }).catch((e) => ({
        status: "error" as const,
        error: String(e),
      }));
      if (res.status === "error") return res.error;
    }
    if (writes.length > 0) await get().refresh();
    return null;
  },
  createRule: async (input) => {
    try {
      const res = await commands.createRoomRule(input);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  updateRule: async (rule) => {
    try {
      const res = await commands.updateRoomRule(rule);
      if (res.status === "ok") await get().refresh();
      return res;
    } catch (e) {
      return { status: "error", error: String(e) };
    }
  },
  removeRule: async (id) => {
    try {
      const res = await commands.deleteRoomRule(id);
      if (res.status === "error") return res.error;
      await get().refresh();
      return null;
    } catch (e) {
      return String(e);
    }
  },
}));

/** Test-only reset. */
export function resetRoomsForTests() {
  started = false;
  useRoomsStore.setState({ rooms: [], rules: [], loaded: false });
}
