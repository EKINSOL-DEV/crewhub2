import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { PromptTemplate } from "@/ipc/bindings";
import { parseVariables, templatesForProject, useTemplatesStore } from "@/stores/templates";

function tpl(overrides: Partial<PromptTemplate> & { id: string; name: string }): PromptTemplate {
  return {
    template: "hello {{who}}",
    variables_json: JSON.stringify([{ name: "who", default: "world" }]),
    project_id: null,
    ...overrides,
  };
}

afterEach(() => {
  clearMocks();
  useTemplatesStore.getState().reset();
});

describe("parseVariables (tolerant, T8 contract shape)", () => {
  test("reads name + optional default", () => {
    expect(parseVariables(JSON.stringify([{ name: "who", default: "world" }, { name: "x" }]))).toEqual([
      { name: "who", default: "world" },
      { name: "x", default: undefined },
    ]);
  });

  test("garbage in, empty out — never a throw", () => {
    expect(parseVariables(null)).toEqual([]);
    expect(parseVariables("not json")).toEqual([]);
    expect(parseVariables('{"name":"obj-not-array"}')).toEqual([]);
    expect(parseVariables('[{"default":"no name"},42,{"name":"  "},{"name":"ok"}]')).toEqual([
      { name: "ok", default: undefined },
    ]);
  });
});

test("templatesForProject: global + the project's own, name-sorted", () => {
  const byId = Object.fromEntries(
    [
      tpl({ id: "g1", name: "zeta" }),
      tpl({ id: "p1", name: "alpha", project_id: "proj-1" }),
      tpl({ id: "other", name: "beta", project_id: "proj-2" }),
    ].map((t) => [t.id, t]),
  );
  expect(templatesForProject(byId, "proj-1").map((t) => t.id)).toEqual(["p1", "g1"]);
  expect(templatesForProject(byId, null).map((t) => t.id)).toEqual(["g1"]);
});

test("init seeds global scope; loadProject merges; refresh is the SettingChanged fold", async () => {
  let globals = [tpl({ id: "g1", name: "global one" })];
  const projTpls = [tpl({ id: "p1", name: "proj one", project_id: "proj-1" })];
  mockIPC((cmd, args) => {
    if (cmd === "list_prompt_templates") {
      const { projectId } = args as { projectId: string | null };
      return projectId === "proj-1" ? [...globals, ...projTpls] : globals;
    }
    return null;
  });
  const s = useTemplatesStore.getState();
  await s.init();
  expect(Object.keys(useTemplatesStore.getState().templates)).toEqual(["g1"]);

  await s.loadProject("proj-1");
  expect(Object.keys(useTemplatesStore.getState().templates).sort()).toEqual(["g1", "p1"]);

  // SettingChanged{prompt_templates} → refresh(): deletions disappear too
  globals = [];
  await s.refresh();
  expect(Object.keys(useTemplatesStore.getState().templates)).toEqual(["p1"]);
});

test("create/update/remove mutate through IPC and surface errors", async () => {
  const created = tpl({ id: "new", name: "fresh" });
  mockIPC((cmd, args) => {
    if (cmd === "list_prompt_templates") return [];
    if (cmd === "create_prompt_template") return created;
    if (cmd === "update_prompt_template") return { ...(args as { template: PromptTemplate }).template };
    if (cmd === "delete_prompt_template") throw new Error("template not found");
    return null;
  });
  const s = useTemplatesStore.getState();
  await s.init();
  expect(await s.create({ name: "fresh", template: "x", variables_json: null, project_id: null })).toBeNull();
  expect(useTemplatesStore.getState().templates.new).toBeDefined();

  expect(await s.update({ ...created, name: "renamed" })).toBeNull();
  expect(useTemplatesStore.getState().templates.new?.name).toBe("renamed");

  expect(await s.remove("new")).toContain("not found");
  expect(useTemplatesStore.getState().templates.new).toBeDefined(); // failed delete keeps it
});
