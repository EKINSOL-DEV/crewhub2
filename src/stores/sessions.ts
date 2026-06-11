// Sessions store (T18, EKI-74): seeded by list_all_sessions, maintained by
// Discovered/Updated/Removed engine events. Pure fold + join functions first
// (M2 plan §3.1), the zustand store just hosts them.
import { useMemo } from "react";
import { create } from "zustand";
import {
  commands,
  type Agent,
  type Room,
  type SessionBinding,
  type SessionEvent,
  type SessionId,
  type SessionMeta,
} from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";
import { useAgentsStore } from "./agents";
import { useBindingsStore } from "./bindings";

/** Stable map key for a provider-scoped session id. */
export function sessionKey(id: SessionId): string {
  return `${id.provider}:${id.id}`;
}

/** First 8 chars — enough to recognize a UUID at a glance. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Stored session meta: `Removed` keeps a tombstone (meta retained, status
 * forced Ended, flagged `removed`) so chat's MetaStrip keeps its model/branch
 * chips after a session ends. Live surfaces filter tombstones out via
 * {@link joinSessionsView}; rediscovery replaces the tombstone wholesale.
 */
export type StoredSessionMeta = SessionMeta & { removed?: true };

/** Fold a SessionEvent into the sessions-by-key map. Non-meta events are no-ops. */
export function applySessionEvent(
  sessions: Record<string, StoredSessionMeta>,
  ev: SessionEvent,
): Record<string, StoredSessionMeta> {
  switch (ev.type) {
    case "Discovered":
    case "Updated":
      return { ...sessions, [sessionKey(ev.data.meta.id)]: ev.data.meta };
    case "Removed": {
      const key = sessionKey(ev.data.id);
      const existing = sessions[key];
      if (!existing) return sessions;
      return { ...sessions, [key]: { ...existing, status: "Ended", removed: true } };
    }
    default:
      return sessions;
  }
}

/**
 * Project-filter predicate (EKI-22 shape): a session matches when its
 * project_path is the filter root or any path under it (worktrees included).
 * Panels resolve the root from `useProjectFilter().project?.folder_path`.
 */
export function matchesProjectFilter(sessionPath: string, filterRoot: string | null): boolean {
  if (!filterRoot) return true;
  const root = filterRoot.endsWith("/") ? filterRoot.slice(0, -1) : filterRoot;
  return sessionPath === root || sessionPath.startsWith(`${root}/`);
}

/** The joined row every Lane C surface renders (T18). */
export interface SessionView {
  key: string;
  meta: SessionMeta;
  binding: SessionBinding | null;
  agent: Agent | null;
  room: Room | null;
  /** display_name ?? bound agent name ?? short id. */
  displayName: string;
}

/** Join sessions ↔ bindings ↔ agents/rooms; newest activity first. Tombstones excluded. */
export function joinSessionsView(
  sessions: Record<string, StoredSessionMeta>,
  bindings: Record<string, SessionBinding>,
  agents: Agent[],
  rooms: Room[],
  projectFilter: string | null = null,
): SessionView[] {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  return Object.entries(sessions)
    .filter(([, meta]) => !meta.removed && matchesProjectFilter(meta.project_path, projectFilter))
    .map(([key, meta]) => {
      const binding = bindings[meta.id.id] ?? null;
      const agent = binding?.agent_id ? (agentById.get(binding.agent_id) ?? null) : null;
      const room = binding?.room_id ? (roomById.get(binding.room_id) ?? null) : null;
      return {
        key,
        meta,
        binding,
        agent,
        room,
        displayName: binding?.display_name ?? agent?.name ?? shortId(meta.id.id),
      };
    })
    .sort((a, b) => b.meta.last_activity_ms - a.meta.last_activity_ms);
}

interface SessionsState {
  sessions: Record<string, StoredSessionMeta>;
  /** True once the initial list_all_sessions round-trip settled (ok or error). */
  loaded: boolean;
  error: string | null;
  /** Seed + subscribe exactly once; later calls are no-ops. */
  init: () => Promise<void>;
  /** Fold one engine event (also the test seam: drive the store with fake events). */
  apply: (ev: SessionEvent) => void;
  reset: () => void;
}

let started = false;

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: {},
  loaded: false,
  error: null,
  apply: (ev) => set((s) => ({ sessions: applySessionEvent(s.sessions, ev) })),
  init: async () => {
    if (started) return;
    started = true;
    try {
      const res = await commands.listAllSessions();
      if (res.status === "ok") {
        const seeded: Record<string, SessionMeta> = {};
        for (const m of res.data) seeded[sessionKey(m.id)] = m;
        // Events that raced the seed win: spread live state over the seed.
        set((s) => ({ sessions: { ...seeded, ...s.sessions }, loaded: true, error: null }));
      } else {
        set({ error: res.error, loaded: true });
      }
    } catch (e) {
      set({ error: String(e), loaded: true });
    }
    try {
      await onEngineEvent((ev) => get().apply(ev));
    } catch {
      // event bridge unavailable (unit tests) — store stays drivable via apply()
    }
  },
  reset: () => {
    started = false;
    set({ sessions: {}, loaded: false, error: null });
  },
}));

/**
 * The one selector every Lane C panel renders from. Pass the active project's
 * folder_path from `useProjectFilter()` (EKI-22) to scope it.
 */
export function useSessionsView(projectFilter: string | null = null): SessionView[] {
  const sessions = useSessionsStore((s) => s.sessions);
  const bindings = useBindingsStore((s) => s.bindings);
  const rooms = useBindingsStore((s) => s.rooms);
  const agents = useAgentsStore((s) => s.agents);
  return useMemo(
    () => joinSessionsView(sessions, bindings, agents, rooms, projectFilter),
    [sessions, bindings, agents, rooms, projectFilter],
  );
}
