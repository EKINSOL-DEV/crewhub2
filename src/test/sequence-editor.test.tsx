import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import AutomationPanel from "@/panels/automation/AutomationPanel";
import { RunHistory } from "@/panels/automation/RunHistory";
import { validateSteps, emptyStep } from "@/panels/automation/SequenceEditor";
import { resetProjectsForTests } from "@/app/project-filter";
import type { Run, RunResult } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useAutomationStore } from "@/stores/automation";
import { useToasts } from "@/stores/toasts";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { chatLeaves, seedWorkspace } from "./fixtures";

// EKI-121: deep links adopt workspace leaves only in `?window=` routes — this
// suite exercises that classic path (the main window opens overlays instead).
beforeEach(() => window.history.replaceState(null, "", "/?window=workspace"));
afterEach(() => window.history.replaceState(null, "", "/"));

const noop = () => {};

function run(overrides: Partial<Run> & { id: string }): Run {
  return {
    kind: "manual",
    schedule_cron: null,
    spec_json: JSON.stringify({
      action: "sequence",
      steps: [
        { project_path: "/p", prompt: "draft notes", model: "haiku" },
        { project_path: "/p", prompt: "polish: {{previous_output}}", model: "haiku" },
      ],
    }),
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
    finished_at: 1_100,
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

describe("validateSteps (mirrors Rust dispatch::validate_spec)", () => {
  test("at least one step, each with project + prompt", () => {
    expect(validateSteps([])).toContain("at least 1 step");
    expect(validateSteps([emptyStep()])).toContain("step 1 needs a project path");
    expect(validateSteps([{ ...emptyStep("/p") }])).toContain("step 1 needs a prompt");
    expect(validateSteps([{ projectPath: "/p", prompt: "go", model: "haiku" }])).toBeNull();
  });

  test("only {{previous_output}} may be referenced", () => {
    const ok = { projectPath: "/p", prompt: "use {{previous_output}}", model: "haiku" };
    expect(validateSteps([ok])).toBeNull();
    const bad = { projectPath: "/p", prompt: "use {{mystery}}", model: "haiku" };
    expect(validateSteps([bad])).toContain("{{mystery}}");
  });
});

test("create a 2-step sequence: add/reorder, chip insert, haiku defaults (EKI-35)", async () => {
  const created: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects" || cmd === "list_agents") return [];
    if (cmd === "create_run") {
      const { input } = args as { input: { spec_json: string } };
      created.push(input.spec_json);
      return run({ id: "seq-1", spec_json: input.spec_json });
    }
    return null;
  });
  render(<AutomationPanel leafId="leaf-1" params={{}} setParams={noop} />);
  fireEvent.click(await screen.findByTestId("new-schedule"));
  const editor = await screen.findByTestId("schedule-editor");
  fireEvent.change(within(editor).getByLabelText("Run action"), { target: { value: "sequence" } });
  await within(editor).findByTestId("sequence-editor");

  // step 1
  fireEvent.change(within(editor).getByLabelText("Step 1 project path"), { target: { value: "/work/a" } });
  fireEvent.change(within(editor).getByLabelText("Step 1 prompt"), { target: { value: "draft notes" } });

  // add step 2 — inherits the previous step's project path
  fireEvent.click(within(editor).getByTestId("add-sequence-step"));
  expect((within(editor).getByLabelText("Step 2 project path") as HTMLInputElement).value).toBe("/work/a");
  fireEvent.change(within(editor).getByLabelText("Step 2 prompt"), { target: { value: "polish: " } });
  fireEvent.click(within(editor).getByTestId("insert-previous-output-1"));
  expect((within(editor).getByLabelText("Step 2 prompt") as HTMLTextAreaElement).value).toBe(
    "polish: {{previous_output}}",
  );

  // both steps' ModelPickers default to haiku (D-M4-3, never hardcoded expensive)
  const pickers = within(editor).getAllByTestId("model-haiku");
  for (const p of pickers) expect(p).toHaveAttribute("aria-checked", "true");

  fireEvent.click(within(editor).getByTestId("schedule-save"));
  await waitFor(() => expect(created).toHaveLength(1));
  expect(JSON.parse(created[0]!)).toEqual({
    action: "sequence",
    steps: [
      { project_path: "/work/a", prompt: "draft notes", model: "haiku" },
      { project_path: "/work/a", prompt: "polish: {{previous_output}}", model: "haiku" },
    ],
  });
});

test("step reorder and remove", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects" || cmd === "list_agents") return [];
    return null;
  });
  render(<AutomationPanel leafId="leaf-1" params={{}} setParams={noop} />);
  fireEvent.click(await screen.findByTestId("new-schedule"));
  const editor = await screen.findByTestId("schedule-editor");
  fireEvent.change(within(editor).getByLabelText("Run action"), { target: { value: "sequence" } });
  await within(editor).findByTestId("sequence-editor");

  fireEvent.change(within(editor).getByLabelText("Step 1 prompt"), { target: { value: "first" } });
  fireEvent.click(within(editor).getByTestId("add-sequence-step"));
  fireEvent.change(within(editor).getByLabelText("Step 2 prompt"), { target: { value: "second" } });

  fireEvent.click(within(editor).getByLabelText("Move step 2 up"));
  expect((within(editor).getByLabelText("Step 1 prompt") as HTMLTextAreaElement).value).toBe("second");

  fireEvent.click(within(editor).getByLabelText("Remove step 2"));
  expect(within(editor).queryByTestId("sequence-step-1")).toBeNull();
  // the last remaining step cannot be removed (a sequence needs ≥1)
  expect(within(editor).getByLabelText("Remove step 1")).toBeDisabled();
});

test("unknown variables refuse to save with a pointed message", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_projects" || cmd === "list_agents") return [];
    return null;
  });
  render(<AutomationPanel leafId="leaf-1" params={{}} setParams={noop} />);
  fireEvent.click(await screen.findByTestId("new-schedule"));
  const editor = await screen.findByTestId("schedule-editor");
  fireEvent.change(within(editor).getByLabelText("Run action"), { target: { value: "sequence" } });
  await within(editor).findByTestId("sequence-editor");
  fireEvent.change(within(editor).getByLabelText("Step 1 project path"), { target: { value: "/p" } });
  fireEvent.change(within(editor).getByLabelText("Step 1 prompt"), { target: { value: "use {{nope}}" } });
  fireEvent.click(within(editor).getByTestId("schedule-save"));
  await screen.findByTestId("schedule-editor-error");
  expect(screen.getByTestId("schedule-editor-error").textContent).toContain("{{nope}}");
});

test("step results timeline: failed step loud, skipped muted, per-step transcript links (halt-on-failure honesty)", async () => {
  const seq = run({ id: "seq-1" });
  const rows = [
    result({
      id: "st0",
      run_id: "seq-1",
      step_index: 0,
      started_at: 10,
      status: "success",
      session_id: "sess-a",
    }),
    result({
      id: "st1",
      run_id: "seq-1",
      step_index: 1,
      started_at: 20,
      status: "error",
      summary: "exec failed: boom",
      session_id: "sess-b",
    }),
    result({
      id: "st2",
      run_id: "seq-1",
      step_index: 2,
      started_at: 30,
      status: "skipped",
      summary: "skipped: an earlier step failed",
      session_id: null,
    }),
  ];
  mockIPC((cmd) => {
    if (cmd === "list_run_results") return rows;
    return null;
  });
  render(<RunHistory run={seq} />);
  const failed = await screen.findByTestId("run-result-st1");
  expect(failed.className).toContain("border-destructive"); // loud
  expect(failed.textContent).toContain("step 2");
  expect(failed.textContent).toContain("exec failed: boom");

  const skipped = screen.getByTestId("run-result-st2");
  expect(skipped.className).toContain("opacity-50"); // muted
  expect(within(skipped).queryByRole("button")).toBeNull(); // no transcript — never ran

  // per-step transcript links open the chat panel on that session
  fireEvent.click(within(screen.getByTestId("run-result-st0")).getByTestId("result-transcript-st0"));
  expect(chatLeaves()[0]?.params).toMatchObject({ sessionId: "claude-code:sess-a", mode: "history" });
});

test("edit round-trip: an existing sequence opens in the structured editor", async () => {
  const seq = run({ id: "seq-1" });
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [seq];
    if (cmd === "list_run_results") return [];
    if (cmd === "list_projects" || cmd === "list_agents") return [];
    return null;
  });
  render(<AutomationPanel leafId="leaf-1" params={{}} setParams={noop} />);
  const row = await screen.findByTestId("run-row-seq-1");
  fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
  const editor = await screen.findByTestId("schedule-editor");
  expect((within(editor).getByLabelText("Run action") as HTMLSelectElement).value).toBe("sequence");
  expect((within(editor).getByLabelText("Step 2 prompt") as HTMLTextAreaElement).value).toBe(
    "polish: {{previous_output}}",
  );
});
