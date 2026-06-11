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
    component: lazy(() => import("./panel-placeholders").then((m) => ({ default: m.ChatPlaceholder }))),
    emptyState: { emoji: "💤", title: "Nobody's talking yet", hint: "Summon a crew member to get started" },
  },
  sessions: {
    kind: "sessions",
    label: "Sessions",
    emoji: "🗂️",
    description: "Live managed + external sessions",
    keywords: ["sessions", "live", "running", "agents", "list"],
    shortcutHint: "s",
    component: lazy(() => import("./panel-placeholders").then((m) => ({ default: m.SessionsPlaceholder }))),
    emptyState: { emoji: "🏢", title: "The office is quiet", hint: "Spawn a session to liven the place up" },
  },
  activity: {
    kind: "activity",
    label: "Activity",
    emoji: "📡",
    description: "Live activity feed across all sessions",
    keywords: ["activity", "feed", "events", "log", "stream"],
    shortcutHint: "a",
    component: lazy(() => import("./panel-placeholders").then((m) => ({ default: m.ActivityPlaceholder }))),
    emptyState: { emoji: "🍃", title: "All calm", hint: "Tool calls and signals will stream in here" },
  },
  history: {
    kind: "history",
    label: "History",
    emoji: "🗄️",
    description: "Browse and search archived sessions",
    keywords: ["history", "archive", "past", "search", "transcripts"],
    shortcutHint: "h",
    component: lazy(() => import("./panel-placeholders").then((m) => ({ default: m.HistoryPlaceholder }))),
    emptyState: { emoji: "🗄️", title: "No past lives yet", hint: "Finished sessions will rest here" },
  },
  crew: {
    kind: "crew",
    label: "Crew",
    emoji: "🧑‍🚀",
    description: "Manage agents — personas, models, pinning",
    keywords: ["crew", "agents", "team", "personas", "hire"],
    shortcutHint: "r",
    component: lazy(() => import("./panel-placeholders").then((m) => ({ default: m.CrewPlaceholder }))),
    emptyState: { emoji: "🧑‍🚀", title: "Hire your first agent", hint: "A crew makes the ship go" },
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
};

export const PANEL_LIST: PanelDefinition[] = Object.values(PANELS);
