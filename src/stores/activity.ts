// Activity feed store (T23, EKI-76): a bounded ring buffer folded from the
// engine event stream. Items collapse to one entry per message / tool-use
// (never per token); pure fold + group functions first, store hosts them.
import { create } from "zustand";
import type { SessionEvent, SessionId } from "@/ipc/bindings";
import { toolEmoji } from "@/components/StatusEmoji";
import { onEngineEvent } from "@/ipc/events";
import { sessionKey } from "./sessions";

export const MAX_ACTIVITY = 1000;

export interface ActivityEntry {
  id: string;
  /** Wall-clock arrival time (ms) — used for Today/Earlier grouping. */
  ts: number;
  kind: "message" | "tool" | "signal" | "conflict" | "lifecycle" | "permission";
  sessionId: SessionId | null;
  sessionKey: string | null;
  /** Transcript anchor for click-through, when the entry came from an Item. */
  seq?: number;
  emoji: string;
  text: string;
  /** Conflicts render loud (EKI-76 AC). */
  loud?: boolean;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `act-${counter}`;
}

function truncate(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Best-effort one-line summary of a tool input (path or command). */
function toolDetail(inputJson: string): string {
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    const detail = input["file_path"] ?? input["path"] ?? input["command"] ?? input["pattern"];
    return typeof detail === "string" ? ` ${truncate(detail, 60)}` : "";
  } catch {
    return "";
  }
}

/**
 * Fold one engine event into at most one feed entry (null = not feed-worthy).
 * ToolResult/Thinking/Usage collapse into nothing — the ToolUse already told
 * the story (one entry per tool-use / message, not per token).
 */
export function foldActivity(ev: SessionEvent, now: number): ActivityEntry | null {
  const base = { id: nextId(), ts: now };
  switch (ev.type) {
    case "Item": {
      const common = { ...base, sessionId: ev.data.id, sessionKey: sessionKey(ev.data.id), seq: ev.data.seq };
      const item = ev.data.item;
      switch (item.kind) {
        case "UserText":
          return { ...common, kind: "message", emoji: "💬", text: truncate(item.data.text) };
        case "AssistantText":
          return { ...common, kind: "message", emoji: "🤖", text: truncate(item.data.text) };
        case "ToolUse":
          return {
            ...common,
            kind: "tool",
            emoji: toolEmoji(item.data.tool),
            text: `${item.data.tool}${toolDetail(item.data.input_json)}`,
          };
        default:
          return null;
      }
    }
    case "PermissionRequest":
      return {
        ...base,
        kind: "permission",
        sessionId: ev.data.id,
        sessionKey: sessionKey(ev.data.id),
        emoji: "🙋",
        text: `asked permission for ${ev.data.request.tool}`,
      };
    case "Question":
      return {
        ...base,
        kind: "permission",
        sessionId: ev.data.id,
        sessionKey: sessionKey(ev.data.id),
        emoji: "❓",
        text: truncate(ev.data.question.text),
      };
    case "Signal":
      return {
        ...base,
        kind: "signal",
        sessionId: ev.data.id,
        sessionKey: sessionKey(ev.data.id),
        emoji: "🪝",
        text: ev.data.signal.tool ? `${ev.data.signal.event} · ${ev.data.signal.tool}` : ev.data.signal.event,
      };
    case "Conflict":
      return {
        ...base,
        kind: "conflict",
        sessionId: null,
        sessionKey: null,
        emoji: "⚠️",
        text: `${ev.data.sessions.length} sessions editing ${ev.data.path}`,
        loud: true,
      };
    case "Discovered":
      return {
        ...base,
        kind: "lifecycle",
        sessionId: ev.data.meta.id,
        sessionKey: sessionKey(ev.data.meta.id),
        emoji: "✨",
        text: `session discovered (${ev.data.meta.origin})`,
      };
    case "Removed":
      return {
        ...base,
        kind: "lifecycle",
        sessionId: ev.data.id,
        sessionKey: sessionKey(ev.data.id),
        emoji: "🪦",
        text: "session removed",
      };
    default:
      return null;
  }
}

/** Prepend the newest entry, keeping at most `max` (ring buffer). */
export function pushBounded(
  entries: ActivityEntry[],
  entry: ActivityEntry,
  max: number = MAX_ACTIVITY,
): ActivityEntry[] {
  const next = [entry, ...entries];
  return next.length > max ? next.slice(0, max) : next;
}

export interface ActivityGroup {
  label: "Today" | "Earlier";
  entries: ActivityEntry[];
}

/** Group (already newest-first) entries into Today / Earlier buckets. */
export function groupActivity(entries: ActivityEntry[], now: number): ActivityGroup[] {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  const today = entries.filter((e) => e.ts >= cutoff);
  const earlier = entries.filter((e) => e.ts < cutoff);
  const groups: ActivityGroup[] = [];
  if (today.length > 0) groups.push({ label: "Today", entries: today });
  if (earlier.length > 0) groups.push({ label: "Earlier", entries: earlier });
  return groups;
}

interface ActivityState {
  entries: ActivityEntry[];
  /**
   * True once the event subscription settled — even with zero events the
   * panel must leave its loading state (the v1 ActivityLogStream stuck-spinner
   * regression, EKI-76 AC).
   */
  loaded: boolean;
  init: () => Promise<void>;
  apply: (ev: SessionEvent) => void;
  reset: () => void;
}

let started = false;

export const useActivityStore = create<ActivityState>((set, get) => ({
  entries: [],
  loaded: false,
  apply: (ev) => {
    const entry = foldActivity(ev, Date.now());
    if (entry) set((s) => ({ entries: pushBounded(s.entries, entry) }));
  },
  init: async () => {
    if (started) return;
    started = true;
    try {
      await onEngineEvent((ev) => get().apply(ev));
    } catch {
      // event bridge unavailable (unit tests) — apply() still drives the store
    } finally {
      // Subscription settled: resolve to data or empty state, never a spinner.
      set({ loaded: true });
    }
  },
  reset: () => {
    started = false;
    set({ entries: [], loaded: false });
  },
}));
