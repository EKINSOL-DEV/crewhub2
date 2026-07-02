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
});
