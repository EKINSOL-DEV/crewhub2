// SessionView[] → WorldBot[] (EKI-66): names, colors, rooms, subagent links.
import { describe, expect, it } from "vitest";
import type { Agent, Room, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { ACTIVE_WINDOW_MS, botColor, humanizeSubagentName, toWorldBots } from "./bots";
import { LOBBY_ID } from "./layout";

function meta(id: string, over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: { provider: "claude", id },
    origin: "Managed",
    project_path: "/work/crewhub",
    model: null,
    status: "Working",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: 0,
    ...over,
  };
}

function view(id: string, over: Partial<SessionView> = {}, metaOver: Partial<SessionMeta> = {}): SessionView {
  return {
    key: `claude:${id}`,
    meta: meta(id, metaOver),
    binding: null,
    agent: null,
    room: null,
    displayName: id.slice(0, 8),
    ...over,
  };
}

const aqua: Agent = {
  id: "ag1",
  name: "Aqua",
  icon: null,
  color: "#22ccaa",
  avatar: null,
  default_model: null,
  project_path: null,
  permission_mode: "Default",
  system_prompt: null,
  persona_json: null,
  is_pinned: false,
  auto_spawn: false,
  bio: null,
  created_at: 0,
  updated_at: 0,
};

const den: Room = {
  id: "room1",
  project_id: null,
  name: "Den",
  icon: null,
  color: null,
  sort_order: 0,
  is_hq: false,
  style_json: null,
  created_at: 0,
  updated_at: 0,
};

describe("toWorldBots", () => {
  it("maps a bound session to its room and agent color", () => {
    const bots = toWorldBots([view("s1", { agent: aqua, room: den, displayName: "Aqua" })], { nowMs: 0 });
    expect(bots).toHaveLength(1);
    expect(bots[0]).toMatchObject({
      key: "claude:s1",
      name: "Aqua",
      roomId: "room1",
      color: "#22ccaa",
      isSubagent: false,
      parentKey: null,
    });
  });

  it("drops Ended sessions — tombstones have no body", () => {
    expect(toWorldBots([view("s1", {}, { status: "Ended" })], { nowMs: 0 })).toHaveLength(0);
  });

  it("sends unbound sessions to the lobby", () => {
    expect(toWorldBots([view("s1")], { nowMs: 0 })[0]!.roomId).toBe(LOBBY_ID);
  });

  it("clusters subagents into the parent's room with a parentKey", () => {
    const parent = view("p1", { room: den });
    const child = view("c1", {}, { parent: { provider: "claude", id: "p1" } });
    const bots = toWorldBots([parent, child], { nowMs: 0 });
    const sub = bots.find((b) => b.key === "claude:c1")!;
    expect(sub.isSubagent).toBe(true);
    expect(sub.parentKey).toBe("claude:p1");
    expect(sub.roomId).toBe("room1"); // follows the parent, not its own binding
  });

  it("humanizes subagent names instead of showing raw ids", () => {
    const parent = view("p1", { displayName: "Aqua", agent: aqua });
    const child = view(
      "c1-uuid-long",
      {},
      {
        parent: { provider: "claude", id: "p1" },
        activity_detail: "Editing config.py",
      },
    );
    const bots = toWorldBots([parent, child], { nowMs: 0 });
    expect(bots.find((b) => b.isSubagent)!.name).toBe("Editing config.py");
  });

  it("keeps an explicit binding display_name for subagents", () => {
    const child = view(
      "c1",
      {
        displayName: "Scout",
        binding: {
          session_id: "c1",
          agent_id: null,
          room_id: null,
          display_name: "Scout",
          pinned: false,
          updated_at: 0,
        },
      },
      { parent: { provider: "claude", id: "p1" } },
    );
    expect(toWorldBots([view("p1"), child], { nowMs: 0 }).find((b) => b.isSubagent)!.name).toBe("Scout");
  });

  // ── EKI-110: recency window + crew resting at HQ ───────────────────────────

  it("hides sessions idle longer than the 5-minute window (external ones too)", () => {
    const now = 1_000_000_000;
    const fresh = view("fresh", {}, { last_activity_ms: now - ACTIVE_WINDOW_MS });
    const stale = view("stale", {}, { last_activity_ms: now - ACTIVE_WINDOW_MS - 1, origin: "External" });
    const keys = toWorldBots([fresh, stale], { nowMs: now }).map((b) => b.key);
    expect(keys).toEqual(["claude:fresh"]);
  });

  it("a fresh subagent still resolves the room of its stale parent", () => {
    const now = 1_000_000_000;
    const parent = view("p1", { room: den }, { last_activity_ms: 0 });
    const child = view("c1", {}, { parent: { provider: "claude", id: "p1" }, last_activity_ms: now });
    const bots = toWorldBots([parent, child], { nowMs: now });
    expect(bots.map((b) => b.key)).toEqual(["claude:c1"]);
    expect(bots[0]!.roomId).toBe("room1");
  });

  it("crew agents without a live session rest idle at HQ", () => {
    const bots = toWorldBots([], { agents: [aqua], hqId: "hq1" });
    expect(bots).toHaveLength(1);
    expect(bots[0]).toMatchObject({
      key: "agent:ag1",
      name: "Aqua",
      status: "Idle",
      roomId: "hq1",
      color: "#22ccaa",
      agentId: "ag1",
    });
  });

  it("an agent out working a live session gets no HQ rest bot", () => {
    const live = view("s1", { agent: aqua }, { last_activity_ms: 0 });
    const bots = toWorldBots([live], { agents: [aqua], hqId: "hq1", nowMs: 0 });
    expect(bots.map((b) => b.key)).toEqual(["claude:s1"]);
  });

  it("an agent whose only session went stale returns to HQ", () => {
    const now = 1_000_000_000;
    const stale = view("s1", { agent: aqua }, { last_activity_ms: 0 });
    const bots = toWorldBots([stale], { agents: [aqua], hqId: "hq1", nowMs: now });
    expect(bots.map((b) => b.key)).toEqual(["agent:ag1"]);
  });

  it("rest bots fall back to the lobby when no HQ room exists", () => {
    expect(toWorldBots([], { agents: [aqua] })[0]!.roomId).toBe(LOBBY_ID);
  });
});

describe("humanizeSubagentName", () => {
  it("prefers activity detail, then project basename, then parent name", () => {
    expect(
      humanizeSubagentName({ activity: "Reading docs", projectPath: "/w/app", parentName: "Aqua" }),
    ).toBe("Reading docs");
    expect(humanizeSubagentName({ activity: null, projectPath: "/w/app", parentName: "Aqua" })).toBe(
      "Subagent (app)",
    );
    expect(humanizeSubagentName({ activity: null, projectPath: "", parentName: "Aqua" })).toBe(
      "Subagent of Aqua",
    );
    expect(humanizeSubagentName({ activity: null, projectPath: "", parentName: null })).toBe("Subagent");
  });
});

describe("botColor", () => {
  it("uses the agent color when set and a stable soft fallback otherwise", () => {
    expect(botColor("k", "#123456")).toBe("#123456");
    const a = botColor("claude:s1", null);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    expect(botColor("claude:s1", null)).toBe(a); // stable
    // different keys spread across the palette (not all identical)
    const colors = new Set([...Array(12).keys()].map((i) => botColor(`k${i}`, null)));
    expect(colors.size).toBeGreaterThan(1);
  });
});
