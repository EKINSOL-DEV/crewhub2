// Automation store (T13, EKI-30): runs seeded by list_runs, reconciled by
// DomainEvent::RunChanged → get_run single-entity refetch (M3 discipline:
// event → refetch, never payload-stuffed events). Results are fetched lazily
// per run (history drawer) and re-fetched on RunChanged while cached. A run
// reaching a terminal result pushes one completion toast (deduped by result id).
import { create } from "zustand";
import { commands, type NewRun, type Run, type RunResult } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";
import { parseRunSpec, specEmoji, specSummary } from "@/panels/automation/run-spec";
import { useToasts } from "./toasts";

/** Result statuses that mean "this execution is over". */
export const TERMINAL_RESULT_STATUSES = ["success", "error", "skipped", "interrupted"] as const;

export function isTerminalResult(status: string): boolean {
  return (TERMINAL_RESULT_STATUSES as readonly string[]).includes(status);
}

export function resultEmoji(status: string): string {
  switch (status) {
    case "success":
      return "✅";
    case "error":
      return "❌";
    case "running":
      return "🏃";
    case "skipped":
      return "💤";
    case "interrupted":
      return "⚡";
    default:
      return "❓";
  }
}

/** Newest-first ordering the drawer renders (backend order is unspecified-stable). */
export function sortResults(results: RunResult[]): RunResult[] {
  return [...results].sort(
    (a, b) => (b.started_at ?? 0) - (a.started_at ?? 0) || (a.step_index ?? 0) - (b.step_index ?? 0),
  );
}

interface AutomationState {
  runs: Record<string, Run>;
  /** Results by run id — populated once a run's history was opened. */
  results: Record<string, RunResult[]>;
  loaded: boolean;
  error: string | null;

  init: () => Promise<void>;
  /** Reconcile one RunChanged: get_run (+ results refetch when cached). */
  reconcile: (runId: string) => Promise<void>;
  loadResults: (runId: string) => Promise<void>;
  create: (input: NewRun) => Promise<string | null>;
  update: (run: Run) => Promise<string | null>;
  remove: (runId: string) => Promise<string | null>;
  setEnabled: (runId: string, enabled: boolean) => Promise<string | null>;
  /** "Run now" — the same dispatcher path as a scheduled firing (D-M4-5). */
  runNow: (runId: string) => Promise<string | null>;
  reset: () => void;
}

let started = false;
/** Result ids already toasted — a run fires many RunChanged events. */
const toastedResults = new Set<string>();
/** Results finished before this window opened never toast (history ≠ news). */
let watchingSinceMs = Number.POSITIVE_INFINITY;

/** One completion toast per terminal result (also covers scheduled firings). */
function toastNewTerminalResults(run: Run | undefined, results: RunResult[]): void {
  for (const r of results) {
    if (!isTerminalResult(r.status) || toastedResults.has(r.id)) continue;
    toastedResults.add(r.id);
    if ((r.finished_at ?? 0) < watchingSinceMs) continue;
    if (r.status === "skipped") continue; // sequence tail noise — the drawer shows it
    const spec = run ? parseRunSpec(run.spec_json) : null;
    const step = r.step_index !== null ? ` (step ${r.step_index + 1})` : "";
    useToasts.getState().push({
      emoji: specEmoji(spec),
      text: `${resultEmoji(r.status)} run ${r.status}${step} — ${specSummary(spec)}`,
      taskId: null,
      shake: r.status === "error",
      action: null,
    });
  }
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  runs: {},
  results: {},
  loaded: false,
  error: null,

  init: async () => {
    if (started) return;
    started = true;
    watchingSinceMs = Date.now();
    try {
      const res = await commands.listRuns();
      if (res.status === "ok") {
        set({ runs: Object.fromEntries(res.data.map((r) => [r.id, r])), loaded: true, error: null });
      } else {
        set({ error: res.error, loaded: true });
      }
    } catch (e) {
      set({ error: String(e), loaded: true });
    }
    try {
      await onDomainEvent((e) => {
        if (e.type === "RunChanged") void get().reconcile(e.data.run_id);
      });
    } catch {
      // event bridge unavailable (unit tests) — store stays drivable directly
    }
  },

  reconcile: async (runId) => {
    try {
      const res = await commands.getRun(runId);
      if (res.status !== "ok") return;
      if (res.data === null) {
        // deleted — drop the run and its cached results
        set((s) => {
          const runs = { ...s.runs };
          delete runs[runId];
          const results = { ...s.results };
          delete results[runId];
          return { runs, results };
        });
        return;
      }
      const run = res.data as Run;
      set((s) => ({ runs: { ...s.runs, [runId]: run } }));
      const rr = await commands.listRunResults(runId);
      if (rr.status === "ok") {
        toastNewTerminalResults(run, rr.data);
        // keep the cache fresh only if the drawer ever opened it
        set((s) => (s.results[runId] ? { results: { ...s.results, [runId]: sortResults(rr.data) } } : s));
      }
    } catch {
      // backend unavailable (unit tests)
    }
  },

  loadResults: async (runId) => {
    try {
      const res = await commands.listRunResults(runId);
      if (res.status === "ok") {
        set((s) => ({ results: { ...s.results, [runId]: sortResults(res.data) } }));
      }
    } catch {
      // backend unavailable (unit tests)
    }
  },

  create: async (input) => {
    try {
      const res = await commands.createRun(input);
      if (res.status === "error") return res.error;
      set((s) => ({ runs: { ...s.runs, [res.data.id]: res.data } }));
      return null;
    } catch (e) {
      return String(e);
    }
  },

  update: async (run) => {
    try {
      const res = await commands.updateRun(run);
      if (res.status === "error") return res.error;
      set((s) => ({ runs: { ...s.runs, [res.data.id]: res.data } }));
      return null;
    } catch (e) {
      return String(e);
    }
  },

  remove: async (runId) => {
    try {
      const res = await commands.deleteRun(runId);
      if (res.status === "error") return res.error;
      set((s) => {
        const runs = { ...s.runs };
        delete runs[runId];
        const results = { ...s.results };
        delete results[runId];
        return { runs, results };
      });
      return null;
    } catch (e) {
      return String(e);
    }
  },

  setEnabled: async (runId, enabled) => {
    // optimistic flip; the RunChanged echo reconciles to server truth
    const prev = get().runs[runId];
    if (prev) set((s) => ({ runs: { ...s.runs, [runId]: { ...prev, enabled } } }));
    try {
      const res = await commands.setRunEnabled(runId, enabled);
      if (res.status === "error") {
        if (prev) set((s) => ({ runs: { ...s.runs, [runId]: prev } }));
        return res.error;
      }
      set((s) => ({ runs: { ...s.runs, [runId]: res.data } }));
      return null;
    } catch (e) {
      if (prev) set((s) => ({ runs: { ...s.runs, [runId]: prev } }));
      return String(e);
    }
  },

  runNow: async (runId) => {
    try {
      // resolves when the dispatcher finishes; progress streams via RunChanged
      const res = await commands.runNow(runId);
      return res.status === "error" ? res.error : null;
    } catch (e) {
      return String(e);
    }
  },

  reset: () => {
    started = false;
    toastedResults.clear();
    watchingSinceMs = Number.POSITIVE_INFINITY;
    set({ runs: {}, results: {}, loaded: false, error: null });
  },
}));

/** Runs sorted for the table: enabled schedules first, then newest activity. */
export function sortRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => {
    const aSched = a.enabled && a.schedule_cron ? 1 : 0;
    const bSched = b.enabled && b.schedule_cron ? 1 : 0;
    if (aSched !== bSched) return bSched - aSched;
    return (b.last_run_at ?? 0) - (a.last_run_at ?? 0);
  });
}
