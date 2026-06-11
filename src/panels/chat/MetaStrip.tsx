// Session meta strip (EKI-49): model, usage totals, git branch, Status
// Critter, interrupt — fed by live SessionMeta when present, by summed Usage
// items otherwise (history mode).
import { useState } from "react";
import { StatusEmoji } from "@/components/StatusEmoji";
import { commands, type SessionId } from "@/ipc/bindings";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { humanizeId, shortId } from "./humanize";
import { formatTokens, sumUsage } from "./render-list";
import { useSessionMeta } from "./useSessionMeta";

export function MetaStrip({
  sid,
  historyMode,
  note,
}: {
  sid: SessionId;
  historyMode?: boolean;
  /** Panel annotation, e.g. "⏪ rewind @ ckpt-3" after a checkpoint fork. */
  note?: string | undefined;
}) {
  const key = sessionKey(sid);
  const meta = useSessionMeta(key);
  const t = useTranscripts((s) => s.sessions[key]);
  const [interrupting, setInterrupting] = useState(false);

  const sums = !meta && t ? sumUsage(t.items, t.order) : null;
  const usage = meta?.usage ?? {
    input_tokens: sums?.input_tokens ?? 0,
    output_tokens: sums?.output_tokens ?? 0,
    cache_read_tokens: sums?.cache_read ?? 0,
  };
  const status = meta?.status ?? "Ended";

  const interrupt = async () => {
    setInterrupting(true);
    try {
      await commands.interruptSession(sid);
    } catch {
      /* session may have just ended */
    } finally {
      setInterrupting(false);
    }
  };

  return (
    <header
      data-testid="meta-strip"
      className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs"
    >
      <StatusEmoji status={status} />
      <span className="font-medium">{humanizeId(sid.id)}</span>
      <span className="font-mono text-muted-foreground">{shortId(sid.id)}</span>
      {historyMode && (
        <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">👀 history</span>
      )}
      {note && (
        <span
          data-testid="panel-note"
          className="truncate rounded border border-border px-1.5 py-0.5 text-muted-foreground"
          title={note}
        >
          {note}
        </span>
      )}
      {meta?.model && <span className="rounded bg-accent/15 px-1.5 py-0.5">{meta.model}</span>}
      <span className="text-muted-foreground" title="input ▸ output tokens" data-testid="usage-totals">
        {formatTokens(usage.input_tokens)} ▸ {formatTokens(usage.output_tokens)}
      </span>
      {meta?.git_branch && (
        <span className="truncate text-muted-foreground" title="git branch">
          🌿 {meta.git_branch}
        </span>
      )}
      <span className="ml-auto" />
      {!historyMode && status === "Working" && (
        <button
          type="button"
          data-testid="interrupt-button"
          disabled={interrupting}
          className="rounded border border-border px-2 py-0.5 hover:bg-accent/20 disabled:opacity-50"
          onClick={() => void interrupt()}
        >
          ⏹ interrupt
        </button>
      )}
    </header>
  );
}
