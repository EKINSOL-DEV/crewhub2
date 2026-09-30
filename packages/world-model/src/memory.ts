/**
 * Presentation memory: the little state the reducer carries between reductions that is not a loops
 * fact. It is plain JSON so the app may keep it across reloads.
 */
import type { AgentKey, LaneStatus, RoleId } from "./model.ts";

export interface LaneMemory {
  /** The status the posture currently shows. */
  shown: LaneStatus;
  /** A different status waiting to hold long enough (plan 7.1). */
  pending: LaneStatus | null;
  pendingSince: number;
  /** Consecutive team snapshots that carried `pending`. */
  pendingSnapshots: number;
  /** The team revision last counted for `pending`. */
  teamRevision: number;
}

export interface PresentationMemory {
  lanes: Record<AgentKey, LaneMemory>;
  /** Per building slug: when a role room first had an agent (source ms). */
  roleRooms: Record<string, Partial<Record<RoleId, number>>>;
  /** The last real building per agent, kept after 30 quiet minutes. */
  locations: Record<AgentKey, string>;
}

export function emptyMemory(): PresentationMemory {
  return { lanes: {}, roleRooms: {}, locations: {} };
}
