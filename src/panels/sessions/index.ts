// Sessions panel registration (EKI-74).
// TODO(merge): register SESSIONS_PANEL in Lane A's panel registry.
import { lazy } from "react";
import type { PanelDefinition } from "../panel-contract";

export const SESSIONS_PANEL: PanelDefinition = {
  kind: "sessions",
  label: "Sessions",
  emoji: "🖥️",
  description: "Every live Claude Code session — managed or external",
  keywords: ["sessions", "live", "running", "agents", "kill", "interrupt"],
  shortcutHint: "s",
  component: lazy(() => import("./SessionsPanel").then((m) => ({ default: m.SessionsPanel }))),
  emptyState: {
    emoji: "🏢",
    title: "The office is quiet",
    hint: "Spawn a crew member or start a session in a terminal — it will show up here.",
  },
};

export { SessionsPanel } from "./SessionsPanel";
export { BindingControls } from "./BindingControls";
export { requestOpenChat, onOpenChatRequest, OPEN_CHAT_EVENT } from "./openChat";
export type { OpenChatRequest } from "./openChat";
