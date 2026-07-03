import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    worldGenerateProp: vi.fn(async () => ({
      status: "ok",
      data: { session_id: "s1", status: "success", text: "counting semicolons quietly" },
    })),
  },
}));

import { commands } from "@/ipc/bindings";
import type { Character } from "@/game/sim/characters";
import { FLAVOR_MODEL_KEY, FLAVOR_SETTING_KEY, resetFlavorForTests, thoughtFor, useFlavor } from "./engine";

function character(overrides: Partial<Character> = {}): Character {
  return {
    key: "claude:abc",
    name: "Ada",
    status: "Working",
    activity: "refactoring the parser",
    color: "#fff",
    isSubagent: false,
    parentKey: null,
    agentId: null,
    ...overrides,
  };
}

describe("useFlavor", () => {
  beforeEach(() => {
    resetFlavorForTests();
    vi.mocked(commands.getSetting)
      .mockReset()
      .mockResolvedValue({ status: "ok", data: null } as never);
    vi.mocked(commands.worldGenerateProp)
      .mockReset()
      .mockResolvedValue({
        status: "ok",
        data: { session_id: "s1", status: "success", text: "counting semicolons quietly" },
      } as never);
  });

  it("init loads the enabled flag and model from settings, once", async () => {
    vi.mocked(commands.getSetting).mockImplementation(async (key: string) => {
      if (key === FLAVOR_SETTING_KEY) return { status: "ok", data: "0" };
      if (key === FLAVOR_MODEL_KEY) return { status: "ok", data: "sonnet" };
      return { status: "ok", data: null };
    });
    await useFlavor.getState().init();
    expect(useFlavor.getState().enabled).toBe(false);

    // idempotent — a second call does not re-fetch
    await useFlavor.getState().init();
    expect(vi.mocked(commands.getSetting)).toHaveBeenCalledTimes(2);
  });

  it("defaults to enabled when the setting is absent", async () => {
    await useFlavor.getState().init();
    expect(useFlavor.getState().enabled).toBe(true);
  });

  it("generates a thought for a character and records the run", async () => {
    useFlavor.getState().maybeThink(character(), 0);
    await vi.waitFor(() => expect(useFlavor.getState().runs).toBe(1));
    expect(useFlavor.getState().thoughts["claude:abc"]).toEqual({
      text: "counting semicolons quietly",
      ts: 0,
    });
    expect(commands.worldGenerateProp).toHaveBeenCalledWith(expect.stringContaining("Ada"), "haiku");
  });

  it("uses the configured model from settings", async () => {
    vi.mocked(commands.getSetting).mockImplementation(async (key: string) => {
      if (key === FLAVOR_MODEL_KEY) return { status: "ok", data: "sonnet" };
      return { status: "ok", data: null };
    });
    await useFlavor.getState().init();
    useFlavor.getState().maybeThink(character(), 0);
    await vi.waitFor(() => expect(useFlavor.getState().runs).toBe(1));
    expect(commands.worldGenerateProp).toHaveBeenCalledWith(expect.any(String), "sonnet");
  });

  it("does nothing when disabled", async () => {
    vi.mocked(commands.getSetting).mockImplementation(async (key: string) => {
      if (key === FLAVOR_SETTING_KEY) return { status: "ok", data: "0" };
      return { status: "ok", data: null };
    });
    await useFlavor.getState().init();
    useFlavor.getState().maybeThink(character(), 0);
    await Promise.resolve();
    expect(commands.worldGenerateProp).not.toHaveBeenCalled();
  });

  it("skips characters with agentId set", () => {
    useFlavor.getState().maybeThink(character({ agentId: "agent-1" }), 0);
    expect(commands.worldGenerateProp).not.toHaveBeenCalled();
  });

  it("skips demo characters", () => {
    useFlavor.getState().maybeThink(character({ key: "demo:ada" }), 0);
    expect(commands.worldGenerateProp).not.toHaveBeenCalled();
  });

  it("respects the per-character 240s cooldown, recorded at attempt time", async () => {
    useFlavor.getState().maybeThink(character(), 0);
    await vi.waitFor(() => expect(useFlavor.getState().runs).toBe(1));

    useFlavor.getState().maybeThink(character(), 239_999);
    await Promise.resolve();
    expect(commands.worldGenerateProp).toHaveBeenCalledTimes(1);

    useFlavor.getState().maybeThink(character(), 240_000);
    await vi.waitFor(() => expect(commands.worldGenerateProp).toHaveBeenCalledTimes(2));
  });

  it("caps in-flight generations at 1 across characters", async () => {
    let resolveFirst!: (v: unknown) => void;
    vi.mocked(commands.worldGenerateProp).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }) as never,
    );

    useFlavor.getState().maybeThink(character({ key: "claude:one" }), 0);
    useFlavor.getState().maybeThink(character({ key: "claude:two" }), 0);
    await Promise.resolve();
    expect(commands.worldGenerateProp).toHaveBeenCalledTimes(1);

    resolveFirst({ status: "ok", data: { session_id: "s1", status: "success", text: "done" } });
    await vi.waitFor(() => expect(useFlavor.getState().runs).toBe(1));

    // in-flight slot freed — a later attempt for the second character goes through
    useFlavor.getState().maybeThink(character({ key: "claude:two" }), 1);
    await vi.waitFor(() => expect(commands.worldGenerateProp).toHaveBeenCalledTimes(2));
  });

  it("records the cooldown on failure but does not increment runs", async () => {
    vi.mocked(commands.worldGenerateProp).mockResolvedValueOnce({ status: "error", error: "boom" } as never);
    useFlavor.getState().maybeThink(character(), 0);
    await vi.waitFor(() => expect(vi.mocked(commands.worldGenerateProp)).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(useFlavor.getState().runs).toBe(0);

    // cooldown still recorded at attempt time — no immediate retry storm
    useFlavor.getState().maybeThink(character(), 1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(commands.worldGenerateProp).toHaveBeenCalledTimes(1);
  });

  it("drops a successful but unsanitizable reply without incrementing runs", async () => {
    vi.mocked(commands.worldGenerateProp).mockResolvedValueOnce({
      status: "ok",
      data: { session_id: "s1", status: "success", text: "Error: no idea" },
    } as never);
    useFlavor.getState().maybeThink(character(), 0);
    await vi.waitFor(() => expect(vi.mocked(commands.worldGenerateProp)).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(useFlavor.getState().runs).toBe(0);
    expect(useFlavor.getState().thoughts["claude:abc"]).toBeUndefined();
  });
});

describe("thoughtFor", () => {
  beforeEach(() => resetFlavorForTests());

  it("returns the thought within the 30s TTL", () => {
    useFlavor.setState({ thoughts: { "claude:abc": { text: "hi", ts: 1000 } } });
    expect(thoughtFor("claude:abc", 1000)).toEqual({ text: "hi", ts: 1000 });
    expect(thoughtFor("claude:abc", 1000 + 30_000)).toEqual({ text: "hi", ts: 1000 });
  });

  it("hides an expired thought", () => {
    useFlavor.setState({ thoughts: { "claude:abc": { text: "hi", ts: 1000 } } });
    expect(thoughtFor("claude:abc", 1000 + 30_001)).toBeNull();
  });

  it("returns null for an unknown key", () => {
    expect(thoughtFor("claude:missing", 0)).toBeNull();
  });
});
