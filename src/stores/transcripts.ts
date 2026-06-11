// Per-session transcript buffers — the seq stitch contract (M2 plan D-M2-3).
//
// `Item.seq` from live `EngineEvent`s and `SeqItem.seq` from
// `get_session_transcript` pages share ONE numbering (the absolute item index
// from the start of the transcript file — pinned by a backend parity test).
// The buffer is therefore a sparse `Map<seq, item>` + a sorted index: live
// events and history pages merge with zero dedup logic.

import { create } from "zustand";
import {
  commands,
  type PermissionRequest,
  type QuestionRequest,
  type SessionEvent,
  type SessionId,
  type TranscriptItem,
  type TranscriptPage,
} from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";

export const PAGE_SIZE = 200;

/** Stable string key for a SessionId ("provider:id"). */
export function sessionKey(id: SessionId): string {
  return `${id.provider}:${id.id}`;
}

/** Inverse of {@link sessionKey}; the provider never contains ":". */
export function parseSessionKey(key: string): SessionId {
  const sep = key.indexOf(":");
  return { provider: key.slice(0, sep), id: key.slice(sep + 1) };
}

/** Insert `seq` into the ascending `order` index; no-op if present. Returns a new array. */
export function insertSorted(order: readonly number[], seq: number): number[] {
  // Common case: live append at the end.
  const last = order[order.length - 1];
  if (last === undefined || seq > last) return [...order, seq];
  let lo = 0;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((order[mid] as number) < seq) lo = mid + 1;
    else hi = mid;
  }
  if (order[lo] === seq) return [...order]; // idempotent duplicate
  const next = [...order];
  next.splice(lo, 0, seq);
  return next;
}

/** A one-line trace of an answered prompt ("✅ allowed Edit on src/foo.rs"). */
export interface PromptReceipt {
  request_id: string;
  text: string;
  ts: number;
}

export interface SessionTranscript {
  /** Sparse seq → item buffer. Mutated in place; the wrapper object is replaced per change. */
  items: Map<number, TranscriptItem>;
  /** Ascending seqs present in `items`. */
  order: number[];
  /** Best-known item count of the transcript (max of page totals and live seq+1). */
  total: number;
  loadingOlder: boolean;
  /** First page (or probe) finished — distinguishes "empty session" from "not yet loaded". */
  opened: boolean;
  pendingPermissions: PermissionRequest[];
  pendingQuestions: QuestionRequest[];
  receipts: PromptReceipt[];
}

export function emptyTranscript(): SessionTranscript {
  return {
    items: new Map(),
    order: [],
    total: 0,
    loadingOlder: false,
    opened: false,
    pendingPermissions: [],
    pendingQuestions: [],
    receipts: [],
  };
}

interface TranscriptsState {
  sessions: Record<string, SessionTranscript>;
  /** Merge one live `EngineEvent::Item`. */
  ingestLive: (id: SessionId, seq: number, item: TranscriptItem) => void;
  /** Merge one `get_session_transcript` page. */
  ingestPage: (id: SessionId, page: TranscriptPage) => void;
  /** Load the newest page (probe for total, then fetch the tail). */
  openSession: (id: SessionId) => Promise<void>;
  /** Page the gap below the lowest loaded seq (scroll-up). */
  loadOlder: (id: SessionId) => Promise<void>;
  addPermission: (id: SessionId, req: PermissionRequest) => void;
  addQuestion: (id: SessionId, q: QuestionRequest) => void;
  /** Clear a pending prompt, leaving a one-line receipt. */
  resolvePrompt: (id: SessionId, requestId: string, receipt: string) => void;
  /** Truncation/removal resets the numbering on both sides (plan M2-R2). */
  reset: (id: SessionId) => void;
  /** Route one engine event into the buffers. */
  ingestEngineEvent: (e: SessionEvent) => void;
}

export const useTranscripts = create<TranscriptsState>((set, get) => {
  /** Replace one session's wrapper via an updater (creates it when absent). */
  const update = (key: string, fn: (t: SessionTranscript) => SessionTranscript) =>
    set((s) => ({ sessions: { ...s.sessions, [key]: fn(s.sessions[key] ?? emptyTranscript()) } }));

  const merge = (t: SessionTranscript, seq: number, item: TranscriptItem): SessionTranscript => {
    t.items.set(seq, item); // duplicate seqs overwrite — idempotent by construction
    return {
      ...t,
      order: insertSorted(t.order, seq),
      total: Math.max(t.total, seq + 1),
    };
  };

  return {
    sessions: {},

    ingestLive: (id, seq, item) => update(sessionKey(id), (t) => merge(t, seq, item)),

    ingestPage: (id, page) =>
      update(sessionKey(id), (t) => {
        let next = { ...t, total: Math.max(t.total, page.total), opened: true };
        for (const { seq, item } of page.items) next = merge(next, seq, item);
        return next;
      }),

    openSession: async (id) => {
      const key = sessionKey(id);
      const existing = get().sessions[key];
      if (existing?.opened) return;
      try {
        // Probe for total (limit 0 → empty window + total), then fetch the tail page.
        const probe = await commands.getSessionTranscript(id, 0, 0);
        if (probe.status !== "ok") {
          update(key, (t) => ({ ...t, opened: true }));
          return;
        }
        const total = probe.data.total;
        const offset = Math.max(0, total - PAGE_SIZE);
        const page = total > 0 ? await commands.getSessionTranscript(id, offset, PAGE_SIZE) : probe;
        if (page.status === "ok") get().ingestPage(id, page.data);
        else update(key, (t) => ({ ...t, opened: true }));
      } catch {
        // No transcript on disk yet (fresh spawn) — live events will fill the buffer.
        update(key, (t) => ({ ...t, opened: true }));
      }
    },

    loadOlder: async (id) => {
      const key = sessionKey(id);
      const t = get().sessions[key];
      const lowest = t?.order[0];
      if (!t || t.loadingOlder || lowest === undefined || lowest === 0) return;
      update(key, (s) => ({ ...s, loadingOlder: true }));
      try {
        const offset = Math.max(0, lowest - PAGE_SIZE);
        const res = await commands.getSessionTranscript(id, offset, lowest - offset);
        if (res.status === "ok") get().ingestPage(id, res.data);
      } catch {
        // transient — scroll-up will retry
      } finally {
        update(key, (s) => ({ ...s, loadingOlder: false }));
      }
    },

    addPermission: (id, req) =>
      update(sessionKey(id), (t) => ({
        ...t,
        pendingPermissions: [...t.pendingPermissions.filter((p) => p.request_id !== req.request_id), req],
      })),

    addQuestion: (id, q) =>
      update(sessionKey(id), (t) => ({
        ...t,
        pendingQuestions: [...t.pendingQuestions.filter((p) => p.request_id !== q.request_id), q],
      })),

    resolvePrompt: (id, requestId, receipt) =>
      update(sessionKey(id), (t) => ({
        ...t,
        pendingPermissions: t.pendingPermissions.filter((p) => p.request_id !== requestId),
        pendingQuestions: t.pendingQuestions.filter((q) => q.request_id !== requestId),
        receipts: [...t.receipts, { request_id: requestId, text: receipt, ts: Date.now() }],
      })),

    reset: (id) =>
      set((s) => {
        const next = { ...s.sessions };
        delete next[sessionKey(id)];
        return { sessions: next };
      }),

    ingestEngineEvent: (e) => {
      const s = get();
      switch (e.type) {
        case "Item":
          s.ingestLive(e.data.id, e.data.seq, e.data.item);
          break;
        case "PermissionRequest":
          s.addPermission(e.data.id, e.data.request);
          break;
        case "Question":
          s.addQuestion(e.data.id, e.data.question);
          break;
        case "Removed":
          s.reset(e.data.id);
          break;
        default:
          break;
      }
    },
  };
});

let streamStarted = false;

/** Subscribe the store to the engine event stream (idempotent). */
export function startTranscriptStream(): void {
  if (streamStarted) return;
  streamStarted = true;
  void onEngineEvent((e) => useTranscripts.getState().ingestEngineEvent(e));
}
