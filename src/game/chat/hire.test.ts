// Pure spec-building + flow tests for hire.ts (M2 T5). buildHireSpec/
// buildAdoptSpec/canTakeOver are pure ports (see hire.ts headers for the
// v1 sources); hireAgent/adoptSession are the async flows, tested against
// mocked stores/commands the way crew-bar.test.tsx mocks spawn_session.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agent, meta, sid } from "@/test/fixtures";
import type { SessionMeta } from "@/ipc/bindings";

const spawnSession = vi.fn();
vi.mock("@/ipc/bindings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/ipc/bindings")>();
  return {
    ...real,
    commands: { ...real.commands, spawnSession: (...args: unknown[]) => spawnSession(...args) },
  };
});

const getSpawnProvider = vi.fn();
vi.mock("@/stores/agents", () => ({
  useAgentsStore: { getState: () => ({ getSpawnProvider }) },
}));

const upsert = vi.fn();
vi.mock("@/stores/bindings", () => ({
  useBindingsStore: { getState: () => ({ upsert }) },
}));

const { buildHireSpec, buildAdoptSpec, canTakeOver, hireAgent, adoptSession } = await import("./hire");

beforeEach(() => {
  spawnSession.mockReset();
  getSpawnProvider.mockReset();
  upsert.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("buildHireSpec", () => {
  it("errors when the agent has no home project", () => {
    const a = agent({ id: "a1", name: "Scout", project_path: null });
    expect(buildHireSpec(a, { model: "sonnet", prompt: null })).toEqual({
      error: "Scout has no home project — set one in the agent editor first.",
    });
  });

  it("uses the picker's model, not the agent's default", () => {
    const a = agent({ id: "a1", name: "Scout", project_path: "/work/proj", default_model: "haiku" });
    const spec = buildHireSpec(a, { model: "opus", prompt: null });
    expect(spec).toMatchObject({
      project_path: "/work/proj",
      model: "opus",
      resume_session: null,
      fork: false,
      agent_id: "a1",
    });
  });

  it("carries the first-message prompt and system prompt through", () => {
    const a = agent({ id: "a1", name: "Scout", project_path: "/work/proj", system_prompt: "be terse" });
    const spec = buildHireSpec(a, { model: "sonnet", prompt: "start here" });
    expect(spec).toMatchObject({ prompt: "start here", append_system_prompt: "be terse" });
  });

  it("falls back to Default permission mode for an unrecognized value", () => {
    const a = agent({ id: "a1", name: "Scout", project_path: "/work/proj", permission_mode: "Weird" });
    const spec = buildHireSpec(a, { model: "sonnet", prompt: null });
    expect(spec).toMatchObject({ permission_mode: "Default" });
  });
});

describe("buildAdoptSpec", () => {
  const m = meta({ id: sid("s1"), project_path: "/work/proj", model: "opus" });

  it("resumes the session id without forking", () => {
    expect(buildAdoptSpec(m, { fork: false })).toMatchObject({
      project_path: "/work/proj",
      resume_session: "s1",
      fork: false,
      model: "opus",
      prompt: null,
      append_system_prompt: null,
      agent_id: null,
      permission_mode: "Default",
    });
  });

  it("sets fork: true for a fork", () => {
    expect(buildAdoptSpec(m, { fork: true })).toMatchObject({ resume_session: "s1", fork: true });
  });

  it("falls back to null model when the session has none", () => {
    const noModel = meta({ id: sid("s2"), model: null });
    expect(buildAdoptSpec(noModel, { fork: false }).model).toBeNull();
  });
});

describe("canTakeOver", () => {
  it("is true for Ended sessions", () => {
    expect(canTakeOver(meta({ id: sid("s1"), status: "Ended", origin: "Managed" }))).toBe(true);
  });

  it("is true for settled External sessions", () => {
    expect(canTakeOver(meta({ id: sid("s1"), status: "Idle", origin: "External" }))).toBe(true);
  });

  it("is false for a mid-run External session", () => {
    expect(canTakeOver(meta({ id: sid("s1"), status: "Working", origin: "External" }))).toBe(false);
  });

  it("is false for an Idle Managed session (not External, not Ended)", () => {
    expect(canTakeOver(meta({ id: sid("s1"), status: "Idle", origin: "Managed" }))).toBe(false);
  });
});

describe("hireAgent", () => {
  const a = agent({ id: "a1", name: "Scout", project_path: "/work/proj" });

  it("passes buildHireSpec's error straight through without touching stores", async () => {
    const noPath = agent({ id: "a1", name: "Scout", project_path: null });
    const result = await hireAgent(noPath, { model: "sonnet", prompt: null });
    expect(result).toEqual({ error: "Scout has no home project — set one in the agent editor first." });
    expect(getSpawnProvider).not.toHaveBeenCalled();
  });

  it("errors when no spawn-capable provider is available", async () => {
    getSpawnProvider.mockResolvedValue(null);
    const result = await hireAgent(a, { model: "sonnet", prompt: null });
    expect(result).toEqual({ error: "No spawn-capable provider is available — is the engine running?" });
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it("passes spawnSession's error through", async () => {
    getSpawnProvider.mockResolvedValue("claude-code");
    spawnSession.mockResolvedValue({ status: "error", error: "boom" });
    const result = await hireAgent(a, { model: "sonnet", prompt: null });
    expect(result).toEqual({ error: "boom" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("spawns, binds the agent, and returns the new session's chat key", async () => {
    getSpawnProvider.mockResolvedValue("claude-code");
    spawnSession.mockResolvedValue({ status: "ok", data: sid("s-new", "claude-code") });
    upsert.mockResolvedValue(null);
    const result = await hireAgent(a, { model: "opus", prompt: "go" });
    expect(spawnSession).toHaveBeenCalledWith(
      "claude-code",
      expect.objectContaining({ model: "opus", prompt: "go" }),
    );
    expect(upsert).toHaveBeenCalledWith({
      session_id: "s-new",
      agent_id: "a1",
      room_id: null,
      display_name: null,
      pinned: false,
    });
    expect(result).toEqual({ key: "claude-code:s-new" });
  });
});

describe("adoptSession", () => {
  const m: SessionMeta = meta({ id: sid("s1", "claude-code"), status: "Ended", origin: "Managed" });

  it("resumes on the session's original provider and returns the new chat key", async () => {
    spawnSession.mockResolvedValue({ status: "ok", data: sid("s2", "claude-code") });
    const result = await adoptSession(m, { fork: false });
    expect(spawnSession).toHaveBeenCalledWith(
      "claude-code",
      expect.objectContaining({ resume_session: "s1", fork: false }),
    );
    expect(result).toEqual({ key: "claude-code:s2" });
  });

  it("forks with fork: true", async () => {
    spawnSession.mockResolvedValue({ status: "ok", data: sid("s3", "claude-code") });
    await adoptSession(m, { fork: true });
    expect(spawnSession).toHaveBeenCalledWith("claude-code", expect.objectContaining({ fork: true }));
  });

  it("passes spawnSession's error through", async () => {
    spawnSession.mockResolvedValue({ status: "error", error: "nope" });
    const result = await adoptSession(m, { fork: false });
    expect(result).toEqual({ error: "nope" });
  });
});
