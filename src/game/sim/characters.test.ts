// SessionView[] → Character[] (M1 T4): the store join for the campus sim,
// ported from src/panels/world/lib/bots.ts minus room/zone assignment (the
// campus sim seats characters itself).
import { describe, expect, it } from "vitest";
import type { Agent, SessionMeta } from "@/ipc/bindings";
import type { SessionView } from "@/stores/sessions";
import { toCharacters } from "./characters";

const NOW = 1_000_000;

function meta(id: string, over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: { provider: "claude", id },
    origin: "Managed",
    project_path: "/tmp/proj",
    model: null,
    status: "Working",
    activity_detail: null,
    parent: null,
    team: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: NOW,
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
    displayName: id,
    ...over,
  };
}

const robo: Agent = {
  id: "ag1",
  name: "Robo",
  icon: null,
  color: "#ff0000",
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

describe("toCharacters", () => {
  it("keeps recent live sessions, drops ended and stale ones", () => {
    const chars = toCharacters(
      [
        view("a"),
        view("ended", {}, { status: "Ended", last_activity_ms: NOW }),
        view("stale", {}, { status: "Idle", last_activity_ms: NOW - 6 * 60_000 }),
      ],
      { nowMs: NOW },
    );
    expect(chars.map((c) => c.key)).toEqual(["claude:a"]);
  });

  it("adds resting crew for agents without a live session", () => {
    const chars = toCharacters([], { nowMs: NOW, agents: [robo] });
    expect(chars).toHaveLength(1);
    expect(chars[0]!.agentId).toBe("ag1");
    expect(chars[0]!.status).toBe("Idle");
    expect(chars[0]!.color).toBe("#ff0000");
  });

  it("gives stable palette colors to unbound sessions", () => {
    const [a1] = toCharacters([view("a")], { nowMs: NOW });
    const [a2] = toCharacters([view("a")], { nowMs: NOW });
    expect(a1!.color).toBe(a2!.color);
  });

  it("humanizes subagent names and links them to their parent", () => {
    const parent = view("p1", { displayName: "Aqua" });
    const child = view(
      "c1",
      {},
      { parent: { provider: "claude", id: "p1" }, activity_detail: "Editing config.py" },
    );
    const chars = toCharacters([parent, child], { nowMs: NOW });
    const sub = chars.find((c) => c.key === "claude:c1")!;
    expect(sub.isSubagent).toBe(true);
    expect(sub.parentKey).toBe("claude:p1");
    expect(sub.name).toBe("Editing config.py");
  });

  it("an agent out working a live session gets no resting crew entry", () => {
    const live = view("s1", { agent: robo }, { last_activity_ms: NOW });
    const chars = toCharacters([live], { nowMs: NOW, agents: [robo] });
    expect(chars.map((c) => c.key)).toEqual(["claude:s1"]);
  });
});
