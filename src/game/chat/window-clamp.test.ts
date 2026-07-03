import { afterEach, describe, expect, it } from "vitest";
import { clampLayout, clampPos, clampSize, DEFAULT_SIZE, MAX_W, MIN_H, MIN_W } from "./window-clamp";

function withViewport(width: number, height: number, run: () => void) {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
  try {
    run();
  } finally {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalWidth });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: originalHeight,
    });
  }
}

describe("clampSize", () => {
  it("passes a size already inside the bounds through unchanged", () => {
    withViewport(1600, 1000, () => {
      expect(clampSize({ w: 400, h: 500 })).toEqual({ w: 400, h: 500 });
    });
  });

  it("clamps width to [MIN_W, MAX_W]", () => {
    withViewport(1600, 1000, () => {
      expect(clampSize({ w: 10, h: 500 }).w).toBe(MIN_W);
      expect(clampSize({ w: 5000, h: 500 }).w).toBe(MAX_W);
    });
  });

  it("clamps height to [MIN_H, viewport height - minVisible]", () => {
    withViewport(1600, 500, () => {
      expect(clampSize({ w: 400, h: 10 }).h).toBe(MIN_H);
      expect(clampSize({ w: 400, h: 5000 }).h).toBe(500 - 40);
    });
  });

  it("a tiny viewport still floors height at MIN_H rather than shrinking further", () => {
    withViewport(1600, 300, () => {
      // viewport - minVisible (260) is below MIN_H (320) — the floor wins.
      expect(clampSize({ w: 400, h: 200 }).h).toBe(MIN_H);
    });
  });

  it("honors a custom minVisible", () => {
    withViewport(1600, 1000, () => {
      expect(clampSize({ w: 400, h: 5000 }, 100).h).toBe(900);
    });
  });
});

describe("clampPos", () => {
  it("floors the top edge at 0 even past a generous sliver", () => {
    withViewport(1600, 1000, () => {
      expect(clampPos({ x: 100, y: -500 }, 350).y).toBe(0);
    });
  });

  it("keeps a minVisible-px sliver on the right/bottom edges", () => {
    withViewport(1600, 1000, () => {
      expect(clampPos({ x: 5000, y: 5000 }, 350)).toEqual({ x: 1600 - 40, y: 1000 - 40 });
    });
  });

  it("keeps a minVisible-px sliver on the left edge, relative to the window's own width", () => {
    withViewport(1600, 1000, () => {
      expect(clampPos({ x: -5000, y: 100 }, 350).x).toBe(40 - 350);
    });
  });

  it("passes an in-bounds position through unchanged", () => {
    withViewport(1600, 1000, () => {
      expect(clampPos({ x: 200, y: 300 }, 350)).toEqual({ x: 200, y: 300 });
    });
  });
});

describe("clampLayout", () => {
  it("clamps size and pos together, using the clamped (not raw) width for the pos x-bound", () => {
    withViewport(1600, 1000, () => {
      const out = clampLayout({ pos: { x: -5000, y: 100 }, size: { w: 5000, h: 400 } });
      expect(out.size).toEqual({ w: MAX_W, h: 400 });
      expect(out.pos).toEqual({ x: 40 - MAX_W, y: 100 });
    });
  });

  it("a size-only entry (pos null) clamps size and leaves pos null", () => {
    withViewport(1600, 1000, () => {
      expect(clampLayout({ pos: null, size: { w: 5000, h: 400 } })).toEqual({
        pos: null,
        size: { w: MAX_W, h: 400 },
      });
    });
  });

  it("a pos-only entry (size null) clamps pos against the DEFAULT_SIZE width and leaves size null", () => {
    withViewport(1600, 1000, () => {
      const out = clampLayout({ pos: { x: -5000, y: 100 }, size: null });
      expect(out.size).toBeNull();
      expect(out.pos).toEqual({ x: 40 - DEFAULT_SIZE.w, y: 100 });
    });
  });

  it("an empty layout (both null) passes straight through", () => {
    withViewport(1600, 1000, () => {
      expect(clampLayout({ pos: null, size: null })).toEqual({ pos: null, size: null });
    });
  });
});

describe("viewport restoration", () => {
  // Guards the test helper itself: every test above must leave window's
  // dimensions exactly as it found them for the rest of the suite.
  afterEach(() => {
    expect(window.innerWidth).toBeGreaterThan(0);
  });

  it("restores dimensions after a nested withViewport call", () => {
    const before = { w: window.innerWidth, h: window.innerHeight };
    withViewport(300, 200, () => undefined);
    expect(window.innerWidth).toBe(before.w);
    expect(window.innerHeight).toBe(before.h);
  });
});
