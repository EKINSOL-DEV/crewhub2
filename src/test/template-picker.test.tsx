// T15 (EKI-39): the insert picker — templates alongside slash commands/skills,
// variable-fill mini-form, blanks-stay-chips, and the composer mount.
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { renderWithBlanksKept, TemplatePicker, variablesToFill } from "@/panels/automation/TemplatePicker";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import type { PromptTemplate, SessionMeta } from "@/ipc/bindings";
import { Composer } from "@/panels/chat/Composer";
import { useSessionsStore } from "@/stores/sessions";
import { useTemplatesStore } from "@/stores/templates";
import { useTranscripts } from "@/stores/transcripts";
import { project, sid } from "./fixtures";

function tpl(overrides: Partial<PromptTemplate> & { id: string; name: string }): PromptTemplate {
  return {
    template: "review {{path}} for {{focus}}",
    variables_json: JSON.stringify([{ name: "path" }, { name: "focus", default: "bugs" }]),
    project_id: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  clearMocks();
  useTemplatesStore.getState().reset();
  useSessionsStore.getState().reset();
  useTranscripts.setState({ sessions: {} });
  resetProjectsForTests();
});

describe("pure helpers", () => {
  test("variablesToFill: declared order first, referenced-but-undeclared appended", () => {
    const t = tpl({
      id: "t",
      name: "t",
      template: "{{extra}} then {{path}}",
      variables_json: JSON.stringify([{ name: "path" }, { name: "focus", default: "bugs" }]),
    });
    expect(variablesToFill(t)).toEqual([
      { name: "path", default: "" },
      { name: "focus", default: "bugs" },
      { name: "extra", default: "" },
    ]);
  });

  test("renderWithBlanksKept: blanks stay literal chips (previous_output survives)", () => {
    expect(renderWithBlanksKept("a {{x}} b {{previous_output}}", { x: "1" })).toBe(
      "a 1 b {{previous_output}}",
    );
  });
});

test("templates listed alongside slash commands & skills; slash inserts /name", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_prompt_templates") return [tpl({ id: "t1", name: "Code review" })];
    if (cmd === "list_slash_commands")
      return [
        { name: "commit", description: "commit staged changes" },
        { name: "deep-research", description: null },
      ];
    return null;
  });
  const inserted: string[] = [];
  render(
    <TemplatePicker
      projectId={null}
      projectPath="/work/proj"
      onInsert={(t) => inserted.push(t)}
      onClose={() => {}}
    />,
  );
  await screen.findByTestId("template-option-t1");
  await screen.findByTestId("picker-slash-commit");
  expect(screen.getByText("slash commands & skills")).toBeInTheDocument();

  fireEvent.click(screen.getByTestId("picker-slash-commit"));
  expect(inserted).toEqual(["/commit "]);
});

test("filter narrows both lists; empty state mentions the library", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_prompt_templates") return [tpl({ id: "t1", name: "Code review" })];
    if (cmd === "list_slash_commands") return [{ name: "commit", description: null }];
    return null;
  });
  render(<TemplatePicker projectId={null} projectPath="/p" onInsert={() => {}} onClose={() => {}} />);
  await screen.findByTestId("template-option-t1");
  fireEvent.change(screen.getByLabelText("Filter templates and commands"), { target: { value: "zzz" } });
  await screen.findByTestId("template-picker-empty");
});

test("a template without variables inserts immediately; with variables → fill form", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_prompt_templates")
      return [
        tpl({ id: "plain", name: "Plain", template: "just text", variables_json: null }),
        tpl({ id: "vars", name: "With vars" }),
      ];
    return null;
  });
  const inserted: string[] = [];
  render(<TemplatePicker projectId={null} onInsert={(t) => inserted.push(t)} onClose={() => {}} />);

  fireEvent.click(await screen.findByTestId("template-option-plain"));
  expect(inserted).toEqual(["just text"]);

  fireEvent.click(screen.getByTestId("template-option-vars"));
  const form = await screen.findByTestId("template-fill-form");
  // defaults pre-filled from variables_json
  expect((within(form).getByLabelText("Template variable focus") as HTMLInputElement).value).toBe("bugs");
  fireEvent.change(within(form).getByLabelText("Template variable path"), {
    target: { value: "src/lib.rs" },
  });
  fireEvent.click(within(form).getByTestId("template-fill-insert"));
  expect(inserted[1]).toBe("review src/lib.rs for bugs");
});

test("composer mount: 📜 button opens the picker and inserts into the draft (EKI-39 AC)", async () => {
  const TEST_SID = sid("sess-1");
  mockIPC((cmd) => {
    if (cmd === "list_prompt_templates")
      return [tpl({ id: "plain", name: "Plain", template: "rendered text", variables_json: null })];
    if (cmd === "list_slash_commands") return [];
    return null;
  });
  useProjects.setState({ projects: [project({ id: "p-1", folder_path: "/work/proj" })], loaded: true });
  useSessionsStore.getState().apply({
    type: "Updated",
    data: {
      meta: {
        id: TEST_SID,
        origin: "Managed",
        project_path: "/work/proj",
        model: "haiku",
        status: "WaitingForInput",
        activity_detail: null,
        parent: null,
        team: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
        git_branch: null,
        last_activity_ms: 0,
      } satisfies SessionMeta,
    },
  });
  render(<Composer sid={TEST_SID} />);
  fireEvent.click(screen.getByTestId("insert-template-button"));
  fireEvent.click(await screen.findByTestId("template-option-plain"));
  await waitFor(() =>
    expect((screen.getByTestId("composer-input") as HTMLTextAreaElement).value).toBe("rendered text"),
  );
});
