import { render, screen, fireEvent, within } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { WorkspaceShell } from "../app/WorkspaceShell";
import { leaves } from "../app/layout-tree";
import { resetPaletteForTests, usePalette, WINK_HINTS } from "../stores/palette";
import { resetWorkspaceForTests, useWorkspace } from "../stores/workspace";

// EKI-121: deep links adopt workspace leaves only in `?window=` routes — this
// suite exercises that classic path (the main window opens overlays instead).
beforeEach(() => window.history.replaceState(null, "", "/?window=workspace"));
afterEach(() => window.history.replaceState(null, "", "/"));

beforeEach(async () => {
  resetWorkspaceForTests();
  resetPaletteForTests();
  mockIPC((cmd) => {
    if (cmd === "app_info") return { version: "1.0.0", data_dir: "/tmp" };
    if (cmd === "list_projects") return [];
    return null;
  });
  await useWorkspace.getState().load();
});

afterEach(clearMocks);

async function openPalette() {
  render(<WorkspaceShell />);
  await screen.findByTestId("panel-chat");
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  return screen.getByPlaceholderText("Type a command…");
}

describe("CommandPalette (EKI-16)", () => {
  test("⌘K opens; all action groups are present", async () => {
    await openPalette();
    const palette = within(screen.getByTestId("command-palette"));
    for (const group of ["Panels", "Layout", "Theme", "Sessions", "Tasks", "Settings"]) {
      expect(palette.getByText(group)).toBeInTheDocument();
    }
    expect(palette.getByText("Open Chat panel")).toBeInTheDocument();
    expect(palette.getByText("Spawn session")).toBeInTheDocument();
  });

  test("⌘K toggles closed again", async () => {
    await openPalette();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  test("typing filters actions via the store's fuzzy filter", async () => {
    const input = await openPalette();
    fireEvent.change(input, { target: { value: "history" } });
    expect(screen.getByText("Open History panel")).toBeInTheDocument();
    expect(screen.queryByText("Open Chat panel")).not.toBeInTheDocument();
  });

  test("running an action executes it, records a recent and closes the palette", async () => {
    const input = await openPalette();
    useWorkspace.getState().applyPreset("focus");
    fireEvent.change(input, { target: { value: "monitor" } });
    fireEvent.click(screen.getByTestId("palette-action-layout.preset.monitor"));
    expect(leaves(useWorkspace.getState().activeTab()!.root).map((l) => l.kind)).toEqual([
      "sessions",
      "activity",
    ]);
    expect(usePalette.getState().recents[0]).toBe("layout.preset.monitor");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  test("palette wink: empty query footer rotates playful hints", async () => {
    await openPalette();
    const wink = screen.getByTestId("palette-wink");
    expect(WINK_HINTS).toContain(wink.textContent);
  });

  test("Escape closes the palette without touching maximize", async () => {
    await openPalette();
    useWorkspace.getState().toggleMaximize(leaves(useWorkspace.getState().activeTab()!.root)[0]!.id);
    fireEvent.keyDown(screen.getByPlaceholderText("Type a command…"), { key: "Escape" });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(useWorkspace.getState().maximizedLeafId).not.toBeNull();
  });

  test("'Spawn session' opens the quick-spawn dialog with haiku preselected (D-M2-7)", async () => {
    const input = await openPalette();
    fireEvent.change(input, { target: { value: "spawn" } });
    fireEvent.click(screen.getByTestId("palette-action-session.spawn"));
    expect(await screen.findByText("🚀 Spawn session")).toBeInTheDocument();
    expect(screen.getByTestId("model-haiku")).toHaveAttribute("aria-checked", "true");
  });

  test("action registry accepts later registrations without palette changes", async () => {
    const input = await openPalette();
    usePalette.getState().registerActions("m3-kanban", [
      {
        id: "kanban.open",
        label: "Open Kanban board",
        group: "Panels",
        keywords: ["board"],
        run: () => {},
      },
    ]);
    fireEvent.change(input, { target: { value: "kanban" } });
    expect(await screen.findByText("Open Kanban board")).toBeInTheDocument();
  });

  test("'Open X panel' replaces a focused welcome leaf in place", async () => {
    const input = await openPalette();
    useWorkspace.getState().addTab(); // welcome tab, focused welcome leaf
    fireEvent.change(input, { target: { value: "open crew" } });
    fireEvent.click(screen.getByTestId("palette-action-panel.open.crew"));
    expect(leaves(useWorkspace.getState().activeTab()!.root).map((l) => l.kind)).toEqual(["crew"]);
  });
});
