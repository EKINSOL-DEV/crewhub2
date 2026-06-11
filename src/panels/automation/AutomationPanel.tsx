// Automation panel (T13, EKI-30): the runs table — kind, human cron text,
// enabled toggle, Cron Critter chip, last result badge, 🚀 Run now — plus the
// schedule editor and per-run history drawer. The "schedules run only while
// CrewHub is open" copy is rendered prominently (D-M4-4 AC), never a tooltip.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import type { Run } from "@/ipc/bindings";
import type { PanelProps } from "@/panels/registry";
import { resultEmoji, sortRuns, useAutomationStore } from "@/stores/automation";
import { describeCron } from "./cron-describe";
import { parseRunSpec, specEmoji, specSummary } from "./run-spec";
import { RunHistory } from "./RunHistory";
import { ScheduleEditor } from "./ScheduleEditor";
import "./automation.css";

/** The honest scheduler copy (mirrors `preview_cron`'s `note`, D-M4-4). */
export const SCHEDULER_HONEST_COPY = "Schedules run only while CrewHub is open.";

/** Cron Critter (D-M4-10): enabled schedules tick softly; reduced-motion = static. */
function CronChip({ run }: { run: Run }) {
  const reduced = usePrefersReducedMotion();
  if (!run.schedule_cron) return <span className="text-muted-foreground">manual</span>;
  return (
    <span className="flex items-center gap-1" title={run.schedule_cron}>
      <span
        aria-hidden
        data-testid={`cron-critter-${run.id}`}
        className={run.enabled && !reduced ? "cron-tick" : ""}
      >
        ⏰
      </span>
      <span className="truncate">{describeCron(run.schedule_cron)}</span>
    </span>
  );
}

function LastResultBadge({ runId }: { runId: string }) {
  // newest cached result, when the drawer (or a reconcile) populated it
  const results = useAutomationStore((s) => s.results[runId]);
  const newest = results?.[0];
  if (!newest) return <span className="text-muted-foreground">—</span>;
  return (
    <span data-testid={`last-result-${runId}`} title={newest.summary ?? newest.status}>
      {resultEmoji(newest.status)} {newest.status}
    </span>
  );
}

function RunRow({
  run,
  historyOpen,
  onToggleHistory,
  onEdit,
  onError,
}: {
  run: Run;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onEdit: () => void;
  onError: (msg: string | null) => void;
}) {
  const [launching, setLaunching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const spec = parseRunSpec(run.spec_json);
  const store = useAutomationStore.getState();

  const runNow = async () => {
    setLaunching(true);
    onError(null);
    const err = await store.runNow(run.id);
    setLaunching(false);
    if (err) onError(err);
  };

  return (
    <>
      <tr data-testid={`run-row-${run.id}`} className="pop-in border-b align-middle">
        <td className="px-2 py-1 whitespace-nowrap">
          {specEmoji(spec)} {spec?.action ?? "?"}
        </td>
        <td className="max-w-56 truncate px-2 py-1" title={specSummary(spec)}>
          {specSummary(spec)}
        </td>
        <td className="max-w-44 px-2 py-1">
          <CronChip run={run} />
        </td>
        <td className="px-2 py-1">
          <button
            type="button"
            role="switch"
            aria-checked={run.enabled}
            aria-label={`Run enabled ${run.id}`}
            data-testid={`run-enabled-${run.id}`}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${
              run.enabled ? "border-ring bg-accent/20 text-accent" : "text-muted-foreground"
            }`}
            onClick={() => void store.setEnabled(run.id, !run.enabled).then(onError)}
          >
            {run.enabled ? "on" : "off"}
          </button>
        </td>
        <td className="px-2 py-1">
          <LastResultBadge runId={run.id} />
        </td>
        <td className="px-2 py-1">
          <span className="flex items-center gap-1">
            <Button
              size="xs"
              variant="outline"
              data-testid={`run-now-${run.id}`}
              disabled={launching}
              title="Run now — same path as a scheduled firing"
              onClick={() => void runNow()}
            >
              {launching ? "🚀 …" : "🚀 Run now"}
            </Button>
            <Button size="xs" variant={historyOpen ? "default" : "ghost"} onClick={onToggleHistory}>
              History
            </Button>
            <Button size="xs" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
            {confirmDelete ? (
              <Button
                size="xs"
                variant="destructive"
                onClick={() => {
                  setConfirmDelete(false);
                  void store.remove(run.id).then(onError);
                }}
              >
                Sure?
              </Button>
            ) : (
              <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </span>
        </td>
      </tr>
      {historyOpen && (
        <tr>
          <td colSpan={6} className="px-2 py-1">
            <RunHistory run={run} />
          </td>
        </tr>
      )}
    </>
  );
}

interface EditorTarget {
  run: Run | null;
  initialSpecJson?: string | undefined;
  initialCron?: string | undefined;
}

export default function AutomationPanel({ params, setParams }: PanelProps) {
  const runsById = useAutomationStore((s) => s.runs);
  const loaded = useAutomationStore((s) => s.loaded);
  const storeError = useAutomationStore((s) => s.error);
  const [localEditor, setLocalEditor] = useState<EditorTarget | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Deep-link params open the editor DERIVED, board-panel style: the
  // palette's "New schedule" passes create=1, Lane G's standup "Schedule
  // this" passes spec/cron. Closing clears both the param and local state.
  const setEditor = setLocalEditor;
  const editor: EditorTarget | null =
    localEditor ??
    (params.create === "1" || params.spec
      ? { run: null, initialSpecJson: params.spec, initialCron: params.cron }
      : null);
  const closeEditor = () => {
    setLocalEditor(null);
    if (params.create || params.spec || params.cron) {
      const rest = { ...params };
      delete rest.create;
      delete rest.spec;
      delete rest.cron;
      setParams(rest);
    }
  };

  useEffect(() => {
    void useAutomationStore.getState().init();
  }, []);

  // Last-result badges need each run's newest result — fetch lazily once per
  // run; afterwards RunChanged reconciles keep the cache fresh.
  useEffect(() => {
    if (!loaded) return;
    const s = useAutomationStore.getState();
    for (const id of Object.keys(runsById)) {
      if (!s.results[id]) void s.loadResults(id);
    }
  }, [loaded, runsById]);

  const runs = sortRuns(Object.values(runsById));

  return (
    <div data-testid="automation-panel" className="relative flex h-full flex-col gap-2 overflow-auto p-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">⏰ Automation</h2>
        <Button size="xs" data-testid="new-schedule" onClick={() => setEditor({ run: null })}>
          ＋ New run
        </Button>
      </div>
      {/* the honest copy, prominent — not a tooltip (D-M4-4 AC) */}
      <p
        data-testid="scheduler-honest-copy"
        className="rounded border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
      >
        ⏰ {SCHEDULER_HONEST_COPY} A missed occurrence fires once on the next launch.
      </p>

      {(storeError || actionError) && (
        <p data-testid="automation-error" className="text-xs text-destructive">
          {actionError ?? storeError}
        </p>
      )}

      {loaded && runs.length === 0 && (
        <EmptyState
          emoji="⏰"
          title="Nothing scheduled — the crew sleeps in"
          hint="Create a run: a one-off prompt, a sequence, or a scheduled standup."
          action={
            <Button size="xs" variant="outline" onClick={() => setEditor({ run: null })}>
              ＋ New run
            </Button>
          }
        />
      )}

      {runs.length > 0 && (
        <table data-testid="runs-table" className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-2 py-1">kind</th>
              <th className="px-2 py-1">what</th>
              <th className="px-2 py-1">schedule</th>
              <th className="px-2 py-1">enabled</th>
              <th className="px-2 py-1">last result</th>
              <th className="px-2 py-1">actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                historyOpen={historyFor === r.id}
                onToggleHistory={() => setHistoryFor((h) => (h === r.id ? null : r.id))}
                onEdit={() => setEditor({ run: r })}
                onError={setActionError}
              />
            ))}
          </tbody>
        </table>
      )}

      {editor && (
        <ScheduleEditor
          run={editor.run}
          initialSpecJson={editor.initialSpecJson}
          initialCron={editor.initialCron}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
