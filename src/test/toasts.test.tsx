// Task notifications (T14, EKI-99): the pure rule matcher (triggers, scopes,
// mention parsing, D-M3-9), toast queue dedupe, ToastCenter rendering with
// Toast Critters (shake + reduced-motion static), click-through to the board,
// and the review-suggestion action closing the run loop (D-M3-6).
import { act, render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { leaves } from "@/app/layout-tree";
import { ToastCenter } from "@/components/ToastCenter";
import { useAgentsStore } from "@/stores/agents";
import { useTasksStore } from "@/stores/tasks";
import { focusBoardAtTask, matchRules, mentionedAgents, toastCopy, useToasts } from "@/stores/toasts";
import { useWorkspace } from "@/stores/workspace";
import { agent, notificationRule, seedWorkspace, sid, task } from "./fixtures";

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => mockMatchMedia(false));

afterEach(() => {
  cleanup();
  clearMocks();
  useToasts.getState().reset();
  useTasksStore.getState().reset();
  useAgentsStore.getState().reset();
});

const botje = agent({ id: "ag-1", name: "Botje", icon: "🦾" });

// ── mentionedAgents ──────────────────────────────────────────────────────────

test("mentionedAgents finds @Name case-insensitively, ignores non-mentions", () => {
  const agents = [botje, agent({ id: "ag-2", name: "Scout" })];
  expect(mentionedAgents("ping @botje about this", agents).map((a) => a.id)).toEqual(["ag-1"]);
  expect(mentionedAgents("Botje without the at-sign", agents)).toEqual([]);
  expect(mentionedAgents("@Scout and @Botje", agents)).toHaveLength(2);
});

// ── matchRules (pure, closed trigger list) ───────────────────────────────────

test("task_moved fires on any move; task_blocked only on a move into blocked", () => {
  const rules = [
    notificationRule({ id: "r1", trigger: "task_moved" }),
    notificationRule({ id: "r2", trigger: "task_blocked" }),
  ];
  const moved = matchRules(
    rules,
    { type: "moved", task: task({ id: "t1", status: "review" }), from: "todo", to: "review" },
    [],
  );
  expect(moved.map((m) => m.trigger)).toEqual(["task_moved"]);
  const blocked = matchRules(
    rules,
    { type: "moved", task: task({ id: "t1", status: "blocked" }), from: "todo", to: "blocked" },
    [],
  );
  expect(blocked.map((m) => m.trigger)).toEqual(["task_moved", "task_blocked"]);
});

test("disabled rules never fire; several matching rules yield ONE notification", () => {
  const off = [notificationRule({ id: "r1", trigger: "task_moved", enabled: false })];
  const event = {
    type: "moved" as const,
    task: task({ id: "t1", status: "done" }),
    from: "review",
    to: "done",
  };
  expect(matchRules(off, event, [])).toEqual([]);
  const twice = [
    notificationRule({ id: "r1", trigger: "task_moved" }),
    notificationRule({ id: "r2", trigger: "task_moved", scope: "project", scope_id: "p1" }),
  ];
  expect(
    matchRules(twice, { ...event, task: task({ id: "t1", status: "done", project_id: "p1" }) }, []),
  ).toHaveLength(1);
});

test("scopes: project matches the task's project, agent matches the concerned agent", () => {
  const projectRule = [
    notificationRule({ id: "r", trigger: "task_moved", scope: "project", scope_id: "p1" }),
  ];
  const inP1 = {
    type: "moved" as const,
    task: task({ id: "t1", status: "done", project_id: "p1" }),
    from: "todo",
    to: "done",
  };
  const inP2 = {
    type: "moved" as const,
    task: task({ id: "t2", status: "done", project_id: "p2" }),
    from: "todo",
    to: "done",
  };
  expect(matchRules(projectRule, inP1, [])).toHaveLength(1);
  expect(matchRules(projectRule, inP2, [])).toEqual([]);

  const agentRule = [
    notificationRule({ id: "r", trigger: "task_assigned", scope: "agent", scope_id: "ag-1" }),
  ];
  expect(
    matchRules(agentRule, { type: "assigned", task: task({ id: "t1" }), assigneeId: "ag-1" }, []),
  ).toHaveLength(1);
  expect(
    matchRules(agentRule, { type: "assigned", task: task({ id: "t1" }), assigneeId: "ag-2" }, []),
  ).toEqual([]);
});

test("task_mention: @AgentName in created/edited text and status_update text", () => {
  const rules = [notificationRule({ id: "r", trigger: "task_mention" })];
  const agents = [botje];
  expect(
    matchRules(rules, { type: "created", task: task({ id: "t1", description: "ask @Botje" }) }, agents),
  ).toMatchObject([{ trigger: "task_mention", agentId: "ag-1" }]);
  expect(
    matchRules(rules, { type: "status_update", task: task({ id: "t1" }), text: "cc @botje" }, agents),
  ).toHaveLength(1);
  expect(matchRules(rules, { type: "created", task: task({ id: "t1" }) }, agents)).toEqual([]);
});

test("toastCopy is verb-first with the acting face up front (Toast Critters)", () => {
  const n = {
    trigger: "task_moved" as const,
    taskId: "t1",
    task: task({ id: "t1", title: "Fix flaky test", status: "review" }),
    agentId: null,
  };
  const copy = toastCopy(n, { name: "Botje", emoji: "🦾" });
  expect(copy.emoji).toBe("🦾");
  expect(copy.text).toContain("Botje moved “Fix flaky test” → Review");
});

// ── Store + ToastCenter ──────────────────────────────────────────────────────

function seedRules(rules: ReturnType<typeof notificationRule>[]) {
  useToasts.setState({ rules, loaded: true });
}

test("publish renders a toast; same task+trigger dedupes within 5 s", () => {
  mockIPC(() => []);
  seedRules([notificationRule({ id: "r1", trigger: "task_moved" })]);
  render(<ToastCenter />);
  const event = {
    type: "moved" as const,
    task: task({ id: "t1", title: "Fix it", status: "review" }),
    from: "todo",
    to: "review",
  };
  act(() => {
    useToasts.getState().publish(event, { name: "Botje", emoji: "🦾" });
    useToasts.getState().publish(event, { name: "Botje", emoji: "🦾" }); // duplicate burst
  });
  expect(screen.getAllByTestId("toast-body")).toHaveLength(1);
  expect(screen.getByTestId("toast-body")).toHaveTextContent("Botje moved “Fix it” → Review");
});

test("blocked toasts shake — except under prefers-reduced-motion", () => {
  mockIPC(() => []);
  seedRules([notificationRule({ id: "r1", trigger: "task_blocked" })]);
  render(<ToastCenter />);
  act(() => {
    useToasts.getState().publish({
      type: "moved",
      task: task({ id: "t1", title: "Stuck", status: "blocked" }),
      from: "todo",
      to: "blocked",
    });
  });
  expect(screen.getByRole("status")).toHaveClass("ch-toast-shake");

  cleanup();
  useToasts.getState().reset();
  mockMatchMedia(true);
  seedRules([notificationRule({ id: "r1", trigger: "task_blocked" })]);
  render(<ToastCenter />);
  act(() => {
    useToasts.getState().publish({
      type: "moved",
      task: task({ id: "t2", title: "Stuck again", status: "blocked" }),
      from: "todo",
      to: "blocked",
    });
  });
  expect(screen.getByRole("status")).not.toHaveClass("ch-toast-shake");
});

test("click-through focuses an existing board panel at the task (Epic 22 contract)", () => {
  mockIPC(() => []);
  seedWorkspace();
  const s = useWorkspace.getState();
  const tab = s.tabs[0]!;
  const welcome = leaves(tab.root)[0]!;
  s.replacePanel(welcome.id, "board", {});

  focusBoardAtTask("t-42");
  const board = leaves(useWorkspace.getState().tabs[0]!.root).find((l) => l.kind === "board")!;
  expect(board.params).toMatchObject({ task: "t-42" });
  expect(useWorkspace.getState().focusedLeafId).toBe(board.id);
});

test("click-through opens a board when none exists", () => {
  mockIPC(() => []);
  seedWorkspace();
  focusBoardAtTask("t-7");
  const board = leaves(useWorkspace.getState().tabs[0]!.root).find((l) => l.kind === "board");
  expect(board?.params).toMatchObject({ task: "t-7" });
});

test("review suggestion toast: one click moves to review and records run_finished", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "update_task") return (args as { task: ReturnType<typeof task> }).task;
    if (cmd === "list_notification_rules") return [];
    if (cmd === "list_task_events") return [];
    return null;
  });
  render(<ToastCenter />); // init subscribes to suggestions
  await waitFor(() => expect(useToasts.getState().loaded).toBe(true));

  const tasks = useTasksStore.getState();
  tasks.dispatch({ kind: "seed", tasks: [task({ id: "t1", title: "Fix it", status: "in_progress" })] });
  tasks.registerRun("t1", sid("s1"), "ag-1", "Botje");
  tasks.applyEngine({
    type: "Signal",
    data: { id: sid("s1"), signal: { event: "stop", tool: null, path: null, payload_json: null, ts: 0 } },
  });

  const action = await screen.findByTestId("toast-action");
  expect(screen.getByTestId("toast-body")).toHaveTextContent("Botje finished");
  fireEvent.click(action);

  await waitFor(() => {
    const update = calls.find((c) => c.cmd === "update_task");
    expect(update).toBeDefined();
    expect((update!.args as { task: { status: string } }).task.status).toBe("review");
  });
  await waitFor(() => expect(calls.some((c) => c.cmd === "record_task_run_finished")).toBe(true));
  expect(screen.queryByTestId("toast-action")).toBeNull(); // toast dismissed
});

test("rules section: add, per-rule mute toggle, delete — persistent via IPC", async () => {
  const { NotificationRulesSection } = await import("@/panels/board/NotificationRulesSection");
  let rules: ReturnType<typeof notificationRule>[] = [];
  const calls: string[] = [];
  mockIPC((cmd, args) => {
    calls.push(cmd);
    if (cmd === "list_notification_rules") return rules;
    if (cmd === "create_notification_rule") {
      const input = (args as { input: { trigger: string; scope: string } }).input;
      rules = [...rules, notificationRule({ id: "r-new", trigger: input.trigger, scope: input.scope })];
      return rules[rules.length - 1];
    }
    if (cmd === "update_notification_rule") {
      const rule = (args as { rule: ReturnType<typeof notificationRule> }).rule;
      rules = rules.map((r) => (r.id === rule.id ? rule : r));
      return rule;
    }
    if (cmd === "delete_notification_rule") {
      rules = rules.filter((r) => r.id !== (args as { id: string }).id);
      return true;
    }
    return [];
  });
  render(<NotificationRulesSection />);
  await screen.findByTestId("no-rules");

  fireEvent.click(screen.getByTestId("add-rule"));
  await screen.findByTestId("rule-r-new");
  expect(calls).toContain("create_notification_rule");

  const toggle = screen.getByLabelText(/Enable rule/);
  fireEvent.click(toggle);
  await waitFor(() => expect(rules[0]!.enabled).toBe(false)); // per-rule mute

  fireEvent.click(screen.getByLabelText("Delete rule"));
  await screen.findByTestId("no-rules");
});

test("board deltas flow through rules into toasts end-to-end (agent move via reconcile)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_notification_rules") return [notificationRule({ id: "r1", trigger: "task_moved" })];
    if (cmd === "list_task_events") return [];
    return [];
  });
  render(<ToastCenter />);
  await waitFor(() => expect(useToasts.getState().loaded).toBe(true));

  const tasks = useTasksStore.getState();
  tasks.dispatch({ kind: "seed", tasks: [task({ id: "t1", title: "Fix it", status: "todo" })] });
  // an agent moves it (reconcile path) — no pending entry, so the delta fires
  tasks.dispatch({
    kind: "reconcile",
    taskId: "t1",
    task: task({ id: "t1", title: "Fix it", status: "review" }),
  });

  await screen.findByTestId("toast-body");
  expect(screen.getByTestId("toast-body")).toHaveTextContent("moved “Fix it” → Review");
});

test("status_update feed (T17): mention rules fire on MCP status updates", async () => {
  const t1 = task({ id: "t1", title: "Wire it" });
  mockIPC((cmd) => {
    if (cmd === "list_notification_rules") return [notificationRule({ id: "r1", trigger: "task_mention" })];
    if (cmd === "get_setting")
      return JSON.stringify({ text: "stuck — ping @Botje", by: "agent:ag-1", task_id: "t1", ts: 1 });
    if (cmd === "get_task") return t1;
    return [];
  });
  useAgentsStore.setState({ agents: [botje], loaded: true });
  render(<ToastCenter />);
  await waitFor(() => expect(useToasts.getState().loaded).toBe(true));
  await act(() => useToasts.getState().publishStatusUpdate());
  await screen.findByTestId("toast-body");
  expect(screen.getByTestId("toast-body")).toHaveTextContent("Botje is mentioned on “Wire it”");
});
