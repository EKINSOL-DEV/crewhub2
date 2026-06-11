// Run history drawer (T13/T14, EKI-30/35): `run_results` rows newest-first —
// status, summary, duration; sequence steps render as a per-step timeline
// (failed step loud, skipped steps muted — halt-on-failure shown honestly).
// A result with a session id links to the transcript (read-only chat).
import { useEffect } from "react";
import { openChatPanel } from "@/app/open-chat";
import { Button } from "@/components/ui/button";
import type { Run, RunResult } from "@/ipc/bindings";
import { isTerminalResult, resultEmoji, useAutomationStore } from "@/stores/automation";
import { parseRunSpec } from "./run-spec";

/** Headless runs execute through the claude engine — its provider id. */
const HEADLESS_PROVIDER = "claude-code";

export function formatDuration(startedAt: number | null, finishedAt: number | null): string {
  // `finished_at` is 0 while a row is still running (begin_run_result)
  if (startedAt === null || finishedAt === null || finishedAt === 0) return "—";
  const ms = Math.max(0, finishedAt - startedAt);
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function ResultRow({ result, isSequence }: { result: RunResult; isSequence: boolean }) {
  const loud = result.status === "error";
  const muted = result.status === "skipped";
  return (
    <li
      data-testid={`run-result-${result.id}`}
      className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
        loud ? "border-destructive/60 bg-destructive/10" : muted ? "opacity-50" : ""
      }`}
    >
      <span aria-hidden>{resultEmoji(result.status)}</span>
      {isSequence && result.step_index !== null && (
        <span className="rounded bg-muted px-1 font-mono text-[10px]">step {result.step_index + 1}</span>
      )}
      <span className={`flex-1 truncate ${loud ? "font-medium" : ""}`} title={result.summary ?? ""}>
        {result.status}
        {result.summary ? ` — ${result.summary}` : ""}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {formatDuration(result.started_at, result.finished_at)}
      </span>
      {result.session_id && (
        <Button
          size="xs"
          variant="outline"
          data-testid={`result-transcript-${result.id}`}
          onClick={() =>
            openChatPanel({
              provider: HEADLESS_PROVIDER,
              id: result.session_id as string,
              mode: isTerminalResult(result.status) ? "history" : "live",
            })
          }
        >
          transcript
        </Button>
      )}
    </li>
  );
}

export function RunHistory({ run }: { run: Run }) {
  const results = useAutomationStore((s) => s.results[run.id]);

  useEffect(() => {
    void useAutomationStore.getState().loadResults(run.id);
  }, [run.id]);

  const isSequence = parseRunSpec(run.spec_json)?.action === "sequence";

  return (
    <div data-testid={`run-history-${run.id}`} className="flex flex-col gap-1 rounded border bg-card p-2">
      <p className="text-xs font-medium text-muted-foreground">history</p>
      {results === undefined && <p className="text-xs text-muted-foreground">loading…</p>}
      {results !== undefined && results.length === 0 && (
        <p className="text-xs text-muted-foreground">no results yet — run it once 🚀</p>
      )}
      {results !== undefined && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r) => (
            <ResultRow key={r.id} result={r} isSequence={isSequence} />
          ))}
        </ul>
      )}
    </div>
  );
}
