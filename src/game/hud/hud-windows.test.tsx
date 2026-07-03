// M4 T6 fix round 1 (reachability): the 🧰 Workspace / ⚙️ Settings chips are
// the only way out of the main window now that WorldView's gear button and
// dock are gone. Same tolerance as build-ui.test.tsx / hud-night.test.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HudOverlay } from "./HudOverlay";

vi.mock("@/game/app/windows", () => ({
  openWorkspaceWindow: vi.fn(),
  openSettingsWindow: vi.fn(),
}));

import { openSettingsWindow, openWorkspaceWindow } from "@/game/app/windows";

beforeEach(() => vi.clearAllMocks());

describe("HudOverlay window chips", () => {
  it("🧰 Workspace invokes the workspace-window opener", () => {
    render(<HudOverlay fps={60} bots={0} onHire={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Workspace/ }));
    expect(openWorkspaceWindow).toHaveBeenCalledTimes(1);
    expect(openSettingsWindow).not.toHaveBeenCalled();
  });

  it("⚙️ Settings invokes the settings-window opener", () => {
    render(<HudOverlay fps={60} bots={0} onHire={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(openSettingsWindow).toHaveBeenCalledTimes(1);
    expect(openWorkspaceWindow).not.toHaveBeenCalled();
  });
});
