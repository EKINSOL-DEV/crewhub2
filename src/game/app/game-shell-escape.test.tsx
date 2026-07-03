// M8 T2: Escape precedence — dialogs/cards and build mode close first (each
// owns its own `window.addEventListener("keydown", ...)`, mounted only
// while open/active — see HqCard.tsx/RoomCard.tsx/RoomLinkDialog.tsx/
// ProjectsDialog.tsx/BuildControls.tsx); GameShell's own listener is the
// fallback that exits a focus/follow camera shot once neither has anything
// open. `shouldExitCameraOnEscape` is the pure predicate that guard runs —
// unit-tested directly below with no rendering at all.
//
// The mounted suite proves the actual wiring: GameCanvas's <Canvas
// fallback={null}> never mounts under jsdom (no WebGL — see
// src/test/App.test.tsx's comment), so GameCameraRig/Characters don't run
// here; only GameShell's own top-level Escape listener (outside the Canvas)
// is exercised, driven by calling the camera director's store actions
// directly, same as a rig would.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { shouldExitCameraOnEscape } from "./GameShell";

describe("shouldExitCameraOnEscape", () => {
  it("does nothing while a card is open", () => {
    expect(shouldExitCameraOnEscape(true, false, false)).toBe(false);
  });

  it("does nothing while build mode is active", () => {
    expect(shouldExitCameraOnEscape(false, true, false)).toBe(false);
  });

  it("does nothing once the camera is already free", () => {
    expect(shouldExitCameraOnEscape(false, false, true)).toBe(false);
  });

  it("exits once no card is open, build is inactive, and the camera isn't free", () => {
    expect(shouldExitCameraOnEscape(false, false, false)).toBe(true);
  });
});

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const useGLTF = Object.assign(real.useGLTF, { preload: vi.fn() });
  return { ...real, useGLTF };
});

import GameShell from "./GameShell";
import { useBuildMode } from "@/game/build/mode";
import { useCameraDirector } from "@/game/engine/camera/director";

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
}

describe("GameShell Escape precedence (mounted)", () => {
  beforeEach(() => {
    mockIPC(() => null);
    useBuildMode.setState({ active: false, tool: { kind: "select" }, pendingRoomLink: null, roomCard: null });
    useCameraDirector.setState({ mode: { kind: "free" }, savedGoal: null });
  });

  afterEach(() => clearMocks());

  it("leaves a focused camera untouched while a card is open", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "hq" }));

    pressEscape();

    expect(useCameraDirector.getState().mode.kind).toBe("follow");
  });

  it("leaves a focused camera untouched while build mode is active", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().activate());

    pressEscape();

    expect(useCameraDirector.getState().mode.kind).toBe("follow");
  });

  it("exits the camera once no card is open and build mode is inactive", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));

    pressEscape();

    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });

  it("is a no-op when the camera is already free (no card, no build)", () => {
    render(<GameShell />);

    expect(() => pressEscape()).not.toThrow();
    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });

  it("a second Escape exits the camera after a card closes on the first", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "hq" }));

    pressEscape(); // consumed by the (mocked-shut) card, camera untouched
    expect(useCameraDirector.getState().mode.kind).toBe("follow");

    act(() => useBuildMode.getState().closeRoomCard()); // simulates HqCard's own Escape handler having run
    pressEscape();
    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });
});
