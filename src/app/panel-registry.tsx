// Panel registry (D-M2-2): one data structure, four consumers — the command
// palette, the empty-panel picker, keyboard shortcuts and the layout renderer
// all read this. Adding a panel in M3+ is one entry + one lazy component.
import { lazy } from "react";
import type { PanelKind } from "./layout-tree";

export interface PanelProps {
  leafId: string;
  params: Record<string, string>;
  setParams: (p: Record<string, string>) => void; // persists into the tree
}

export interface PanelDefinition {
  kind: PanelKind;
  label: string;
  emoji: string; // playfulness: every panel has a face
  description: string;
  keywords: string[]; // palette fuzzy search
  shortcutHint?: string; // single key inside the empty-panel picker
  component: React.LazyExoticComponent<React.ComponentType<PanelProps>>;
  emptyState: { emoji: string; title: string; hint: string }; // D-M2-6 names
}

export const PANELS: Record<PanelKind, PanelDefinition> = {
  chat: {
    kind: "chat",
    label: "Chat",
    emoji: "💬",
    description: "Talk to a session — full-fidelity transcript",
    keywords: ["conversation", "messages", "transcript", "talk", "session"],
    shortcutHint: "c",
    component: lazy(() => import("@/panels/chat/ChatPanel")),
    emptyState: { emoji: "💤", title: "Nobody's talking yet", hint: "Summon a crew member to get started" },
  },
  sessions: {
    kind: "sessions",
    label: "Sessions",
    emoji: "🗂️",
    description: "Live managed + external sessions",
    keywords: ["sessions", "live", "running", "agents", "list"],
    shortcutHint: "s",
    component: lazy(() =>
      import("@/panels/sessions/SessionsPanel").then((m) => ({ default: m.SessionsPanel })),
    ),
    emptyState: { emoji: "🏢", title: "The office is quiet", hint: "Spawn a session to liven the place up" },
  },
  activity: {
    kind: "activity",
    label: "Activity",
    emoji: "📡",
    description: "Live activity feed across all sessions",
    keywords: ["activity", "feed", "events", "log", "stream"],
    shortcutHint: "a",
    component: lazy(() =>
      import("@/panels/activity/ActivityPanel").then((m) => ({ default: m.ActivityPanel })),
    ),
    emptyState: { emoji: "🍃", title: "All calm", hint: "Tool calls and signals will stream in here" },
  },
  history: {
    kind: "history",
    label: "History",
    emoji: "🗄️",
    description: "Browse and search archived sessions",
    keywords: ["history", "archive", "past", "search", "transcripts"],
    shortcutHint: "h",
    component: lazy(() => import("@/panels/history/HistoryPanel").then((m) => ({ default: m.HistoryPanel }))),
    emptyState: { emoji: "🗄️", title: "No past lives yet", hint: "Finished sessions will rest here" },
  },
  crew: {
    kind: "crew",
    label: "Crew",
    emoji: "🧑‍🚀",
    description: "Manage agents — personas, models, pinning",
    keywords: ["crew", "agents", "team", "personas", "hire"],
    shortcutHint: "r",
    component: lazy(() => import("@/panels/crew/CrewPanel").then((m) => ({ default: m.CrewPanel }))),
    emptyState: { emoji: "🧑‍🚀", title: "Hire your first agent", hint: "A crew makes the ship go" },
  },
  world: {
    kind: "world",
    label: "World",
    emoji: "🌍",
    description: "The 3D office — your crew, live, in one little world",
    keywords: ["world", "3d", "office", "bots", "rooms", "map"],
    shortcutHint: "w",
    component: lazy(() => import("@/panels/world/WorldPanel")),
    emptyState: { emoji: "🌍", title: "World loading", hint: "Bots are putting their badges on" },
  },
  board: {
    kind: "board",
    label: "Board",
    emoji: "📋",
    description: "Kanban board — humans and agents move the same cards",
    keywords: ["board", "tasks", "kanban", "todo", "cards", "work"],
    shortcutHint: "b",
    component: lazy(() => import("@/panels/board/BoardPanel")),
    emptyState: {
      emoji: "🧹",
      title: "Quiet board",
      hint: "🧹 nothing to do — file a task or let an agent file one",
    },
  },
  projects: {
    kind: "projects",
    label: "Projects",
    emoji: "🗺️",
    description: "Register projects — folders, docs, rooms and routing rules",
    keywords: ["projects", "folders", "register", "rooms", "rules", "workspace"],
    shortcutHint: "p",
    component: lazy(() =>
      import("@/panels/projects/ProjectsPanel").then((m) => ({ default: m.ProjectsPanel })),
    ),
    emptyState: {
      emoji: "🗺️",
      title: "Register your first project",
      hint: "Point CrewHub at a folder — rooms, docs and boards hang off it",
    },
  },
  docs: {
    kind: "docs",
    label: "Docs",
    emoji: "📚",
    description: "Read a project's docs — markdown and images, rendered",
    keywords: ["docs", "documentation", "markdown", "readme", "notes", "read"],
    shortcutHint: "o",
    component: lazy(() => import("@/panels/docs/DocsPanel")),
    emptyState: {
      emoji: "📚",
      title: "No docs yet",
      hint: "Point me at a folder — set a docs path on a project",
    },
  },
  settings: {
    kind: "settings",
    label: "Settings",
    emoji: "⚙️",
    description: "Appearance, models, permissions, integrations",
    keywords: ["settings", "preferences", "theme", "models", "permissions"],
    shortcutHint: "t",
    component: lazy(() => import("@/panels/settings/SettingsPanel")),
    emptyState: { emoji: "⚙️", title: "Settings", hint: "Tweak the cockpit to taste" },
  },
  welcome: {
    kind: "welcome",
    label: "New Panel",
    emoji: "✨",
    description: "Pick what this panel becomes",
    keywords: ["welcome", "new", "empty", "panel", "picker"],
    component: lazy(() => import("./WelcomePanel")),
    emptyState: { emoji: "✨", title: "Fresh panel", hint: "Pick a panel kind to fill it" },
  },
  debug: {
    kind: "debug",
    label: "Engine Debug",
    emoji: "🐞",
    description: "Raw engine events, spawn form, MCP status (M1 holdover)",
    keywords: ["debug", "engine", "raw", "events", "developer"],
    shortcutHint: "d",
    component: lazy(() => import("@/panels/debug/DebugPanel").then((m) => ({ default: m.DebugPanel }))),
    emptyState: { emoji: "🐞", title: "Engine debug", hint: "Raw events for the curious" },
  },
  meetings: {
    kind: "meetings",
    label: "Meetings",
    emoji: "🎻",
    description: "Round-table meetings and coffee standups for the crew",
    keywords: ["meetings", "standup", "round table", "discussion", "synthesis", "action items"],
    shortcutHint: "m",
    component: lazy(() => import("@/panels/meetings/MeetingsPanel")),
    emptyState: {
      emoji: "🎻",
      title: "No meetings yet",
      hint: "🎻 no meetings yet — gather the crew",
    },
  },
  diff: {
    kind: "diff",
    label: "Diff",
    emoji: "🔬",
    description: "What changed — read-only git diff per project",
    keywords: ["diff", "git", "changes", "patch", "review", "code"],
    shortcutHint: "g",
    component: lazy(() => import("@/panels/diff/DiffPanel")),
    emptyState: {
      emoji: "🧘",
      title: "Working tree is clean",
      hint: "Changes will show up here as they land",
    },
  },
  automation: {
    kind: "automation",
    label: "Automation",
    emoji: "⏰",
    description: "Scheduled runs, sequences and the prompt template library",
    keywords: ["automation", "schedule", "cron", "runs", "sequences", "templates"],
    shortcutHint: "u",
    component: lazy(() => import("@/panels/automation/AutomationPanel")),
    emptyState: {
      emoji: "⏰",
      title: "Nothing scheduled — the crew sleeps in",
      hint: "Create a run: a one-off prompt, a sequence, or a scheduled standup",
    },
  },
};

export const PANEL_LIST: PanelDefinition[] = Object.values(PANELS);
