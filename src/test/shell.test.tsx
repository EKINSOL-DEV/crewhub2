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
  test("renders the default cockpit preset with the real panels' quiet states", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    // unbound chat offers spawn-from-chat; sessions/activity show Quiet Office
    // (generous timeout: the lazy chat chunk is the heaviest import in the suite)
    expect(await screen.findByTestId("spawn-from-chat", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(await screen.findByText(/Nobody's talking yet/)).toBeInTheDocument();
    expect(await screen.findByText("The office is quiet", {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(await screen.findByText("All calm", {}, { timeout: 10_000 })).toBeInTheDocument();
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

describe("keymap integration (T8)", () => {
  beforeEach(async () => {
    await loadDefaultWorkspace();
  });

  test("⌘T adds a tab, ⌘W closes it", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.keyDown(window, { key: "t", metaKey: true });
    expect(useWorkspace.getState().tabs).toHaveLength(2);
    fireEvent.keyDown(window, { key: "w", metaKey: true });
    expect(useWorkspace.getState().tabs).toHaveLength(1);
  });

  test("⌘2 focuses panel 2; Tab cycles focus", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    const ls = leaves(useWorkspace.getState().activeTab()!.root);
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[1]!.id);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[2]!.id);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(useWorkspace.getState().focusedLeafId).toBe(ls[1]!.id);
  });

  test("⌘\\ splits the focused panel; ⌘⇧W closes it", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    useWorkspace.getState().applyPreset("focus");
    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(leaves(useWorkspace.getState().activeTab()!.root).map((l) => l.kind)).toEqual(["chat", "welcome"]);
    fireEvent.keyDown(window, { key: "W", metaKey: true, shiftKey: true });
    expect(leaves(useWorkspace.getState().activeTab()!.root).map((l) => l.kind)).toEqual(["chat"]);
  });

  test("⌘⇧M maximizes the focused panel; Esc restores", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.keyDown(window, { key: "M", metaKey: true, shiftKey: true });
    expect(useWorkspace.getState().maximizedLeafId).not.toBeNull();
    expect(screen.queryByTestId("panel-sessions")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useWorkspace.getState().maximizedLeafId).toBeNull();
  });

  test("⌘⇧→ resizes the focused row split", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true, shiftKey: true });
    const root = useWorkspace.getState().activeTab()!.root;
    if (root.type !== "split") throw new Error("expected split");
    expect(root.ratio).toBeCloseTo(0.65);
  });

  test("⌘/ toggles the help sheet; Esc closes it", async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    fireEvent.keyDown(window, { key: "/", metaKey: true });
    expect(screen.getByTestId("help-sheet")).toBeInTheDocument();
    expect(screen.getByText("Command palette")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("help-sheet")).not.toBeInTheDocument();
  });
});

describe("drag-rearrange (T8)", () => {
  test("dragging a panel header onto another panel swaps them (center drop)", async () => {
    await loadDefaultWorkspace();
    render(<WorkspaceShell />);
    await screen.findByTestId("panel-chat");
    const before = leaves(useWorkspace.getState().activeTab()!.root);
    const dataTransfer = {
      data: new Map<string, string>(),
      types: ["text/crewhub-leaf"],
      effectAllowed: "",
      dropEffect: "",
      setData(type: string, val: string) {
        this.data.set(type, val);
      },
      getData(type: string) {
        return this.data.get(type) ?? "";
      },
    };
    fireEvent.dragStart(screen.getByTestId("panel-handle-chat"), { dataTransfer });
    const sessions = screen.getByTestId("panel-sessions");
    fireEvent.dragOver(sessions, { dataTransfer, clientX: 0, clientY: 0 });
    // jsdom rects are zero-sized → normalized position is center
    expect(screen.getByTestId("drop-hint-center")).toBeInTheDocument();
    fireEvent.drop(sessions, { dataTransfer });
    const after = leaves(useWorkspace.getState().activeTab()!.root);
    expect(after[0]!.id).toBe(before[1]!.id);
    expect(after[1]!.id).toBe(before[0]!.id);
    expect(screen.queryByTestId("drop-hint-center")).not.toBeInTheDocument();
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
