import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import App from "../App";
import { useOverlays } from "../app/overlays";
import { useOnboarding } from "../stores/onboarding";
import { resetWorkspaceForTests } from "../stores/workspace";

beforeEach(() => {
  resetWorkspaceForTests();
  useOverlays.setState({ overlay: null });
  useOnboarding.getState().reset();
  mockIPC((cmd, args) => {
    if (cmd === "app_info") return { version: "9.9.9", data_dir: "/tmp" };
    // onboarding is done — the wizard must not steal the world boot
    if (cmd === "get_setting" && (args as { key?: string } | undefined)?.key === "onboarding.state")
      return "done";
    return null;
  });
});

afterEach(() => {
  useOnboarding.getState().reset();
  useOverlays.setState({ overlay: null });
  clearMocks();
});

test("the world IS the app (EKI-121): fullscreen world + game HUD, no shell chrome", async () => {
  render(<App />);
  expect(await screen.findByTestId("world-view")).toBeInTheDocument();
  expect(screen.queryByTestId("app-root")).toBeNull(); // no tabs, no panel chrome
  expect(screen.getByTestId("hud-dock")).toBeInTheDocument(); // the dock
  expect(screen.getByTestId("hud-strip")).toBeInTheDocument(); // the status strip
  expect(screen.queryByTestId("to-workspace")).toBeNull(); // nowhere else to go
});

test("a dock button opens its panel as a drawer OVER the world; backdrop closes it", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  fireEvent.click(screen.getByTestId("dock-sessions"));
  expect(await screen.findByTestId("world-overlay")).toBeInTheDocument();
  expect(screen.getByTestId("world-view")).toBeInTheDocument(); // world never leaves
  fireEvent.click(screen.getByTestId("world-overlay-backdrop"));
  expect(screen.queryByTestId("world-overlay")).toBeNull();
});

test("a dock button toggles: second click closes the drawer", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  fireEvent.click(screen.getByTestId("dock-crew"));
  expect(await screen.findByTestId("world-overlay")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("dock-crew"));
  expect(screen.queryByTestId("world-overlay")).toBeNull();
});

test("⌘K opens the command palette over the world", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  const { usePalette } = await import("../stores/palette");
  usePalette.getState().setOpen(false);
});

test("an active onboarding wizard overlays the world — the world stays underneath", async () => {
  render(<App />);
  await screen.findByTestId("world-view");
  // The lazy wizard's own load() resolves "done" — wait for it so our
  // forced `show` is not immediately overwritten.
  await waitFor(() => expect(useOnboarding.getState().loaded).toBe(true));
  act(() => {
    useOnboarding.setState({ show: true });
  });
  expect(await screen.findByTestId("onboarding-wizard")).toBeInTheDocument();
  expect(screen.getByTestId("world-view")).toBeInTheDocument(); // still the stage
  act(() => {
    useOnboarding.setState({ show: false });
  });
  expect(screen.queryByTestId("onboarding-wizard")).toBeNull();
});

test("?window=workspace renders only the panel grid — no world, no wizard", async () => {
  window.history.replaceState(null, "", "/?window=workspace");
  try {
    render(<App />);
    expect(await screen.findByTestId("app-root")).toBeInTheDocument();
    expect(await screen.findByTestId("panel-chat")).toBeInTheDocument();
    expect(screen.queryByTestId("world-view")).toBeNull(); // exactly ONE world — main window only
    expect(screen.queryByTestId("onboarding-wizard")).toBeNull();
  } finally {
    window.history.replaceState(null, "", "/");
  }
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
