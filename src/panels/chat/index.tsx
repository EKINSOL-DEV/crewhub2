// Lane B's registry contract (D-M2-2): Lane A imports `chatPanelDefinition`
// into src/app/panel-registry.tsx on merge.
import { lazy } from "react";
import type { PanelDefinition } from "./panel-contract";

export { ChatPanel } from "./ChatPanel";
export type { PanelDefinition, PanelKind, PanelProps } from "./panel-contract";
export { PerfProbe } from "./perf/PerfProbe";

export const chatPanelDefinition: PanelDefinition = {
  kind: "chat",
  label: "Chat",
  emoji: "💬",
  description: "Full-fidelity conversation with a session — transcript, prompts, composer",
  keywords: ["chat", "conversation", "transcript", "talk", "message", "session"],
  shortcutHint: "c",
  component: lazy(() => import("./ChatPanel")),
  emptyState: { emoji: "💤", title: "Nobody's talking yet", hint: "Summon a crew member" },
};
