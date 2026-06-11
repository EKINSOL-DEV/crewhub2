// GitStrip (M3 T15, EKI-103): read-only branch/dirty/ahead-behind strip with
// worktree badge; GitUnavailable hides quietly; click opens the diff panel.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { leaves } from "@/app/layout-tree";
import { resetProjectsForTests } from "@/app/project-filter";
import type { GitStatus } from "@/ipc/bindings";
import { MetaStrip } from "@/panels/chat/MetaStrip";
import { GitStrip } from "@/panels/diff/GitStrip";
import { SessionsPanel } from "@/panels/sessions/SessionsPanel";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { resetGitForTests } from "@/stores/git";
import { useSessionsStore } from "@/stores/sessions";
import { resetWorkspaceForTests, useWorkspace } from "@/stores/workspace";
import { meta, seedWorkspace, sid } from "./fixtures";

const status = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  dirty: 0,
  untracked: 0,
  worktrees: [],
  ...overrides,
});

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  resetGitForTests();
  useSessionsStore.getState().reset();
  useAgentsStore.getState().reset();
  useBindingsStore.getState().reset();
  resetProjectsForTests();
  resetWorkspaceForTests();
});

function mockStatus(s: GitStatus | (() => GitStatus)) {
  mockIPC((cmd) => {
    if (cmd === "git_status") return typeof s === "function" ? s() : s;
    return null;
  });
}

test("renders branch, ahead/behind and dirty count", async () => {
  mockStatus(status({ branch: "feat/x", ahead: 2, behind: 1, dirty: 2, untracked: 1 }));
  render(<GitStrip projectPath="/repo" />);
  const strip = await screen.findByTestId("git-strip");
  expect(strip).toHaveTextContent("⎇ feat/x");
  expect(strip).toHaveTextContent("↑2");
  expect(strip).toHaveTextContent("↓1");
  expect(strip).toHaveTextContent("●3");
});

test("clean tree shows the spotless touch, no counters", async () => {
  mockStatus(status({ branch: "main" }));
  render(<GitStrip projectPath="/repo" />);
  const strip = await screen.findByTestId("git-strip");
  expect(strip).toHaveTextContent("🧹 spotless");
  expect(strip).not.toHaveTextContent("↑");
  expect(strip).not.toHaveTextContent("●");
});

test("labels sessions living in a linked worktree", async () => {
  mockStatus(
    status({
      branch: "feat-x",
      worktrees: [
        { path: "/repo", branch: "main", is_current: false },
        { path: "/repo-wt", branch: "feat-x", is_current: true },
      ],
    }),
  );
  render(<GitStrip projectPath="/repo-wt" sessionPath="/repo-wt" />);
  expect(await screen.findByTestId("git-strip")).toHaveTextContent("🌿 worktree: feat-x");
});

test("GitUnavailable hides quietly, falling back to the transcript branch", async () => {
  mockIPC((cmd) => {
    if (cmd === "git_status") throw "GitUnavailable: not a git repository";
    return null;
  });
  const { rerender } = render(<GitStrip projectPath="/not-a-repo" fallbackBranch="develop" />);
  await waitFor(() => expect(screen.queryByTestId("git-strip")).not.toBeInTheDocument());
  expect(screen.getByText(/develop/)).toBeInTheDocument();
  rerender(<GitStrip projectPath="/not-a-repo" />);
  await waitFor(() => expect(screen.queryByText(/develop/)).not.toBeInTheDocument());
});

test("sessions panel rows mount the strip (EKI-103 surface)", async () => {
  mockIPC((cmd) => {
    if (cmd === "git_status") return status({ branch: "feat/strip", dirty: 1 });
    if (cmd === "list_all_sessions") return [meta({ id: sid("aaaa-row"), project_path: "/work/proj" })];
    return [];
  });
  render(<SessionsPanel />);
  const row = await screen.findByTestId("session-row-aaaa-row");
  const strip = await waitFor(() => {
    const el = row.querySelector('[data-testid="git-strip"]');
    expect(el).not.toBeNull();
    return el;
  });
  expect(strip).toHaveTextContent("⎇ feat/strip");
});

test("chat MetaStrip mounts the strip (EKI-103 surface)", async () => {
  mockIPC((cmd) => {
    if (cmd === "git_status") return status({ branch: "feat/chat", dirty: 2 });
    return [];
  });
  const id = sid("cccc-chat");
  useSessionsStore.setState({
    sessions: { "claude-code:cccc-chat": meta({ id, project_path: "/work/proj" }) },
    loaded: true,
  });
  render(<MetaStrip sid={id} />);
  const strip = await screen.findByTestId("git-strip");
  expect(strip).toHaveTextContent("⎇ feat/chat");
  expect(strip).toHaveTextContent("●2");
});

test("click opens the diff panel scoped to the project", async () => {
  mockStatus(status({ branch: "main", dirty: 1 }));
  render(<GitStrip projectPath="/repo" />);
  await userEvent.click(await screen.findByTestId("git-strip"));
  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  const diffLeaf = tab ? leaves(tab.root).find((l) => l.kind === "diff") : undefined;
  expect(diffLeaf?.params?.projectPath).toBe("/repo");
});
