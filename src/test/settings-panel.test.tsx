import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import SettingsPanel from "../panels/settings/SettingsPanel";
import type { PermissionRule } from "../ipc/bindings";

let rules: PermissionRule[];
let writes: Array<{ key: string; value: string }>;

beforeEach(() => {
  rules = [
    { agent_id: null, tool_pattern: "Read" },
    { agent_id: "agent-1", tool_pattern: "mcp__crewhub__*" },
  ];
  writes = [];
  mockIPC((cmd, args) => {
    if (cmd === "list_permission_rules") return rules;
    if (cmd === "revoke_permission_rule") {
      rules = rules.filter((_, i) => i !== (args as { index: number }).index);
      return rules;
    }
    if (cmd === "mcp_status") return { port: 4242, url: "http://127.0.0.1:4242/mcp" };
    if (cmd === "set_setting") {
      writes.push(args as { key: string; value: string });
      return null;
    }
    return null;
  });
});

afterEach(clearMocks);

test("renders all four sections", async () => {
  render(<SettingsPanel />);
  expect(screen.getByText("Appearance")).toBeInTheDocument();
  expect(screen.getByText("Models")).toBeInTheDocument();
  expect(screen.getByText("Permissions")).toBeInTheDocument();
  expect(screen.getByText("Integrations")).toBeInTheDocument();
  expect(await screen.findByTestId("mcp-url")).toHaveTextContent("http://127.0.0.1:4242/mcp");
});

test("theme picker shows all 9 swatches and applies + persists on click", async () => {
  render(<SettingsPanel />);
  expect(screen.getAllByTestId(/^theme-swatch-/)).toHaveLength(9);
  fireEvent.click(screen.getByTestId("theme-swatch-dracula"));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dracula"));
  expect(writes).toContainEqual({ key: "theme", value: "dracula" });
});

test("density + font size buttons persist their settings keys", async () => {
  render(<SettingsPanel />);
  fireEvent.click(screen.getByTestId("density-compact"));
  fireEvent.click(screen.getByTestId("font-s"));
  await waitFor(() => expect(writes).toContainEqual({ key: "ui.density", value: "compact" }));
  expect(writes).toContainEqual({ key: "ui.font_size", value: "s" });
});

test("default spawn model persists model.default_spawn", async () => {
  render(<SettingsPanel />);
  fireEvent.click(screen.getAllByTestId("model-sonnet")[0]!);
  await waitFor(() => expect(writes).toContainEqual({ key: "model.default_spawn", value: "sonnet" }));
});

test("permission rules list renders and revoke removes by index", async () => {
  render(<SettingsPanel />);
  expect(await screen.findByText("Read")).toBeInTheDocument();
  expect(screen.getByText("mcp__crewhub__*")).toBeInTheDocument();
  expect(screen.getByText("all agents")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("revoke-rule-0"));
  await waitFor(() => expect(screen.queryByText("Read")).not.toBeInTheDocument());
  expect(screen.getByText("mcp__crewhub__*")).toBeInTheDocument();
});

test("empty rules list shows the friendly note", async () => {
  rules = [];
  render(<SettingsPanel />);
  expect(await screen.findByText(/No standing allow-rules/)).toBeInTheDocument();
});
