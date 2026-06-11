// TODO(merge): import these from Lane A's registry (src/app/panel-registry.tsx
// + src/app/layout-tree.ts). Defined locally — identical to the plan's §1
// D-M2-1/D-M2-2 sketches — so Lane B never edits Lane A's files (M2-R5).
import type { ComponentType, LazyExoticComponent } from "react";

export type PanelKind = "chat" | "sessions" | "activity" | "history" | "crew" | "settings" | "welcome";

export interface PanelProps {
  leafId: string;
  params: Record<string, string>;
  /** Persists into the layout tree. */
  setParams: (p: Record<string, string>) => void;
}

export interface PanelDefinition {
  kind: PanelKind;
  label: string;
  emoji: string; // playfulness: every panel has a face
  description: string;
  keywords: string[]; // palette fuzzy search
  shortcutHint?: string; // single key inside the empty-panel picker
  component: LazyExoticComponent<ComponentType<PanelProps>>;
  emptyState: { emoji: string; title: string; hint: string }; // D-M2-6 names
}
