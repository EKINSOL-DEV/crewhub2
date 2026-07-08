import { afterEach, describe, expect, it } from "vitest";
import type { Agent, Project, Room, SessionBinding, SessionMeta } from "@/ipc/bindings";
import { registerLiveBots } from "@/game/sim/live-bots";
import type { SimBot } from "@/game/sim/sim";
import { buildDossier, type DossierSnapshot, humanizeDuration } from "./data";

const NOW = 1_000_000;

function meta(id: string, over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: { provider: "claude", id },
    origin: "Managed",
    project_path: "/tmp/proj",
    model: "sonnet",
    status: "Working",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 1200, output_tokens: 340, cache_read_tokens: 50 },
    git_branch: "main",
    last_activity_ms: NOW,
    ...over,
  };
}

function agent(id: string, over: Partial<Agent> = {}): Agent {
  return {
    id,
    name: "Robo",
    icon: null,
    color: "#ff0000",
    avatar: null,
    default_model: "opus",
    project_path: "/tmp/proj",
    permission_mode: "Default",
    system_prompt: null,
    persona_json: null,
    is_pinned: false,
    auto_spawn: false,
    bio: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function binding(sessionId: string, over: Partial<SessionBinding> = {}): SessionBinding {
  return {
    session_id: sessionId,
    agent_id: null,
    room_id: null,
    display_name: null,
    pinned: false,
    updated_at: 0,
    ...over,
  };
}

function room(id: string, over: Partial<Room> = {}): Room {
  return {
    id,
    project_id: null,
    name: "War Room",
    icon: null,
    color: null,
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function project(id: string, over: Partial<Project> = {}): Project {
  return {
    id,
    name: "Crewhub",
    description: null,
    icon: null,
    color: null,
    folder_path: "/tmp/proj",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function snapshot(over: Partial<DossierSnapshot> = {}): DossierSnapshot {
  return {
    sessions: {},
    bindings: {},
    agents: [],
    rooms: [],
    projects: [],
    nowMs: NOW,
    ...over,
  };
}

describe("buildDossier", () => {
  afterEach(() => registerLiveBots(null));

  it("returns null for an unknown key", () => {
    expect(buildDossier("claude:ghost", snapshot())).toBeNull();
  });

  it("joins a live session bound to a crew agent, room and project", () => {
    const snap = snapshot({
      sessions: { "claude:s1": meta("s1") },
      bindings: { s1: binding("s1", { agent_id: "ag1", room_id: "r1", display_name: "Ada" }) },
      agents: [
        agent("ag1", { name: "Ada", color: "#7dd3fc", system_prompt: "You are a meticulous refactorer." }),
      ],
      rooms: [room("r1", { name: "The Foundry" })],
      projects: [project("p1", { name: "Crewhub", folder_path: "/tmp/proj" })],
    });
    const info = buildDossier("claude:s1", snap);
    expect(info).toMatchObject({
      key: "claude:s1",
      name: "Ada",
      status: "Working",
      model: "sonnet",
      origin: "Managed",
      projectName: "Crewhub",
      projectFolder: "/tmp/proj",
      roomName: "The Foundry", // explicit room binding wins over the project-folder match
      gitBranch: "main",
      parentKey: null,
      agentRole: "You are a meticulous refactorer.",
      agentId: "ag1",
      usage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 50 },
    });
    expect(info?.statusSinceMs).toBe(NOW);
  });

  it("falls back to the agent's name for role when it has no system prompt", () => {
    const snap = snapshot({
      sessions: { "claude:s1": meta("s1") },
      bindings: { s1: binding("s1", { agent_id: "ag1" }) },
      agents: [agent("ag1", { name: "Ada", system_prompt: null })],
    });
    expect(buildDossier("claude:s1", snap)?.agentRole).toBe("Ada");
  });

  it("joins an external session with no binding — name falls back to the short id, no room/agent", () => {
    const snap = snapshot({
      sessions: { "codex:abcdef1234567890": meta("abcdef1234567890", { origin: "External", model: null }) },
    });
    const info = buildDossier("codex:abcdef1234567890", snap);
    expect(info).toMatchObject({
      name: "abcdef12",
      origin: "External",
      model: null,
      roomName: null,
      agentRole: null,
      agentId: null,
    });
  });

  it("falls back to the matching project's name for roomName when there is no explicit room binding", () => {
    const snap = snapshot({
      sessions: { "claude:s1": meta("s1", { project_path: "/tmp/proj/" }) }, // trailing slash — normalizeFolder must still match
      projects: [project("p1", { name: "Crewhub", folder_path: "/tmp/proj" })],
    });
    const info = buildDossier("claude:s1", snap);
    expect(info?.projectName).toBe("Crewhub");
    expect(info?.roomName).toBe("Crewhub");
  });

  it("resolves forked session lineage to a parentKey", () => {
    const snap = snapshot({
      sessions: {
        "claude:child": meta("child", { parent: { provider: "claude", id: "parent" } }),
      },
    });
    expect(buildDossier("claude:child", snap)?.parentKey).toBe("claude:parent");
  });

  it("gives resting crew (agent-keyed, no live session) status 'resting' and a null statusSinceMs", () => {
    const snap = snapshot({
      agents: [agent("ag1", { name: "Turing", project_path: "/tmp/proj" })],
      projects: [project("p1", { name: "Crewhub", folder_path: "/tmp/proj" })],
    });
    const info = buildDossier("agent:ag1", snap);
    expect(info).toMatchObject({
      key: "agent:ag1",
      name: "Turing",
      status: "resting",
      statusSinceMs: null,
      origin: null,
      projectName: "Crewhub",
      roomName: "Crewhub",
      activity: null,
      usage: null,
      agentId: "ag1",
    });
  });

  it("returns null for a resting-crew key whose agent no longer exists", () => {
    expect(buildDossier("agent:gone", snapshot())).toBeNull();
  });

  it("clamps statusSinceMs to nowMs against clock skew", () => {
    const snap = snapshot({
      sessions: { "claude:s1": meta("s1", { last_activity_ms: NOW + 10_000 }) },
      nowMs: NOW,
    });
    expect(buildDossier("claude:s1", snap)?.statusSinceMs).toBe(NOW);
  });

  it("humanizes the sim's live motion for a session bot", () => {
    const bots = new Map<string, SimBot>([
      [
        "claude:s1",
        { key: "claude:s1", x: 0, z: 0, facing: 0, motion: "dance", deskId: null, path: [], age: 0 },
      ],
    ]);
    registerLiveBots(bots);
    const snap = snapshot({ sessions: { "claude:s1": meta("s1") } });
    expect(buildDossier("claude:s1", snap)?.motion).toBe("dancing");
  });

  it("humanizes sit-type as 'working at a desk'", () => {
    const bots = new Map<string, SimBot>([
      [
        "claude:s1",
        { key: "claude:s1", x: 0, z: 0, facing: 0, motion: "sit-type", deskId: "d1", path: [], age: 0 },
      ],
    ]);
    registerLiveBots(bots);
    const snap = snapshot({ sessions: { "claude:s1": meta("s1") } });
    expect(buildDossier("claude:s1", snap)?.motion).toBe("working at a desk");
  });

  it("is null when the bot has no live sim entry (not currently rendered)", () => {
    const snap = snapshot({ sessions: { "claude:s1": meta("s1") } });
    expect(buildDossier("claude:s1", snap)?.motion).toBeNull();
  });
});

describe("humanizeDuration", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(humanizeDuration(42_000)).toBe("42s");
  });

  it("formats sub-hour durations in minutes", () => {
    expect(humanizeDuration(5 * 60_000)).toBe("5m");
  });

  it("formats sub-day durations in hours and minutes", () => {
    expect(humanizeDuration(3 * 3_600_000 + 12 * 60_000)).toBe("3h 12m");
  });

  it("drops a zero minutes remainder", () => {
    expect(humanizeDuration(2 * 3_600_000)).toBe("2h");
  });

  it("formats multi-day durations in days and hours", () => {
    expect(humanizeDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe("2d 4h");
  });

  it("drops a zero hours remainder for whole days", () => {
    expect(humanizeDuration(3 * 86_400_000)).toBe("3d");
  });

  it("floors negative durations at 0s", () => {
    expect(humanizeDuration(-500)).toBe("0s");
  });
});

// abbrevTokens moved to src/lib/format.ts as formatTokens (de-duplicated
// alongside panels/chat/render-list.ts and panels/sessions/format.ts) —
// see src/lib/format.test.ts for the thorough boundary-case coverage.
