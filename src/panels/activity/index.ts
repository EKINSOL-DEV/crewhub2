// Activity panel registration (EKI-76).
// TODO(merge): register ACTIVITY_PANEL in Lane A's panel registry.
import { lazy } from "react";
import type { PanelDefinition } from "../panel-contract";

export const ACTIVITY_PANEL: PanelDefinition = {
  kind: "activity",
  label: "Activity",
  emoji: "📡",
  description: "Live feed of everything the crew is doing",
  keywords: ["activity", "feed", "events", "log", "conflicts"],
  shortcutHint: "a",
  component: lazy(() => import("./ActivityPanel").then((m) => ({ default: m.ActivityPanel }))),
  emptyState: {
    emoji: "🍃",
    title: "All calm",
    hint: "Tool calls, messages and conflicts stream in here as your crew works.",
  },
};

export { ActivityPanel } from "./ActivityPanel";
