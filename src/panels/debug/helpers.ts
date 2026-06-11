// Pure state helpers for the M1 engine debug panel (throwaway UI, tested logic).
import type { PermissionRequest, SessionEvent, SessionId, SessionMeta, SessionStatus } from "@/ipc/bindings";

export const MAX_TAIL = 200;

/** Stable map key for a provider-scoped session id. */
export function sessionKey(id: SessionId): string {
  return `${id.provider}:${id.id}`;
}

/** First 8 chars — enough to recognize a UUID in a debug table. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Playful-but-tasteful status glyphs (product principle: status at a glance). */
export function statusEmoji(status: SessionStatus): string {
  switch (status) {
    case "Working":
      return "🟢";
    case "WaitingForInput":
      return "🕐";
    case "WaitingForPermission":
      return "🔐";
    case "Idle":
      return "💤";
    case "Ended":
      return "🔚";
  }
}

/** Append to the raw event tail, keeping at most `max` (default 200) entries. */
export function appendToTail(tail: SessionEvent[], ev: SessionEvent, max: number = MAX_TAIL): SessionEvent[] {
  const next = [...tail, ev];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Fold a SessionEvent into the sessions-by-key map. Non-meta events are no-ops. */
export function applySessionEvent(
  sessions: Record<string, SessionMeta>,
  ev: SessionEvent,
): Record<string, SessionMeta> {
  switch (ev.type) {
    case "Discovered":
    case "Updated":
      return { ...sessions, [sessionKey(ev.data.meta.id)]: ev.data.meta };
    case "Removed": {
      const key = sessionKey(ev.data.id);
      if (!(key in sessions)) return sessions;
      const next = { ...sessions };
      delete next[key];
      return next;
    }
    default:
      return sessions;
  }
}

export interface PendingPermission {
  sessionId: SessionId;
  request: PermissionRequest;
}

/** Fold a SessionEvent into the pending-permissions list. */
export function applyPermissionEvent(pending: PendingPermission[], ev: SessionEvent): PendingPermission[] {
  switch (ev.type) {
    case "PermissionRequest": {
      const exists = pending.some((p) => p.request.request_id === ev.data.request.request_id);
      if (exists) return pending;
      return [...pending, { sessionId: ev.data.id, request: ev.data.request }];
    }
    // Session left the permission state (answered in another surface) or died.
    case "Updated":
      if (ev.data.meta.status === "WaitingForPermission") return pending;
      return pending.filter((p) => sessionKey(p.sessionId) !== sessionKey(ev.data.meta.id));
    case "Removed":
      return pending.filter((p) => sessionKey(p.sessionId) !== sessionKey(ev.data.id));
    default:
      return pending;
  }
}

/** Drop one pending request after the user responded to it. */
export function removePending(pending: PendingPermission[], requestId: string): PendingPermission[] {
  return pending.filter((p) => p.request.request_id !== requestId);
}
