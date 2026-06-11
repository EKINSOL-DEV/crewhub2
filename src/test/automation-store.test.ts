import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { Run, RunResult } from "@/ipc/bindings";
import {
  isTerminalResult,
  resultEmoji,
  sortResults,
  sortRuns,
  useAutomationStore,
} from "@/stores/automation";
import { useToasts } from "@/stores/toasts";

function run(overrides: Partial<Run> & { id: string }): Run {
  return {
    kind: "manual",
    schedule_cron: null,
    spec_json: JSON.stringify({ action: "prompt", project_path: "/p", prompt: "hello" }),
    enabled: true,
    last_run_at: null,
    ...overrides,
  };
}

function result(overrides: Partial<RunResult> & { id: string; run_id: string }): RunResult {
  return {
    session_id: null,
    status: "success",
    summary: "done",
    step_index: null,
    started_at: 100,
    finished_at: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  clearMocks();
  useAutomationStore.getState().reset();
  useToasts.getState().reset();
});

describe("pure helpers", () => {
  test("terminal statuses and emoji", () => {
    for (const s of ["success", "error", "skipped", "interrupted"]) expect(isTerminalResult(s)).toBe(true);
    expect(isTerminalResult("running")).toBe(false);
    expect(resultEmoji("success")).toBe("✅");
    expect(resultEmoji("weird")).toBe("❓");
  });

  test("sortResults: newest execution first, step order stable on ties", () => {
    const rows = [
      result({ id: "s2", run_id: "r", step_index: 1, started_at: 50, status: "skipped" }),
      result({ id: "a", run_id: "r", started_at: 10 }),
      result({ id: "s1", run_id: "r", step_index: 0, started_at: 50 }),
    ];
    expect(sortResults(rows).map((r) => r.id)).toEqual(["s1", "s2", "a"]);
  });

  test("sortRuns: enabled schedules first, then newest activity", () => {
    const rows = [
      run({ id: "manual-old", last_run_at: 10 }),
      run({ id: "sched", schedule_cron: "0 9 * * *", kind: "scheduled", last_run_at: 1 }),
      run({ id: "manual-new", last_run_at: 99 }),
      run({ id: "sched-off", schedule_cron: "0 9 * * *", enabled: false, last_run_at: 50 }),
    ];
    expect(sortRuns(rows).map((r) => r.id)).toEqual(["sched", "manual-new", "sched-off", "manual-old"]);
  });
});

describe("store", () => {
  test("init seeds from list_runs; reconcile applies get_run and drops deletions", async () => {
    const r1 = run({ id: "r1" });
    mockIPC((cmd, args) => {
      if (cmd === "list_runs") return [r1];
      if (cmd === "get_run") {
        const { id } = args as { id: string };
        return id === "r1" ? { ...r1, enabled: false } : null;
      }
      if (cmd === "list_run_results") return [];
      return null;
    });
    const s = useAutomationStore.getState();
    await s.init();
    expect(useAutomationStore.getState().runs.r1?.enabled).toBe(true);
    expect(useAutomationStore.getState().loaded).toBe(true);

    await s.reconcile("r1");
    expect(useAutomationStore.getState().runs.r1?.enabled).toBe(false);

    // a RunChanged for a deleted run drops it (get_run → null)
    await s.reconcile("gone");
    await useAutomationStore.getState().reconcile("r1"); // still there
    mockIPC((cmd) => {
      if (cmd === "get_run") return null;
      if (cmd === "list_run_results") return [];
      return null;
    });
    await s.reconcile("r1");
    expect(useAutomationStore.getState().runs.r1).toBeUndefined();
  });

  test("loadResults caches sorted results; reconcile refreshes only cached runs", async () => {
    const r1 = run({ id: "r1" });
    let rows = [result({ id: "a", run_id: "r1", started_at: 1 })];
    mockIPC((cmd) => {
      if (cmd === "list_runs") return [r1];
      if (cmd === "get_run") return r1;
      if (cmd === "list_run_results") return rows;
      return null;
    });
    const s = useAutomationStore.getState();
    await s.init();
    expect(useAutomationStore.getState().results.r1).toBeUndefined();

    await s.loadResults("r1");
    expect(useAutomationStore.getState().results.r1).toHaveLength(1);

    rows = [...rows, result({ id: "b", run_id: "r1", started_at: 2 })];
    await s.reconcile("r1");
    expect(useAutomationStore.getState().results.r1?.map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("a fresh terminal result toasts once (and only post-init results)", async () => {
    const r1 = run({ id: "r1" });
    const old = result({ id: "old", run_id: "r1", status: "error", finished_at: 1 }); // pre-dates init
    let rows = [old];
    mockIPC((cmd) => {
      if (cmd === "list_runs") return [r1];
      if (cmd === "get_run") return r1;
      if (cmd === "list_run_results") return rows;
      return null;
    });
    const s = useAutomationStore.getState();
    await s.init();
    await s.reconcile("r1");
    expect(useToasts.getState().toasts).toHaveLength(0); // history ≠ news

    rows = [old, result({ id: "new", run_id: "r1", status: "success", finished_at: Date.now() + 1000 })];
    await s.reconcile("r1");
    await s.reconcile("r1"); // a second RunChanged must not re-toast
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.text).toContain("✅ run success");
    expect(toasts[0]?.text).toContain("hello");
  });

  test("setEnabled is optimistic and rolls back on error", async () => {
    const r1 = run({ id: "r1", enabled: true });
    mockIPC((cmd) => {
      if (cmd === "list_runs") return [r1];
      if (cmd === "set_run_enabled") throw new Error("nope");
      return null;
    });
    const s = useAutomationStore.getState();
    await s.init();
    const err = await s.setEnabled("r1", false);
    expect(err).toContain("nope");
    expect(useAutomationStore.getState().runs.r1?.enabled).toBe(true); // rolled back
  });

  test("create/remove update the map; runNow surfaces dispatcher errors", async () => {
    const created = run({ id: "fresh" });
    mockIPC((cmd) => {
      if (cmd === "list_runs") return [];
      if (cmd === "create_run") return created;
      if (cmd === "delete_run") return true;
      if (cmd === "run_now") throw new Error("spec_json: bad");
      return null;
    });
    const s = useAutomationStore.getState();
    await s.init();
    expect(await s.create({ kind: "manual", schedule_cron: null, spec_json: created.spec_json })).toBeNull();
    expect(useAutomationStore.getState().runs.fresh).toBeDefined();
    expect(await s.runNow("fresh")).toContain("bad");
    expect(await s.remove("fresh")).toBeNull();
    expect(useAutomationStore.getState().runs.fresh).toBeUndefined();
  });
});
