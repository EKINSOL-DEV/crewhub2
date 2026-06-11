// Chat-local session metadata (status, model, usage, lineage).
// TODO(merge): replace with Lane C's stores/sessions.ts selectors once merged —
// this duplicates the minimal slice the chat panel needs so Lane B never
// touches Lane C's files (M2-R5 ownership rule).
import { create } from "zustand";
import { commands, type SessionMeta } from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";
import { sessionKey } from "@/stores/transcripts";

interface MetaState {
  metas: Record<string, SessionMeta>;
}

export const useMetaStore = create<MetaState>(() => ({ metas: {} }));

export function ingestMeta(meta: SessionMeta): void {
  useMetaStore.setState((s) => ({ metas: { ...s.metas, [sessionKey(meta.id)]: meta } }));
}

let started = false;

/** Seed from listAllSessions and follow Discovered/Updated/Removed (idempotent). */
export function startSessionMetaStream(): void {
  if (started) return;
  started = true;
  void commands
    .listAllSessions()
    .then((res) => {
      if (res.status === "ok") for (const m of res.data) ingestMeta(m);
    })
    .catch(() => {
      /* backend unavailable (tests) */
    });
  void onEngineEvent((e) => {
    if (e.type === "Discovered" || e.type === "Updated") ingestMeta(e.data.meta);
    else if (e.type === "Removed") {
      useMetaStore.setState((s) => {
        const key = sessionKey(e.data.id);
        const meta = s.metas[key];
        if (!meta) return s;
        return { metas: { ...s.metas, [key]: { ...meta, status: "Ended" } } };
      });
    }
  });
}

export function useSessionMeta(key: string): SessionMeta | undefined {
  return useMetaStore((s) => s.metas[key]);
}

/** All known metas — callers derive children with useMemo (stable selector). */
export function useAllMetas(): Record<string, SessionMeta> {
  return useMetaStore((s) => s.metas);
}

/** Test hook: reset module state. */
export function resetSessionMetaStreamForTests(): void {
  started = false;
  useMetaStore.setState({ metas: {} });
}
