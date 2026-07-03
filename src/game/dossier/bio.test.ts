import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
    worldGenerateProp: vi.fn(async () => ({
      status: "ok",
      data: {
        session_id: "s1",
        status: "success",
        text: "Ada debugs by moonlight and swears by semicolons.",
      },
    })),
  },
}));

vi.mock("@/game/flavor/engine", () => ({
  flavorEnabled: vi.fn(() => true),
  flavorModel: vi.fn(() => "haiku"),
  bumpFlavorRuns: vi.fn(),
}));

import { commands } from "@/ipc/bindings";
import { bumpFlavorRuns, flavorEnabled, flavorModel } from "@/game/flavor/engine";
import type { DossierInfo } from "./data";
import { BIO_DISABLED_PLACEHOLDER, BIO_KEY_PREFIX, bioPrompt, resetBiosForTests, useBios } from "./bio";

function info(over: Partial<DossierInfo> = {}): DossierInfo {
  return {
    key: "claude:s1",
    name: "Ada",
    color: "#fff",
    status: "Working",
    statusSinceMs: 0,
    model: "sonnet",
    origin: "Managed",
    projectName: "Crewhub",
    projectFolder: "/tmp/proj",
    roomName: "Crewhub",
    gitBranch: "main",
    activity: null,
    usage: null,
    parentKey: null,
    agentRole: "a meticulous refactorer",
    agentId: null,
    motion: null,
    ...over,
  };
}

describe("bioPrompt", () => {
  it("is deterministic for the same input", () => {
    expect(bioPrompt(info())).toBe(bioPrompt(info()));
  });

  it("mentions the bot's name", () => {
    expect(bioPrompt(info({ name: "Turing" }))).toContain("Turing");
  });

  it("includes the agent role as a personality hint when present", () => {
    expect(bioPrompt(info({ agentRole: "a chaotic tester" }))).toContain("a chaotic tester");
  });

  it("includes the project name when present", () => {
    expect(bioPrompt(info({ projectName: "Widgets" }))).toContain("works on Widgets");
  });

  it("omits the hint sentence entirely when there is neither role nor project", () => {
    const prompt = bioPrompt(info({ agentRole: null, projectName: null }));
    expect(prompt).not.toContain("Personality hints");
  });

  it("asks for a short, quote-free 2-sentence reply", () => {
    const prompt = bioPrompt(info());
    expect(prompt).toMatch(/2-sentence/);
    expect(prompt).toMatch(/40 words/);
    expect(prompt).toMatch(/no quotes/i);
  });

  it("clamps an overlong name to 60 chars", () => {
    const longName = "A".repeat(120);
    const prompt = bioPrompt(info({ name: longName }));
    expect(prompt).toContain("A".repeat(60));
    expect(prompt).not.toContain("A".repeat(61));
  });

  it("clamps an overlong role excerpt to 200 chars", () => {
    const longRole = "b".repeat(300);
    const prompt = bioPrompt(info({ agentRole: longRole }));
    expect(prompt).toContain("b".repeat(200));
    expect(prompt).not.toContain("b".repeat(201));
  });
});

describe("useBios", () => {
  beforeEach(() => {
    resetBiosForTests();
    vi.mocked(commands.getSetting)
      .mockReset()
      .mockResolvedValue({ status: "ok", data: null } as never);
    vi.mocked(commands.setSetting)
      .mockReset()
      .mockResolvedValue({ status: "ok", data: null } as never);
    vi.mocked(commands.worldGenerateProp)
      .mockReset()
      .mockResolvedValue({
        status: "ok",
        data: {
          session_id: "s1",
          status: "success",
          text: "Ada debugs by moonlight and swears by semicolons.",
        },
      } as never);
    vi.mocked(flavorEnabled).mockReset().mockReturnValue(true);
    vi.mocked(flavorModel).mockReset().mockReturnValue("haiku");
    vi.mocked(bumpFlavorRuns).mockReset();
  });

  it("does nothing when the bio is already cached in state", () => {
    useBios.setState({ bios: { "claude:s1": "already here" } });
    useBios.getState().ensure(info());
    expect(commands.getSetting).not.toHaveBeenCalled();
  });

  it("caches a KV hit into state without generating", async () => {
    vi.mocked(commands.getSetting).mockResolvedValue({ status: "ok", data: "a cached bio" } as never);
    useBios.getState().ensure(info());
    await vi.waitFor(() => expect(useBios.getState().bios["claude:s1"]).toBe("a cached bio"));
    expect(commands.getSetting).toHaveBeenCalledWith(`${BIO_KEY_PREFIX}claude:s1`);
    expect(commands.worldGenerateProp).not.toHaveBeenCalled();
  });

  it("generates, sanitizes and persists on a KV miss", async () => {
    useBios.getState().ensure(info());
    await vi.waitFor(() =>
      expect(useBios.getState().bios["claude:s1"]).toBe("Ada debugs by moonlight and swears by semicolons."),
    );
    expect(commands.worldGenerateProp).toHaveBeenCalledWith(expect.stringContaining("Ada"), "haiku");
    expect(commands.setSetting).toHaveBeenCalledWith(
      `${BIO_KEY_PREFIX}claude:s1`,
      "Ada debugs by moonlight and swears by semicolons.",
    );
    expect(bumpFlavorRuns).toHaveBeenCalledTimes(1);
    expect(useBios.getState().loading).toBeNull();
  });

  it("strips wrapping quotes and clamps to 240 chars", async () => {
    const long = `"${"z".repeat(300)}"`;
    vi.mocked(commands.worldGenerateProp).mockResolvedValue({
      status: "ok",
      data: { session_id: "s1", status: "success", text: long },
    } as never);
    useBios.getState().ensure(info());
    await vi.waitFor(() => expect(useBios.getState().bios["claude:s1"]).toBeDefined());
    const cached = useBios.getState().bios["claude:s1"]!;
    expect(cached.startsWith('"')).toBe(false);
    expect(cached.length).toBe(240);
  });

  it("caches the agent id, not the session key, for a bound crew member", async () => {
    useBios.getState().ensure(info({ key: "claude:s1", agentId: "ag1" }));
    await vi.waitFor(() => expect(useBios.getState().bios["agent:ag1"]).toBeDefined());
    expect(useBios.getState().bios["claude:s1"]).toBeUndefined();
    expect(commands.getSetting).toHaveBeenCalledWith(`${BIO_KEY_PREFIX}agent:ag1`);
  });

  it("shows a placeholder without persisting when flavor is disabled", async () => {
    vi.mocked(flavorEnabled).mockReturnValue(false);
    useBios.getState().ensure(info());
    await vi.waitFor(() => expect(useBios.getState().bios["claude:s1"]).toBe(BIO_DISABLED_PLACEHOLDER));
    expect(commands.worldGenerateProp).not.toHaveBeenCalled();
    expect(commands.setSetting).not.toHaveBeenCalled();
  });

  it("fails silently on a generation error, leaving no cached bio", async () => {
    vi.mocked(commands.worldGenerateProp).mockRejectedValue(new Error("boom"));
    useBios.getState().ensure(info());
    await vi.waitFor(() => expect(useBios.getState().loading).toBeNull());
    expect(useBios.getState().bios["claude:s1"]).toBeUndefined();
  });

  it("fails silently when the model reports an error status", async () => {
    vi.mocked(commands.worldGenerateProp).mockResolvedValue({
      status: "ok",
      data: { session_id: "s1", status: "error", text: "error: rate limited" },
    } as never);
    useBios.getState().ensure(info());
    await vi.waitFor(() => expect(useBios.getState().loading).toBeNull());
    expect(useBios.getState().bios["claude:s1"]).toBeUndefined();
  });

  it("only ever runs one generation at a time, cluster-wide", async () => {
    let resolveFirst!: (v: Awaited<ReturnType<typeof commands.worldGenerateProp>>) => void;
    vi.mocked(commands.worldGenerateProp).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    useBios.getState().ensure(info({ key: "claude:s1" }));
    await vi.waitFor(() => expect(useBios.getState().loading).toBe("claude:s1"));

    useBios.getState().ensure(info({ key: "claude:s2" }));
    // second bot's generation never starts while the first is in flight
    expect(commands.worldGenerateProp).toHaveBeenCalledTimes(1);

    resolveFirst({ status: "ok", data: { session_id: "s1", status: "success", text: "done" } });
    await vi.waitFor(() => expect(useBios.getState().bios["claude:s1"]).toBe("done"));
  });

  it("regenerate skips the state cache and forces a fresh generation", async () => {
    useBios.setState({ bios: { "claude:s1": "stale bio" } });
    vi.mocked(commands.worldGenerateProp).mockResolvedValue({
      status: "ok",
      data: { session_id: "s1", status: "success", text: "a brand new bio" },
    } as never);
    useBios.getState().regenerate(info());
    await vi.waitFor(() => expect(useBios.getState().bios["claude:s1"]).toBe("a brand new bio"));
    expect(commands.getSetting).not.toHaveBeenCalled();
    expect(commands.setSetting).toHaveBeenCalledWith(`${BIO_KEY_PREFIX}claude:s1`, "a brand new bio");
  });
});
