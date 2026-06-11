import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import AutomationPanel from "@/panels/automation/AutomationPanel";
import { resetProjectsForTests } from "@/app/project-filter";
import type { Run, RunResult } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useAutomationStore } from "@/stores/automation";
import { useToasts } from "@/stores/toasts";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { seedWorkspace } from "./fixtures";

const noop = () => {};

function run(overrides: Partial<Run> & { id: string }): Run {
  return {
    kind: "manual",
    schedule_cron: null,
    spec_json: JSON.stringify({ action: "prompt", project_path: "/p", prompt: "ship the thing" }),
    enabled: true,
    last_run_at: null,
    ...overrides,
  };
}

function result(overrides: Partial<RunResult> & { id: string; run_id: string }): RunResult {
  return {
    session_id: null,
    status: "success",
    summary: "did it",
    step_index: null,
    started_at: 100,
    finished_at: 5_100,
    ...overrides,
  };
}

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  useAutomationStore.getState().reset();
  useAgentsStore.getState().reset();
  useToasts.getState().reset();
  resetProjectsForTests();
  resetWorkspaceForTests();
});

function renderPanel(params: Record<string, string> = {}) {
  return render(<AutomationPanel leafId="leaf-1" params={params} setParams={noop} />);
}

test("Quiet Orchestra empty state + the honest scheduler copy, prominent", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    return null;
  });
  renderPanel();
  await screen.findByText("Nothing scheduled — the crew sleeps in");
  // the honest copy is a visible banner, not a tooltip (D-M4-4 AC)
  expect(screen.getByTestId("scheduler-honest-copy").textContent).toContain(
    "Schedules run only while CrewHub is open.",
  );
});

test("runs table: kind, summary, human cron, Cron Critter, enabled toggle, last result", async () => {
  const sched = run({
    id: "r-sched",
    kind: "scheduled",
    schedule_cron: "0 9 * * 1-5",
    last_run_at: 50,
  });
  mockIPC((cmd, args) => {
    if (cmd === "list_runs") return [sched];
    if (cmd === "list_run_results") return [result({ id: "res-1", run_id: "r-sched", status: "error" })];
    if (cmd === "set_run_enabled") return { ...sched, enabled: !(args as { enabled: boolean }).enabled };
    return null;
  });
  renderPanel();
  const row = await screen.findByTestId("run-row-r-sched");
  expect(within(row).getByText("ship the thing")).toBeInTheDocument();
  expect(within(row).getByText("every weekday at 09:00")).toBeInTheDocument();
  // Cron Critter ticks while enabled (reduced-motion drops the class below)
  expect(screen.getByTestId("cron-critter-r-sched").className).toContain("cron-tick");
  await waitFor(() => expect(screen.getByTestId("last-result-r-sched").textContent).toContain("❌"));

  fireEvent.click(within(row).getByTestId("run-enabled-r-sched"));
  await waitFor(() => expect(within(row).getByTestId("run-enabled-r-sched").textContent).toBe("off"));
});

test("Cron Critter respects prefers-reduced-motion (static chip)", async () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  try {
    mockIPC((cmd) => {
      if (cmd === "list_runs") return [run({ id: "r1", schedule_cron: "0 9 * * *", kind: "scheduled" })];
      if (cmd === "list_run_results") return [];
      return null;
    });
    renderPanel();
    const chip = await screen.findByTestId("cron-critter-r1");
    expect(chip.className).not.toContain("cron-tick");
  } finally {
    window.matchMedia = original;
  }
});

test("🚀 Run now goes through the dispatcher IPC and surfaces errors honestly", async () => {
  const fired: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_runs") return [run({ id: "r1" })];
    if (cmd === "list_run_results") return [];
    if (cmd === "run_now") {
      fired.push((args as { runId: string }).runId);
      throw new Error("no headless-capable provider");
    }
    return null;
  });
  renderPanel();
  fireEvent.click(await screen.findByTestId("run-now-r1"));
  await waitFor(() => expect(fired).toEqual(["r1"]));
  await screen.findByTestId("automation-error");
  expect(screen.getByTestId("automation-error").textContent).toContain("no headless-capable provider");
});

test("history drawer lists results with duration and a transcript link", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [run({ id: "r1" })];
    if (cmd === "list_run_results")
      return [result({ id: "res-1", run_id: "r1", session_id: "sess-9", started_at: 0, finished_at: 5000 })];
    return null;
  });
  renderPanel();
  const row = await screen.findByTestId("run-row-r1");
  fireEvent.click(within(row).getByRole("button", { name: "History" }));
  const item = await screen.findByTestId("run-result-res-1");
  expect(item.textContent).toContain("success");
  expect(item.textContent).toContain("5s");
  expect(screen.getByTestId("result-transcript-res-1")).toBeInTheDocument();
});

test("schedule editor: create a scheduled prompt run with live cron preview (note displayed)", async () => {
  const created: Array<{ kind: string; schedule_cron: string | null; spec_json: string }> = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects") return [];
    if (cmd === "list_agents") return [];
    if (cmd === "preview_cron")
      return {
        next: [1_700_000_000_000, 1_700_086_400_000, 1_700_172_800_000],
        desc: "At 09:00, Monday through Friday",
        note: "Schedules run only while CrewHub is open.",
      };
    if (cmd === "create_run") {
      const { input } = args as { input: { kind: string; schedule_cron: string | null; spec_json: string } };
      created.push(input);
      return run({ id: "new-run", ...input });
    }
    return null;
  });
  renderPanel();
  fireEvent.click(await screen.findByTestId("new-schedule"));
  const editor = await screen.findByTestId("schedule-editor");

  fireEvent.change(within(editor).getByLabelText("Run project path"), { target: { value: "/work/proj" } });
  fireEvent.change(within(editor).getByLabelText("Run prompt"), { target: { value: "nightly tidy" } });
  fireEvent.change(within(editor).getByLabelText("Cron expression"), { target: { value: "0 9 * * 1-5" } });

  // ModelPicker present, haiku pre-selected (D-M4-3 — never hardcoded expensive)
  expect(within(editor).getByTestId("model-haiku")).toHaveAttribute("aria-checked", "true");

  // debounced preview_cron: desc + next fires + the honest note from the IPC
  await screen.findByTestId("cron-preview", undefined, { timeout: 2000 });
  expect(screen.getByTestId("cron-honest-note").textContent).toContain(
    "Schedules run only while CrewHub is open.",
  );

  fireEvent.click(within(editor).getByTestId("schedule-save"));
  await waitFor(() => expect(created).toHaveLength(1));
  expect(created[0]).toMatchObject({ kind: "scheduled", schedule_cron: "0 9 * * 1-5" });
  expect(JSON.parse(created[0]!.spec_json)).toMatchObject({
    action: "prompt",
    project_path: "/work/proj",
    prompt: "nightly tidy",
    model: "haiku",
  });
  await waitFor(() => expect(screen.queryByTestId("schedule-editor")).toBeNull());
  expect(screen.getByTestId("run-row-new-run")).toBeInTheDocument();
});

test("editor validation: a prompt run without a project path refuses to save", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects" || cmd === "list_agents") return [];
    return null;
  });
  renderPanel();
  fireEvent.click(await screen.findByTestId("new-schedule"));
  const editor = await screen.findByTestId("schedule-editor");
  fireEvent.click(within(editor).getByTestId("schedule-save"));
  await screen.findByTestId("schedule-editor-error");
  expect(screen.getByTestId("schedule-editor-error").textContent).toContain("project path");
});

test("standup spec editor: agent multiselect builds the D-M4-5 standup shape", async () => {
  const created: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects") return [];
    if (cmd === "list_agents")
      return [
        {
          id: "ag-1",
          name: "Scout",
          icon: "🦊",
          color: null,
          avatar: null,
          default_model: "haiku",
          project_path: null,
          permission_mode: "Default",
          system_prompt: null,
          persona_json: null,
          is_pinned: false,
          auto_spawn: false,
          bio: null,
          created_at: 0,
          updated_at: 0,
        },
      ];
    if (cmd === "create_run") {
      const { input } = args as { input: { spec_json: string } };
      created.push(input.spec_json);
      return run({ id: "new-standup", spec_json: input.spec_json });
    }
    return null;
  });
  renderPanel();
  fireEvent.click(await screen.findByTestId("new-schedule"));
  const editor = await screen.findByTestId("schedule-editor");
  fireEvent.change(within(editor).getByLabelText("Run action"), { target: { value: "standup" } });
  fireEvent.change(await within(editor).findByLabelText("Standup title"), { target: { value: "Daily" } });
  fireEvent.click(await within(editor).findByLabelText("Standup agent Scout"));
  fireEvent.click(within(editor).getByTestId("schedule-save"));
  await waitFor(() => expect(created).toHaveLength(1));
  expect(JSON.parse(created[0]!)).toEqual({ action: "standup", agent_ids: ["ag-1"], title: "Daily" });
});

test("deep-link params: spec prefill opens the editor (Lane G standup hand-off)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects" || cmd === "list_agents") return [];
    return null;
  });
  renderPanel({ spec: JSON.stringify({ action: "standup", title: "Daily" }), cron: "0 9 * * *" });
  const editor = await screen.findByTestId("schedule-editor");
  expect((within(editor).getByLabelText("Run action") as HTMLSelectElement).value).toBe("standup");
  expect((within(editor).getByLabelText("Standup title") as HTMLInputElement).value).toBe("Daily");
  expect((within(editor).getByLabelText("Cron expression") as HTMLInputElement).value).toBe("0 9 * * *");
});
