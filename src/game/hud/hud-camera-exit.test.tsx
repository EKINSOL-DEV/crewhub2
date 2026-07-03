// M8 T2: HudOverlay's 🎥 ✕ camera-exit chip — visible only while the camera
// director is focused/following, calls exit() + the click sfx. Same
// tolerance as hud-night.test.tsx: the real useCameraDirector store, sfx
// mocked (build-palette-sfx.test.tsx's pattern) so the test doesn't need a
// real AudioContext.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HudOverlay } from "./HudOverlay";
import { useCameraDirector } from "@/game/engine/camera/director";

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

import { playSfx } from "@/game/audio/sfx";

beforeEach(() => {
  useCameraDirector.setState({ mode: { kind: "free" }, savedGoal: null });
  vi.mocked(playSfx).mockClear();
});

describe("HudOverlay camera-exit chip", () => {
  it("is absent while the camera is free", () => {
    render(<HudOverlay fps={60} bots={0} onHire={vi.fn()} />);
    expect(screen.queryByTestId("hud-camera-exit")).toBeNull();
  });

  it("appears while focused on a building and calls exit() + the click sfx", () => {
    render(<HudOverlay fps={60} bots={0} onHire={vi.fn()} />);
    act(() => {
      useCameraDirector.setState({
        mode: { kind: "focus", target: { x: 1, z: 2 }, yaw: 0, distance: 20 },
      });
    });

    const chip = screen.getByTestId("hud-camera-exit");
    fireEvent.click(chip);

    expect(useCameraDirector.getState().mode.kind).toBe("free");
    expect(playSfx).toHaveBeenCalledWith("click");
  });

  it("appears while following a bot and disappears again once exited", () => {
    render(<HudOverlay fps={60} bots={0} onHire={vi.fn()} />);
    act(() => {
      useCameraDirector.setState({ mode: { kind: "follow", botKey: "provider:1" } });
    });
    expect(screen.getByTestId("hud-camera-exit")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hud-camera-exit"));
    expect(screen.queryByTestId("hud-camera-exit")).toBeNull();
  });
});
