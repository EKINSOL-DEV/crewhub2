import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachContextGuard, probeWebgl } from "./webgl-guard";

function lostEvent() {
  return new Event("webglcontextlost");
}

describe("attachContextGuard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(opts?: { isLost?: () => boolean; isActive?: () => boolean }) {
    const canvas = document.createElement("canvas");
    const verdicts: boolean[] = [];
    const detach = attachContextGuard({
      canvas,
      isActive: opts?.isActive ?? (() => true),
      isLost: opts?.isLost ?? (() => true),
      onVerdict: (v) => verdicts.push(v),
      graceMs: 1000,
    });
    return { canvas, verdicts, detach };
  }

  it("does NOT fail immediately on a lost event — only after the grace period", () => {
    const { canvas, verdicts } = setup();
    canvas.dispatchEvent(lostEvent());
    expect(verdicts).toEqual([]);
    vi.advanceTimersByTime(999);
    expect(verdicts).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(verdicts).toEqual([true]);
  });

  it("a spurious loss (context fine again at the deadline) never fails", () => {
    // The StrictMode twin-disposal case: the event fires on the live canvas
    // but the live context was never (or no longer is) lost.
    const { canvas, verdicts } = setup({ isLost: () => false });
    canvas.dispatchEvent(lostEvent());
    vi.advanceTimersByTime(5000);
    expect(verdicts).toEqual([]);
  });

  it("a restore during the grace period cancels the pending verdict", () => {
    const { canvas, verdicts } = setup();
    canvas.dispatchEvent(lostEvent());
    vi.advanceTimersByTime(500);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    vi.advanceTimersByTime(5000);
    expect(verdicts).toEqual([false]); // restore reports recovery, never failure
  });

  it("ignores events once the canvas is no longer active", () => {
    let active = true;
    const { canvas, verdicts } = setup({ isActive: () => active });
    active = false;
    canvas.dispatchEvent(lostEvent());
    vi.advanceTimersByTime(5000);
    expect(verdicts).toEqual([]);
  });

  it("going inactive during the grace period also bails", () => {
    let active = true;
    const { canvas, verdicts } = setup({ isActive: () => active });
    canvas.dispatchEvent(lostEvent());
    active = false;
    vi.advanceTimersByTime(5000);
    expect(verdicts).toEqual([]);
  });

  it("detach removes listeners and cancels pending timers", () => {
    const { canvas, verdicts, detach } = setup();
    canvas.dispatchEvent(lostEvent());
    detach();
    vi.advanceTimersByTime(5000);
    canvas.dispatchEvent(lostEvent());
    vi.advanceTimersByTime(5000);
    expect(verdicts).toEqual([]);
  });
});

describe("probeWebgl", () => {
  it("returns false where no WebGL context can be created (jsdom)", () => {
    expect(probeWebgl()).toBe(false);
  });

  it("returns true and RELEASES the probe context when WebGL exists", () => {
    const loseContext = vi.fn();
    const fakeCtx = {
      getExtension: vi.fn((name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null)),
    };
    const fakeCanvas = { getContext: vi.fn(() => fakeCtx) };
    const doc = { createElement: () => fakeCanvas } as unknown as Document;
    expect(probeWebgl(doc)).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });
});
