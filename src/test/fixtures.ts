// Shared Lane C test fixtures: tiny builders over the generated binding types,
// plus a minimal seeded workspace for asserting openChatPanel effects.
import { leaves, makeLeaf, type LeafNode } from "@/app/layout-tree";
import type {
  Agent,
  ArchivedSession,
  NotificationRule,
  Project,
  Room,
  SessionBinding,
  SessionId,
  SessionMeta,
  Task,
  TaskEvent,
} from "@/ipc/bindings";
import { resetWorkspaceForTests, useWorkspace } from "@/stores/workspace";

/** Seed the workspace store with one tab holding a single welcome leaf. */
export function seedWorkspace(): void {
  resetWorkspaceForTests();
  const root = makeLeaf("welcome");
  useWorkspace.setState({
    tabs: [{ id: "tab-1", name: "Test", root, projectFilter: null }],
    activeTabId: "tab-1",
    focusedLeafId: root.id,
    maximizedLeafId: null,
    loaded: true,
  });
}

/** All chat leaves in the active tab — what openChatPanel should produce. */
export function chatLeaves(): LeafNode[] {
  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return tab ? leaves(tab.root).filter((l) => l.kind === "chat") : [];
}

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
    team: null,
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

export function project(overrides: Partial<Project> & { id: string; folder_path: string }): Project {
  return {
    name: overrides.id,
    description: null,
    icon: null,
    color: null,
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

export function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    project_id: null,
    room_id: "room-1",
    title: overrides.id,
    description: null,
    status: "todo",
    priority: "medium",
    assignee_agent_id: null,
    created_by: "human",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

export function taskEvent(overrides: Partial<TaskEvent> & { id: string; task_id: string }): TaskEvent {
  return {
    event_type: "created",
    actor: "human",
    payload_json: null,
    created_at: 0,
    ...overrides,
  };
}

export function notificationRule(overrides: Partial<NotificationRule> & { id: string }): NotificationRule {
  return {
    scope: "global",
    scope_id: null,
    trigger: "task_moved",
    config_json: null,
    enabled: true,
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
