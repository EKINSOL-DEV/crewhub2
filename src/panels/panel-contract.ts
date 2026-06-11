// Panel contract for Lane C panels (sessions / activity / history / crew).
// TODO(merge): replace with `import type { PanelDefinition, PanelProps, PanelKind } from "@/app/panel-registry"`
// once Lane A's registry lands — this file mirrors the D-M2-2 contract verbatim.
import type React from "react";

export type PanelKind = "chat" | "sessions" | "activity" | "history" | "crew" | "settings" | "welcome";

export interface PanelProps {
  leafId: string;
  params: Record<string, string>;
  /** Persists into the layout tree (Lane A). */
  setParams: (p: Record<string, string>) => void;
}

export interface PanelDefinition {
  kind: PanelKind;
  label: string;
  /** Playfulness: every panel has a face. */
  emoji: string;
  description: string;
  /** Palette fuzzy search. */
  keywords: string[];
  /** Single key inside the empty-panel picker. */
  shortcutHint?: string;
  component: React.LazyExoticComponent<React.ComponentType<PanelProps>>;
  /** Quiet Office (D-M2-6). */
  emptyState: { emoji: string; title: string; hint: string };
}
