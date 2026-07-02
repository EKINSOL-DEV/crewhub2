// Chat session hook (M2 T3): projects one open chat's transcript + live
// status into what `ChatWindow` renders, plus a `send`. No optimistic echo —
// the engine echoes `UserText` back into the transcript within ~100ms (see
// stores/transcripts.ts), so unlike the old panel's use-bot-chat.ts this
// needs no local push-then-dedupe dance.
import { useEffect, useMemo } from "react";
import {
  commands,
  type PermissionRequest,
  type QuestionRequest,
  type SessionId,
  type SessionStatus,
} from "@/ipc/bindings";
import { useSessionsView } from "@/stores/sessions";
import { startTranscriptStream, useTranscripts } from "@/stores/transcripts";
import { chatLinesFrom, type ChatLine } from "./lines";

/**
 * "provider:id" -> SessionId, splitting on the FIRST colon only (ids may
 * themselves contain ":"). Deliberately independent of the identical helper
 * in stores/transcripts.ts — this hook's tests mock that module wholesale,
 * so parsing stays correct even when the store is a stub.
 */
export function parseSessionKey(key: string): SessionId {
  const sep = key.indexOf(":");
  return { provider: key.slice(0, sep), id: key.slice(sep + 1) };
}

export interface ChatSessionPending {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
}

export type ChatSendResult = { ok: true } | { ok: false; error: string };

export interface ChatSessionResult {
  lines: ChatLine[];
  status: SessionStatus | undefined;
  pending: ChatSessionPending;
  send: (text: string) => Promise<ChatSendResult>;
}

/** `demo:*` keys are fake robots (see sim/demo.ts) — there is no session behind them. */
function isDemoKey(key: string): boolean {
  return key.startsWith("demo:");
}

export function useChatSession(key: string): ChatSessionResult {
  const sid = useMemo(() => parseSessionKey(key), [key]);

  useEffect(() => {
    if (isDemoKey(key)) return;
    startTranscriptStream();
    void useTranscripts.getState().openSession(sid);
  }, [key, sid]);

  const transcript = useTranscripts((s) => s.sessions[key]);
  const status = useSessionsView().find((v) => v.key === key)?.meta.status;

  const lines = useMemo(
    () => chatLinesFrom(transcript?.items ?? new Map(), transcript?.order ?? []),
    [transcript],
  );
  const pending = useMemo<ChatSessionPending>(
    () => ({
      permissions: transcript?.pendingPermissions ?? [],
      questions: transcript?.pendingQuestions ?? [],
    }),
    [transcript],
  );

  const send = async (text: string): Promise<ChatSendResult> => {
    if (isDemoKey(key)) return { ok: true }; // no session to send to — ChatWindow disables the composer anyway
    const trimmed = text.trim();
    if (!trimmed) return { ok: true };
    try {
      const res = await commands.sendToSession(sid, trimmed);
      if (res.status === "error") return { ok: false, error: res.error };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  return { lines, status, pending, send };
}
