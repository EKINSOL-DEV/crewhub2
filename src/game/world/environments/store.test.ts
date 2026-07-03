import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { resetGameEnvironmentForTests, useGameEnvironment } from "./store";

describe("useGameEnvironment", () => {
  beforeEach(() => resetGameEnvironmentForTests());

  it("defaults to campus", () => {
    expect(useGameEnvironment.getState().id).toBe("campus");
  });

  it("loads a persisted id", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "sky" } as never);
    await useGameEnvironment.getState().init();
    expect(useGameEnvironment.getState().id).toBe("sky");
  });

  it("persists on change", () => {
    useGameEnvironment.getState().setEnvironment("campus");
    expect(commands.setSetting).toHaveBeenCalledWith("world.environment", "campus");
  });

  it("defaults to day", () => {
    expect(useGameEnvironment.getState().night).toBe(false);
  });

  it("loads a persisted night flag", async () => {
    vi.mocked(commands.getSetting).mockImplementation(async (key: string) =>
      key === "world.night" ? { status: "ok", data: "1" } : { status: "ok", data: null },
    );
    await useGameEnvironment.getState().init();
    expect(useGameEnvironment.getState().night).toBe(true);
  });

  it("toggleNight flips the flag and writes the KV round-trip", () => {
    useGameEnvironment.getState().toggleNight();
    expect(useGameEnvironment.getState().night).toBe(true);
    expect(commands.setSetting).toHaveBeenCalledWith("world.night", "1");

    useGameEnvironment.getState().toggleNight();
    expect(useGameEnvironment.getState().night).toBe(false);
    expect(commands.setSetting).toHaveBeenCalledWith("world.night", "0");
  });
});
