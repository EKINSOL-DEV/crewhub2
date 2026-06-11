import { render, screen } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import App from "../App";
import { resetWorkspaceForTests } from "../stores/workspace";

beforeEach(() => {
  resetWorkspaceForTests();
  mockIPC((cmd) => {
    if (cmd === "app_info") return { version: "9.9.9", data_dir: "/tmp" };
    return null;
  });
});

afterEach(clearMocks);

test("App renders the workspace shell", async () => {
  render(<App />);
  expect(screen.getByTestId("app-root")).toBeInTheDocument();
  // default preset (cockpit) renders its three panels once the workspace loads
  expect(await screen.findByTestId("panel-chat")).toBeInTheDocument();
  expect(screen.getByTestId("panel-sessions")).toBeInTheDocument();
  expect(screen.getByTestId("panel-activity")).toBeInTheDocument();
  expect(await screen.findByText("v9.9.9")).toBeInTheDocument();
});

test("?window=settings renders only the settings panel (EKI-20 settings window)", async () => {
  window.history.replaceState(null, "", "/?window=settings");
  try {
    render(<App />);
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("app-root")).toBeNull(); // no workspace shell
  } finally {
    window.history.replaceState(null, "", "/");
  }
});
