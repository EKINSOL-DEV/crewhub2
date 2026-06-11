// History mode footer (EKI-60): read-only sessions get an action bar instead
// of a composer — Take over (resume) and Fork from here, both through the
// shared ModelPicker (D-M2-7).
import { useState } from "react";
import { DEFAULT_SPAWN_MODEL, MODEL_TIERS, ModelPicker } from "@/components/ModelPicker";
import { commands, type SessionId, type SessionMeta } from "@/ipc/bindings";
import { sessionKey } from "@/stores/transcripts";
import { useSessionMeta } from "./useSessionMeta";

/**
 * Take-over gate: enabled for archived sessions (no live meta) and for
 * External/Ended sessions that are not mid-run (plan T16).
 */
export function canTakeOver(meta: SessionMeta | undefined): boolean {
  if (!meta) return true; // archived — nothing is running
  const settled = meta.status === "Idle" || meta.status === "Ended";
  return (meta.origin === "External" || meta.status === "Ended") && settled;
}

export function HistoryFooter({
  sid,
  projectPath,
  onLive,
}: {
  sid: SessionId;
  /** Fallback for archived sessions (history panel passes it via params). */
  projectPath?: string | undefined;
  /** Swap this panel onto the (new) live session id. */
  onLive: (id: SessionId, kind: "takeover" | "fork") => void;
}) {
  const meta = useSessionMeta(sessionKey(sid));
  const [confirm, setConfirm] = useState<"takeover" | "fork" | null>(null);
  const sessionModel = meta?.model;
  const [model, setModel] = useState(
    sessionModel && MODEL_TIERS.some((t) => t.id === sessionModel) ? sessionModel : DEFAULT_SPAWN_MODEL,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = meta?.project_path ?? projectPath;
  const enabled = canTakeOver(meta) && !!path;

  const go = async (kind: "takeover" | "fork") => {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commands.spawnSession(sid.provider, {
        project_path: path,
        prompt: null,
        model,
        permission_mode: "Default",
        resume_session: sid.id,
        fork: kind === "fork",
        append_system_prompt: null,
        agent_id: null,
      });
      if (res.status === "ok") onLive(res.data, kind);
      else setError(res.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <footer className="border-t border-border px-3 py-2 text-xs" data-testid="history-footer">
      {error && (
        <div className="mb-1 text-destructive" data-testid="history-error">
          {error}
        </div>
      )}
      {confirm === null ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">👀 viewing history — read-only</span>
          <span className="ml-auto" />
          <button
            type="button"
            data-testid="history-take-over"
            disabled={!enabled || busy}
            title={
              enabled
                ? "resume this session and continue in chat"
                : "only settled External/Ended sessions can be taken over"
            }
            className="rounded-md border border-border bg-accent/20 px-2.5 py-1 font-medium hover:bg-accent/30 disabled:opacity-50"
            onClick={() => setConfirm("takeover")}
          >
            🫳 Take over
          </button>
          <button
            type="button"
            data-testid="history-fork"
            disabled={!path || busy}
            title="fork a new session from here; the original stays untouched"
            className="rounded-md border border-border px-2.5 py-1 hover:bg-accent/20 disabled:opacity-50"
            onClick={() => setConfirm("fork")}
          >
            🌱 Fork from here
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2" data-testid="history-confirm">
          <ModelPicker value={model} onChange={setModel} className="w-56" />
          <button
            type="button"
            data-testid="history-confirm-go"
            disabled={busy}
            className="rounded-md border border-border bg-accent/20 px-2.5 py-1 font-medium hover:bg-accent/30 disabled:opacity-50"
            onClick={() => void go(confirm)}
          >
            {busy ? "…" : confirm === "takeover" ? "Resume session" : "Fork session"}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-muted-foreground"
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </footer>
  );
}
