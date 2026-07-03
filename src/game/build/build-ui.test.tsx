// M3 T3: BuildPalette (tool buttons wired to the store) and HudOverlay's
// 🔨 Build chip (toggles build mode). Real stores throughout — mode.ts and
// HudOverlay's environment/quality stores all no-op their persistence when
// `commands` isn't mocked (same tolerance the M0 dispatch relied on), so
// nothing needs mocking here.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PLACEABLE_KINDS } from "./edits";
import { useBuildMode } from "./mode";
import { BuildPalette } from "./BuildPalette";
import { HudOverlay } from "@/game/hud/HudOverlay";

beforeEach(() => {
  useBuildMode.setState({ active: false, tool: { kind: "select" } });
});

describe("BuildPalette", () => {
  it("renders all 10 item buttons plus the building/select/done tool buttons", () => {
    render(<BuildPalette />);
    for (const kind of PLACEABLE_KINDS) {
      expect(screen.getAllByRole("button").some((b) => b.title === kindLabel(kind))).toBe(true);
    }
    expect(screen.getByRole("button", { name: /🏠 Building/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /👆 Select/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /✕ Done/ })).toBeInTheDocument();
  });

  it("clicking an item button sets the store's tool and marks it aria-pressed", () => {
    render(<BuildPalette />);
    fireEvent.click(screen.getByTitle("Bush"));
    expect(useBuildMode.getState().tool).toEqual({ kind: "item", item: "bush" });
    expect(screen.getByTitle("Bush")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking Building/Select sets the corresponding tool", () => {
    render(<BuildPalette />);
    fireEvent.click(screen.getByRole("button", { name: /🏠 Building/ }));
    expect(useBuildMode.getState().tool).toEqual({ kind: "building" });
    expect(screen.getByRole("button", { name: /🏠 Building/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /👆 Select/ }));
    expect(useBuildMode.getState().tool).toEqual({ kind: "select" });
    expect(screen.getByRole("button", { name: /👆 Select/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("the select tool starts aria-pressed since it's the default", () => {
    render(<BuildPalette />);
    expect(screen.getByRole("button", { name: /👆 Select/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("Done deactivates build mode", () => {
    useBuildMode.getState().activate();
    render(<BuildPalette />);
    fireEvent.click(screen.getByRole("button", { name: /✕ Done/ }));
    expect(useBuildMode.getState().active).toBe(false);
  });
});

describe("HudOverlay build chip", () => {
  it("activates build mode when off, deactivates when on", () => {
    render(<HudOverlay fps={60} bots={3} onHire={vi.fn()} />);
    const chip = screen.getByRole("button", { name: /🔨 Build/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip);
    expect(useBuildMode.getState().active).toBe(true);
    expect(chip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(chip);
    expect(useBuildMode.getState().active).toBe(false);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });
});

const ITEM_TITLES: Record<(typeof PLACEABLE_KINDS)[number], string> = {
  "tree-default": "Tree",
  "tree-pine": "Pine",
  "tree-oak": "Oak",
  bush: "Bush",
  "flower-red": "Red flower",
  "flower-yellow": "Yellow flower",
  "rock-large": "Rock",
  lantern: "Lantern",
  bench: "Bench",
  hedge: "Hedge",
};

function kindLabel(kind: (typeof PLACEABLE_KINDS)[number]): string {
  return ITEM_TITLES[kind];
}
