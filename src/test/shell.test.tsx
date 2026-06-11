import { render, screen, fireEvent } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { WorkspaceShell, PanelErrorBoundary } from "../app/WorkspaceShell";
import { leaves, makeLeaf } from "../app/layout-tree";
import { resetWorkspaceForTests, useWorkspace } from "../stores/workspace";

beforeEach(() => {
  resetWorkspaceForTests();
  mockIPC((cmd) => {
    if (cmd === "app_info") return { version: "1.0.0", data_dir: "/tmp" };
    return null;
  });
});

afterEach(clearMocks);

async function loadDefaultWorkspace() {
  await useWorkspace.getState().load();
}

describe("WorkspaceShell", () => {
  test("renders the default cockpit preset with Quiet Office placeholders", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    expect(await screen.findByText("Nobody's talking yet")).toBeInTheDocument();
    expect(await screen.findByText("The office is quiet")).toBeInTheDocument();
    expect(await screen.findByText("All calm")).toBeInTheDocument();
  });

  test("renders splitters for each split node", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    expect(screen.getAllByRole("separator")).toHaveLength(2); // cockpit = 2 splits
  });

  test("panel close button removes the panel", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    const chat = screen.getByTestId("panel-chat");
    fireEvent.click(chat.querySelector('[aria-label="Close panel"]')!);
    expect(screen.queryByTestId("panel-chat")).not.toBeInTheDocument();
    expect(leaves(useWorkspace.getState().activeTab()!.root).map((l) => l.kind)).toEqual([
      "sessions",
      "activity",
    ]);
  });

  test("maximize renders only the maximized panel; restore brings the tree back", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.click(screen.getByTestId("panel-chat").querySelector('[aria-label="Maximize panel"]')!);
    expect(screen.queryByTestId("panel-sessions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("panel-chat").querySelector('[aria-label="Restore panel"]')!);
    expect(await screen.findByTestId("panel-sessions")).toBeInTheDocument();
  });

  test("new tab button adds a welcome tab and activates it", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.click(screen.getByLabelText("New tab"));
    expect(useWorkspace.getState().tabs).toHaveLength(2);
    expect(await screen.findByTestId("panel-welcome")).toBeInTheDocument();
  });

  test("double-click renames a tab inline", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.doubleClick(screen.getByText("Cockpit"));
    const input = screen.getByLabelText("Rename tab");
    fireEvent.change(input, { target: { value: "My Workbench" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useWorkspace.getState().tabs[0]!.name).toBe("My Workbench");
  });

  test("welcome picker replaces the leaf kind on click", async () => {
    await loadDefaultWorkspace();
    useWorkspace.getState().addTab(); // welcome tab
    render(<WorkspaceShell />);
    fireEvent.click(await screen.findByTestId("picker-history"));
    expect(leaves(useWorkspace.getState().activeTab()!.root)[0]!.kind).toBe("history");
    expect(await screen.findByText("No past lives yet")).toBeInTheDocument();
  });

  test("welcome picker single-key shortcut works only when the welcome leaf is focused", async () => {
    await loadDefaultWorkspace();
    useWorkspace.getState().addTab();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-welcome");
    fireEvent.keyDown(window, { key: "s" });
    expect(leaves(useWorkspace.getState().activeTab()!.root)[0]!.kind).toBe("sessions");
  });
});

describe("PanelErrorBoundary", () => {
  test("a crashing panel renders the trip message without taking the shell down", () => {
    const Boom = () => {
      throw new Error("kaboom");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PanelErrorBoundary>
        <Boom />
      </PanelErrorBoundary>,
    );
    expect(screen.getByText("This panel tripped")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    spy.mockRestore();
  });

  test("reopen resets the boundary and re-renders healthy children", () => {
    let crash = true;
    const Flaky = () => {
      if (crash) throw new Error("kaboom");
      return <div>healthy again</div>;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PanelErrorBoundary>
        <Flaky />
      </PanelErrorBoundary>,
    );
    crash = false;
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.getByText("healthy again")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("focus", () => {
  test("mouse-down on a panel focuses its leaf", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-activity");
    const activityLeaf = leaves(useWorkspace.getState().activeTab()!.root)[2]!;
    fireEvent.mouseDown(screen.getByTestId("panel-activity"));
    expect(useWorkspace.getState().focusedLeafId).toBe(activityLeaf.id);
  });

  test("makeLeaf welcome params default empty", () => {
    expect(makeLeaf("welcome").params).toBeUndefined();
  });
});
