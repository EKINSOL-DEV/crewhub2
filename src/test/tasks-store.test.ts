// Tasks-store reducer + store tests (T10, D-M3-2): seed / optimistic /
// confirm / rollback / reconcile, pendingVersion echo suppression, deltas,
// and the T12 run-completion fold.
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import {
  applyTasksAction,
  emptyFold,
  groupByStatus,
  onBoardDelta,
  onReviewSuggestion,
  sameTaskContent,
  sortTasks,
  taskMatchesFilter,
  useTasksStore,
  EMPTY_FILTER,
  type BoardDelta,
  type ReviewSuggestion,
  type TasksFold,
} from "@/stores/tasks";
import { task } from "./fixtures";
import { meta, sid } from "./fixtures";

afterEach(() => {
  clearMocks();
  useTasksStore.getState().reset();
});

function seeded(...tasks: ReturnType<typeof task>[]): TasksFold {
  return applyTasksAction(emptyFold(), { kind: "seed", tasks });
}

// ── Pure reducer ─────────────────────────────────────────────────────────────

test("seed populates byId", () => {
  const s = seeded(task({ id: "t1" }), task({ id: "t2", status: "done" }));
  expect(s.byId.size).toBe(2);
  expect(s.byId.get("t2")!.status).toBe("done");
});

test("optimistic move + confirm clears pending and keeps the move", () => {
  let s = seeded(task({ id: "t1" }));
  s = applyTasksAction(s, {
    kind: "optimistic",
    task: task({ id: "t1", status: "in_progress" }),
    version: 1,
  });
  expect(s.byId.get("t1")!.status).toBe("in_progress");
  expect(s.pending.get("t1")!.version).toBe(1);
  s = applyTasksAction(s, { kind: "confirm", taskId: "t1", version: 1 });
  expect(s.pending.size).toBe(0);
  expect(s.byId.get("t1")!.status).toBe("in_progress");
});

test("rollback restores the pre-move snapshot", () => {
  let s = seeded(task({ id: "t1", status: "todo" }));
  s = applyTasksAction(s, { kind: "optimistic", task: task({ id: "t1", status: "review" }), version: 1 });
  s = applyTasksAction(s, { kind: "rollback", taskId: "t1", version: 1 });
  expect(s.byId.get("t1")!.status).toBe("todo");
  expect(s.pending.size).toBe(0);
});

test("chained optimistic moves keep the ORIGINAL snapshot; stale confirm/rollback no-op", () => {
  let s = seeded(task({ id: "t1", status: "todo" }));
  s = applyTasksAction(s, {
    kind: "optimistic",
    task: task({ id: "t1", status: "in_progress" }),
    version: 1,
  });
  s = applyTasksAction(s, { kind: "optimistic", task: task({ id: "t1", status: "review" }), version: 2 });
  // v1's confirm arrives — v2 is still in flight, pending must survive.
  s = applyTasksAction(s, { kind: "confirm", taskId: "t1", version: 1 });
  expect(s.pending.get("t1")!.version).toBe(2);
  // stale rollback (v1) must not clobber the v2 optimistic state
  s = applyTasksAction(s, { kind: "rollback", taskId: "t1", version: 1 });
  expect(s.byId.get("t1")!.status).toBe("review");
  // v2 fails → rollback all the way to the original server state
  s = applyTasksAction(s, { kind: "rollback", taskId: "t1", version: 2 });
  expect(s.byId.get("t1")!.status).toBe("todo");
});

test("reconcile null drops a deleted task", () => {
  let s = seeded(task({ id: "t1" }));
  s = applyTasksAction(s, { kind: "reconcile", taskId: "t1", task: null });
  expect(s.byId.size).toBe(0);
});

test("reconcile echo of our own write keeps the pending entry (no flicker)", () => {
  let s = seeded(task({ id: "t1", status: "todo" }));
  s = applyTasksAction(s, { kind: "optimistic", task: task({ id: "t1", status: "done" }), version: 1 });
  const echo = task({ id: "t1", status: "done", updated_at: 99 });
  s = applyTasksAction(s, { kind: "reconcile", taskId: "t1", task: echo });
  expect(s.byId.get("t1")!.updated_at).toBe(99); // server timestamps adopted
  expect(s.pending.has("t1")).toBe(true); // still awaiting the IPC confirm
});

test("concurrent agent write wins last-writer and disarms a late rollback", () => {
  let s = seeded(task({ id: "t1", status: "todo" }));
  s = applyTasksAction(s, { kind: "optimistic", task: task({ id: "t1", status: "done" }), version: 1 });
  // an agent moved it to review meanwhile (via MCP)
  s = applyTasksAction(s, { kind: "reconcile", taskId: "t1", task: task({ id: "t1", status: "review" }) });
  expect(s.byId.get("t1")!.status).toBe("review");
  expect(s.pending.has("t1")).toBe(false);
  // our own write then errors — rollback must NOT clobber the agent's write
  s = applyTasksAction(s, { kind: "rollback", taskId: "t1", version: 1 });
  expect(s.byId.get("t1")!.status).toBe("review");
});

test("re-seed (G9) preserves optimistic writes still in flight", () => {
  let s = seeded(task({ id: "t1", status: "todo" }), task({ id: "t2" }));
  s = applyTasksAction(s, { kind: "optimistic", task: task({ id: "t1", status: "done" }), version: 1 });
  s = applyTasksAction(s, {
    kind: "seed",
    tasks: [task({ id: "t1", status: "todo" }), task({ id: "t3" })],
  });
  expect(s.byId.get("t1")!.status).toBe("done"); // optimistic survives
  expect(s.byId.has("t2")).toBe(false); // cascade-deleted task gone
  expect(s.byId.has("t3")).toBe(true);
});

test("sameTaskContent ignores timestamps, sees field diffs", () => {
  const a = task({ id: "t1", updated_at: 1 });
  expect(sameTaskContent(a, task({ id: "t1", updated_at: 2 }))).toBe(true);
  expect(sameTaskContent(a, task({ id: "t1", priority: "high" }))).toBe(false);
});

// ── Selectors ────────────────────────────────────────────────────────────────

test("groupByStatus groups all five columns, urgent floats first", () => {
  const groups = groupByStatus([
    task({ id: "a", status: "todo", priority: "low", updated_at: 5 }),
    task({ id: "b", status: "todo", priority: "urgent", updated_at: 1 }),
    task({ id: "c", status: "blocked" }),
    task({ id: "weird", status: "nonsense" }),
  ]);
  expect(groups.todo.map((t) => t.id)).toEqual(["b", "a"]);
  expect(groups.blocked).toHaveLength(1);
  expect(groups.in_progress).toEqual([]);
  expect(groups.review).toEqual([]);
  expect(groups.done).toEqual([]);
});

test("sortTasks: same priority falls back to freshest-first", () => {
  const sorted = sortTasks([task({ id: "old", updated_at: 1 }), task({ id: "new", updated_at: 9 })]);
  expect(sorted.map((t) => t.id)).toEqual(["new", "old"]);
});

test("taskMatchesFilter: project scope, HQ override, room/assignee/priority", () => {
  const t = task({ id: "t1", project_id: "p1", room_id: "r1", assignee_agent_id: "ag1", priority: "high" });
  expect(taskMatchesFilter(t, EMPTY_FILTER)).toBe(true);
  expect(taskMatchesFilter(t, { ...EMPTY_FILTER, projectId: "p2" })).toBe(false);
  expect(taskMatchesFilter(t, { ...EMPTY_FILTER, projectId: "p2", hq: true })).toBe(true); // HQ ignores project
  expect(taskMatchesFilter(t, { ...EMPTY_FILTER, roomId: "r2" })).toBe(false);
  expect(taskMatchesFilter(t, { ...EMPTY_FILTER, assigneeId: "ag1" })).toBe(true);
  expect(taskMatchesFilter(t, { ...EMPTY_FILTER, priority: "low" })).toBe(false);
});

// ── Store: IPC round-trips ───────────────────────────────────────────────────

test("update() success: optimistic, then confirmed (pending drains)", async () => {
  mockIPC((cmd, args) => {
    if (cmd === "update_task") return (args as { task: ReturnType<typeof task> }).task;
    return null;
  });
  const store = useTasksStore.getState();
  store.dispatch({ kind: "seed", tasks: [task({ id: "t1" })] });
  const err = await store.update(task({ id: "t1", status: "review" }));
  expect(err).toBeNull();
  expect(useTasksStore.getState().byId.get("t1")!.status).toBe("review");
  expect(useTasksStore.getState().pending.size).toBe(0);
});

test("update() error rolls back and returns the message", async () => {
  mockIPC((cmd) => {
    if (cmd === "update_task") throw "no such room";
    return null;
  });
  const store = useTasksStore.getState();
  store.dispatch({ kind: "seed", tasks: [task({ id: "t1", status: "todo" })] });
  const err = await store.move("t1", "done");
  expect(err).toContain("no such room");
  expect(useTasksStore.getState().byId.get("t1")!.status).toBe("todo");
});

test("reconcile() fetches a single task — the agent-write path (G3)", async () => {
  mockIPC((cmd, args) => {
    if (cmd === "get_task" && (args as { id: string }).id === "t1") {
      return task({ id: "t1", status: "in_progress" });
    }
    return null;
  });
  const store = useTasksStore.getState();
  store.dispatch({ kind: "seed", tasks: [task({ id: "t1" })] });
  await store.reconcile("t1");
  expect(useTasksStore.getState().byId.get("t1")!.status).toBe("in_progress");
});

// ── Board deltas (notification feed, D-M3-9) ─────────────────────────────────

test("reconcile emits moved/assigned/edited/created deltas — but never for our own echo", () => {
  const deltas: BoardDelta[] = [];
  const off = onBoardDelta((d) => deltas.push(d));
  const store = useTasksStore.getState();
  store.dispatch({ kind: "seed", tasks: [task({ id: "t1", status: "todo" })] });

  // own optimistic write + its echo: silence
  store.dispatch({ kind: "optimistic", task: task({ id: "t1", status: "done" }), version: 1 });
  store.dispatch({ kind: "reconcile", taskId: "t1", task: task({ id: "t1", status: "done" }) });
  expect(deltas).toEqual([]);
  store.dispatch({ kind: "confirm", taskId: "t1", version: 1 });

  // agent move: delta fires
  store.dispatch({ kind: "reconcile", taskId: "t1", task: task({ id: "t1", status: "blocked" }) });
  expect(deltas).toEqual([{ type: "moved", task: expect.anything(), from: "done", to: "blocked" }]);

  // agent assigns + edits in one write
  deltas.length = 0;
  store.dispatch({
    kind: "reconcile",
    taskId: "t1",
    task: task({ id: "t1", status: "blocked", assignee_agent_id: "ag1", title: "new title" }),
  });
  expect(deltas.map((d) => d.type)).toEqual(["assigned", "edited"]);

  // agent creates a fresh task
  deltas.length = 0;
  store.dispatch({ kind: "reconcile", taskId: "t9", task: task({ id: "t9", assignee_agent_id: "ag2" }) });
  expect(deltas.map((d) => d.type)).toEqual(["created", "assigned"]);
  off();
});

// ── Run linkage + completion fold (T12, D-M3-6) ──────────────────────────────

test("linked session stop while in_progress suggests review (once)", () => {
  const suggestions: ReviewSuggestion[] = [];
  const off = onReviewSuggestion((s) => suggestions.push(s));
  mockIPC(() => null);
  const store = useTasksStore.getState();
  store.dispatch({ kind: "seed", tasks: [task({ id: "t1", status: "in_progress" })] });
  store.registerRun("t1", sid("s1"), "ag1", "Botje");

  store.applyEngine({ type: "Updated", data: { meta: meta({ id: sid("s1"), status: "Idle" }) } });
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0]).toMatchObject({ taskId: "t1", agentName: "Botje" });

  // Idle fires again — no double prompt
  store.applyEngine({ type: "Updated", data: { meta: meta({ id: sid("s1"), status: "Idle" }) } });
  expect(suggestions).toHaveLength(1);
  off();
});

test("agent already moved the task via MCP: stop is silent, run closes", async () => {
  const calls: string[] = [];
  mockIPC((cmd) => {
    calls.push(cmd);
    return null;
  });
  const suggestions: ReviewSuggestion[] = [];
  const off = onReviewSuggestion((s) => suggestions.push(s));
  const store = useTasksStore.getState();
  store.dispatch({ kind: "seed", tasks: [task({ id: "t1", status: "review" })] });
  store.registerRun("t1", sid("s1"), "ag1", "Botje");

  store.applyEngine({
    type: "Signal",
    data: {
      id: sid("s1"),
      signal: { event: "stop", tool: null, path: null, payload_json: null, ts: 0 },
    },
  });
  expect(suggestions).toEqual([]);
  await Promise.resolve(); // let finishRun's IPC settle
  expect(calls).toContain("record_task_run_finished");
  expect(useTasksStore.getState().links["t1"]).toBeUndefined();
  off();
});
