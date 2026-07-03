// CameraExitPill jsdom tests (round 2 amendment) — replaces
// hud-camera-exit.test.tsx now that the chip moved out of HudOverlay. Same
// tolerance as that old suite: the real useCameraDirector store, sfx mocked
// (build-palette-sfx.test.tsx's pattern) so the test doesn't need a real
// AudioContext.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CameraExitPill } from "./CameraExitPill";
import { useCameraDirector } from "@/game/engine/camera/director";

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

import { playSfx } from "@/game/audio/sfx";

beforeEach(() => {
  useCameraDirector.setState({ mode: { kind: "free" } });
  vi.mocked(playSfx).mockClear();
});

afterEach(cleanup);

describe("CameraExitPill", () => {
  it("is absent while the camera is free", () => {
    render(<CameraExitPill />);
    expect(screen.queryByTestId("camera-exit-pill")).toBeNull();
  });

  it("appears while focused on a building and calls exit() + the click sfx", () => {
    render(<CameraExitPill />);
    act(() => {
      useCameraDirector.setState({
        mode: { kind: "focus", target: { x: 1, z: 2 }, yaw: 0, distance: 20 },
      });
    });

    const pill = screen.getByTestId("camera-exit-pill");
    fireEvent.click(pill);

    expect(useCameraDirector.getState().mode.kind).toBe("free");
    expect(playSfx).toHaveBeenCalledWith("click");
  });

  it("appears while following a bot and disappears again once exited", () => {
    render(<CameraExitPill />);
    act(() => {
      useCameraDirector.setState({ mode: { kind: "follow", botKey: "provider:1" } });
    });
    expect(screen.getByTestId("camera-exit-pill")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("camera-exit-pill"));
    expect(screen.queryByTestId("camera-exit-pill")).toBeNull();
  });

  it("shows the label and an Esc hint", () => {
    render(<CameraExitPill />);
    act(() => {
      useCameraDirector.setState({ mode: { kind: "follow", botKey: "provider:1" } });
    });
    const pill = screen.getByTestId("camera-exit-pill");
    expect(pill).toHaveTextContent("Exit zoom");
    expect(pill).toHaveTextContent("Esc");
  });
});
