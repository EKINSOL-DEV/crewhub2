import { describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    openWorkspaceWindow: vi.fn(async () => ({ status: "ok", data: null })),
    openSettingsWindow: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { openSettingsWindow, openWorkspaceWindow } from "./windows";

describe("game HUD window openers", () => {
  it("openWorkspaceWindow calls the open-or-focus command", () => {
    openWorkspaceWindow();
    expect(commands.openWorkspaceWindow).toHaveBeenCalledTimes(1);
  });

  it("openSettingsWindow calls the open-or-focus command", () => {
    openSettingsWindow();
    expect(commands.openSettingsWindow).toHaveBeenCalledTimes(1);
  });

  it("a rejected command (no Tauri backend, e.g. plain browser dev) is swallowed, not thrown", async () => {
    vi.mocked(commands.openWorkspaceWindow).mockRejectedValueOnce(new Error("no backend"));
    expect(() => openWorkspaceWindow()).not.toThrow();
    // give the fire-and-forget promise a tick to settle without an unhandled rejection
    await vi.waitFor(() => expect(commands.openWorkspaceWindow).toHaveBeenCalled());
  });
});
