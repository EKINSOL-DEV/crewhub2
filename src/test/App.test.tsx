import { act, render, screen, waitFor } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";

// The game canvas gracefully falls back to `null` under jsdom (no WebGL) —
// but GameShell's mount effect calls preloadModels() regardless, which
// kicks off real fetches for .glb assets against a nonexistent dev server.
// Harmless, but pointless network noise in a unit test — same fix other
// game tests use (e.g. build-controls.smoke.test.tsx): stub the loader
// instead of hitting the network.
vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const useGLTF = Object.assign(real.useGLTF, { preload: vi.fn() });
  return { ...real, useGLTF };
});

import App from "../App";
import { useOnboarding } from "../stores/onboarding";
import { resetWorkspaceForTests } from "../stores/workspace";

beforeEach(() => {
  resetWorkspaceForTests();
  useOnboarding.getState().reset();
  mockIPC((cmd, args) => {
    if (cmd === "app_info") return { version: "9.9.9", data_dir: "/tmp" };
    // onboarding is done — the wizard must not steal the campus boot
    if (cmd === "get_setting" && (args as { key?: string } | undefined)?.key === "onboarding.state")
      return "done";
    return null;
  });
});

afterEach(() => {
  useOnboarding.getState().reset();
  clearMocks();
});

// Generous timeout: GameShell is the heaviest lazy chunk in the suite now
// (three.js + r3f + drei + the whole game tree) — same reasoning as
// shell.test.tsx's spawn-from-chat wait.
const GAME_SHELL_TIMEOUT = { timeout: 10_000 };

test("the game IS the app (M4 T6, the switch): fullscreen game shell, no shell chrome", async () => {
  render(<App />);
  expect(await screen.findByTestId("game-shell", {}, GAME_SHELL_TIMEOUT)).toBeInTheDocument();
  expect(screen.queryByTestId("app-root")).toBeNull(); // no tabs, no panel chrome
});

test("?game is a redundant alias — same main window, same game shell", async () => {
  window.history.replaceState(null, "", "/?game");
  try {
    render(<App />);
    expect(await screen.findByTestId("game-shell", {}, GAME_SHELL_TIMEOUT)).toBeInTheDocument();
  } finally {
    window.history.replaceState(null, "", "/");
  }
});

test("an active onboarding wizard overlays the game — the game stays underneath", async () => {
  render(<App />);
  await screen.findByTestId("game-shell", {}, GAME_SHELL_TIMEOUT);
  // The lazy wizard's own load() resolves "done" — wait for it so our
  // forced `show` is not immediately overwritten.
  await waitFor(() => expect(useOnboarding.getState().loaded).toBe(true));
  act(() => {
    useOnboarding.setState({ show: true });
  });
  expect(await screen.findByTestId("onboarding-wizard")).toBeInTheDocument();
  expect(screen.getByTestId("game-shell")).toBeInTheDocument(); // still the stage
  act(() => {
    useOnboarding.setState({ show: false });
  });
  expect(screen.queryByTestId("onboarding-wizard")).toBeNull();
});

test("z-order tie-break (M4 debt sweep): a fresh wizard is mounted after — and so paints over — WelcomeCard", async () => {
  render(<App />);
  await screen.findByTestId("game-shell", {}, GAME_SHELL_TIMEOUT);
  // Neither the wizard's nor the welcome ceremony's KV flags are set by
  // this suite's mockIPC (only onboarding.state="done" is special-cased),
  // so on a doubly-fresh profile both overlays are visible at once —
  // exactly the tie App.tsx's MainWindow comment documents.
  await waitFor(() => expect(useOnboarding.getState().loaded).toBe(true));
  act(() => {
    useOnboarding.setState({ show: true });
  });
  const wizard = await screen.findByTestId("onboarding-wizard");
  const welcomeCard = await screen.findByTestId("welcome-card");
  // Both share z-50 (WelcomeCard.tsx) — with no z-index difference, later
  // in the DOM wins the paint order. DOCUMENT_POSITION_PRECEDING means
  // welcomeCard comes before wizard, i.e. the wizard is mounted after.
  expect(wizard.compareDocumentPosition(welcomeCard) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});

test("?window=workspace renders only the panel grid — no game, no wizard", async () => {
  window.history.replaceState(null, "", "/?window=workspace");
  try {
    render(<App />);
    expect(await screen.findByTestId("app-root")).toBeInTheDocument();
    expect(await screen.findByTestId("panel-chat")).toBeInTheDocument();
    expect(screen.queryByTestId("game-shell")).toBeNull(); // exactly ONE game — main window only
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
    expect(screen.queryByTestId("game-shell")).toBeNull(); // and no game
  } finally {
    window.history.replaceState(null, "", "/");
  }
});
