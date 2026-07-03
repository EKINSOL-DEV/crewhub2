// M4 T5: BuildPalette's tool buttons play a click sfx. Isolated from
// build-ui.test.tsx since mocking the sfx module here would otherwise also
// stub out HudOverlay's mute chip (same module) in that file's tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useBuildMode } from "./mode";
import { BuildPalette } from "./BuildPalette";

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

import { playSfx } from "@/game/audio/sfx";

beforeEach(() => {
  useBuildMode.setState({ active: false, tool: { kind: "select" } });
  vi.mocked(playSfx).mockClear();
});

describe("BuildPalette sfx", () => {
  it("clicking an item tool button plays the click sfx", () => {
    render(<BuildPalette />);
    fireEvent.click(screen.getByTitle("Bush"));
    expect(playSfx).toHaveBeenCalledWith("click");
  });

  it("clicking the Building/Select tool buttons plays the click sfx", () => {
    render(<BuildPalette />);
    fireEvent.click(screen.getByRole("button", { name: /🏠 Building/ }));
    expect(playSfx).toHaveBeenCalledWith("click");
  });
});
