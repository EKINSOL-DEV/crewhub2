// Diff viewer panel (M3 T16, EKI-105): mocked bindings, real component —
// file list, highlighted patch, base switcher, truncation banner, quiet
// GitUnavailable, clean-tree zen.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import type { GitDiff } from "@/ipc/bindings";
import DiffPanel from "@/panels/diff/DiffPanel";
import { resetWorkspaceForTests } from "@/stores/workspace";
import { project, seedWorkspace } from "./fixtures";

const PATCH = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;

const sampleDiff = (overrides: Partial<GitDiff> = {}): GitDiff => ({
  files: [
    { path: "src/app.ts", status: "M", additions: 1, deletions: 1, patch: PATCH },
    { path: "README.md", status: "A", additions: 5, deletions: 0, patch: "" },
  ],
  truncated: false,
  ...overrides,
});

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  resetProjectsForTests();
  resetWorkspaceForTests();
});

function renderPanel(params: Record<string, string>) {
  let current = params;
  const setParams = (p: Record<string, string>) => {
    current = p;
    view.rerender(<DiffPanel leafId="leaf-1" params={current} setParams={setParams} />);
  };
  const view = render(<DiffPanel leafId="leaf-1" params={current} setParams={setParams} />);
  return { getParams: () => current };
}

test("renders the file list with ±counts and the selected patch", async () => {
  mockIPC((cmd) => {
    if (cmd === "git_diff") return sampleDiff();
    if (cmd === "git_default_base") return "origin/main";
    return null;
  });
  renderPanel({ projectPath: "/repo" });
  expect(await screen.findByTestId("diff-file-src/app.ts")).toHaveTextContent("+1 −1");
  expect(screen.getByTestId("diff-file-README.md")).toHaveTextContent("A");
  // first file selected by default → its hunk renders as a diff code block
  const patch = await screen.findByTestId("diff-patch");
  expect(patch).toHaveTextContent("@@ -1,2 +1,2 @@");
  expect(patch).toHaveTextContent("+const b = 3;");
});

test("clicking a file switches the patch pane", async () => {
  mockIPC((cmd) => (cmd === "git_diff" ? sampleDiff() : null));
  renderPanel({ projectPath: "/repo" });
  await userEvent.click(await screen.findByTestId("diff-file-README.md"));
  expect(screen.getByText(/no textual changes/)).toBeInTheDocument();
});

test("clean working tree meditates", async () => {
  mockIPC((cmd) => (cmd === "git_diff" ? { files: [], truncated: false } : null));
  renderPanel({ projectPath: "/repo" });
  expect(await screen.findByText("Working tree is clean")).toBeInTheDocument();
  expect(screen.getByText(/spotless/)).toBeInTheDocument();
});

test("truncated diffs say so honestly", async () => {
  mockIPC((cmd) => (cmd === "git_diff" ? sampleDiff({ truncated: true }) : null));
  renderPanel({ projectPath: "/repo" });
  expect(await screen.findByTestId("diff-truncated")).toHaveTextContent("truncated");
});

test("base switcher refetches against the default base", async () => {
  const bases: (string | null)[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "git_diff") {
      bases.push((args as { base: string | null }).base);
      return sampleDiff();
    }
    if (cmd === "git_default_base") return "origin/main";
    return null;
  });
  renderPanel({ projectPath: "/repo" });
  const select = await screen.findByTestId("diff-base-select");
  await waitFor(() => expect(select).toHaveTextContent("vs origin/main"));
  await userEvent.selectOptions(select, "origin/main");
  await waitFor(() => expect(bases).toContain("origin/main"));
  expect(bases[0]).toBeNull(); // first load was the working tree
  // and back to working tree
  await userEvent.selectOptions(select, "");
  await waitFor(() => expect(bases.filter((b) => b === null).length).toBeGreaterThan(1));
});

test("GitUnavailable hides quietly behind a friendly shrug", async () => {
  mockIPC((cmd) => {
    if (cmd === "git_diff") throw "GitUnavailable: not a git repository";
    return null;
  });
  renderPanel({ projectPath: "/no-repo" });
  expect(await screen.findByText("No git info here")).toBeInTheDocument();
  expect(screen.queryByTestId("diff-panel")).not.toBeInTheDocument();
});

test("without a project, offers the registered projects as entry points", async () => {
  mockIPC((cmd) => (cmd === "git_diff" ? sampleDiff() : null));
  useProjects.setState({
    projects: [project({ id: "p1", name: "CrewHub", folder_path: "/repo" })],
    loaded: true,
  });
  const { getParams } = renderPanel({});
  expect(await screen.findByText("Which project's changes?")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /CrewHub/ }));
  expect(getParams().projectPath).toBe("/repo");
  expect(await screen.findByTestId("diff-panel")).toBeInTheDocument();
});
