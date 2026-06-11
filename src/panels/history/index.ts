// History panel registration (EKI-78).
// TODO(merge): register HISTORY_PANEL in Lane A's panel registry.
import { lazy } from "react";
import type { PanelDefinition } from "../panel-contract";

export const HISTORY_PANEL: PanelDefinition = {
  kind: "history",
  label: "History",
  emoji: "🗄️",
  description: "Archived sessions — browse and search past conversations",
  keywords: ["history", "archive", "past", "search", "transcripts"],
  shortcutHint: "h",
  component: lazy(() => import("./HistoryPanel").then((m) => ({ default: m.HistoryPanel }))),
  emptyState: {
    emoji: "🗄️",
    title: "No past lives yet",
    hint: "Finished sessions are archived here — browse them read-only or search what was said.",
  },
};

export { HistoryPanel } from "./HistoryPanel";
