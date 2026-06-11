// Session-bindings store (T18/T21, EKI-40): seeded by list_session_bindings,
// reconciled on DomainEvent::SessionBindingChanged. Writes are optimistic with
// rollback on IPC error (EKI-40 AC). Rooms ride along read-only (M2 scope:
// rooms are assign-only — CRUD UI is M3).
import { create } from "zustand";
import { commands, type NewSessionBinding, type Room, type SessionBinding } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";

interface BindingsState {
  /** Keyed by raw session id (`SessionId.id`) — the session_bindings PK. */
  bindings: Record<string, SessionBinding>;
  rooms: Room[];
  loaded: boolean;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Optimistic upsert; returns an error message on failure (state rolled back). */
  upsert: (input: NewSessionBinding) => Promise<string | null>;
  /** Optimistic delete; returns an error message on failure (state rolled back). */
  remove: (sessionId: string) => Promise<string | null>;
  reset: () => void;
}

let started = false;

function withBinding(
  bindings: Record<string, SessionBinding>,
  sessionId: string,
  binding: SessionBinding | null,
): Record<string, SessionBinding> {
  const next = { ...bindings };
  if (binding) next[sessionId] = binding;
  else delete next[sessionId];
  return next;
}

export const useBindingsStore = create<BindingsState>((set, get) => ({
  bindings: {},
  rooms: [],
  loaded: false,
  refresh: async () => {
    try {
      const [bindingsRes, roomsRes] = await Promise.all([
        commands.listSessionBindings(),
        commands.listRooms(),
      ]);
      if (bindingsRes.status === "ok") {
        const byId: Record<string, SessionBinding> = {};
        for (const b of bindingsRes.data) byId[b.session_id] = b;
        set({ bindings: byId });
      }
      if (roomsRes.status === "ok") set({ rooms: roomsRes.data });
      set({ loaded: true });
    } catch {
      set({ loaded: true }); // backend unavailable (unit tests)
    }
  },
  init: async () => {
    if (started) return;
    started = true;
    await get().refresh();
    try {
      await onDomainEvent((e) => {
        if (e.type === "SessionBindingChanged" || e.type === "RoomChanged") void get().refresh();
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },
  upsert: async (input) => {
    const prev = get().bindings[input.session_id] ?? null;
    const optimistic: SessionBinding = { ...input, updated_at: Date.now() };
    set((s) => ({ bindings: withBinding(s.bindings, input.session_id, optimistic) }));
    try {
      const res = await commands.upsertSessionBinding(input);
      if (res.status === "error") {
        set((s) => ({ bindings: withBinding(s.bindings, input.session_id, prev) }));
        return res.error;
      }
      set((s) => ({ bindings: withBinding(s.bindings, input.session_id, res.data) }));
      return null;
    } catch (e) {
      set((s) => ({ bindings: withBinding(s.bindings, input.session_id, prev) }));
      return String(e);
    }
  },
  remove: async (sessionId) => {
    const prev = get().bindings[sessionId] ?? null;
    if (!prev) return null;
    set((s) => ({ bindings: withBinding(s.bindings, sessionId, null) }));
    try {
      const res = await commands.deleteSessionBinding(sessionId);
      if (res.status === "error") {
        set((s) => ({ bindings: withBinding(s.bindings, sessionId, prev) }));
        return res.error;
      }
      return null;
    } catch (e) {
      set((s) => ({ bindings: withBinding(s.bindings, sessionId, prev) }));
      return String(e);
    }
  },
  reset: () => {
    started = false;
    set({ bindings: {}, rooms: [], loaded: false });
  },
}));
