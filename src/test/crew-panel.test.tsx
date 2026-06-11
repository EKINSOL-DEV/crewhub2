import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { AgentEditor } from "@/panels/crew/AgentEditor";
import { CrewPanel } from "@/panels/crew/CrewPanel";
import { PERSONA_PRESETS } from "@/panels/crew/persona";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { agent } from "./fixtures";

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

afterEach(() => {
  cleanup();
  clearMocks();
  useAgentsStore.getState().reset();
  useSessionsStore.getState().reset();
  useBindingsStore.getState().reset();
});

beforeEach(() => mockMatchMedia(false));

test("editor defaults the model to haiku for new agents (D-M2-7)", async () => {
  mockIPC(() => null);
  render(<AgentEditor onClose={() => {}} />);
  const select = (await screen.findByTestId("model-select")) as HTMLSelectElement;
  expect(select.value).toBe("haiku");
});

test("hiring composes the persona into system_prompt and applies extras", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "create_agent") return agent({ id: "ag-1", name: "Scout" });
    if (cmd === "update_agent") return { ...(args as { agent: ReturnType<typeof agent> }).agent };
    if (cmd === "list_agents") return [agent({ id: "ag-1", name: "Scout" })];
    if (cmd === "list_projects") return [];
    return null;
  });
  const saved: boolean[] = [];
  render(<AgentEditor onClose={() => {}} onSaved={(_a, created) => saved.push(created)} />);
  fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Scout" } });
  fireEvent.click(screen.getByTestId("preset-explorer"));
  fireEvent.click(screen.getByRole("button", { name: /hire/i }));

  await waitFor(() => expect(saved).toEqual([true]));
  const create = calls.find((c) => c.cmd === "create_agent")?.args as {
    input: { system_prompt: string; default_model: string };
  };
  expect(create.input.system_prompt).toContain(PERSONA_PRESETS.explorer.base);
  expect(create.input.default_model).toBe("haiku");
  const update = calls.find((c) => c.cmd === "update_agent")?.args as {
    agent: { persona_json: string; is_pinned: boolean };
  };
  expect(JSON.parse(update.agent.persona_json).preset).toBe("explorer");
  expect(update.agent.is_pinned).toBe(true);
});

test("BypassPermissions is gated behind an explicit confirmation", async () => {
  mockIPC(() => null);
  render(<AgentEditor onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Yolo" } });
  fireEvent.change(screen.getByLabelText("Permission mode"), {
    target: { value: "BypassPermissions" },
  });
  const hire = screen.getByRole("button", { name: /hire/i });
  expect(screen.getByTestId("bypass-warning")).toBeInTheDocument();
  expect(hire).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I understand the risk/i));
  expect(hire).toBeEnabled();
});

test("materialize writes the composed prompt to the selected project's CLAUDE.md", async () => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "list_projects")
      return [
        {
          id: "pr-1",
          name: "Proj",
          description: null,
          icon: null,
          color: null,
          folder_path: "/work/proj",
          docs_path: null,
          status: "active",
          created_at: 0,
          updated_at: 0,
        },
      ];
    return null;
  });
  render(<AgentEditor onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Scout" } });
  await screen.findByRole("option", { name: /Proj/ });
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: "/work/proj" } });
  fireEvent.click(screen.getByRole("button", { name: /write to claude\.md/i }));
  await waitFor(() => expect(calls.some((c) => c.cmd === "materialize_persona")).toBe(true));
  const m = calls.find((c) => c.cmd === "materialize_persona")?.args as {
    projectId: string;
    content: string;
  };
  expect(m.projectId).toBe("pr-1");
  expect(m.content).toContain('You are "Scout"');
});

test("crew panel shows the Quiet Office empty state, then confetti on first hire", async () => {
  let agents: ReturnType<typeof agent>[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_agents") return agents;
    if (cmd === "create_agent") {
      const created = agent({ id: "ag-1", name: "Scout" });
      agents = [created];
      return created;
    }
    if (cmd === "update_agent") return (args as { agent: ReturnType<typeof agent> }).agent;
    if (cmd === "list_projects" || cmd === "list_all_sessions") return [];
    if (cmd === "list_session_bindings" || cmd === "list_rooms") return [];
    return null;
  });
  render(<CrewPanel />);
  await screen.findByText("Hire your first agent");

  fireEvent.click(screen.getByTestId("hire-first"));
  fireEvent.change(await screen.findByLabelText("Agent name"), { target: { value: "Scout" } });
  fireEvent.click(screen.getByRole("button", { name: /hire/i }));

  await screen.findByTestId("confetti"); // Confetti Hire (D-M2-6)
  await screen.findByText("Scout");
});

test("confetti respects prefers-reduced-motion (renders nothing)", async () => {
  mockMatchMedia(true);
  let agents: ReturnType<typeof agent>[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_agents") return agents;
    if (cmd === "create_agent") {
      const created = agent({ id: "ag-1", name: "Scout" });
      agents = [created];
      return created;
    }
    if (cmd === "update_agent") return (args as { agent: ReturnType<typeof agent> }).agent;
    return [];
  });
  render(<CrewPanel />);
  fireEvent.click(await screen.findByTestId("hire-first"));
  fireEvent.change(await screen.findByLabelText("Agent name"), { target: { value: "Scout" } });
  fireEvent.click(screen.getByRole("button", { name: /hire/i }));
  await screen.findByText("Scout");
  expect(screen.queryByTestId("confetti")).toBeNull();
});
