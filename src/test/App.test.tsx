import { act, render, screen, fireEvent } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import App from "../App";
import { resetAppViewForTests, useAppView } from "../stores/appView";
import { useOnboarding } from "../stores/onboarding";
import { resetWorkspaceForTests } from "../stores/workspace";

beforeEach(() => {
  resetWorkspaceForTests();
  resetAppViewForTests();
  useOnboarding.getState().reset();
  mockIPC((cmd, args) => {
    if (cmd === "app_info") return { version: "9.9.9", data_dir: "/tmp" };
    // onboarding is done — the wizard must not steal the world-primary boot
    if (cmd === "get_setting" && (args as { key?: string } | undefined)?.key === "onboarding.state")
      return "done";
    return null;
  });
});

afterEach(() => {
  useOnboarding.getState().reset();
  clearMocks();
});

test("the world is PRIMARY: App boots into the fullscreen world view, no shell chrome", async () => {
  render(<App />);
  expect(await screen.findByTestId("world-view")).toBeInTheDocument();
  expect(screen.queryByTestId("app-root")).toBeNull(); // no tabs, no panel chrome
  expect(screen.getByTestId("to-workspace")).toBeInTheDocument(); // 🧰 escape hatch
});

test("🧰 Workspace visits the shell; the shell's 🌍 World button returns", async () => {
  render(<App />);
  fireEvent.click(await screen.findByTestId("to-workspace"));
  expect(await screen.findByTestId("app-root")).toBeInTheDocument();
  expect(screen.queryByTestId("world-view")).toBeNull(); // exactly ONE world — not here
  // default preset (cockpit) renders its panels once the workspace loads
  expect(await screen.findByTestId("panel-chat")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("to-world"));
  expect(await screen.findByTestId("world-view")).toBeInTheDocument();
  expect(useAppView.getState().view).toBe("world");
});

test("⌘2 switches to the workspace, ⌘1 returns to the world", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  fireEvent.keyDown(window, { key: "2", metaKey: true });
  expect(await screen.findByTestId("app-root")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "1", metaKey: true });
  expect(await screen.findByTestId("world-view")).toBeInTheDocument();
});

test("⌘K opens the command palette inside the world view", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  const { usePalette } = await import("../stores/palette");
  usePalette.getState().setOpen(false);
});

test("an active onboarding wizard wins: the classic shell sits underneath it", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  act(() => {
    useOnboarding.setState({ show: true, loaded: true });
  });
  expect(await screen.findByTestId("app-root")).toBeInTheDocument();
  expect(screen.queryByTestId("world-view")).toBeNull();
  // dismissing the wizard drops back to the primary view
  act(() => {
    useOnboarding.setState({ show: false });
  });
  expect(await screen.findByTestId("world-view")).toBeInTheDocument();
});

test("?window=settings renders only the settings panel (EKI-20 settings window)", async () => {
  window.history.replaceState(null, "", "/?window=settings");
  try {
    render(<App />);
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("app-root")).toBeNull(); // no workspace shell
    expect(screen.queryByTestId("world-view")).toBeNull(); // and no world
  } finally {
    window.history.replaceState(null, "", "/");
  }
});
