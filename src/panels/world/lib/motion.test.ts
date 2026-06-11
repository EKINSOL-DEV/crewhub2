// Squash-and-stretch + blink timing (Epic 20 motion polish) — pure, TDD'd.
import { describe, expect, it } from "vitest";
import { BLINK_DUR_S, BLINK_PERIOD_S, blinkScale, squashStretch } from "./motion";

describe("squashStretch", () => {
  it("squashes on the ground and stretches at the top of the hop", () => {
    const ground = squashStretch(0);
    expect(ground.y).toBeLessThan(1);
    expect(ground.xz).toBeGreaterThan(1);
    const apex = squashStretch(1);
    expect(apex.y).toBeGreaterThan(1);
    expect(apex.xz).toBeLessThan(1);
  });

  it("preserves volume (y · xz² = 1) so the bot squishes, not shrinks", () => {
    for (const h of [0, 0.25, 0.5, 0.75, 1]) {
      const s = squashStretch(h);
      expect(s.y * s.xz * s.xz).toBeCloseTo(1, 10);
    }
  });

  it("clamps the normalized height", () => {
    expect(squashStretch(-2)).toEqual(squashStretch(0));
    expect(squashStretch(9)).toEqual(squashStretch(1));
  });
});

describe("blinkScale", () => {
  it("keeps eyes open outside the blink window", () => {
    // Sample mid-cycle, well clear of the blink.
    expect(blinkScale(BLINK_PERIOD_S / 2, 0)).toBe(1);
  });

  it("closes the eyes mid-blink", () => {
    expect(blinkScale(BLINK_DUR_S / 2, 0)).toBeLessThan(0.2);
  });

  it("is periodic", () => {
    for (const t of [0.03, 1.7, 2.9]) {
      expect(blinkScale(t + BLINK_PERIOD_S, 0.4)).toBeCloseTo(blinkScale(t, 0.4), 10);
    }
  });

  it("desynchronizes bots via phase", () => {
    // One bot mid-blink, a phase-shifted one wide awake at the same time.
    const t = BLINK_DUR_S / 2;
    expect(blinkScale(t, 0)).toBeLessThan(1);
    expect(blinkScale(t, BLINK_PERIOD_S / 2)).toBe(1);
  });

  it("never goes fully to zero (no disappearing eyes)", () => {
    for (let t = 0; t < BLINK_PERIOD_S; t += 0.01) {
      expect(blinkScale(t, 0)).toBeGreaterThan(0);
    }
  });
});
