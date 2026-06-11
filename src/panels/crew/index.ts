// Crew panel registration (EKI-32/EKI-36).
// TODO(merge): register CREW_PANEL in Lane A's panel registry (src/app/panel-registry.tsx).
import { lazy } from "react";
import type { PanelDefinition } from "../panel-contract";

export const CREW_PANEL: PanelDefinition = {
  kind: "crew",
  label: "Crew",
  emoji: "🧑‍🚀",
  description: "Hire agents, shape their personas, watch them work",
  keywords: ["crew", "agents", "hire", "persona", "team"],
  shortcutHint: "c",
  component: lazy(() => import("./CrewPanel").then((m) => ({ default: m.CrewPanel }))),
  emptyState: {
    emoji: "🧑‍🚀",
    title: "Hire your first agent",
    hint: "Agents are reusable personas you can spawn into any project.",
  },
};

export { CrewPanel } from "./CrewPanel";
export { AgentEditor } from "./AgentEditor";
export { PersonaComposer } from "./PersonaComposer";
