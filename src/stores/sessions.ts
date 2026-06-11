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

// ── Session forest (M4 T16, EKI-47/54 — pure, additive) ─────────────────────
//
// Roots resolution + forest assembly from `SessionMeta.parent` links
// (D-M4-9a): sessions whose parent is unknown/gone become roots themselves
// (orphan tolerance), every sibling list is sorted by recency, and team
// grouping (D-M4-9b) lights up only when the provider supplied `team` —
// the UI tolerates `null` by construction.

export interface SessionTreeNode {
  key: string;
  meta: SessionMeta;
  children: SessionTreeNode[];
}

/** A sibling list, with team members folded into bracketed groups (👥). */
export type ForestEntry =
  | { kind: "session"; node: SessionTreeNode }
  | { kind: "team"; teamId: string; nodes: SessionTreeNode[] };

function newestActivity(node: SessionTreeNode): number {
  let max = node.meta.last_activity_ms;
  for (const c of node.children) max = Math.max(max, newestActivity(c));
  return max;
}

/**
 * Assemble the forest. Tombstoned (`removed`) sessions are excluded — same
 * rule as {@link joinSessionsView}. A parent link that would create a cycle
 * (malformed metadata) is dropped: the child becomes a root instead of the
 * whole subtree silently vanishing — orphan tolerance over purity.
 */
export function buildSessionForest(sessions: Record<string, StoredSessionMeta>): SessionTreeNode[] {
  const nodes = new Map<string, SessionTreeNode>();
  for (const [key, meta] of Object.entries(sessions)) {
    if (meta.removed) continue;
    nodes.set(key, { key, meta, children: [] });
  }

  const roots: SessionTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentKey = node.meta.parent ? sessionKey(node.meta.parent) : null;
    const parent = parentKey ? nodes.get(parentKey) : undefined;
    if (!parent || parent === node) {
      roots.push(node); // no parent, or parent unknown/gone — root (orphan tolerance)
      continue;
    }
    // cycle guard: if `node` already sits on the parent's ancestor chain,
    // attaching would orphan the loop entirely — promote to root instead.
    let ancestor: SessionTreeNode | undefined = parent;
    const seen = new Set<string>([node.key]);
    let cycles = false;
    while (ancestor) {
      if (seen.has(ancestor.key)) {
        cycles = true;
        break;
      }
      seen.add(ancestor.key);
      const up: string | null = ancestor.meta.parent ? sessionKey(ancestor.meta.parent) : null;
      ancestor = up ? nodes.get(up) : undefined;
    }
    if (cycles) roots.push(node);
    else parent.children.push(node);
  }

  const sortRec = (list: SessionTreeNode[]) => {
    list.sort((a, b) => newestActivity(b) - newestActivity(a));
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/**
 * Fold one sibling list into render entries: consecutive-or-not members of
 * the same team collapse into one bracketed group placed at the position of
 * its most recent member; everything else stays a plain session entry.
 */
export function groupSiblingsByTeam(siblings: SessionTreeNode[]): ForestEntry[] {
  const out: ForestEntry[] = [];
  const teamAt = new Map<string, ForestEntry & { kind: "team" }>();
  for (const node of siblings) {
    const teamId = node.meta.team?.team_id;
    if (!teamId) {
      out.push({ kind: "session", node });
      continue;
    }
    const existing = teamAt.get(teamId);
    if (existing) {
      existing.nodes.push(node); // recency order preserved within the group
    } else {
      const entry = { kind: "team" as const, teamId, nodes: [node] };
      teamAt.set(teamId, entry);
      out.push(entry);
    }
  }
  return out;
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
