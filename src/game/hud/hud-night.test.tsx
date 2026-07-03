// M4 T4: HudOverlay's ☀️/🌙 day-night chip. Real useGameEnvironment store,
// same tolerance as build-ui.test.tsx — `commands` isn't mocked, so the KV
// write behind toggleNight() just no-ops.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HudOverlay } from "./HudOverlay";
import { resetGameEnvironmentForTests, useGameEnvironment } from "@/game/world/environments/store";

beforeEach(() => resetGameEnvironmentForTests());

describe("HudOverlay night chip", () => {
  it("starts on Day and flips to Night on click, and back", () => {
    render(<HudOverlay fps={60} bots={0} onHire={vi.fn()} />);
    const chip = screen.getByRole("button", { name: /Day/ });

    fireEvent.click(chip);
    expect(useGameEnvironment.getState().night).toBe(true);
    expect(screen.getByRole("button", { name: /🌙 Night/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Night/ }));
    expect(useGameEnvironment.getState().night).toBe(false);
    expect(screen.getByRole("button", { name: /☀️ Day/ })).toBeInTheDocument();
  });
});
