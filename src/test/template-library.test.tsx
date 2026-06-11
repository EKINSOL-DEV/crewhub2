import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import AutomationPanel from "@/panels/automation/AutomationPanel";
import { buildVariablesJson, TemplateLibrary } from "@/panels/automation/TemplateLibrary";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import type { NewPromptTemplate, PromptTemplate } from "@/ipc/bindings";
import { useAutomationStore } from "@/stores/automation";
import { useTemplatesStore } from "@/stores/templates";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { project, seedWorkspace } from "./fixtures";

const noop = () => {};

function tpl(overrides: Partial<PromptTemplate> & { id: string; name: string }): PromptTemplate {
  return {
    template: "review {{path}} for {{focus}}",
    variables_json: JSON.stringify([{ name: "path" }, { name: "focus", default: "bugs" }]),
    project_id: null,
    ...overrides,
  };
}

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  useTemplatesStore.getState().reset();
  useAutomationStore.getState().reset();
  resetProjectsForTests();
  resetWorkspaceForTests();
});

test("buildVariablesJson derives names from text; previous_output never declared", () => {
  expect(buildVariablesJson("no vars", {})).toBeNull();
  expect(buildVariablesJson("a {{x}} b {{y}}", { y: "def" })).toBe(
    JSON.stringify([{ name: "x" }, { name: "y", default: "def" }]),
  );
  expect(buildVariablesJson("chain {{previous_output}}", {})).toBeNull();
});

test("Quiet Orchestra empty state", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_prompt_templates") return [];
    return null;
  });
  render(<TemplateLibrary projectId={null} />);
  await screen.findByText("No templates yet");
});

test("library lists templates with variable chips and scope badges", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_prompt_templates")
      return [tpl({ id: "t1", name: "Code review" }), tpl({ id: "t2", name: "Scoped", project_id: "p-1" })];
    return null;
  });
  useProjects.setState({ projects: [project({ id: "p-1", folder_path: "/work/proj" })], loaded: true });
  render(<TemplateLibrary projectId="p-1" />);
  const row = await screen.findByTestId("template-row-t1");
  expect(within(row).getByText("{{path}}")).toBeInTheDocument();
  expect(within(row).getByText("{{focus}}")).toBeInTheDocument();
  expect(within(row).getByText("🌍 global")).toBeInTheDocument();
  expect(within(screen.getByTestId("template-row-t2")).getByText("p-1")).toBeInTheDocument();
});

test("create flow: variables derived live from the body, defaults captured", async () => {
  const created: NewPromptTemplate[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_prompt_templates") return [];
    if (cmd === "create_prompt_template") {
      const { input } = args as { input: NewPromptTemplate };
      created.push(input);
      return tpl({ id: "new-1", name: input.name, template: input.template });
    }
    return null;
  });
  render(<TemplateLibrary projectId={null} />);
  fireEvent.click(await screen.findByTestId("new-template"));
  const editor = await screen.findByTestId("template-editor");

  fireEvent.change(within(editor).getByLabelText("Template name"), { target: { value: "Standup ask" } });
  fireEvent.change(within(editor).getByLabelText("Template body"), {
    target: { value: "summarize {{topic}} in {{words}} words" },
  });
  // the variable list appears as soon as the body references {{vars}}
  fireEvent.change(await within(editor).findByLabelText("Default for words"), { target: { value: "100" } });
  fireEvent.click(within(editor).getByTestId("template-save"));

  await waitFor(() => expect(created).toHaveLength(1));
  expect(created[0]).toMatchObject({ name: "Standup ask", project_id: null });
  expect(JSON.parse(created[0]!.variables_json!)).toEqual([
    { name: "topic" },
    { name: "words", default: "100" },
  ]);
});

test("delete requires a confirm click", async () => {
  const deleted: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_prompt_templates") return [tpl({ id: "t1", name: "Old" })];
    if (cmd === "delete_prompt_template") {
      deleted.push((args as { id: string }).id);
      return true;
    }
    return null;
  });
  render(<TemplateLibrary projectId={null} />);
  const row = await screen.findByTestId("template-row-t1");
  fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
  expect(deleted).toHaveLength(0);
  fireEvent.click(within(row).getByRole("button", { name: "Sure?" }));
  await waitFor(() => expect(deleted).toEqual(["t1"]));
  await waitFor(() => expect(screen.queryByTestId("template-row-t1")).toBeNull());
});

test("automation panel templates tab (param-persisted view)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_prompt_templates") return [];
    return null;
  });
  const params: Record<string, string> = {};
  render(<AutomationPanel leafId="leaf-1" params={params} setParams={(p) => Object.assign(params, p)} />);
  fireEvent.click(await screen.findByTestId("templates-tab"));
  expect(params.view).toBe("templates");
});

test("panel opened with view=templates renders the library directly", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_runs") return [];
    if (cmd === "list_prompt_templates") return [];
    return null;
  });
  render(<AutomationPanel leafId="leaf-1" params={{ view: "templates" }} setParams={noop} />);
  await screen.findByTestId("template-library");
  expect(screen.queryByTestId("scheduler-honest-copy")).toBeNull();
});
