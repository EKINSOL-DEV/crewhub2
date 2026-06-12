// Wizard steps (M6 T9, EKI-86 part 2 + EKI-88): projects multi-select
// registration, crew hire / sample crew, integrations (hooks preview diff,
// Windows-hidden hooks, MCP per-project, notification seeding), finish
// handoff + Crew Cheer reduced-motion variant. The diff helper's table
// tests live here too.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { leaves } from "@/app/layout-tree";
import type { HooksStatus } from "@/ipc/bindings";
import { diffLines } from "@/onboarding/diff";
import { CrewStep } from "@/onboarding/steps/Crew";
import { FinishStep, enterWorkspace } from "@/onboarding/steps/Finish";
import { IntegrationsStep } from "@/onboarding/steps/Integrations";
import { ProjectsStep } from "@/onboarding/steps/Projects";
import { useAgentsStore } from "@/stores/agents";
import { resetAppViewForTests, useAppView } from "@/stores/appView";
import { useOnboarding } from "@/stores/onboarding";
import { resetProjectsForTests } from "@/stores/projects";
import { useWorkspace } from "@/stores/workspace";
import { agent, project, seedWorkspace } from "./fixtures";

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
  useOnboarding.getState().reset();
  useAgentsStore.getState().reset();
  resetProjectsForTests();
});

// ── diffLines (pure) ─────────────────────────────────────────────────────────

test("diffLines marks added/removed/same lines (the hooks preview contract)", () => {
  expect(diffLines("a\nb", "a\nb")).toEqual([
    { text: "a", kind: "same" },
    { text: "b", kind: "same" },
  ]);
  expect(diffLines("{\n}", '{\n  "hooks": {}\n}')).toEqual([
    { text: "{", kind: "same" },
    { text: '  "hooks": {}', kind: "added" },
    { text: "}", kind: "same" },
  ]);
  expect(diffLines("x\ny", "y")).toEqual([
    { text: "x", kind: "removed" },
    { text: "y", kind: "same" },
  ]);
});

// ── Projects step ────────────────────────────────────────────────────────────

test("projects: scan multi-select registers each picked path as a project", async () => {
  let nextId = 0;
  const created: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "scan_recent_projects")
      return [
        { path: "/work/alpha", last_active_ms: Date.now() },
        { path: "/work/beta", last_active_ms: Date.now() - 86_400_000 },
      ];
    if (cmd === "create_project") {
      const input = (args as { input: { name: string; folder_path: string } }).input;
      created.push(input.folder_path);
      return project({ id: `p-${++nextId}`, folder_path: input.folder_path, name: input.name });
    }
    if (cmd === "list_projects") return created.map((f, i) => project({ id: `p-${i + 1}`, folder_path: f }));
    return [];
  });
  render(<ProjectsStep />);
  fireEvent.click(await screen.findByLabelText("Select /work/alpha"));
  fireEvent.click(screen.getByLabelText("Select /work/beta"));
  fireEvent.click(screen.getByTestId("add-selected-projects"));
  await waitFor(() => expect(created).toEqual(["/work/alpha", "/work/beta"]));
  expect(useOnboarding.getState().createdProjectIds).toEqual(["p-1", "p-2"]);
  expect(await screen.findByTestId("created-projects")).toBeInTheDocument();
});

test("projects: fresh machine (empty scan) falls back to the manual folder picker", async () => {
  const created: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "scan_recent_projects") return [];
    if (cmd === "pick_folder") return "/picked/by/hand";
    if (cmd === "create_project") {
      created.push((args as { input: { folder_path: string } }).input.folder_path);
      return project({ id: "p-9", folder_path: "/picked/by/hand" });
    }
    if (cmd === "list_projects") return [];
    return [];
  });
  render(<ProjectsStep />);
  expect(await screen.findByTestId("no-recent-projects")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("pick-folder"));
  await waitFor(() => expect(created).toEqual(["/picked/by/hand"]));
});

// ── Crew step ────────────────────────────────────────────────────────────────

test("crew: hiring the first agent goes through the agents store with haiku prefilled", async () => {
  const inputs: Array<Record<string, unknown>> = [];
  mockIPC((cmd, args) => {
    if (cmd === "create_agent") {
      const input = (args as { input: Record<string, unknown> }).input;
      inputs.push(input);
      return agent({ id: "ag-1", name: input.name as string });
    }
    if (cmd === "list_agents") return [];
    return [];
  });
  render(<CrewStep />);
  fireEvent.change(screen.getByTestId("agent-name-input"), { target: { value: "Scout" } });
  fireEvent.click(screen.getByTestId("hire-agent"));
  expect(await screen.findByTestId("agent-hired")).toHaveTextContent("Scout just joined the crew");
  expect(inputs[0]).toMatchObject({ name: "Scout", default_model: "haiku", permission_mode: null });
  expect(screen.getByTestId("confetti")).toBeInTheDocument(); // crew-creation confetti
});

test("crew: sample crew (EKI-88) stores the result and celebrates 🎉", async () => {
  mockIPC((cmd) => {
    if (cmd === "create_sample_crew")
      return {
        project_id: "sp",
        room_ids: ["r1", "r2"],
        agent_ids: ["a1", "a2"],
        task_ids: ["t1", "t2", "t3"],
      };
    return [];
  });
  render(<CrewStep />);
  fireEvent.click(screen.getByTestId("sample-crew"));
  expect(await screen.findByTestId("sample-crew-done")).toHaveTextContent(
    "1 project, 2 rooms, 2 agents and 3 starter tasks",
  );
});

test("crew: the sample crew's polite idempotent refusal is shown, not swallowed", async () => {
  mockIPC((cmd) => {
    if (cmd === "create_sample_crew") throw "sample crew already exists — delete it first";
    return [];
  });
  render(<CrewStep />);
  fireEvent.click(screen.getByTestId("sample-crew"));
  expect(await screen.findByText(/already exists/)).toBeInTheDocument();
});

// ── Integrations step ────────────────────────────────────────────────────────

const HOOKS_OK: HooksStatus = {
  supported: true,
  installed: false,
  settings_path: "/home/u/.claude/settings.json",
  sidecar_ok: true,
};

test("integrations: hooks preview renders the REAL before/after diff, then installs", async () => {
  let installed = false;
  mockIPC((cmd) => {
    if (cmd === "hooks_status") return { ...HOOKS_OK, installed };
    if (cmd === "preview_hooks_install")
      return { before: "{\n}", after: '{\n  "hooks": { "Stop": "crewhub-signal" }\n}' };
    if (cmd === "install_hooks") {
      installed = true;
      return { ...HOOKS_OK, installed };
    }
    return [];
  });
  render(<IntegrationsStep />);
  fireEvent.click(await screen.findByTestId("hooks-preview"));
  const diff = await screen.findByTestId("hooks-diff");
  expect(diff).toHaveTextContent('"hooks": { "Stop": "crewhub-signal" }');
  fireEvent.click(screen.getByTestId("hooks-install"));
  expect(await screen.findByTestId("hooks-installed")).toBeInTheDocument();
  expect(installed).toBe(true);
  // perfect uninstall stays one click away
  expect(screen.getByTestId("hooks-uninstall")).toBeInTheDocument();
});

test("integrations: Windows (supported:false) hides the hooks opt-in honestly", async () => {
  mockIPC((cmd) => {
    if (cmd === "hooks_status")
      return { supported: false, installed: false, settings_path: "", sidecar_ok: false };
    return [];
  });
  render(<IntegrationsStep />);
  expect(await screen.findByTestId("hooks-unsupported")).toHaveTextContent(/watches transcripts/);
  expect(screen.queryByTestId("hooks-preview")).toBeNull();
});

test("integrations: MCP toggles per created project", async () => {
  const calls: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "hooks_status") return HOOKS_OK;
    if (cmd === "list_projects") return [project({ id: "p-1", folder_path: "/w/a", name: "alpha" })];
    if (cmd === "enable_mcp_for_project" || cmd === "disable_mcp_for_project") {
      calls.push(`${cmd}:${(args as { projectId: string }).projectId}`);
      return null;
    }
    return [];
  });
  useOnboarding.getState().addCreatedProject("p-1");
  render(<IntegrationsStep />);
  const toggle = await screen.findByLabelText("Enable MCP for alpha");
  fireEvent.click(toggle);
  await waitFor(() => expect(calls).toContain("enable_mcp_for_project:p-1"));
  fireEvent.click(toggle);
  await waitFor(() => expect(calls).toContain("disable_mcp_for_project:p-1"));
});

test("integrations: notifications opt-in seeds the default attention rules", async () => {
  mockIPC((cmd) => {
    if (cmd === "hooks_status") return HOOKS_OK;
    if (cmd === "seed_default_notification_rules")
      return [1, 2, 3, 4, 5].map((i) => ({
        id: `nr-${i}`,
        scope: "global",
        scope_id: null,
        trigger: "permission_needed",
        config_json: '{"sink":"both"}',
        enabled: true,
      }));
    return [];
  });
  render(<IntegrationsStep />);
  fireEvent.click(await screen.findByTestId("seed-notifications"));
  expect(await screen.findByTestId("notifications-seeded")).toHaveTextContent("5 rules added");
});

// ── Finish step ──────────────────────────────────────────────────────────────

test("finish: enterWorkspace seeds the chat+board two-panel layout", () => {
  mockIPC(() => null);
  seedWorkspace();
  enterWorkspace();
  const ls = leaves(useWorkspace.getState().tabs[0]!.root);
  expect(ls.map((l) => l.kind).sort()).toEqual(["board", "chat"]);
});

test("finish: enterWorkspace switches the world-primary view to the workspace", () => {
  // The wizard only FORCES the workspace view while it shows; the store still
  // says "world". Finishing must switch explicitly or the overlay dissolves
  // into the world and the promised panels never appear (caught by e2e).
  mockIPC(() => null);
  seedWorkspace();
  resetAppViewForTests();
  enterWorkspace();
  expect(useAppView.getState().view).toBe("workspace");
});

test("finish: Crew Cheer confetti renders — and not under reduced motion", () => {
  mockIPC(() => null);
  render(<FinishStep />);
  expect(screen.getByTestId("confetti")).toBeInTheDocument();
  cleanup();
  mockMatchMedia(true);
  render(<FinishStep />);
  expect(screen.queryByTestId("confetti")).toBeNull();
});
