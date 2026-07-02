import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { QUALITY, detectQuality, resetQualityForTests, useQuality } from "./quality";

describe("detectQuality", () => {
  it("maps hardware to tiers", () => {
    expect(detectQuality({ cores: 4, dpr: 1 })).toBe("low");
    expect(detectQuality({ cores: 8, dpr: 2 })).toBe("high");
    expect(detectQuality({ cores: 6, dpr: 1.5 })).toBe("medium");
  });
});

describe("QUALITY table", () => {
  it("scales monotonically", () => {
    expect(QUALITY.low.shadowMapSize).toBeLessThan(QUALITY.high.shadowMapSize);
    expect(QUALITY.low.ssao).toBe(false);
    expect(QUALITY.high.ssao).toBe(true);
  });
});

describe("useQuality store", () => {
  beforeEach(() => resetQualityForTests());

  it("loads a persisted tier", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "low" } as never);
    await useQuality.getState().init();
    expect(useQuality.getState().tier).toBe("low");
  });

  it("ignores junk in the KV", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "ultra" } as never);
    await useQuality.getState().init();
    expect(["low", "medium", "high"]).toContain(useQuality.getState().tier);
  });

  it("persists on setTier", () => {
    useQuality.getState().setTier("high");
    expect(useQuality.getState().tier).toBe("high");
    expect(commands.setSetting).toHaveBeenCalledWith("game.quality", "high");
  });
});
