import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { WelcomeCard } from "./WelcomeCard";
import { resetGameWelcomeForTests, useGameWelcome } from "./welcome";

beforeEach(() => resetGameWelcomeForTests());

describe("WelcomeCard", () => {
  it("shows the ceremony on a fresh campus", async () => {
    render(<WelcomeCard />);
    expect(await screen.findByTestId("welcome-card")).toBeInTheDocument();
    expect(screen.getByText("🏫 Welcome to your campus")).toBeInTheDocument();
  });

  it("renders nothing before the KV read resolves (no flash for returning users)", () => {
    render(<WelcomeCard />);
    expect(useGameWelcome.getState().loaded).toBe(false);
    expect(screen.queryByTestId("welcome-card")).toBeNull();
  });

  it("stays hidden when already welcomed, and never re-shows", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "1" } as never);
    render(<WelcomeCard />);
    await vi.waitFor(() => expect(useGameWelcome.getState().loaded).toBe(true));
    expect(screen.queryByTestId("welcome-card")).toBeNull();
  });

  it("Let's go dismisses the card and persists the KV flag", async () => {
    render(<WelcomeCard />);
    fireEvent.click(await screen.findByTestId("welcome-card-dismiss"));
    expect(screen.queryByTestId("welcome-card")).toBeNull();
    expect(commands.setSetting).toHaveBeenCalledWith("game.welcomed", "1");
  });
});
