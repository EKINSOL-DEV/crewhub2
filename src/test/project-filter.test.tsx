import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { WorkspaceShell } from "../app/WorkspaceShell";
import {
  matchesProjectFilter,
  pathUnderRoot,
  resetProjectsForTests,
  useProjects,
} from "../app/project-filter";
import type { Project } from "../ipc/bindings";
import { resetPaletteForTests, usePalette } from "../stores/palette";
import { resetWorkspaceForTests, useWorkspace } from "../stores/workspace";

function project(id: string, name: string, folder: string): Project {
  return {
    id,
    name,
    description: null,
    icon: null,
    color: null,
    folder_path: folder,
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
  };
}

const PROJECTS = [project("p1", "CrewHub", "/work/crewhub"), project("p2", "Side", "/work/side")];

describe("pathUnderRoot (pure predicate)", () => {
  test("exact match and subpaths match", () => {
    expect(pathUnderRoot("/work/crewhub", "/work/crewhub")).toBe(true);
    expect(pathUnderRoot("/work/crewhub/src", "/work/crewhub")).toBe(true);
  });

  test("worktree paths under the project root match (EKI-22 AC)", () => {
    expect(pathUnderRoot("/work/crewhub/.worktrees/lane-a", "/work/crewhub")).toBe(true);
  });

  test("sibling prefixes do NOT match", () => {
    expect(pathUnderRoot("/work/crewhub2", "/work/crewhub")).toBe(false);
    expect(pathUnderRoot("/work/crew", "/work/crewhub")).toBe(false);
  });

  test("trailing slashes are normalized", () => {
    expect(pathUnderRoot("/work/crewhub/", "/work/crewhub")).toBe(true);
    expect(pathUnderRoot("/work/crewhub/src", "/work/crewhub/")).toBe(true);
  });
});

describe("matchesProjectFilter", () => {
  test("no filter matches everything", () => {
    expect(matchesProjectFilter("/anything", null, PROJECTS)).toBe(true);
  });

  test("filter scopes to the project folder", () => {
    expect(matchesProjectFilter("/work/crewhub/src", "p1", PROJECTS)).toBe(true);
    expect(matchesProjectFilter("/work/side", "p1", PROJECTS)).toBe(false);
  });

  test("unknown project id fails open", () => {
    expect(matchesProjectFilter("/work/side", "gone", PROJECTS)).toBe(true);
  });
});

describe("ProjectSwitcher in the shell", () => {
  beforeEach(async () => {
    resetWorkspaceForTests();
    resetPaletteForTests();
    resetProjectsForTests();
    mockIPC((cmd) => {
      if (cmd === "app_info") return { version: "1.0.0", data_dir: "/tmp" };
      if (cmd === "list_projects") return PROJECTS;
      return null;
    });
    await useWorkspace.getState().load();
  });

  afterEach(clearMocks);

  test("selecting a project scopes the active tab; per-tab persistence", async () => {
    render(<WorkspaceShell />);
    const switcher = await screen.findByTestId("project-switcher");
    await waitFor(() => expect(useProjects.getState().projects).toHaveLength(2));
    fireEvent.change(switcher, { target: { value: "p1" } });
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBe("p1");

    // a new tab starts unfiltered; switching back restores the old tab's filter
    useWorkspace.getState().addTab("focus");
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBeNull();
    const firstTab = useWorkspace.getState().tabs[0]!;
    useWorkspace.getState().setActiveTab(firstTab.id);
    expect((await screen.findByTestId("project-switcher")).closest("label")).toBeInTheDocument();
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBe("p1");
  });

  test("filter is part of the persisted tab JSON (survives restart)", async () => {
    const writes: Array<{ key: string; value: string }> = [];
    clearMocks();
    mockIPC((cmd, args) => {
      if (cmd === "app_info") return { version: "1.0.0", data_dir: "/tmp" };
      if (cmd === "list_projects") return PROJECTS;
      if (cmd === "set_setting") {
        writes.push(args as { key: string; value: string });
        return null;
      }
      return null;
    });
    vi.useFakeTimers();
    useWorkspace.getState().setProjectFilter("p2");
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    const tabsWrite = writes.find((w) => w.key === "workspace.tabs");
    expect(tabsWrite).toBeDefined();
    expect(JSON.parse(tabsWrite!.value)[0].projectFilter).toBe("p2");
  });

  test("registers palette filter actions for every project", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("project-switcher");
    await waitFor(() => {
      const ids = usePalette
        .getState()
        .allActions()
        .map((a) => a.id);
      expect(ids).toContain("project.filter.all");
      expect(ids).toContain("project.filter.p1");
      expect(ids).toContain("project.filter.p2");
    });
  });

  test("'All projects' clears the filter", async () => {
    render(<WorkspaceShell />);
    const switcher = await screen.findByTestId("project-switcher");
    await waitFor(() => expect(useProjects.getState().projects).toHaveLength(2));
    fireEvent.change(switcher, { target: { value: "p2" } });
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBe("p2");
    fireEvent.change(switcher, { target: { value: "" } });
    expect(useWorkspace.getState().activeTab()!.projectFilter).toBeNull();
  });
});
