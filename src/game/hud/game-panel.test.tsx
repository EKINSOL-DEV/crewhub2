// GamePanel jsdom tests: the shared docked-panel chrome every in-game card
// converts to (see the file's own header comment for the why). The point of
// this suite is just the wrapper's contract — title + children render, ✕
// closes, and — the whole reason for the conversion — there's no fullscreen
// dimming backdrop behind it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GamePanel } from "./GamePanel";

afterEach(cleanup);

describe("GamePanel", () => {
  it("renders the title and children", () => {
    render(
      <GamePanel title={<span>🏷️ Room</span>} onClose={vi.fn()}>
        <div data-testid="panel-body">Hello</div>
      </GamePanel>,
    );
    expect(screen.getByText("🏷️ Room")).toBeInTheDocument();
    expect(screen.getByTestId("panel-body")).toHaveTextContent("Hello");
  });

  it("the ✕ button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <GamePanel title="Title" onClose={onClose}>
        Body
      </GamePanel>,
    );
    fireEvent.click(screen.getByTestId("game-panel-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders no fullscreen dimming backdrop", () => {
    const { container } = render(
      <GamePanel title="Title" onClose={vi.fn()}>
        Body
      </GamePanel>,
    );
    // The old modal wrapper was `fixed inset-0 ... bg-black/40` — neither
    // class should exist anywhere in the rendered tree.
    expect(container.querySelector(".inset-0")).toBeNull();
    expect(container.querySelector('[class*="bg-black"]')).toBeNull();
  });

  it("docks top-right rather than centering, and never fills the screen", () => {
    const { container } = render(
      <GamePanel title="Title" onClose={vi.fn()}>
        Body
      </GamePanel>,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain("right-4");
    expect(panel.className).toContain("top-4");
    expect(panel.className).not.toContain("inset-0");
    expect(panel.className).not.toContain("items-center justify-center");
  });

  // Round 2: the optional header action slot (RoomCard/HqCard/DossierCard's
  // "🎥 Exit zoom" chip rides here).
  it("renders an optional header action between the title and ✕ when given", () => {
    render(
      <GamePanel
        title="Title"
        onClose={vi.fn()}
        headerAction={<button data-testid="header-action">🎥 Exit zoom</button>}
      >
        Body
      </GamePanel>,
    );
    expect(screen.getByTestId("header-action")).toBeInTheDocument();
  });

  it("renders nothing extra in the header when headerAction is omitted", () => {
    render(
      <GamePanel title="Title" onClose={vi.fn()}>
        Body
      </GamePanel>,
    );
    expect(screen.queryByTestId("header-action")).toBeNull();
  });
});
