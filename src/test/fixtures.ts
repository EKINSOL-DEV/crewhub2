// Shared Lane C test fixtures: tiny builders over the generated binding types.
import type { Agent, ArchivedSession, Room, SessionBinding, SessionId, SessionMeta } from "@/ipc/bindings";

export function sid(id: string, provider = "claude-code"): SessionId {
  return { provider, id };
}

export function meta(overrides: Partial<SessionMeta> & { id: SessionId }): SessionMeta {
  return {
    origin: "Managed",
    project_path: "/work/proj",
    model: "haiku",
    status: "Idle",
    activity_detail: null,
    parent: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    git_branch: null,
    last_activity_ms: 0,
    ...overrides,
  };
}

export function agent(overrides: Partial<Agent> & { id: string; name: string }): Agent {
  return {
    icon: null,
    color: null,
    avatar: null,
    default_model: "haiku",
    project_path: null,
    permission_mode: "Default",
    system_prompt: null,
    persona_json: null,
    is_pinned: false,
    auto_spawn: false,
    bio: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

export function room(overrides: Partial<Room> & { id: string; name: string }): Room {
  return {
    project_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

export function binding(overrides: Partial<SessionBinding> & { session_id: string }): SessionBinding {
  return {
    agent_id: null,
    room_id: null,
    display_name: null,
    pinned: false,
    updated_at: 0,
    ...overrides,
  };
}

export function archived(overrides: Partial<ArchivedSession> & { id: SessionId }): ArchivedSession {
  return {
    project_path: "/work/proj",
    summary: "did things",
    last_modified_ms: 0,
    ...overrides,
  };
}
