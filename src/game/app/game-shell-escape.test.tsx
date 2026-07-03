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
import { isFocusCoupledCard, shouldExitCameraOnEscape } from "./GameShell";

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

// Round 2: the pure predicate behind the focus-coupled dock lifetime (which
// card kinds share the camera's lifetime vs. never touch it at all).
describe("isFocusCoupledCard", () => {
  it("room (plot/placed), HQ, and dossier panels are focus-coupled", () => {
    expect(isFocusCoupledCard("plot")).toBe(true);
    expect(isFocusCoupledCard("placed")).toBe(true);
    expect(isFocusCoupledCard("hq")).toBe(true);
    expect(isFocusCoupledCard("dossier")).toBe(true);
  });

  it("projects/hire (no camera interaction) and no open card at all are not", () => {
    expect(isFocusCoupledCard("projects")).toBe(false);
    expect(isFocusCoupledCard("hire")).toBe(false);
    expect(isFocusCoupledCard(undefined)).toBe(false);
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
    useCameraDirector.setState({ mode: { kind: "free" } });
  });

  afterEach(() => clearMocks());

  // Round 2 note: HQ (like room/dossier) is now focus-coupled, so a card
  // that couples with the camera is deliberately NOT used here anymore —
  // this test is specifically about a card that DOESN'T touch the camera,
  // Projects, and its own coupling behavior is covered in the
  // "focus-coupled dock lifetime" suite below.
  it("leaves a focused camera untouched while a non-coupled card (Projects) is open", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "projects" }));

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

  it("a second Escape exits the camera after a non-coupled card closes on the first", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "projects" }));

    pressEscape(); // consumed by the (mocked-shut) card, camera untouched
    expect(useCameraDirector.getState().mode.kind).toBe("follow");

    act(() => useBuildMode.getState().closeRoomCard()); // simulates ProjectsDialog's own Escape handler having run
    pressEscape();
    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });
});

// Round 2: room/HQ/dossier panels share the camera's lifetime; Projects/
// hire/room-link never do. See GameShell.tsx's isFocusCoupledCard doc
// comment for the full rationale — these tests exercise both directions
// through a REAL mounted GameShell (real HqCard/RoomLinkDialog Escape
// listeners, real mode.ts/director.ts stores), same tolerance as the
// precedence suite above.
describe("GameShell focus-coupled dock lifetime (round 2, mounted)", () => {
  beforeEach(() => {
    mockIPC(() => null);
    useBuildMode.setState({ active: false, tool: { kind: "select" }, pendingRoomLink: null, roomCard: null });
    useCameraDirector.setState({ mode: { kind: "free" } });
  });

  afterEach(() => clearMocks());

  it("ONE Escape press on a focus-coupled card (HQ) both closes it and exits the camera — no two-press dance", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "hq" }));

    pressEscape();

    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });

  it("ONE Escape press on a focus-coupled room card (a plot) both closes it and exits the camera", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "plot", plotIndex: 0 }));

    pressEscape();

    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });

  it("exiting the camera some other way (not via the panel's own close) also closes a focus-coupled card", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "hq" }));

    // Stands in for the HUD's 🎥✕ chip / a drag-pan takeover / a despawned
    // followed bot — all of them just call director.exit() directly,
    // bypassing the panel's own onClose entirely.
    act(() => useCameraDirector.getState().exit());

    expect(useBuildMode.getState().roomCard).toBeNull();
  });

  it("exiting the camera does NOT close a non-coupled card (Projects)", () => {
    render(<GameShell />);
    act(() => useCameraDirector.getState().followBot("bot:a"));
    act(() => useBuildMode.getState().openRoomCard({ kind: "projects" }));

    act(() => useCameraDirector.getState().exit());

    expect(useBuildMode.getState().roomCard).toEqual({ kind: "projects" });
  });

  it("opening a focus-coupled card while the camera is ALREADY free doesn't auto-close it (no false-positive from the mode-watching effect)", () => {
    // Mirrors HqCard's own roster rows, which open a dossier without ever
    // calling followBot — the camera stays free the whole time, and the
    // card must not be immediately undone by the same effect that closes
    // it on a free-TRANSITION.
    render(<GameShell />);
    expect(useCameraDirector.getState().mode.kind).toBe("free");

    act(() => useBuildMode.getState().openRoomCard({ kind: "hq" }));

    expect(useBuildMode.getState().roomCard).toEqual({ kind: "hq" });
  });

  it("no loop: closing an already-closed focus-coupled card via a stray Escape, with the camera already free, changes nothing", () => {
    render(<GameShell />);
    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(useCameraDirector.getState().mode.kind).toBe("free");

    expect(() => pressEscape()).not.toThrow();

    expect(useBuildMode.getState().roomCard).toBeNull();
    expect(useCameraDirector.getState().mode.kind).toBe("free");
  });
});
